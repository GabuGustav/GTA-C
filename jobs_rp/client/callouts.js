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

var Callouts = Callouts || {};

// Callout Manager
Callouts.Manager = {
    active: null,
    callouts: [],
    probabilityWeights: {
        "shooting": 30,
        "pursuit": 25, 
        "brawl": 20,
        "traffic": 15,
        "medical": 10
    },
    
    init: function() {
        debugLog("[Callouts] Initializing callout system");
        
        // Register callout types
        this.register(new ShootingCallout());
        this.register(new PursuitCallout());
        this.register(new BrawlCallout());
        
        // B key for manual callout
        try {
            bindKey(SDLK_b, KEYSTATE_DOWN, function() {
                // Check if player is on duty as police (bypass UI context)
                if (JobsClient.profile && JobsClient.profile.currentJobId === "police") {
                    debugLog("[KeyboardService] B key pressed - checking for callout");
                    debugLog("[KeyboardService] JobsClient.profile: " + (JobsClient.profile ? "exists" : "null"));
                    debugLog("[KeyboardService] currentJobId: " + (JobsClient.profile ? JobsClient.profile.currentJobId : "unknown"));
                    debugLog("[KeyboardService] Callouts.Manager: " + (Callouts.Manager ? "exists" : "null"));
                    debugLog("[KeyboardService] Active callout: " + (Callouts.Manager.active ? Callouts.Manager.active.name : "none"));
                    debugLog("[KeyboardService] KeyboardService active: " + (KeyboardService && KeyboardService.isActive ? KeyboardService.isActive() : "false"));
                    
                    Callouts.Manager.checkRandomCallout();
                } else {
                    debugLog("[KeyboardService] B key pressed - not on duty as police");
                }
            });
            
            debugLog("[KeyboardService] Callout keybinds setup (B key)");
        } catch (e) {
            debugLog("[KeyboardService] Failed to setup B keybind: " + String(e));
        }
        
        // Start periodic callout checks
        setInterval(function() {
            Callouts.Manager.checkRandomCallout();
        }, 30000); // Check every 30 seconds
        
        debugLog("[Callouts] Callout system initialized with " + this.callouts.length + " callouts");
    },
    
    register: function(callout) {
        this.callouts.push(callout);
        debugLog("[Callouts] Registered callout: " + callout.name);
    },
    
    checkRandomCallout: function() {
        debugLog("[Callouts] checkRandomCallout called");
        debugLog("[Callouts] Active callout: " + (Callouts.Manager.active ? Callouts.Manager.active.name : "none"));
        debugLog("[Callouts] JobsClient.profile: " + (JobsClient.profile ? "exists" : "null"));
        debugLog("[Callouts] currentJobId: " + (JobsClient.profile ? JobsClient.profile.currentJobId : "unknown"));
        debugLog("[Callouts] KeyboardService active: " + (KeyboardService && KeyboardService.isActive ? KeyboardService.isActive() : "false"));
        
        if (Callouts.Manager.active) {
            debugLog("[Callouts] Already have active callout, returning");
            return; // Already have active callout
        }
        
        // Only generate callouts if player is on duty as police
        if (!JobsClient.profile || JobsClient.profile.currentJobId !== "police") {
            debugLog("[Callouts] Not on duty as police, returning");
            return;
        }
        
        var roll = Math.random() * 100;
        var cumulative = 0;
        
        for (var type in this.probabilityWeights) {
            cumulative += this.probabilityWeights[type];
            if (roll <= cumulative) {
                var callout = this.getCalloutByType(type);
                if (callout && callout.canStart()) {
                    debugLog("[Callouts] Starting random callout: " + type + " (roll: " + roll.toFixed(2) + ")");
                    callout.start();
                    return;
                }
            }
        }
    },
    
    getCalloutByType: function(type) {
        for (var i = 0; i < this.callouts.length; i++) {
            if (this.callouts[i].type === type) {
                return this.callouts[i];
            }
        }
        return null;
    },
    
    startCallout: function(type) {
        var callout = this.getCalloutByType(type);
        if (callout && callout.canStart()) {
            Callouts.Manager.active = callout;
            callout.start();
        }
    },
    
    endCallout: function() {
        if (Callouts.Manager.active) {
            Callouts.Manager.active.end();
            Callouts.Manager.active = null;
        }
    }
};

// Shooting Callout
function ShootingCallout() {
    this.name = "Shooting";
    this.type = "shooting";
    this.message = "Reports of shots fired in progress";
    this.active = false;
    this.criminals = [];
    this.blip = null;
}

ShootingCallout.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

ShootingCallout.prototype.start = function() {
    debugLog("[ShootingCallout] Starting: " + this.message);
    this.active = true;
    
    // Create blip at random location near player
    var position = this.getRandomPositionNearPlayer(200, 400);
    debugLog("[ShootingCallout] Creating blip at position: " + JSON.stringify(position));
    
    // Use working fallback method from zones.js
    this.blip = createBlipForCoords(position, "shooting", "Shooting");
    
    if (!this.blip) {
        debugLog("[ShootingCallout] Failed to create blip");
    } else {
        debugLog("[ShootingCallout] Blip created successfully with ID: " + this.blip.id);
    }
    
    // Play police scanner audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playDispatch("shooting", position);
    }
    
    // Show callout message
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt(this.message, "warning", true);
    }
    
    // Spawn criminals
    this.spawnCriminals(position);
    
    // Setup event handlers
    this.setupHandlers();
};

ShootingCallout.prototype.end = function() {
    debugLog("[ShootingCallout] Ending");
    this.active = false;
    
    // Play completion audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playCalloutComplete();
    }
    
    // Clean up
    if (this.blip) {
        // Remove blip (implementation depends on your blip system)
    }
    
    this.cleanupCriminals();
    
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt("Callout completed", "success", false);
    }
};

ShootingCallout.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

ShootingCallout.prototype.spawnCriminals = function(position) {
    var criminalModels = ["M_Y_GBIK_LO_01", "M_Y_GRUS_LO_01", "M_Y_GRU2_LO_01"];
    var numCriminals = 2 + Math.floor(Math.random() * 2);
    
    for (var i = 0; i < numCriminals; i++) {
        var offset = {
            x: (Math.random() - 0.5) * 20,
            y: (Math.random() - 0.5) * 20
        };
        
        // Placeholder for criminal spawning (would need GTAC ped API)
        debugLog("[ShootingCallout] Criminal spawning placeholder - would spawn " + 
            (numCriminals) + " criminals at " + JSON.stringify(position) + 
            " with models: " + criminalModels.slice(0, Math.min(numCriminals, criminalModels.length)).join(", "));
        debugLog("[ShootingCallout] TODO: Implement GTAC ped spawning API");
    }
};

ShootingCallout.prototype.cleanupCriminals = function() {
    // Clean up spawned criminals
    this.criminals = [];
};

ShootingCallout.prototype.setupHandlers = function() {
    // Setup keybinds and event handlers
    // This would integrate with existing keyboard service
};

// Pursuit Callout (simplified version)
function PursuitCallout() {
    this.name = "Pursuit";
    this.type = "pursuit";
    this.message = "Vehicle pursuit in progress";
    this.active = false;
    this.suspect = null;
    this.vehicle = null;
}

PursuitCallout.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

PursuitCallout.prototype.start = function() {
    debugLog("[PursuitCallout] Starting: " + this.message);
    this.active = true;
    
    // Create pursuit scenario
    var position = this.getRandomPositionNearPlayer(150, 300);
    debugLog("[PursuitCallout] Creating blip at position: " + JSON.stringify(position));
    
    // Use working fallback method from zones.js
    this.blip = createBlipForCoords(position, "pursuit", "Pursuit");
    
    if (!this.blip) {
        debugLog("[PursuitCallout] Failed to create blip");
    } else {
        debugLog("[PursuitCallout] Blip created successfully with ID: " + this.blip.id);
    }
    
    // Play police scanner audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playDispatch("pursuit", position);
    }
    
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt(this.message, "warning", true);
    }
    
    // This would spawn suspect vehicle and ped
    debugLog("[PursuitCallout] Would spawn pursuit at: " + JSON.stringify(position));
    
    this.setupHandlers();
};

PursuitCallout.prototype.end = function() {
    debugLog("[PursuitCallout] Ending");
    this.active = false;
    
    // Play completion audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playCalloutComplete();
    }
    
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt("Pursuit completed", "success", false);
    }
};

PursuitCallout.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

PursuitCallout.prototype.setupHandlers = function() {
    // Setup pursuit-specific handlers
};

// Brawl Callout
function BrawlCallout() {
    this.name = "Brawl";
    this.type = "brawl";
    this.message = "Disturbance in progress";
    this.active = false;
    this.participants = [];
}

BrawlCallout.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

BrawlCallout.prototype.start = function() {
    debugLog("[BrawlCallout] Starting: " + this.message);
    this.active = true;
    
    var position = this.getRandomPositionNearPlayer(50, 150);
    debugLog("[BrawlCallout] Creating blip at position: " + JSON.stringify(position));
    
    // Use working fallback method from zones.js
    this.blip = createBlipForCoords(position, "brawl", "Brawl");
    
    if (!this.blip) {
        debugLog("[BrawlCallout] Failed to create blip");
    } else {
        debugLog("[BrawlCallout] Blip created successfully with ID: " + this.blip.id);
    }
    
    // Play police scanner audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playDispatch("brawl", position);
    }
    
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt(this.message, "warning", true);
    }
    
    // This would spawn fighting civilians
    debugLog("[BrawlCallout] Would spawn brawl at: " + JSON.stringify(position));
    
    this.setupHandlers();
};

BrawlCallout.prototype.end = function() {
    debugLog("[BrawlCallout] Ending");
    this.active = false;
    
    // Play completion audio
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.playCalloutComplete();
    }
    
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt("Brawl resolved", "success", false);
    }
};

BrawlCallout.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

BrawlCallout.prototype.setupHandlers = function() {
    // Setup brawl-specific handlers
};

// Initialize callout system when resource starts
addEventHandler("onResourceStart", function() {
    if (typeof Callouts !== "undefined") {
        setTimeout(function() {
            Callouts.Manager.init();
        }, 2000); // Delay to ensure all systems are loaded
    }
});
