# Belling the Cat: The Truth of the Bell
**Concept & Story Design Document**

## 1. Game Overview
**Genre:** Narrative Action-Adventure
**Platform:** Web (Browser)
**Core Experience:** Intense stealth action mixed with moral dilemmas and a shocking narrative twist.
**Visual Style:** Dark, Gritty, Noir-inspired. High contrast.

## 2. Story Synopsis
The village of mice lives in fear of **The Cat**. The only warning system—a bell on its neck—is old and failing. A specialized team is formed to replace it.

### **Characters**
-   **Protagonist (The Volunteer):** A young, radical mouse. Believes the "Belling" strategy is cowardly and ineffective. Wants to kill the Cat to end the thread permanently.
-   **The Elder:** The leader of the council. Conservative, seemingly cowardly, but holds a terrible secret about the nature of their world.
-   **The Cat:** A looming, Lovecraftian force of death.

### **Plot Outline**

#### **Phase 1: The Mission**
-   The Protagonist is chosen for the suicide mission to replace the bell.
-   **Internal Monologue:** He despises the mission. He secretly plans to strangle the Cat with the new rope instead of tying the bell.
-   **The Failure:** During the stealth approach (gameplay), the rope snaps or proves too weak. The mission is aborted.
-   **The Realization:** While close to the Cat, the Protagonist realizes: *"I could have done it. If the rope were strong enough, I could have killed it."*

#### **Phase 2: The Conflict (Narrative)**
-   Back at the hideout, the Protagonist confronts the Elder.
-   **Protagonist:** "Why do we just bell it? We can kill it! We have the numbers, we have the surprise!"
-   **Elder:** "No! You don't understand! The Cat must live!"
-   **The Incident:** Before the Elder can explain *why*, the Cat attacks. The Elder sacrifices himself or is caught, dying instantly.
-   The Protagonist is left with the replacement bell/rope (now reinforced or a new one found) and a dying wish he didn't hear.

#### **Phase 3: The Climax (Gameplay)**
-   A final, desperate run to the sleeping Cat.
-   **Gameplay:** Intense stealth/QTE sequence. The player reaches the Cat's neck.

#### **Phase 4: The Choice**
The player must choose between two actions:

**Option A: Bell the Cat (The "Coward's" Way)**
-   **Action:** The Protagonist ties the bell.
-   **Outcome:** The Cat wakes up. The Protagonist is likely killed in the escape or narrowly survives.
-   **Ending:** The village is safe. The status quo is preserved. The Protagonist dies a "hero" of the old ways.
-   **Tone:** Melancholic but stable.

**Option B: Kill the Cat (The "Hero's" Way)**
-   **Action:** The Protagonist uses the rope to strangle the Cat. Copious button mashing (QTE).
-   **Outcome:** The Cat dies. The village celebrates. The Protagonist is hailed as the greatest savior.
-   **The Twist:** Days later, the mice are partying on the Cat's corpse. Suddenly, a shadow update. A **New Cat** appears. It is younger, faster, and crueler than the old one.
-   **Ending:** Without the fear and caution learned from the old Cat, the mice are unprepared. The village is massacred.
-   **Tone:** Horror/Despair. "The Elder was right. The Old Cat was the devil we knew."

## 3. Gameplay Mechanics

### **Dialogue Mode**
-   Standard VN interface.
-   Dark/Red text for the Protagonist's angry thoughts.
-   Shaking text effects for tension.

### **Action Mode (Unified Side-View Platformer)**
**Core Mechanic:** The game plays as a side-scrolling platformer.
-   **Controls:** Arrow Keys (Move), Space (Jump), Down (Hide/Crouch).
-   **Physics:** Gravity, platform collision.

**Levels:**
1.  **The Journey (Exploration):**
    -   **Goal:** Travel from the Mouse Village Hideout to the Cat's Lair.
    -   **Hazards:** Falling debris, gaps, maybe other small predators (spiders?).
    -   **Purpose:** Builds tension and establishes the scale of the world.

2.  **The Stealth (Red Light/Green Light):**
    -   **Context:** Approaching the Cat.
    -   **Mechanic:** Platformer + Vision Cones.
    -   **Hiding:** Player must duck behind objects (books, cups) when the Cat shifts gaze.

3.  **The Escape (The Crumbling Path):**
    -   **Context:** The Hideout is destroyed. The Protagonist flees through the collapsing tunnels while the Cat tears the village apart from above.
    -   **Core Conflict:** **Speed vs. Silence.**
    -   **Mechanic A (Urgency):** The ceiling is collapsing behind and above the player. A "Collapse Wall" chases the player from the left. Debris falls from above (indicated by dust/shadows).
    -   **Mechanic B (The Bell - The Listener):**
        -   The Cat isn't visible, but the **Bell** rings.
        -   **Visual Cue:** Screen shakes, red vignette pulses.
        -   **Soft Ring:** Cat is distracted. **Run (Dash).**
        -   **Loud Ring:** Cat is listening near the surface. **Walk/Crawl** (Move slowly). Running creates "Noise" -> Instant Death (Paw crushes the tunnel).
    -   **Goal:** Reach the surface/sewers before being buried or caught.

4.  **Phase 3: The Approach (Silent Infiltration):**
    -   **Context:** Crossing the room to reach the Sleeping Cat.
    -   **View:** Side-scrolling Platformer (Horizontal).
    -   **Core Mechanic:** **Surface Noise & Stealth Platforming.**
        -   **Soft Surfaces (Carpet, Sofa, Curtains):** Silent. Safe to run.
        -   **Hard Surfaces (Wood Floor, Tables, Shelves):** Noisy.
    -   **Rules:**
        -   Running on Hard Surface -> **Wakefulness UP**.
        -   Landing Hard (High Fall) on Hard Surface -> **Wakefulness SPIKE**.
        -   **Crawl (Down Key)** on Hard Surface -> **Silent**.
    -   **Goal:** Navigate across furniture obstacles to reach the Cat without waking it.

5.  **The Finale (Choice & Consequence):**
    -   **The Collar:** Reaching the Cat triggers the final choice.
    -   **Option A: Bell (Peace):** Tie the bell.
        -   **Action:** Precision QTE (Timing).
        -   **Result:** The Cat wakes up. Final Chase.
    -   **Option B: Kill (Revenge):** Strangle using the rope.
        -   **Action:** Button Mashing.
        -   **Result:** The Cat dies. Dark ending.

6.  **The Final Chase (Bell Ending Only):**
    -   **Context:** Escaping the enraged, belled Cat.
    -   **Mechanic:** High speed auto-runner.
    -   **Gimmick:** **High/Low Road.**
    -   **Visual Cue:** Cat swipe High (Show Red Top) -> **Slide (Down)**. Cat swipe Low (Show Red Bottom) -> **Jump (Up)**.

## 4. Technical Requirements
-   **Input:** Keyboard (Arrows + Space) or Touch (Tap/Hold).
-   **Assets:**
    -   Silhouette style sprites (Mice).
    -   Giant, close-up shots of the Cat (part of an eye, a paw, teeth).
    -   Sound: Heartbeat, heavy breathing, sharp strings for danger.
