"use strict";

console.log("[PoliceMenu] Script loading...");

var JobsClient = JobsClient || {};
JobsClient.PoliceMenu = JobsClient.PoliceMenu || {};

var PoliceMenu = JobsClient.PoliceMenu;

console.log("[PoliceMenu] Basic setup complete");

// Configuration
PoliceMenu.config = {
    windowWidth: 450,
    windowHeight: 550,
    padding: 20,
    buttonHeight: 40,
    buttonSpacing: 10,
    titleHeight: 40
};

// State
PoliceMenu.active = false;
PoliceMenu.window = null;
PoliceMenu.controls = {};

// Helper functions
function getJobsRpUi() {
    try {
        if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.ui) {
            return JobsRP.ui;
        }
    } catch (e) {
    }
    if (typeof mexui !== "undefined" && mexui) {
        return mexui;
    }
    return null;
}

function getScreenSize() {
    var width = 1280;
    var height = 720;

    try {
        if (gta && gta.width) {
            width = Number(gta.width) || width;
        }
        if (gta && gta.height) {
            height = Number(gta.height) || height;
        }
    } catch (e) {
    }

    try {
        if (screen && screen.width) {
            width = Number(screen.width) || width;
        }
        if (screen && screen.height) {
            height = Number(screen.height) || height;
        }
    } catch (e) {
    }

    return { width: width, height: height };
}

function getPoliceRankName(grade) {
    var ranks = [
        "Cadet", "Officer", "Senior Officer", "Corporal",
        "Sergeant", "Lieutenant", "Captain", "Chief"
    ];
    return ranks[Math.min(Math.max(0, Number(grade) || 0), ranks.length - 1)];
}

// Window creation using jobsrpui
PoliceMenu.createWindow = function() {
    console.log("[PoliceMenu] Creating window using jobsrpui");
    
    var ui = getJobsRpUi();
    if (!ui) {
        console.log("[PoliceMenu] No UI system available");
        return false;
    }

    var screen = getScreenSize();
    var centerX = Math.floor((screen.width - PoliceMenu.config.windowWidth) / 2);
    var centerY = Math.floor((screen.height - PoliceMenu.config.windowHeight) / 2);

    // Window styles (matching existing HUD style)
    var windowStyles = {
        main: {
            backgroundColour: toColour(40, 40, 40, 240),
            borderColour: toColour(100, 100, 100, 255),
            borderSize: 2
        }
    };

    // Button styles
    var buttonStyles = {
        main: {
            backgroundColour: toColour(60, 60, 60, 200),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(80, 80, 80, 255),
            borderSize: 1
        },
        hover: {
            backgroundColour: toColour(80, 80, 80, 220),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(120, 120, 120, 255)
        },
        active: {
            backgroundColour: toColour(100, 100, 100, 240),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(150, 150, 150, 255)
        }
    };

    // Text styles
    var textStyles = {
        main: {
            textColour: toColour(255, 255, 255, 255),
            textIndent: 0
        }
    };

    // Title text styles
    var titleStyles = {
        main: {
            textColour: toColour(255, 215, 0, 255), // Gold color
            textIndent: 0
        }
    };

    // Create window
    PoliceMenu.window = ui.window(centerX, centerY, PoliceMenu.config.windowWidth, PoliceMenu.config.windowHeight, "Police Menu", windowStyles);
    PoliceMenu.window.titleBarShown = true;
    PoliceMenu.window.shown = false;

    // Title
    PoliceMenu.controls.titleText = PoliceMenu.window.text(
        PoliceMenu.config.padding,
        PoliceMenu.config.padding + 25,
        PoliceMenu.config.windowWidth - (PoliceMenu.config.padding * 2),
        30,
        "POLICE DUTY MENU",
        titleStyles
    );

    // Player info section
    PoliceMenu.controls.playerInfo = PoliceMenu.window.text(
        PoliceMenu.config.padding,
        PoliceMenu.config.padding + 70,
        PoliceMenu.config.windowWidth - (PoliceMenu.config.padding * 2),
        20,
        "Loading player info...",
        textStyles
    );

    // Divider line
    PoliceMenu.controls.divider = PoliceMenu.window.rectangle(
        PoliceMenu.config.padding,
        PoliceMenu.config.padding + 100,
        PoliceMenu.config.windowWidth - (PoliceMenu.config.padding * 2),
        2,
        {
            main: {
                backgroundColour: toColour(100, 100, 100, 255)
            }
        }
    );

    // Duty buttons
    PoliceMenu.controls.dutyButtons = [];
    var duties = [
        { id: "patrol", label: "Patrol Duty", description: "Regular patrol duties and traffic enforcement" },
        { id: "traffic", label: "Traffic Control", description: "Dedicated traffic enforcement and accident response" },
        { id: "investigation", label: "Investigation", description: "Crime scene investigation and detective work" },
        { id: "swat", label: "SWAT Team", description: "Special weapons and tactics operations" }
    ];

    var buttonY = PoliceMenu.config.padding + 120;
    for (var i = 0; i < duties.length; i++) {
        var duty = duties[i];
        var button = PoliceMenu.window.button(
            PoliceMenu.config.padding,
            buttonY,
            PoliceMenu.config.windowWidth - (PoliceMenu.config.padding * 2),
            PoliceMenu.config.buttonHeight,
            duty.label + "\n" + duty.description,
            buttonStyles
        );
        button.dutyData = duty;
        PoliceMenu.controls.dutyButtons.push(button);
        buttonY += PoliceMenu.config.buttonHeight + PoliceMenu.config.buttonSpacing;
    }

    // Close button
    PoliceMenu.controls.closeButton = PoliceMenu.window.button(
        PoliceMenu.config.padding,
        PoliceMenu.config.windowHeight - PoliceMenu.config.padding - PoliceMenu.config.buttonHeight,
        PoliceMenu.config.windowWidth - (PoliceMenu.config.padding * 2),
        PoliceMenu.config.buttonHeight,
        "Close Menu (F11)",
        buttonStyles
    );

    console.log("[PoliceMenu] Window created successfully");
    return true;
};

// Update player info
PoliceMenu.updatePlayerInfo = function() {
    if (!PoliceMenu.controls.playerInfo) {
        return;
    }

    console.log("[PoliceMenu] Profile debug: " + JSON.stringify(JobsClient.profile));
    console.log("[PoliceMenu] Profile.name: " + (JobsClient.profile ? JobsClient.profile.name : "undefined"));
    console.log("[PoliceMenu] Profile.jobs: " + JSON.stringify(JobsClient.profile ? JobsClient.profile.jobs : "null"));

    var info = "Officer: ";
    // Try GTAC API first
    if (typeof player !== "undefined" && typeof player.name === "function") {
        try {
            var playerName = player.name();
            if (playerName && playerName !== "") {
                info += playerName;
            } else {
                info += "Unknown";
            }
        } catch (e) {
            console.log("[PoliceMenu] Error getting player name: " + String(e));
            info += "Unknown";
        }
    } else if (JobsClient.profile && JobsClient.profile.name) {
        info += JobsClient.profile.name;
    } else {
        // Fallback for testing
        info += "Officer";
        console.log("[PoliceMenu] Using fallback officer name - player.name API unavailable");
    }

    info += " | Rank: ";
    // Check correct profile structure for police grade
    if (JobsClient.profile && JobsClient.profile.jobs && JobsClient.profile.jobs.police && JobsClient.profile.jobs.police.grade !== undefined) {
        info += getPoliceRankName(JobsClient.profile.jobs.police.grade);
    } else if (JobsClient.profile && JobsClient.profile.policeGrade !== undefined) {
        // Fallback to direct policeGrade field
        info += getPoliceRankName(JobsClient.profile.policeGrade);
    } else {
        info += "None";
    }

    console.log("[PoliceMenu] Updated player info: " + info);
    PoliceMenu.controls.playerInfo.text = info;
};

// Handle duty selection
PoliceMenu.handleDutyClick = function(duty) {
    console.log("[PoliceMenu] Selected duty: " + duty.label);
    
    if (typeof triggerNetworkEvent === "function") {
        triggerNetworkEvent("jobs.police.selectDuty", duty.id);
    } else if (typeof triggerClientEvent === "function") {
        triggerClientEvent("jobs.police.selectDuty", duty.id);
    } else {
        console.log("[PoliceMenu] No network event function available");
    }

    if (JobsClient.UI) {
        JobsClient.UI.showPrompt("Selected duty: " + duty.label, "info", true);
    }

    // Close menu after selection
    PoliceMenu.hide();
};

// Show menu
PoliceMenu.show = function() {
    console.log("[PoliceMenu] show() called");
    if (PoliceMenu.active) {
        console.log("[PoliceMenu] Already active");
        return;
    }

    // Check if player is in police job
    if (!JobsClient.profile || JobsClient.profile.currentJobId !== "police") {
        console.log("[PoliceMenu] Player not in police job");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("You must be in the police job to access this menu.", "warn", true);
        }
        return;
    }

    if (!PoliceMenu.window && !PoliceMenu.createWindow()) {
        console.log("[PoliceMenu] Failed to create window");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Failed to create police menu UI.", "error", true);
        }
        return;
    }

    PoliceMenu.updatePlayerInfo();
    PoliceMenu.window.shown = true;
    PoliceMenu.active = true;

    // Show cursor
    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(true);
    }

    // Setup button handlers
    if (PoliceMenu.controls.closeButton) {
        PoliceMenu.controls.closeButton.onClick = function() {
            PoliceMenu.hide();
        };
    }

    for (var i = 0; i < PoliceMenu.controls.dutyButtons.length; i++) {
        var button = PoliceMenu.controls.dutyButtons[i];
        button.onClick = function() {
            PoliceMenu.handleDutyClick(this.dutyData);
        };
    }

    console.log("[PoliceMenu] Menu shown with player info: " + PoliceMenu.controls.playerInfo.text);
};

// Hide menu
PoliceMenu.hide = function() {
    console.log("[PoliceMenu] hide() called");
    if (!PoliceMenu.active) {
        return;
    }

    if (PoliceMenu.window) {
        PoliceMenu.window.shown = false;
    }
    PoliceMenu.active = false;

    // Hide cursor
    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(false);
    }

    console.log("[PoliceMenu] Menu hidden");
};

// Toggle menu
PoliceMenu.toggle = function() {
    console.log("[PoliceMenu] toggle() called, active=" + PoliceMenu.active);
    if (PoliceMenu.active) {
        PoliceMenu.hide();
    } else {
        PoliceMenu.show();
    }
};

// Auto-update player info when profile changes
PoliceMenu.onProfileUpdate = function() {
    if (PoliceMenu.active) {
        PoliceMenu.updatePlayerInfo();
    }
};

// Keyboard shortcut for police menu (F11 key)
console.log("[PoliceMenu] Setting up F11 keybind");
console.log("[PoliceMenu] SDLK_F11 available: " + typeof SDLK_F11);
console.log("[PoliceMenu] KEYSTATE_DOWN available: " + typeof KEYSTATE_DOWN);

if (typeof bindKey === "function") {
    // Try with constants first (like mexui)
    if (typeof SDLK_F11 !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
        bindKey(SDLK_F11, KEYSTATE_DOWN, function(e) {
            console.log("[PoliceMenu] F11 pressed (with constants)");
            PoliceMenu.toggle();
        });
        console.log("[PoliceMenu] F11 keybind registered with constants");
    }
    // Fallback to integer values
    else {
        bindKey(302, 1, function() {
            console.log("[PoliceMenu] F11 pressed (with integers)");
            PoliceMenu.toggle();
        });
        console.log("[PoliceMenu] F11 keybind registered with integers");
    }
} else {
    console.log("[PoliceMenu] bindKey not available");
}

// Network handler for duty updates
if (typeof addNetworkHandler === "function") {
    addNetworkHandler("jobs.police.dutyResult", function(success, message, dutyId) {
        console.log("[PoliceMenu] Duty result: " + String(success) + " - " + String(message));
        if (JobsClient.UI) {
            var level = success ? "success" : "warn";
            JobsClient.UI.showPrompt(message, level, true);
        }
        
        if (success && PoliceMenu.active) {
            PoliceMenu.hide(); // Close menu after successful duty selection
        }
    });
    console.log("[PoliceMenu] Network handlers registered");
}

// Export for global access
if (typeof globalThis !== "undefined") {
    globalThis.PoliceMenu = PoliceMenu;
}


console.log("[PoliceMenu] Police menu loaded with jobsrpui framework");
