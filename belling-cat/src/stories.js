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
    "stealth_intro": [
        {
            id: 1,
            speaker: "Protagonist",
            text: "(Whisper) There it is... The Beast.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "The Cat sleeps, but its ears twitch at the slightest sound.",
            next: 3
        },
        {
            id: 3,
            speaker: "System",
            text: "Hide behind objects (DOWN Key) when the Eye opens. Move only when it sleeps.",
            next: "action:stealth"
        }
    ],

    "mission_brief": [
        {
            id: 1,
            speaker: "Elder",
            text: "Take this. Use the cover of darkness. Do not fail us.",
            next: "action:journey"
        }
    ],

    // ========================================
    // ROPE BREAK SCENE
    // Player reaches the Cat but the rope snaps
    // ========================================

    "rope_break": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You reach the beast. Its massive form rises and falls with each breath.",
            next: 2
        },
        {
            id: 2,
            speaker: "Protagonist",
            text: "(Internal) This is it. The moment we've waited generations for.",
            type: "thought",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "You loop the rope around its neck. The old bell dangles uselessly—cracked, silent.",
            next: 4
        },
        {
            id: 4,
            speaker: "Protagonist",
            text: "(Internal) Why just replace it? I could pull. I could end this. Right now.",
            type: "thought",
            next: 5
        },
        {
            id: 5,
            speaker: "Narrator",
            text: "Your paws grip the rope. You pull. Tighter. Tighter.",
            next: 6
        },
        {
            id: 6,
            speaker: "Narrator",
            text: "SNAP.",
            next: 7
        },
        {
            id: 7,
            speaker: "Narrator",
            text: "The rope breaks. The Cat stirs. You flee into the darkness.",
            next: "phase2_return"
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
            next: "action:escape"
        }
    ],

    // ========================================
    // PHASE 3: THE CLIMB
    // Ascending the sleeping giant
    // ========================================

    "phase3_approach": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You emerge from the tunnels. The night air is cold.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "And there it lies. The Beast. A mountain of fur and death.",
            next: 3
        },
        {
            id: 3,
            speaker: "Protagonist",
            text: "(Internal) It's... enormous. How did I ever think I could kill this thing?",
            type: "thought",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "Its chest rises and falls like the tide. Each breath could be your last.",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "(Internal) No. The Elder died for this. They ALL died for this.",
            type: "thought",
            next: 6
        },
        {
            id: 6,
            speaker: "Protagonist",
            text: "(Internal) I will climb. I will reach its throat. And then...",
            type: "thought",
            next: 7
        },
        {
            id: 7,
            speaker: "System",
            text: "Climb the Cat. Hold DOWN when it twitches. Don't wake the beast.",
            next: "action:climb"
        }
    ],

    "phase3_summit": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You reach the collar. The old bell hangs silent—cracked and useless.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "Below you, the Cat's throat pulses with life. So fragile. So close.",
            next: 3
        },
        {
            id: 3,
            speaker: "Protagonist",
            text: "(Internal) This is it. The moment that will define everything.",
            type: "thought",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "The Elder's last words echo in your mind: 'The bell is a warning for THEM...'",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "...",
            choices: [
                { text: "Tie the bell. Honor the old ways.", nextId: "ending_bell_start" },
                { text: "Strangle the Cat. End this forever.", nextId: "ending_kill_start" }
            ]
        }
    ],

    // ========================================
    // ENDING A: THE BELL (The Coward's Way)
    // ========================================

    "ending_bell_start": [
        {
            id: 1,
            speaker: "Protagonist",
            text: "(Internal) I... I can't do it. Not like this.",
            type: "thought",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "Your paws tremble as you loop the rope around the collar.",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "The new bell gleams in the moonlight. One knot. Two knots.",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "DING.",
            next: 5
        },
        {
            id: 5,
            speaker: "Narrator",
            text: "The Cat's eye snaps open.",
            next: 6
        },
        {
            id: 6,
            speaker: "System",
            text: "RUN! Escape the awakened beast!",
            next: "action:chase"
        }
    ],

    "ending_bell_escape": [
        {
            id: 1,
            speaker: "Narrator",
            text: "You tumble into the darkness. Behind you, the Cat's roar shakes the world.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "But it doesn't follow. The bell rings with every movement now.",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "A warning. For all who would be hunted.",
            next: 4
        },
        {
            id: 4,
            speaker: "Protagonist",
            text: "(Internal) The Elder was right. This is how we survive.",
            type: "thought",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "(Internal) Not by killing our devils... but by knowing when they come.",
            type: "thought",
            next: 6
        },
        {
            id: 6,
            speaker: "Narrator",
            text: "The village will rebuild. The mice will remember. And the bell will ring.",
            next: 7
        },
        {
            id: 7,
            speaker: "Narrator",
            text: "[ END - The Devil We Know ]",
            next: null
        }
    ],

    // ========================================
    // ENDING B: THE KILL (The Hero's Way)
    // ========================================

    "ending_kill_start": [
        {
            id: 1,
            speaker: "Protagonist",
            text: "No more running. No more hiding. NO MORE FEAR!",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "You wrap the rope around its throat. Once. Twice.",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "The Cat's eyes fly open. But you pull. PULL!",
            next: 4
        },
        {
            id: 4,
            speaker: "System",
            text: "MASH SPACE to strangle the Cat!",
            next: "action:qte_kill"
        }
    ],

    "ending_kill_victory": [
        {
            id: 1,
            speaker: "Narrator",
            text: "The beast convulses. Its claws tear the air. But you hold.",
            next: 2
        },
        {
            id: 2,
            speaker: "Narrator",
            text: "And then... silence.",
            next: 3
        },
        {
            id: 3,
            speaker: "Narrator",
            text: "The Cat is dead. You have done what no mouse has ever done.",
            next: 4
        },
        {
            id: 4,
            speaker: "Narrator",
            text: "Days pass. The village celebrates. They dance on the corpse of their oppressor.",
            next: 5
        },
        {
            id: 5,
            speaker: "Protagonist",
            text: "We're free. Finally, truly FREE!",
            next: 6
        },
        {
            id: 6,
            speaker: "Narrator",
            text: "And then, on the seventh night... a shadow falls across the moon.",
            next: 7
        },
        {
            id: 7,
            speaker: "Narrator",
            text: "A shape. Sleek. Young. Fast.",
            next: 8
        },
        {
            id: 8,
            speaker: "Narrator",
            text: "Another Cat. The old one's offspring.",
            next: 9
        },
        {
            id: 9,
            speaker: "Narrator",
            text: "It has no bell. It makes no sound. And it is HUNGRY.",
            next: 10
        },
        {
            id: 10,
            speaker: "Protagonist",
            text: "(Internal) No... no, no, NO—",
            type: "thought",
            next: 11
        },
        {
            id: 11,
            speaker: "Narrator",
            text: "The screaming lasts until dawn. By sunrise, there are no mice left to scream.",
            next: 12
        },
        {
            id: 12,
            speaker: "Narrator",
            text: "The Elder's final words were never heard. But they were true.",
            next: 13
        },
        {
            id: 13,
            speaker: "Narrator",
            text: "'The bell is a warning for THEM... to stay away.'",
            next: 14
        },
        {
            id: 14,
            speaker: "Narrator",
            text: "[ END - The Devil We Made ]",
            next: null
        }
    ]
};
