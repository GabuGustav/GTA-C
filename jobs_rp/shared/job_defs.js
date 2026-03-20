"use strict";

var JobsRP = JobsRP || {};
JobsRP.JobDefs = JobsRP.JobDefs || {};

var defs = [
    {
        id: "taxi",
        label: "Taxi Driver",
        hub: [-50, -100, 30],
        payout: 70,
        xp: 25,
        constraints: { role: "civilian" },
        pools: {
            pickups: [
                [-120, -45, 28],
                [-15, 95, 25],
                [70, -160, 32],
                [135, 25, 29],
                [-210, 110, 26],
                [240, -70, 31]
            ],
            dropoffs: [
                [-300, 220, 24],
                [30, 310, 22],
                [185, -250, 35],
                [330, 80, 28],
                [-160, -280, 30],
                [55, -20, 29]
            ]
        }
    },
    {
        id: "robbery",
        label: "Crew Robbery",
        hub: [0, 200, 20],
        payout: 220,
        xp: 80,
        constraints: { role: "civilian", minPlayers: 2 },
        pools: {
            heist_targets: [
                [5, 210, 20],
                [-8, 195, 19],
                [16, 188, 20],
                [65, 260, 22]
            ],
            stash_points: [
                [-55, 255, 21],
                [120, 150, 23],
                [-125, 175, 20],
                [155, 300, 24]
            ],
            escape: [
                [-170, 280, 18],
                [210, 220, 25],
                [30, 310, 22],
                [185, -250, 35]
            ]
        },
        stages: [
            { id: "gather", type: "gather", label: "Wait for crew", pool: "heist_targets", distance: 8 },
            { id: "crack", type: "crack", label: "Hold E to crack safe", usePreviousTarget: true, durationMs: 10000, distance: 8 },
            { id: "bags", type: "bags", label: "Grab bag", pool: "stash_points", distance: 8 },
            { id: "escape", type: "escape", label: "Escape to drop-off", pool: "escape", distance: 8 }
        ]
    },
    {
        id: "police",
        label: "Police Patrol",
        hub: [100, 50, 25],
        payout: 110,
        xp: 45,
        constraints: { role: "civilian" },
        pools: {
            patrol: [
                [125, 85, 24],
                [80, 140, 26],
                [175, 40, 25],
                [55, -10, 27],
                [220, 95, 24]
            ],
            incidents: [
                [95, 45, 25],
                [110, 60, 25],
                [85, 35, 25],
                [70, -160, 32]
            ]
        }
    }
];

var byId = {};
for (var i = 0; i < defs.length; i++) {
    byId[defs[i].id] = defs[i];
}

JobsRP.JobDefs.list = defs;
JobsRP.JobDefs.byId = byId;
JobsRP.JobDefs.get = function(jobId) {
    return byId[jobId];
};
