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
            next: null // End of scene/Transition
        }
    ]
};
