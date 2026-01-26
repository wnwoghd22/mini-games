import { LEVELS, TILE } from './levels.js';
import { Renderer } from './renderer.js';

const MOVES = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 }
};

const GRAVITY_DIRS = [
    { x: 0, y: 1 },  // 0: Down
    { x: 1, y: 0 },  // 1: Right
    { x: 0, y: -1 }, // 2: Up
    { x: -1, y: 0 }  // 3: Left
];

const rotate90 = (v, sign) => sign === 1
    ? { x: -v.y, y: v.x }   // CCW
    : { x: v.y, y: -v.x };  // CW

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const lerpAngle = (a, b, t) => {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);

        this.level = LEVELS[0];

        // Find start pos
        let startX = 1, startY = 1;
        for (let y = 0; y < this.level.height; y++) {
            for (let x = 0; x < this.level.width; x++) {
                if (this.level.grid[y][x] === TILE.START) {
                    startX = x; startY = y;
                }
            }
        }

        // Count Gems
        this.totalGems = 0;
        this.collectedGems = 0;
        for (let y = 0; y < this.level.height; y++) {
            for (let x = 0; x < this.level.width; x++) {
                if (this.level.grid[y][x] === TILE.GEM) this.totalGems++;
            }
        }

        this.state = {
            player: { x: startX, y: startY },
            gravityIndex: 0,
            rotation: 0,
            isMoving: false,
            lockRotation: false,
            score: 0
        };

        this.lastTime = 0;

        window.addEventListener('keydown', (e) => this.handleInput(e));

        requestAnimationFrame((t) => this.loop(t));
    }

    handleInput(e) {
        if (this.state.isMoving) return;

        let moveDir = null;
        switch (e.key) {
            case 'ArrowUp': moveDir = MOVES.UP; break;
            case 'ArrowDown': moveDir = MOVES.DOWN; break;
            case 'ArrowLeft': moveDir = MOVES.LEFT; break;
            case 'ArrowRight': moveDir = MOVES.RIGHT; break;
        }

        if (moveDir) {
            // Static Map: Input corresponds directly to Grid Direction.
            this.attemptMove(moveDir);
        }
    }

    attemptMove(dir) {
        const g = GRAVITY_DIRS[this.state.gravityIndex];

        // Current Pos
        const cx = this.state.player.x;
        const cy = this.state.player.y;

        // Target Pos
        const tx = cx + dir.x;
        const ty = cy + dir.y;

        const nextTile = this.getTile(tx, ty);

        if (nextTile === TILE.WALL) return; // Bonk

        // Corner directly ahead (same plane)
        if (this.isCorner(nextTile)) {
            const plan = this.buildCornerPlan(tx, ty, nextTile, dir);
            if (plan) {
                this.runCornerPlan(plan);
                return;
            }
            return;
        }

        // Empty space with a corner just below/behind (walk-off case)
        if (nextTile === TILE.EMPTY) {
            const floorX = tx + g.x;
            const floorY = ty + g.y;
            const floorTile = this.getTile(floorX, floorY);

            if (this.isCorner(floorTile)) {
                const plan = this.buildCornerPlan(floorX, floorY, floorTile, dir);
                if (plan) {
                    this.runCornerPlan(plan);
                    return;
                }
            }
        }

        this.slide(dir);
    }

    getCornerTurn(cornerType, gIdx, dir) {
        const dx = dir.x, dy = dir.y;

        switch (cornerType) {
            case TILE.CORNER_TR:
                if (gIdx === 0 && dx === 1 && dy === 0) return { targetG: 3, sign: 1 };   // Top -> Right face
                if (gIdx === 3 && dx === 0 && dy === -1) return { targetG: 0, sign: -1 }; // Right -> Top face
                break;
            case TILE.CORNER_TL:
                if (gIdx === 0 && dx === -1 && dy === 0) return { targetG: 1, sign: -1 }; // Top -> Left face
                if (gIdx === 1 && dx === 0 && dy === -1) return { targetG: 0, sign: -1 }; // Left -> Top face
                break;
            case TILE.CORNER_BR:
                if (gIdx === 2 && dx === 1 && dy === 0) return { targetG: 3, sign: -1 };  // Bottom -> Right face
                if (gIdx === 3 && dx === 0 && dy === 1) return { targetG: 2, sign: 1 };   // Right -> Bottom face
                break;
            case TILE.CORNER_BL:
                if (gIdx === 2 && dx === -1 && dy === 0) return { targetG: 1, sign: 1 };  // Bottom -> Left face
                if (gIdx === 1 && dx === 0 && dy === 1) return { targetG: 2, sign: -1 };  // Left -> Bottom face
                break;
        }

        return null;
    }

    buildCornerPlan(cornerX, cornerY, cornerType, dir) {
        const gIdx = this.state.gravityIndex;
        const turn = this.getCornerTurn(cornerType, gIdx, dir);
        if (!turn) return null;

        // Pivot at tile center; arc radius is half a tile to match the rendered quarter circle.
        const CORNER_RADIUS = 0.5;
        const pivot = { x: cornerX + 0.5, y: cornerY + 0.5 };
        const gStart = GRAVITY_DIRS[gIdx];
        const gEnd = GRAVITY_DIRS[turn.targetG];

        const entryCenter = {
            x: pivot.x - gStart.x * CORNER_RADIUS,
            y: pivot.y - gStart.y * CORNER_RADIUS
        };

        const exitCenter = {
            x: pivot.x - gEnd.x * CORNER_RADIUS,
            y: pivot.y - gEnd.y * CORNER_RADIUS
        };

        const exitDir = rotate90(dir, turn.sign);
        // Push outward from the corner so the player body doesn't overlap the curved block.
        const outward = { x: -gEnd.x * CORNER_RADIUS, y: -gEnd.y * CORNER_RADIUS };

        const finalCenter = {
            x: exitCenter.x + exitDir.x + outward.x,
            y: exitCenter.y + exitDir.y + outward.y
        };

        const finalTile = {
            x: Math.round(finalCenter.x - 0.5),
            y: Math.round(finalCenter.y - 0.5)
        };

        const finalTileType = this.getTile(finalTile.x, finalTile.y);
        if (finalTileType === TILE.WALL || this.isCorner(finalTileType)) return null;

        const floorX = finalTile.x + gEnd.x;
        const floorY = finalTile.y + gEnd.y;
        if (!this.hasSolidGround(floorX, floorY)) return null;

        const snapCenter = { x: finalTile.x + 0.5, y: finalTile.y + 0.5 };

        return {
            cornerType,
            turn,
            pivot,
            targetG: turn.targetG,
            entryCenter,
            exitCenter,
            exitStepCenter: finalCenter,
            finalTile,
            snapCenter
        };
    }

    runCornerPlan(plan) {
        this.state.isMoving = true;
        this.state.lockRotation = true;

        const startCenter = { x: this.state.player.x + 0.5, y: this.state.player.y + 0.5 };
        const startRot = this.state.rotation;
        const targetRot = plan.targetG * (Math.PI / 2);

        const entryAngle = Math.atan2(plan.entryCenter.y - plan.pivot.y, plan.entryCenter.x - plan.pivot.x);
        const radius = 0.5; // fixed half-tile radius to match corner geometry

        let progress = 0;
        const entryEnd = 0.25;
        const rotateEnd = 0.75;
        const speed = 0.03;

        const step = () => {
            progress += speed;
            if (progress > 1) progress = 1;

            let center, rot;

            if (progress < entryEnd) {
                const t = progress / entryEnd;
                center = lerpPoint(startCenter, plan.entryCenter, t);
                rot = startRot;
            } else if (progress < rotateEnd) {
                const t = (progress - entryEnd) / (rotateEnd - entryEnd);
                const ang = entryAngle + plan.turn.sign * t * (Math.PI / 2);
                center = {
                    x: plan.pivot.x + Math.cos(ang) * radius,
                    y: plan.pivot.y + Math.sin(ang) * radius
                };
                rot = lerpAngle(startRot, targetRot, t);
            } else {
                const t = (progress - rotateEnd) / (1 - rotateEnd);
                center = lerpPoint(plan.exitCenter, plan.exitStepCenter, t);
                rot = targetRot;
            }

            this.state.player.x = center.x - 0.5;
            this.state.player.y = center.y - 0.5;
            this.state.rotation = rot;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                this.state.isMoving = false;
                this.state.lockRotation = false;
                this.state.gravityIndex = plan.targetG;
                this.state.player.x = plan.snapCenter.x - 0.5;
                this.state.player.y = plan.snapCenter.y - 0.5;
                this.state.rotation = this.state.gravityIndex * (Math.PI / 2);

                const gx = Math.round(this.state.player.x);
                const gy = Math.round(this.state.player.y);
                if (this.getTile(gx, gy) === TILE.GEM) {
                    this.collectGem(gx, gy);
                }
            }
        };

        requestAnimationFrame(step);
    }

    canTraverseCorner(cornerType, moveDir, gravityDir) {
        // Only Walk-Off Logic supported (Convex Corner Traversal).
        // Matches directions where we move "Off" the solid part.

        // TR (Solid BL). Connects Left & Bottom.
        // Move Right (from Left/Top): Valid.
        // Move Up (from Bottom?): Valid.
        // Wait, TR connects Left & Bottom.
        // To walk off TR (Right): Must come from Top (of BL)?
        // Top of BL is inside the tile.
        // "Walk Off" implies we are on the neighbor.
        // Neighbor Left (Top Face). Move Right. -> Enter TR (Top Face).
        // Move Right -> Walk off TR.

        // Logic:
        // TR: Move Right or Move Up.
        const movRight = moveDir.x === 1;
        const movLeft = moveDir.x === -1;
        const movUp = moveDir.y === -1;
        const movDown = moveDir.y === 1;

        if (cornerType === TILE.CORNER_TR) return movRight || movDown; // Down?? If G=Left.
        if (cornerType === TILE.CORNER_TL) return movLeft || movDown;
        if (cornerType === TILE.CORNER_BR) return movRight || movUp;
        if (cornerType === TILE.CORNER_BL) return movLeft || movUp;

        return false;
    }

    traverseCorner(cornerTileType, cx, cy, dir) {
        // cx,cy is the Corner Tile ("Floor" tile).
        this.state.isMoving = true;

        // Determine Pivot and Arc Points based on Corner Type
        let pivotX, pivotY;
        let startAngle, endAngle;
        let rotationDir; // 1 = CW, -1 = CCW
        let exitDir; // Vector for the "One step forward"

        // Player is currently at (pX, pY).
        // For TR (Walk Right):
        // P at (cx, cy-1). Floor cx,cy.
        // Pivot BL (cx, cy+1).
        // Radius 1.
        // Start Angle -90 (Top Point: cx, cy). Matches Player Pos (cx, cy-1) feet?
        // Wait, Player y is top-left. Feet at y+1.
        // P(cx, cy-1) feet at cx, cy. (Top-Left of Corner Tile).
        // Correct.
        // Orbit to Angle 0 (Right Point: cx+1, cy+1).
        // Feet land at cx+1, cy+1.
        // Body (G=Right, Head Left) -> X = FeetX - 1 = cx. Y = FeetY = cy+1.
        // So Body lands at (cx, cy+1).
        // This is "Right" of the solid part (which is BL of tile)?
        // Wait, if Solid is BL.
        // (cx, cy+1) is the Bottom-Left cell?
        // No, (cx, cy) is the tile.
        // (cx, cy+1) is the tile BELOW it.
        // So we land at the tile BELOW the corner?
        // And we are facing Down (Screen).
        // Forward is Down.
        // Exit to (cx, cy+2).

        // Let's generalize.
        // TR (Right): Pivot (cx, cy+1). Start -90. End 0. Rot 1(CW).
        // TL (Left): Pivot (cx+1, cy+1). Start -90. End -180. Rot -1(CCW).
        // BR (Right?): ...

        if (cornerTileType === TILE.CORNER_TR) {
            pivotX = cx; pivotY = cy + 1;
            if (dir.x === 1) { // Right
                startAngle = -Math.PI / 2; endAngle = 0; rotationDir = 1;
                exitDir = { x: 0, y: 1 }; // Down
            } else { // Down (into Top face? No support).
                // Assuming only Walk-Off logic (Top->Right).
                startAngle = -Math.PI / 2; endAngle = 0; rotationDir = 1;
                exitDir = { x: 0, y: 1 };
            }
        }
        else if (cornerTileType === TILE.CORNER_TL) {
            pivotX = cx + 1; pivotY = cy + 1;
            if (dir.x === -1) { // Left
                startAngle = -Math.PI / 2; endAngle = -Math.PI; rotationDir = -1;
                exitDir = { x: 0, y: 1 }; // Down (Visually Down, World Left?)
                // G: Down -> Left (-1, 0).
                // Screen Down = World Left?
                // Left is (-1, 0).
                // Screen Down is (0, 1).
                // Check G=3 (Left). GVec (-1, 0).
                // Screen Down matches G?
                // Yes. In G=Left. Gravity points Left.
                // Screen Down usually points With Gravity.
                // So exitDir (0, 1) Screen -> (-1, 0) World (Left).
            }
        }
        // Need BR/BL Walk-Off support?
        // BR (Bottom-Right corner missing). Solid Top-Left.
        // Walk Off Right (from Bottom face? No).
        // Walk Off Right (from Left face? No).
        // Walk Off Bottom (from Right face?).
        // BR connects Right & Bottom.
        // Walk Down (from Top? No. from Right face).
        // G=Left. Walk Down (Screen -> Left World?).
        // Not supporting other gravity starts yet (Game starts G=0).
        // Let's Focus on G=0 Walk-Offs (TR/TL).

        else if (cornerTileType === TILE.CORNER_BR) {
            // Placeholder
            pivotX = cx; pivotY = cy;
            startAngle = 0; endAngle = Math.PI / 2; rotationDir = 1;
            exitDir = { x: -1, y: 0 };
        }
        else if (cornerTileType === TILE.CORNER_BL) {
            pivotX = cx + 1; pivotY = cy;
            startAngle = Math.PI; endAngle = Math.PI / 2; rotationDir = -1;
            exitDir = { x: 1, y: 0 };
        }

        // Animation Loop
        let progress = 0;
        const speed = 0.05; // Slower for clarity

        const startX = this.state.player.x;
        const startY = this.state.player.y;

        // Calculate Orbit Start Pos (Player Top-Left)
        // Feet at Pivot + Radius(StartAngle).
        // Player Top-Left = Feet - DownVector(CurrentG).
        // G=0 (Down). DownVec (0, 1).
        // P = (Pivot + R) - (0, 1).
        const startRadX = pivotX + Math.cos(startAngle);
        const startRadY = pivotY + Math.sin(startAngle);
        // Note: Pivot is Integer Grid Intersection.
        // startRad is the 'Feet' position on the grid lines.
        // Player is centered on Tile.
        // If Feet at (cx, cy). Player Centered at (cx-0.5, cy-0.5)?
        // No. If Feet at (cx, cy). Player (TopLeft) at (cx-1?, cy-1?).
        // Let's use Center Logic. Center is simpler.
        // Player Size 1. Center offset 0.5.
        // Feet from Center is +0.5 * GVec.
        // So Center = Feet - 0.5 * GVec.

        const getCenter = (angle, gIdx) => {
            const fx = pivotX + Math.cos(angle);
            const fy = pivotY + Math.sin(angle);
            const g = GRAVITY_DIRS[gIdx];
            return {
                x: fx - g.x * 0.5,
                y: fy - g.y * 0.5
            };
        };

        const startCenter = getCenter(startAngle, this.state.gravityIndex);
        // End Center (New Gravity)
        // Predict New G
        let delta = (rotationDir === 1) ? -1 : 1; // My G Index is CCW?.
        // G: 0(D), 1(R), 2(U), 3(L).
        // CCW (0->1->2->3).
        // Clockwise Visual Rotation (-90deg) -> G Index +1 ??
        // TR (Right): Down(0) -> Right(1). (CW Visual, +1 G).
        // Wait, G Index:
        // Down(0) -> Right(1) is +1.
        // Right(1) -> Up(2) is +1.
        // So +1 is CCW in Cartesian? (0,-1) -> (1,0).
        // Yes.
        // But RotationDir 1 (CW) usually means Angle increases?
        // My Logic: TR (Right). Angle -90 -> 0. (Increase). 
        // RotationDir = 1.
        // G Index 0 -> 1.
        // So Delta = +1.

        const targetG = (this.state.gravityIndex + (rotationDir === 1 ? 1 : 3)) % 4; // +1 or -1 (+3)
        const endCenter = getCenter(endAngle, targetG);

        // Final Exit Target
        // One step forward from EndCenter in new ExitDir (Screen Space?)
        // ExitDir was defined in Screen Space? e.g. (0, 1) Down.
        // Yes, if we rotate View, (0,1) is always Screen Down.
        // And we want to move Screen Down?
        // Yes.
        const exitCenter = {
            x: endCenter.x + exitDir.x,
            y: endCenter.y + exitDir.y
        };

        const animate = () => {
            progress += speed;
            if (progress > 1) progress = 1;

            let cx, cy, rot;

            // Phase 1: Slide to Orbit Start (0.0 - 0.2)
            if (progress < 0.2) {
                const t = progress / 0.2;
                // Current (startX + 0.5) -> startCenter
                const curCX = (startX + 0.5) * (1 - t) + startCenter.x * t;
                const curCY = (startY + 0.5) * (1 - t) + startCenter.y * t;
                cx = curCX; cy = curCY;
                rot = this.state.gravityIndex * Math.PI / 2;
            }
            // Phase 2: Orbit (0.2 - 0.7)
            else if (progress < 0.7) {
                const t = (progress - 0.2) / 0.5;
                // Interpolate Angle
                const ang = startAngle + (endAngle - startAngle) * t;
                // Interpolate Rot (Visual)
                // StartRot -> TargetRot.
                // G=0 -> 0. G=1 -> 1.57 (PI/2).
                // Visual Rot increases.
                // TR: 0 -> PI/2.
                // For TL: 0 -> 270? No. 0 -> -90.
                // My G logic:
                // 0(D), 3(L).
                // TL: 0 -> 3.
                // 3 * PI/2 = 270.
                // 0 -> 270 is Long way. Should be -90.

                let rStart = this.state.gravityIndex * Math.PI / 2;
                let rEnd = targetG * Math.PI / 2;
                if (targetG === 3 && this.state.gravityIndex === 0) rEnd = -Math.PI / 2;
                if (targetG === 0 && this.state.gravityIndex === 3) rStart = -Math.PI / 2;

                rot = rStart + (rEnd - rStart) * t;

                // Pivot Logic needs INTERPOLATED GRAVITY VECTOR for 'Center' calculation?
                // Center = Pivot + Vec(Ang) - 0.5 * GVec.
                // We should lerp GVec too?
                // Yes, 'Normal' matches Angle?
                // Normal points IN to pivot? No, Normal points to Head.
                // Head is Opposite to Feet.
                // Feet is at Pivot + Vec(Ang).
                // Head is at Pivot + Vec(Ang) - 1.0 * Normal?
                // No. Center is Feet - 0.5 * Down.
                // Down Vector is Normal(Angle)?
                // TR: Ang -90 (Top). Down (0, 1). Normal (0, -1)?
                // Ang 0 (Right). Down (1, 0)? No, G=Right is (1,0).
                // Cos(0)=1, Sin(0)=0. Vec(1,0). Matches G.
                // So GVec matches Angle Vector?
                // TR: Ang -90 (0, -1). G(0, 1). OPPOSITE.
                // TR: Ang 0 (1, 0). G(1, 0). SAME.
                // Mismatch.

                // Fallback: Linearly Interpolate Center positions directly.
                // Arc is for Feet. But Center moves in Arc too?
                // Yes.
                // Let's just Lerp Angle for calculation?
                // startCenter to endCenter via Arc?
                // Pivot for Center?
                // Center of Curve is Pivot?
                // Player Center orbits Pivot at Radius ??
                // FeetRadius = 1.0.
                // CenterRadius = sqrt(1^2 + 0.5^2) = 1.11 ?
                // No.
                // Let's use simple polar lerp of the Center coord.
                // It might look slightly 'sliding' but better than complex math errors.

                // Or just Interpolate startCenter -> endCenter utilizing Angle?
                // pX = pivotX + R_effective * cos(ang + phase)?
                // Just Lerp the "Feet" Pos, then calculate Center from Feet using Lerped Gravity?

                // Feet Pos
                const fX = pivotX + Math.cos(ang);
                const fY = pivotY + Math.sin(ang);

                // Lerp G
                const gStart = GRAVITY_DIRS[this.state.gravityIndex];
                const gEnd = GRAVITY_DIRS[targetG];
                const gCurX = gStart.x * (1 - t) + gEnd.x * t;
                const gCurY = gStart.y * (1 - t) + gEnd.y * t;

                cx = fX - gCurX * 0.5;
                cy = fY - gCurY * 0.5;
            }
            // Phase 3: Exit (0.7 - 1.0)
            else {
                const t = (progress - 0.7) / 0.3;
                cx = endCenter.x * (1 - t) + exitCenter.x * t;
                cy = endCenter.y * (1 - t) + exitCenter.y * t;
                rot = targetG * Math.PI / 2;
            }

            // Apply
            this.state.player.x = cx - 0.5; // TopLeft
            this.state.player.y = cy - 0.5;
            this.state.rotation = rot;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.state.isMoving = false;
                this.state.gravityIndex = targetG;
                // Snap Integer
                this.state.player.x = Math.round(exitCenter.x - 0.5);
                this.state.player.y = Math.round(exitCenter.y - 0.5);
                this.state.rotation = this.state.gravityIndex * Math.PI / 2;
            }
        };

        animate();
    }

    canClimbCorner(c, d) { return false; } // Deprecated
    performClimbRotation(c, d) { } // Deprecated

    slide(dir) {
        this.state.isMoving = true;

        const moveStep = () => {
            const nextX = this.state.player.x + dir.x;
            const nextY = this.state.player.y + dir.y;

            // 1. Check Bounds
            if (nextX < 0 || nextX >= this.level.width || nextY < 0 || nextY >= this.level.height) {
                this.state.isMoving = false;
                return;
            }

            const nextTile = this.level.grid[nextY][nextX];

            // 2. Check Collision (Wall/CornerBlock)
            if (nextTile === TILE.WALL || (nextTile >= TILE.CORNER_TL && nextTile <= TILE.CORNER_BR)) {

                // If we hit a corner block, check if we can rotate around it?
                // No, "Round Corner" usually implies we walk ON it, then rotate.
                // But the user said "goes again in front of round corner".
                // This implies "Face the blocks".
                // If I am at (x,y) and (x+1,y) is a Corner Block.
                // I hit it. I recognize it's a corner.
                // If I press Right AGAIN, I rotate?
                // Let's implement that in handleInput/attemptMove separate from slide.
                // For 'slide', we just stop.

                this.state.isMoving = false;

                // Check if this impact should trigger rotation?
                // "if player goes again" -> suggests separate input.
                // So current slide just stops.
                return;
            }

            // 3. Check Floor (Don't fall off)
            // Gravity Vector
            const g = GRAVITY_DIRS[this.state.gravityIndex];
            const nextFloorX = nextX + g.x;
            const nextFloorY = nextY + g.y;

            let hasFloor = this.hasSolidGround(nextFloorX, nextFloorY);

            // SPECIAL: If Floor is a Corner Tile, we MUST Stop.
            // We cannot stand on a Corner Tile (it's curved).
            if (hasFloor) {
                const floorTile = this.getTile(nextFloorX, nextFloorY);
                if (this.isCorner(floorTile)) {
                    // STOP.
                    this.state.isMoving = false;
                    return;
                }
            }

            if (!hasFloor) {
                this.state.isMoving = false;
                return;
            }

            // Collect Gem?
            // "Slide" moves from tile to tile. We should check intermediate tiles?
            // Here 'nextX' is just one step.
            if (nextTile === TILE.GEM) {
                this.collectGem(nextX, nextY);
            }

            // Normal Move
            this.state.player.x = nextX;
            this.state.player.y = nextY;
            setTimeout(moveStep, 50);
        };

        moveStep();
    }

    collectGem(x, y) {
        // Modify level grid?
        // LEVELS is const. We should copy grid or mutate it.
        // For prototype, mutate.
        this.level.grid[y][x] = TILE.EMPTY;
        this.collectedGems++;
        this.state.score++;

        console.log(`Gems: ${this.collectedGems}/${this.totalGems}`);

        // Update UI
        const ui = document.getElementById('level-info');
        if (ui) ui.innerText = `Level 1 - Gems: ${this.collectedGems}/${this.totalGems}`;

        if (this.collectedGems >= this.totalGems) {
            setTimeout(() => alert("Stage Clear!"), 100);
        }
    }

    getTile(x, y) {
        if (x < 0 || x >= this.level.width || y < 0 || y >= this.level.height) return TILE.EMPTY;
        return this.level.grid[y][x];
    }

    hasSolidGround(x, y) {
        const t = this.getTile(x, y);
        return t === TILE.WALL || (t >= TILE.CORNER_TL && t <= TILE.CORNER_BR);
    }

    isCorner(t) {
        return t >= TILE.CORNER_TL && t <= TILE.CORNER_BR;
    }

    canRotateOnCorner(cornerType, moveDir) {
        // Map G-Index + MoveDir -> Valid Corner?
        // Assume Standard G (0=Down).
        // Move Right (1, 0).
        // Corner TR (Top-Right).
        // Matches? Yes.

        // Generalize:
        // We are moving Perp to G.
        // Corner must have a face Normal to -G (Up) and Normal to MoveDir.
        // TR: Up + Right.
        // If G=Down (Stand on Up). Move=Right. Matches.

        // Logic:
        // if cornerPos == floorPos.
        // Vector from Corner to Player is -G. (e.g. Up).
        // MoveDir is tangent. (e.g. Right).
        // We need Corner to span (-G) and (MoveDir).

        // TR spans Up(N) and Right(E).
        // TL spans Up(N) and Left(W).
        // BR spans Down(S) and Right(E).
        // BL spans Down(S) and Left(W).

        // Current Up-Vector (Floor Normal) = -Gravity.
        // Move Vector = moveDir.

        const g = GRAVITY_DIRS[this.state.gravityIndex];
        const up = { x: -g.x, y: -g.y };

        const isUp = up.y === -1; // Normal Up
        const isDown = up.y === 1;
        const isRight = up.x === 1;
        const isLeft = up.x === -1;

        const movRight = moveDir.x === 1;
        const movLeft = moveDir.x === -1;
        const movUp = moveDir.y === -1;
        const movDown = moveDir.y === 1;

        if (cornerType === TILE.CORNER_TR) return (isUp && movRight) || (isRight && movUp);
        if (cornerType === TILE.CORNER_TL) return (isUp && movLeft) || (isLeft && movUp);
        if (cornerType === TILE.CORNER_BR) return (isDown && movRight) || (isRight && movDown);
        if (cornerType === TILE.CORNER_BL) return (isDown && movLeft) || (isLeft && movDown);

        return false;
    }

    performCornerRotation(cornerType, dir) {
        this.state.isMoving = true;

        // 1. Determine direction of rotation (CW or CCW)
        // If TR (Up -> Right), we move Right. Gravity shifts Down->Left?
        // Wait, TR connects Top and Right.
        // Start on Top. G=Down. Move Right.
        // End on Right. G=Left.
        // Down(0) -> Left(3). Delta -1 (CCW).

        // Wait, "Rotation" of PLAYER/CAMERA.
        // Camera rotates CW (+90) to make "Right" look "Down".
        // Gravity Index 0->3 is -1? No 0-1 = -1 = 3.
        // So Modulo arithmetic.

        // Let's create a lookup or heuristic.
        // TR: Up->Right (Clockwise turn? Right is CW of Up).
        // Normal changes Up -> Right. (CW).
        // Gravity changes Opposite: Down -> Left. (CW).
        // Index: 0 -> 3? No 0 is Down. 3 is Left.
        // 0->3 is +3 or -1 step.
        // Let's rely on `canRotate` logic to deduce delta.
        // If TR and moving Right -> G becomes Left (3). Delta -1.
        // If TR and moving Up (Standing on Right, G=Left). Left->Down. 3->0. Delta +1.

        let deltaG = 0;
        if (cornerType === TILE.CORNER_TR) deltaG = (dir.x === 1) ? 3 : 1; // R->L (+3/-1), U->D (+1)

        // Let's generalize simply:
        // Index: 0(D), 1(R), 2(U), 3(L).
        // TR w/ Right Move: D->L (0->3). (+3).
        // TL w/ Left Move: D->R (0->1). (+1).
        // BR w/ Right Move: U->L (2->3). (+1).
        // BL w/ Left Move: U->R (2->1). (+3).

        // Refined Lookups:
        // TL: Left->Right (+1).
        // TR: Right->Left (+3).
        // BL: Left->Right (+3).
        // BR: Right->Left (+1).
        // Wait, BR (Bottom-Right). Standing on Right (G=Left). Move Down?
        // TR and BR Logic might depend on 'dir'.

        if (cornerType === TILE.CORNER_TR) deltaG = (dir.x === 1) ? 3 : 1;
        if (cornerType === TILE.CORNER_TL) deltaG = (dir.x === -1) ? 1 : 3;
        if (cornerType === TILE.CORNER_BR) deltaG = (dir.x === 1) ? 1 : 3;
        if (cornerType === TILE.CORNER_BL) deltaG = (dir.x === -1) ? 3 : 1;

        // Update State
        const newG = (this.state.gravityIndex + deltaG) % 4;

        // Move Player "Around" the corner.
        // Effectively +1 in both x and y (diagonal)?
        // Top->Right: (x,y) -> (x+1, y+1).
        // Top->Left: (x,y) -> (x-1, y+1).
        // Bottom->Right: (x,y) -> (x+1, y-1).
        // Bottom->Left: (x,y) -> (x-1, y-1).

        this.state.player.x += dir.x;
        this.state.player.y += dir.y;

        // Add Gravity Vector of NEW gravity??
        // No, we just land on the adjacent diagonal cell.
        // But wait, "dir" was just one component (e.g. x=1, y=0).
        // So we moved (x+1, y).
        // We need to move +1 in y as well to land "on the side".
        // We need to add the "Drop" component.
        // Old G was e.g. (0, 1). We usually move (1, 1) total?
        // Yes.
        const drop = GRAVITY_DIRS[this.state.gravityIndex];
        this.state.player.x += drop.x;
        this.state.player.y += drop.y;

        this.state.gravityIndex = newG;

        // Animate?
        // For now, just snap.
        this.state.isMoving = false;

        // Check for immediate things after rotation?
        // Maybe Gems?
    }

    loop(t) {
        const dt = t - this.lastTime;
        this.lastTime = t;

        if (!this.state.lockRotation) {
            const targetRot = this.state.gravityIndex * (Math.PI / 2);

            let diff = targetRot - this.state.rotation;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            this.state.rotation += diff * 0.1;
        }

        this.renderer.draw(this.state, this.level);
        requestAnimationFrame((t) => this.loop(t));
    }
}

new Game();
