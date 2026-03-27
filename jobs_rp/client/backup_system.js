"use strict";

var BackupSystem = BackupSystem || {};

// Backup Request System
BackupSystem.Manager = {
    requests: [],
    activeOfficers: [],
    maxBackupDistance: 500,
    requestCooldown: 30000, // 30 seconds
    
    init: function() {
        console.log("[BackupSystem] Initializing backup request system");
        
        // Setup network handlers
        this.setupNetworkHandlers();
        
        // Setup keybinds
        this.setupKeybinds();
        
        // Start officer tracking
        this.startOfficerTracking();
        
        console.log("[BackupSystem] Backup system initialized");
    },
    
    setupNetworkHandlers: function() {
        // Handle backup requests from other officers
        addNetworkHandler("police.backupRequest", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    BackupSystem.Manager.handleBackupRequest(data);
                }
            } catch (e) {
                console.log("[BackupSystem] Error handling backup request: " + String(e));
            }
        });
        
        // Handle backup responses
        addNetworkHandler("police.backupResponse", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    BackupSystem.Manager.handleBackupResponse(data);
                }
            } catch (e) {
                console.log("[BackupSystem] Error handling backup response: " + String(e));
            }
        });
        
        // Handle officer position updates
        addNetworkHandler("police.broadcastPosition", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    BackupSystem.Manager.updateOfficerPosition(data);
                }
            } catch (e) {
                console.log("[BackupSystem] Error handling position broadcast: " + String(e));
            }
        });
        
        // Handle callout assignments
        addNetworkHandler("police.calloutAssignment", function(a, b) {
            try {
                var data = unwrapArgs(a, b)[0];
                if (data) {
                    BackupSystem.Manager.handleCalloutAssignment(data);
                }
            } catch (e) {
                console.log("[BackupSystem] Error handling callout assignment: " + String(e));
            }
        });
    },
    
    setupKeybinds: function() {
        if (typeof bindKey !== "undefined") {
            // N key for backup request
            try {
                bindKey(SDLK_n, KEYSTATE_DOWN, function() {
                    if (BackupSystem.Manager.canRequestBackup()) {
                        BackupSystem.Manager.requestBackup();
                    }
                });
                
                console.log("[BackupSystem] Backup keybind setup (N key)");
            } catch (e) {
                console.log("[BackupSystem] Failed to setup N keybind: " + String(e));
            }
        }
    },
    
    canRequestBackup: function() {
        // Check if player is on duty as police
        if (!JobsClient.profile || JobsClient.profile.currentJobId !== "police") {
            return false;
        }
        
        // Check cooldown
        if (this.lastRequestTime && (Date.now() - this.lastRequestTime) < this.requestCooldown) {
            var remaining = Math.ceil((this.requestCooldown - (Date.now() - this.lastRequestTime)) / 1000);
            if (JobsClient.UI) {
                JobsClient.UI.showPrompt("Backup request cooldown: " + remaining + " seconds", "info", false);
            }
            return false;
        }
        
        return true;
    },
    
    requestBackup: function() {
        if (!localPlayer || !localPlayer.position) {
            return;
        }
        
        var position = localPlayer.position;
        var playerName = this.getPlayerName();
        
        // Create backup request data
        var requestData = {
            officerName: playerName,
            position: position,
            timestamp: Date.now(),
            requestId: this.generateRequestId(),
            situation: this.getCurrentSituation()
        };
        
        // Send to server
        triggerNetworkEvent("police.requestBackup", requestData);
        
        // Play backup request audio
        if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
            PoliceScanner.Manager.playBackupRequest(position);
        }
        
        // Store request
        this.requests.push(requestData);
        this.lastRequestTime = Date.now();
        
        // Show confirmation
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Backup requested at your location", "success", true);
        }
        
        console.log("[BackupSystem] Backup requested: " + JSON.stringify(requestData));
    },
    
    handleBackupRequest: function(data) {
        console.log("[BackupSystem] Received backup request: " + JSON.stringify(data));
        
        // Check if we can respond
        if (!this.canRespondToBackup(data)) {
            return;
        }
        
        var distance = this.getDistance(localPlayer.position, data.position);
        
        // Show backup request to player
        if (JobsClient.UI) {
            var message = data.officerName + " requests backup (" + Math.round(distance) + "m away)";
            JobsClient.UI.showPrompt(message, "warning", true);
        }
        
        // Create blip for backup location
        this.createBackupBlip(data.position, data.requestId);
        
        // Auto-respond if very close
        if (distance <= 150) {
            setTimeout(function() {
                BackupSystem.Manager.respondToBackup(data.requestId, true);
            }, 2000);
        }
    },
    
    respondToBackup: function(requestId, accept) {
        var playerName = this.getPlayerName();
        var response = {
            requestId: requestId,
            officerName: playerName,
            accept: accept,
            position: localPlayer.position,
            timestamp: Date.now()
        };
        
        // Send response
        triggerNetworkEvent("police.respondToBackup", response);
        
        if (JobsClient.UI) {
            var message = accept ? "Responding to backup request" : "Declined backup request";
            JobsClient.UI.showPrompt(message, accept ? "success" : "info", false);
        }
        
        console.log("[BackupSystem] Backup response: " + JSON.stringify(response));
    },
    
    handleBackupResponse: function(data) {
        console.log("[BackupSystem] Received backup response: " + JSON.stringify(data));
        
        // Find the original request
        var request = this.requests.find(function(req) {
            return req.requestId === data.requestId;
        });
        
        if (!request) {
            return;
        }
        
        if (data.accept) {
            // Officer is responding
            if (JobsClient.UI) {
                var message = data.officerName + " is responding to backup";
                JobsClient.UI.showPrompt(message, "success", true);
            }
            
            // Create responding officer blip
            this.createOfficerBlip(data.position, data.officerName);
            
            // Add to active officers
            this.activeOfficers.push({
                name: data.officerName,
                position: data.position,
                timestamp: Date.now(),
                respondingTo: data.requestId
            });
        } else {
            // Officer declined
            if (JobsClient.UI) {
                var message = data.officerName + " declined backup request";
                JobsClient.UI.showPrompt(message, "info", false);
            }
        }
    },
    
    canRespondToBackup: function(data) {
        // Check if player is on duty
        if (!JobsClient.profile || JobsClient.profile.currentJobId !== "police") {
            return false;
        }
        
        // Check if already responding to another call
        if (this.activeOfficers.some(function(officer) {
            return officer.name === this.getPlayerName();
        }.bind(this))) {
            return false;
        }
        
        // Check distance
        var distance = this.getDistance(localPlayer.position, data.position);
        if (distance > this.maxBackupDistance) {
            return false;
        }
        
        return true;
    },
    
    startOfficerTracking: function() {
        // Update officer positions every 5 seconds
        setInterval(function() {
            if (BackupSystem.Manager.isOfficerOnDuty()) {
                BackupSystem.Manager.broadcastPosition();
            }
        }, 5000);
    },
    
    isOfficerOnDuty: function() {
        return JobsClient.profile && JobsClient.profile.currentJobId === "police";
    },
    
    broadcastPosition: function() {
        if (!localPlayer || !localPlayer.position) {
            return;
        }
        
        var positionData = {
            officerName: this.getPlayerName(),
            position: localPlayer.position,
            timestamp: Date.now(),
            onDuty: true,
            currentCallout: Callouts.Manager.active ? Callouts.Manager.active.name : null
        };
        
        // Broadcast position to other officers
        // Only broadcast if there are other officers to avoid unnecessary errors
        if (this.activeOfficers && Object.keys(this.activeOfficers).length > 0) {
            triggerNetworkEvent("police.broadcastPosition", positionData);
        }
    },
    
    updateOfficerPosition: function(data) {
        // Update officer position in our tracking
        var officerIndex = this.activeOfficers.findIndex(function(officer) {
            return officer.name === data.officerName;
        });
        
        if (officerIndex >= 0) {
            this.activeOfficers[officerIndex].position = data.position;
            this.activeOfficers[officerIndex].timestamp = data.timestamp;
            
            // Update officer blip position
            this.updateOfficerBlip(data.officerName, data.position);
        } else if (data.onDuty && data.officerName !== this.getPlayerName()) {
            // Add new officer to tracking
            this.activeOfficers.push({
                name: data.officerName,
                position: data.position,
                timestamp: data.timestamp,
                currentCallout: data.currentCallout
            });
            
            // Create officer blip
            this.createOfficerBlip(data.position, data.officerName);
        }
    },
    
    handleCalloutAssignment: function(data) {
        console.log("[BackupSystem] Received callout assignment: " + JSON.stringify(data));
        
        if (data.officerName === this.getPlayerName()) {
            // This assignment is for us
            if (JobsClient.UI) {
                var message = "Assigned to callout: " + data.calloutType;
                JobsClient.UI.showPrompt(message, "info", true);
            }
            
            // Start the assigned callout
            if (Callouts.Manager) {
                Callouts.Manager.startCallout(data.calloutType);
            }
        } else {
            // Another officer got the assignment
            if (JobsClient.UI) {
                var message = data.officerName + " assigned to " + data.calloutType;
                JobsClient.UI.showPrompt(message, "info", false);
            }
        }
    },
    
    createBackupBlip: function(position, requestId) {
        // This would create a blip for backup request location
        console.log("[BackupSystem] Creating backup blip at: " + JSON.stringify(position));
        // Implementation depends on your blip system
    },
    
    createOfficerBlip: function(position, officerName) {
        // This would create a blip for officer position
        console.log("[BackupSystem] Creating officer blip for: " + officerName + " at " + JSON.stringify(position));
        // Implementation depends on your blip system
    },
    
    updateOfficerBlip: function(officerName, position) {
        // This would update existing officer blip position
        console.log("[BackupSystem] Updating officer blip for: " + officerName + " to " + JSON.stringify(position));
        // Implementation depends on your blip system
    },
    
    getPlayerName: function() {
        // Try GTAC API first
        if (typeof player !== "undefined" && typeof player.name === "function") {
            try {
                var playerName = player.name();
                if (playerName && playerName !== "") {
                    return playerName.replace(/#\d+$/, ""); // Remove #0 suffix
                }
            } catch (e) {
                console.log("[BackupSystem] Error getting player name: " + String(e));
            }
        } else if (JobsClient.profile && JobsClient.profile.name) {
            return JobsClient.profile.name;
        }
        
        return "Unknown Officer";
    },
    
    getCurrentSituation: function() {
        if (Callouts.Manager && Callouts.Manager.active) {
            return Callouts.Manager.active.name;
        }
        
        // Check nearby world events
        if (WorldEvents && WorldEvents.Manager) {
            var nearbyEvents = WorldEvents.Manager.getNearbyEvents(localPlayer.position, 50);
            if (nearbyEvents.length > 0) {
                return "Nearby: " + nearbyEvents[0].name;
            }
        }
        
        return "Routine patrol";
    },
    
    generateRequestId: function() {
        return "req_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    },
    
    getDistance: function(pos1, pos2) {
        var dx = pos1.x - pos2.x;
        var dy = pos1.y - pos2.y;
        var dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};

// Initialize backup system when resource starts
addEventHandler("onResourceStart", function() {
    if (typeof BackupSystem !== "undefined") {
        setTimeout(function() {
            BackupSystem.Manager.init();
        }, 5000); // Delay to ensure all systems are loaded
    }
});
