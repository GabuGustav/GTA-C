"use strict";

console.log("[PoliceHUD] Loading police HUD...");

// Load shared utilities
if (typeof require !== "undefined") {
    try {
        require("shared_utils.js");
    } catch (e) {
        console.log("[PoliceHUD] Could not load shared utilities: " + String(e));
    }
}

var JobsClient = JobsClient || {};
JobsClient.PoliceHUD = JobsClient.PoliceHUD || {};

var PoliceHUD = JobsClient.PoliceHUD;
var Utils = JobsClient.Utils || {};

// Configuration
PoliceHUD.config = {
    enabled: true,
    position: { x: 0.02, y: 0.15 }, // Top-left position
    width: 250,
    height: 120,
    padding: 10,
    fontSize: 0.8,
    backgroundAlpha: 180,
    updateInterval: 1000 // Update every second
};

// State
PoliceHUD.active = false;
PoliceHUD.currentJobId = null;
PoliceHUD.policeGrade = 0;
PoliceHUD.currentDuty = null;
PoliceHUD.playerName = "Officer";
PoliceHUD.lastUpdate = 0;
PoliceHUD.drawEventName = "";

// Helper functions
function getPoliceRankName(grade) {
    var ranks = [
        "Cadet", "Officer", "Senior Officer", "Corporal",
        "Sergeant", "Lieutenant", "Captain", "Chief"
    ];
    return ranks[Math.min(Math.max(0, Number(grade) || 0), ranks.length - 1)];
}

function getDutyDisplayName(dutyId) {
    var duties = {
        "patrol": "Patrol Duty",
        "traffic": "Traffic Control", 
        "investigation": "Investigation",
        "swat": "SWAT Team"
    };
    return duties[dutyId] || "On Duty";
}

function getScreenSize() {
    if (typeof Utils !== "undefined" && Utils.getScreenSize) {
        return Utils.getScreenSize();
    }
    if (typeof gta !== "undefined" && gta.screen) {
        return { width: gta.screen.width, height: gta.screen.height };
    }
    return { width: 1280, height: 720 };
}

function nowMs() {
    if (typeof Date !== "undefined" && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
}

// Draw functions
function drawRect(x, y, width, height, r, g, b, a) {
    if (typeof drawRectNorm === "function") {
        drawRectNorm(x / screen.width, y / screen.height, width / screen.width, height / screen.height, r, g, b, a);
    } else if (typeof gta !== "undefined" && gta.drawRect) {
        gta.drawRect(x, y, width, height, r, g, b, a);
    }
}

function drawText(text, x, y, size, r, g, b, a) {
    if (typeof drawTextSimple === "function") {
        drawTextSimple(text, x / screen.width, y / screen.height, r, g, b, a);
    } else if (typeof gta !== "undefined" && gta.drawText) {
        gta.drawText(text, x, y, size, r, g, b, a);
    }
}

// Main draw function
PoliceHUD.draw = function() {
    if (!PoliceHUD.enabled || !PoliceHUD.active || PoliceHUD.currentJobId !== "police") {
        return;
    }

    var now = nowMs();
    if (now - PoliceHUD.lastUpdate < PoliceHUD.config.updateInterval) {
        return;
    }
    PoliceHUD.lastUpdate = now;

    var screen = getScreenSize();
    var scale = Math.min(screen.width / 1280, screen.height / 720);
    
    var x = screen.width * PoliceHUD.config.position.x;
    var y = screen.height * PoliceHUD.config.position.y;
    var width = PoliceHUD.config.width * scale;
    var height = PoliceHUD.config.height * scale;
    var padding = PoliceHUD.config.padding * scale;

    // Background
    drawRect(x, y, width, height, 20, 20, 40, PoliceHUD.config.backgroundAlpha);
    
    // Border
    drawRect(x, y, width, 2, 100, 100, 150, 255);
    drawRect(x, y + height - 2, width, 2, 100, 100, 150, 255);
    drawRect(x, y, 2, height, 100, 100, 150, 255);
    drawRect(x + width - 2, y, 2, height, 100, 100, 150, 255);

    var textY = y + padding;
    var textX = x + padding;
    var fontSize = PoliceHUD.config.fontSize * scale;

    // Title
    drawText("LCPD STATUS", textX, textY, fontSize * 1.2, 255, 215, 0, 255);
    textY += fontSize * 1.5;

    // Officer Name
    drawText("Officer: " + PoliceHUD.playerName, textX, textY, fontSize, 255, 255, 255, 255);
    textY += fontSize * 1.2;

    // Rank
    drawText("Rank: " + getPoliceRankName(PoliceHUD.policeGrade), textX, textY, fontSize, 200, 200, 255, 255);
    textY += fontSize * 1.2;

    // Duty Status
    if (PoliceHUD.currentDuty) {
        drawText("Duty: " + getDutyDisplayName(PoliceHUD.currentDuty), textX, textY, fontSize, 100, 255, 100, 255);
    } else {
        drawText("Duty: Off Duty", textX, textY, fontSize, 255, 100, 100, 255);
    }
};

// Update functions
PoliceHUD.updateFromProfile = function() {
    if (!JobsClient.profile) {
        return;
    }

    // Update basic info
    PoliceHUD.currentJobId = JobsClient.profile.currentJobId || null;
    PoliceHUD.playerName = "Officer"; // Will be updated by network events

    // Update police grade from profile
    if (JobsClient.profile.jobs && JobsClient.profile.jobs.police && JobsClient.profile.jobs.police.grade !== undefined) {
        PoliceHUD.policeGrade = JobsClient.profile.jobs.police.grade;
    } else if (JobsClient.profile.policeGrade !== undefined) {
        PoliceHUD.policeGrade = JobsClient.profile.policeGrade;
    }

    // Update duty status
    if (JobsClient.profile.currentPoliceDuty) {
        PoliceHUD.currentDuty = JobsClient.profile.currentPoliceDuty;
    }

    // Activate HUD if in police job
    PoliceHUD.active = PoliceHUD.currentJobId === "police";

    console.log("[PoliceHUD] Updated from profile - Job: " + PoliceHUD.currentJobId + 
               ", Rank: " + getPoliceRankName(PoliceHUD.policeGrade) + 
               ", Duty: " + (PoliceHUD.currentDuty || "None"));
};

PoliceHUD.setPlayerName = function(name) {
    PoliceHUD.playerName = name || "Officer";
};

PoliceHUD.setDuty = function(dutyId) {
    PoliceHUD.currentDuty = dutyId;
    console.log("[PoliceHUD] Duty set to: " + (dutyId || "Off Duty"));
};

PoliceHUD.setRank = function(grade) {
    PoliceHUD.policeGrade = grade || 0;
    console.log("[PoliceHUD] Rank set to: " + getPoliceRankName(PoliceHUD.policeGrade));
};

// Control functions
PoliceHUD.enable = function() {
    PoliceHUD.enabled = true;
    console.log("[PoliceHUD] Enabled");
};

PoliceHUD.disable = function() {
    PoliceHUD.enabled = false;
    console.log("[PoliceHUD] Disabled");
};

PoliceHUD.toggle = function() {
    PoliceHUD.enabled = !PoliceHUD.enabled;
    console.log("[PoliceHUD] " + (PoliceHUD.enabled ? "Enabled" : "Disabled"));
};

// Initialize
PoliceHUD.init = function() {
    console.log("[PoliceHUD] Initializing police HUD...");

    // Register draw event
    if (typeof attachFirstHandler === "function") {
        PoliceHUD.drawEventName = attachFirstHandler([
            "OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", 
            "OnRender", "onRender"
        ], PoliceHUD.draw);
        console.log("[PoliceHUD] Draw event registered as: " + PoliceHUD.drawEventName);
    }

    // Register network handlers
    if (typeof addNetworkHandler === "function") {
        // Update player name
        addNetworkHandler("jobs.police.updateName", function(name) {
            PoliceHUD.setPlayerName(name);
        });

        // Update duty status
        addNetworkHandler("jobs.police.updateDuty", function(dutyId) {
            PoliceHUD.setDuty(dutyId);
        });

        // Update rank
        addNetworkHandler("jobs.police.updateRank", function(grade) {
            PoliceHUD.setRank(grade);
        });

        console.log("[PoliceHUD] Network handlers registered");
    }

    // Initial update from profile
    PoliceHUD.updateFromProfile();

    // Auto-update when profile changes
    if (JobsClient && JobsClient.onProfileUpdate) {
        var originalHandler = JobsClient.onProfileUpdate;
        JobsClient.onProfileUpdate = function() {
            originalHandler();
            PoliceHUD.updateFromProfile();
        };
    }

    console.log("[PoliceHUD] Police HUD initialized successfully");
};

// Export for global access
if (typeof globalThis !== "undefined") {
    globalThis.PoliceHUD = PoliceHUD;
}

console.log("[PoliceHUD] Police HUD script loaded");
