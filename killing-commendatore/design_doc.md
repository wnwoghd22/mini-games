# Game Design Document: Killing Commendatore (Unity Version)

## 1. Core Concept
**Genre**: Deckbuilding Roguelike / RPG
**Theme**: "The Unbearable Brightness of Being" (Irony/Horror)
**Hook**: A game that looks like a cheerful adventure but tells a story of existential dread and crime. The visuals strictly refuse to acknowledge the horror of the text.

## 2. Visual Direction: "Bright & Ironic"

### A. Color & Atmosphere
- **Concept**: A "Dark yet Bright" aesthetic. The world can use dark colors (deep blues, purples) as a canvas for bright, vibrant elements.
- **Atmosphere**: The *feeling* must remain upbeat or ironically cheerful, even if the environment is dimly lit.
    - *Example*: A dark void populated by glowing, friendly neon signs or comforting warm lights.
- **Palette**: Not restricted to pastels. High contrast is key. Dark backgrounds can exist, but they shouldn't feel "depressing" or "grimy"—they should feel "sleek" or "mysterious."

### B. The "Irony" Mechanic
- **Combat**: When an enemy attacks (even a horrific one), the animation should be "cute" or abstract (e.g., they throw a flower, but the damage text says "Bone Fracture: -10 HP").
- **Death**: Player death triggers a "Better Luck Next Time! :)" screen with upbeat music, contrasting with the permanence of the failure.

### C. Character: The Protagonist
- **Asset**: `protagonist.png`
- **Design Note**: The outfit is currently as-is, but may evolve to be **all black** later in development. This fits the high-contrast aesthetic (Black outfit on bright backgrounds, or blending into the dark).
- **Animation**: Simple 2 frame bobbing. Lo-fi/Abstract.

## 3. Narrative & Dialogue
- **Style**: Text-heavy, psychological.
- **Delivery**: Dialogue boxes should be clean, rounded, and white.
- **Dissonance**: 
    - *Text*: "You feel the cold metal against your skin. It smells of rust and old blood."
    - *Visual*: A shiny, clean silver spoon or toy sword.

## 4. Audio Direction (Planned)
- **Music**: Major pentatonic scales, chiptune or light orchestral (flutes, harps). **No** dark ambient drones.
- **SFX**: UI clicks should sound like bubbles or soft bells. Damage sounds should be muted thuds or "glitch" noises, not realistic gore.

## 5. Unity Implementation Specifics
- **Post-Processing**: Use Color Grading to lift shadows. High brightness, low contrast.
- **Shaders**: Unlit or Toon shaders. No realistic PBR materials.
