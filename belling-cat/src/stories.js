export const storyData = {
    "intro": [
        {
            id: 1,
            speaker: "Narrator",
            text: "The meeting hall reeks of damp fur and fear.",
            next: 2
        },
        {
            id: 2,
            speaker: "Elder",
            text: "Citizens! We must remain calm! The Council has a plan.",
            next: 3
        },
        {
            id: 3,
            speaker: "Protagonist",
            text: "(Internal) Calm? You old fool. We are being slaughtered.",
            type: "thought", // Special styling for thoughts
            next: 4
        },
        {
            id: 4,
            speaker: "Elder",
            text: "We have selected a volunteer to replace the Bell. A hero who will save us all.",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "...",
            choices: [
                { text: "Step forward silently.", nextId: "step_forward" },
                { text: "Glance at the shaking crowd.", nextId: "look_around" }
            ]
        }
    ],
    "step_forward": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You step into the light. The murmurs stop.",
            next: "mission_brief"
        }
    ],
    "look_around": [
        {
            id: 1,
            speaker: "Narrator",
            text: "They are terrified. Someone has to end this.",
            next: "mission_brief"
        }
    ],
    "mission_brief": [
        {
            id: 1,
            speaker: "Elder",
            text: "Take this. Use the cover of darkness. Do not fail us.",
            next: null // End of scene -> Transition to Phase 1 Action
        }
    ],

    // ========================================
    // PHASE 2: THE CONFLICT
    // After the failed mission, confrontation with Elder
    // ========================================

    "phase2_return": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You crawl back through the hole in the wall. Your paws are still shaking.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "The rope—useless. It snapped like a dry twig against that monster's neck.",
            next: 3
        },
        {
            id: 3,
            speaker: "Protagonist",
            text: "(Internal) But I was so close. Close enough to feel its heartbeat.",
            type: "thought",
            next: 4
        },
        {
            id: 4,
            speaker: "Protagonist",
            text: "(Internal) Close enough to kill it.",
            type: "thought",
            next: 5
        },
        {
            id: 5,
            speaker: "Elder",
            text: "You're alive. Thank the old walls... What happened?",
            next: 6
        },
        {
            id: 6,
            speaker: "Protagonist",
            text: "The rope failed. But I learned something.",
            next: 7
        },
        {
            id: 7,
            speaker: "Elder",
            text: "...What did you learn?",
            next: "phase2_confrontation"
        }
    ],

    "phase2_confrontation": [
        {
            id: 1,
            speaker: "Protagonist",
            text: "It can be killed.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "The Elder's face hardens. Something flickers in his eyes—not surprise. Fear.",
            next: 3
        },
        {
            id: 3,
            speaker: "Elder",
            text: "No. You will not speak of this.",
            next: 4
        },
        {
            id: 4,
            speaker: "Protagonist",
            text: "Why not?! We've lived in terror for generations! My mother, my siblings—",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "(Internal) Don't. Don't think about them now.",
            type: "thought",
            next: 6
        },
        {
            id: 6,
            speaker: "Protagonist",
            text: "We have the numbers. We have the element of surprise. With a stronger rope—",
            next: 7
        },
        {
            id: 7,
            speaker: "Elder",
            text: "ENOUGH!",
            next: 8
        },
        {
            id: 8,
            speaker: "Narrator",
            text: "His voice cracks. You've never heard him shout before.",
            next: 9
        },
        {
            id: 9,
            speaker: "Elder",
            text: "The Cat... must... live.",
            next: 10
        },
        {
            id: 10,
            speaker: "Protagonist",
            text: "...What?",
            next: "phase2_revelation"
        }
    ],

    "phase2_revelation": [
        {
            id: 1,
            speaker: "Elder",
            text: "You think this is the first time someone had your idea? Your father thought the same.",
            next: 2
        },
        {
            id: 2,
            speaker: "Protagonist",
            text: "Don't you dare speak of him.",
            next: 3
        },
        {
            id: 3,
            speaker: "Elder",
            text: "He found the nest. Did you know that? Behind the great wall. He saw what sleeps there.",
            next: 4
        },
        {
            id: 4,
            speaker: "Protagonist",
            text: "(Internal) The nest? What is he talking about?",
            type: "thought",
            next: 5
        },
        {
            id: 5,
            speaker: "Elder",
            text: "This Cat... this old, slow, predictable Cat... it is not our curse.",
            next: 6
        },
        {
            id: 6,
            speaker: "Elder",
            text: "It is our—",
            next: 7
        },
        {
            id: 7,
            speaker: "Narrator",
            text: "A sound. Low. Rumbling. The walls begin to tremble.",
            next: 8
        },
        {
            id: 8,
            speaker: "Elder",
            text: "No... not now. Not HERE.",
            next: "phase2_attack"
        }
    ],

    "phase2_attack": [
        {
            id: 1,
            speaker: "Narrator",
            text: "The ceiling collapses. Dust. Screaming. A massive shadow fills the room.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "THE CAT. It found the hideout.",
            next: 3
        },
        {
            id: 3,
            speaker: "Elder",
            text: "RUN! Take the new rope—behind the altar!",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "You see it: a coil of reinforced rope. Stronger. Deadlier.",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "Elder, come with me!",
            next: 6
        },
        {
            id: 6,
            speaker: "Elder",
            text: "There's no time. Listen to me—",
            next: 7
        },
        {
            id: 7,
            speaker: "Narrator",
            text: "The Cat's paw sweeps through the hall. The Elder is pinned.",
            next: 8
        },
        {
            id: 8,
            speaker: "Elder",
            text: "The bell... is not a warning for us...",
            next: 9
        },
        {
            id: 9,
            speaker: "Protagonist",
            text: "What do you mean?!",
            next: 10
        },
        {
            id: 10,
            speaker: "Elder",
            text: "It's a warning... for THEM... to stay... away...",
            next: 11
        },
        {
            id: 11,
            speaker: "Narrator",
            text: "His voice fades. His eyes go still.",
            next: 12
        },
        {
            id: 12,
            speaker: "Protagonist",
            text: "...",
            choices: [
                { text: "Grab the rope and flee.", nextId: "phase2_escape_action" },
                { text: "Stare at the Elder's body.", nextId: "phase2_grief" }
            ]
        }
    ],

    "phase2_grief": [
        {
            id: 1,
            speaker: "Narrator",
            text: "For a moment, the world stops. The old fool... he knew something.",
            next: 2
        },
        {
            id: 2,
            speaker: "Protagonist",
            text: "(Internal) 'For THEM.' Who are 'them'?",
            type: "thought",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "The Cat's eye turns toward you. Yellow. Ancient. Almost... tired.",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "You grab the rope. You run.",
            next: "phase2_escape_action"
        }
    ],

    "phase2_escape_action": [
        {
            id: 1,
            speaker: "Narrator",
            text: "Darkness swallows you. Behind you, the bell rings—broken, desperate.",
            next: 2
        },
        {
            id: 2,
            speaker: "Protagonist",
            text: "(Internal) Tonight, I finish this. One way or another.",
            type: "thought",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "The rope is heavy in your paws. Strong enough to tie a bell.",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "Strong enough to kill.",
            next: null // End of Phase 2 -> Transition to Phase 3 Action
        }
    ]
};
