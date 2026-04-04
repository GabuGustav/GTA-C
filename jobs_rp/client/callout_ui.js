"use strict";

function debugLog() {
    var enabled = false;
    try {
        enabled = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.debug === true);
    } catch (e) {
        enabled = false;
    }
    if (!enabled) {
        return;
    }
    if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log.apply(console, arguments);
    }
}

var CalloutUI = CalloutUI || {};

// Callout Acceptance UI
CalloutUI.Manager = {
    window: null,
    visible: false,
    currentCallout: null,
    
    init: function() {
        debugLog("[CalloutUI] Initializing callout acceptance UI");
        
        // Create UI window
        this.createWindow();
        
        // Setup network handlers
        this.setupNetworkHandlers();
        
        debugLog("[CalloutUI] Callout UI initialized");
    },
    
    createWindow: function() {
        // Create main window
        this.window = mexui.window(100, 100, 400, 300, "Police Callout", {
            background: "rgba(0, 0, 0, 0.8)",
            border: "rgba(100, 100, 255, 0.3)",
            titleBackground: "rgba(0, 50, 100, 0.9)",
            titleColor: "#ffffff"
        });
        
        // Create callout info section
        this.createCalloutInfo();
        
        // Create action buttons
        this.createActionButtons();
        
        // Create backup request section
        this.createBackupSection();
        
        // Initially hide
        this.window.setShown(false);
    },
    
    createCalloutInfo: function() {
        // Callout title
        var titleLabel = new mexui.Component.Control(this.window, 20, 40, 360, 30, {
            text: "No Active Callout",
            colour: toColour(255, 255, 255),
            size: 18,
            weight: "bold",
            align: "center"
        });
        
        this.window.controls.push(titleLabel);
        this.titleLabel = titleLabel;
        
        // Callout description
        var descLabel = new mexui.Component.Control(this.window, 20, 80, 360, 60, {
            text: "Awaiting callout assignment...",
            colour: toColour(204, 204, 204),
            size: 14,
            align: "center"
        });
        
        this.window.controls.push(descLabel);
        this.descLabel = descLabel;
        
        // Callout location
        var locationLabel = new mexui.Component.Control(this.window, 20, 150, 360, 25, {
            text: "",
            colour: toColour(170, 170, 170),
            size: 12,
            align: "center"
        });
        
        this.window.controls.push(locationLabel);
        this.locationLabel = locationLabel;
    },
    
    createActionButtons: function() {
        // Accept button
        var acceptButton = new mexui.Component.Control(this.window, 50, 200, 120, 35, {
            text: "Accept Callout",
            colour: toColour(0, 150, 0),
            hoverColour: toColour(0, 200, 0),
            textColour: toColour(255, 255, 255),
            size: 14,
            weight: "bold"
        });
        
        acceptButton.onClick = function() {
            CalloutUI.Manager.acceptCallout();
        };
        
        this.window.controls.push(acceptButton);
        this.acceptButton = acceptButton;
        
        // Decline button
        var declineButton = new mexui.Component.Control(this.window, 230, 200, 120, 35, {
            text: "Decline",
            colour: toColour(150, 0, 0),
            hoverColour: toColour(200, 0, 0),
            textColour: toColour(255, 255, 255),
            size: 14,
            weight: "bold"
        });
        
        declineButton.onClick = function() {
            CalloutUI.Manager.declineCallout();
        };
        
        this.window.controls.push(declineButton);
        this.declineButton = declineButton;
        
        // Initially disable buttons
        acceptButton.shown = false;
        declineButton.shown = false;
    },
    
    createBackupSection: function() {
        // Backup request button
        var backupButton = new mexui.Component.Control(this.window, 20, 250, 160, 30, {
            text: "Request Backup (N)",
            colour: toColour(0, 100, 200),
            hoverColour: toColour(0, 150, 255),
            textColour: toColour(255, 255, 255),
            size: 12
        });
        
        backupButton.onClick = function() {
            if (BackupSystem && BackupSystem.Manager) {
                BackupSystem.Manager.requestBackup();
            }
        };
        
        this.window.controls.push(backupButton);
        this.backupButton = backupButton;
        
        // End current callout button
        var endButton = new mexui.Component.Control(this.window, 220, 250, 160, 30, {
            text: "End Callout",
            colour: toColour(150, 150, 0),
            hoverColour: toColour(200, 200, 0),
            textColour: toColour(255, 255, 255),
            size: 12
        });
        
        endButton.onClick = function() {
            CalloutUI.Manager.endCurrentCallout();
        };
        
        this.window.controls.push(endButton);
        this.endButton = endButton;
        
        // Initially disable end button
        endButton.shown = false;
    },
    
    setupNetworkHandlers: function() {
        // Handle callout assignment from server
        addNetworkHandler("police.calloutAssignment", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    CalloutUI.Manager.handleCalloutAssignment(data);
                }
            } catch (e) {
                debugLog("[CalloutUI] Error handling callout assignment: " + String(e));
            }
        });
        
        // Handle backup requests
        addNetworkHandler("police.backupRequest", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    CalloutUI.Manager.handleBackupRequest(data);
                }
            } catch (e) {
                debugLog("[CalloutUI] Error handling backup request: " + String(e));
            }
        });
    },
    
    show: function() {
        if (this.window) {
            this.window.setShown(true);
            this.visible = true;
            debugLog("[CalloutUI] Callout window shown");
        }
    },
    
    hide: function() {
        if (this.window) {
            this.window.setShown(false);
            this.visible = false;
            debugLog("[CalloutUI] Callout window hidden");
        }
    },
    
    updateCalloutInfo: function(callout) {
        if (!this.titleLabel || !this.descLabel || !this.locationLabel) {
            return;
        }
        
        this.currentCallout = callout;
        
        // Update title
        this.titleLabel.text = callout.name || "Callout";
        
        // Update description
        var description = callout.message || "Respond to this callout";
        this.descLabel.text = description;
        
        // Update location
        var locationText = "";
        if (callout.position) {
            locationText = "Location: " + 
                Math.round(callout.position.x) + ", " + 
                Math.round(callout.position.y) + ", " + 
                Math.round(callout.position.z);
        }
        this.locationLabel.text = locationText;
        
        // Enable action buttons
        if (this.acceptButton) this.acceptButton.shown = true;
        if (this.declineButton) this.declineButton.shown = true;
        if (this.endButton) this.endButton.shown = true;
        
        debugLog("[CalloutUI] Updated callout info: " + callout.name);
    },
    
    handleCalloutAssignment: function(data) {
        debugLog("[CalloutUI] Received callout assignment: " + JSON.stringify(data));
        
        if (data.officerName === this.getPlayerName()) {
            // This assignment is for us
            this.updateCalloutInfo({
                name: data.calloutType,
                message: "Assigned to " + data.calloutType + " callout",
                position: data.position
            });
            
            // Show the UI
            this.show();
            
            // Auto-accept after 2 seconds if not manually responded
            setTimeout(function() {
                if (CalloutUI.Manager.currentCallout && 
                    CalloutUI.Manager.currentCallout.name === data.calloutType) {
                    CalloutUI.Manager.acceptCallout();
                }
            }, 2000);
        }
    },
    
    handleBackupRequest: function(data) {
        debugLog("[CalloutUI] Received backup request: " + JSON.stringify(data));
        
        // Show backup request notification
        if (JobsClient && JobsClient.UI) {
            var message = data.officerName + " requests backup!";
            JobsClient.UI.showPrompt(message, "warning", true);
        }
        
        // Create backup response UI
        this.showBackupResponseDialog(data);
    },
    
    showBackupResponseDialog: function(backupData) {
        // Create response dialog
        var responseWindow = mexui.window(150, 150, 350, 200, "Backup Request", {
            background: toColour(0, 0, 0, 230),
            border: toColour(100, 100, 255, 128)
        });
        
        // Request info
        var infoText = new mexui.Component.Control(responseWindow, 20, 40, 310, 80, {
            text: backupData.officerName + " needs backup!\n\nSituation: " + 
                   (backupData.situation || "Unknown") + "\nDistance: " + 
                   this.getDistanceToPlayer(backupData.position) + "m",
            colour: toColour(255, 255, 255),
            size: 14
        });
        
        responseWindow.controls.push(infoText);
        
        // Response buttons
        var respondButton = new mexui.Component.Control(responseWindow, 30, 140, 130, 35, {
            text: "Respond",
            colour: toColour(0, 150, 0),
            hoverColour: toColour(0, 200, 0),
            textColour: toColour(255, 255, 255),
            size: 14
        });
        
        respondButton.onClick = function() {
            if (BackupSystem && BackupSystem.Manager) {
                BackupSystem.Manager.respondToBackup(backupData.requestId, true);
            }
            responseWindow.setShown(false);
        };
        
        responseWindow.controls.push(respondButton);
        
        var declineButton = new mexui.Component.Control(responseWindow, 190, 140, 130, 35, {
            text: "Decline",
            colour: toColour(150, 0, 0),
            hoverColour: toColour(200, 0, 0),
            textColour: toColour(255, 255, 255),
            size: 14
        });
        
        declineButton.onClick = function() {
            if (BackupSystem && BackupSystem.Manager) {
                BackupSystem.Manager.respondToBackup(backupData.requestId, false);
            }
            responseWindow.setShown(false);
        };
        
        responseWindow.controls.push(declineButton);
        
        // Auto-close after 10 seconds
        setTimeout(function() {
            responseWindow.setShown(false);
        }, 10000);
    },
    
    acceptCallout: function() {
        if (!this.currentCallout) {
            return;
        }
        
        debugLog("[CalloutUI] Accepting callout: " + this.currentCallout.name);
        
        // Start the callout
        if (Callouts && Callouts.Manager) {
            Callouts.Manager.startCallout(this.currentCallout.type);
        }
        
        // Hide UI
        this.hide();
        
        // Show confirmation
        if (JobsClient && JobsClient.UI) {
            JobsClient.UI.showPrompt("Callout accepted", "success", false);
        }
    },
    
    declineCallout: function() {
        if (!this.currentCallout) {
            return;
        }
        
        debugLog("[CalloutUI] Declining callout: " + this.currentCallout.name);
        
        // Hide UI
        this.hide();
        
        // Show confirmation
        if (JobsClient && JobsClient.UI) {
            JobsClient.UI.showPrompt("Callout declined", "info", false);
        }
    },
    
    endCurrentCallout: function() {
        if (!Callouts || !Callouts.Manager || !Callouts.Manager.active) {
            return;
        }
        
        debugLog("[CalloutUI] Ending current callout");
        
        // End the active callout
        Callouts.Manager.endCallout();
        
        // Reset UI
        this.updateCalloutInfo(null);
        
        // Show confirmation
        if (JobsClient && JobsClient.UI) {
            JobsClient.UI.showPrompt("Callout ended", "success", false);
        }
    },
    
    getPlayerName: function() {
        // Try GTAC API first
        if (typeof player !== "undefined" && typeof player.name === "function") {
            try {
                var playerName = player.name();
                if (playerName && playerName !== "") {
                    return playerName.replace(/#\d+$/, "");
                }
            } catch (e) {
                debugLog("[CalloutUI] Error getting player name: " + String(e));
            }
        } else if (JobsClient.profile && JobsClient.profile.name) {
            return JobsClient.profile.name;
        }
        
        return "Unknown Officer";
    },
    
    getDistanceToPlayer: function(position) {
        if (!localPlayer || !localPlayer.position || !position) {
            return 0;
        }
        
        var dx = localPlayer.position.x - position.x;
        var dy = localPlayer.position.y - position.y;
        var dz = localPlayer.position.z - position.z;
        
        return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
};

// Initialize callout UI when resource starts
addEventHandler("onResourceStart", function() {
    if (typeof CalloutUI !== "undefined") {
        setTimeout(function() {
            CalloutUI.Manager.init();
        }, 6000); // Delay to ensure all systems are loaded
    }
});
