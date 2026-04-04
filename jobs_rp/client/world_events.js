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

var WorldEvents = WorldEvents || {};

// World Events System
WorldEvents.Manager = {
    active: [],
    events: [],
    probabilityWeights: {
        "brawl": 40,
        "disturbance": 25,
        "suspicious": 20,
        "medical": 15
    },
    maxActiveEvents: 3,
    checkInterval: 45000, // 45 seconds
    
    init: function() {
        debugLog("[WorldEvents] Initializing world events system");
        
        // Register event types
        this.register(new BrawlEvent());
        this.register(new DisturbanceEvent());
        this.register(new SuspiciousEvent());
        this.register(new MedicalEvent());
        
        // Start periodic event checks
        setInterval(function() {
            WorldEvents.Manager.checkRandomEvent();
        }, this.checkInterval);
        
        debugLog("[WorldEvents] World events system initialized with " + this.events.length + " event types");
    },
    
    register: function(worldEvent) {
        this.events.push(worldEvent);
        debugLog("[WorldEvents] Registered world event: " + worldEvent.name);
    },
    
    checkRandomEvent: function() {
        if (this.active.length >= this.maxActiveEvents) {
            return; // Too many active events
        }
        
        // Only generate events if player is on duty as police
        if (!JobsClient.profile || JobsClient.profile.currentJobId !== "police") {
            return;
        }
        
        var roll = Math.random() * 100;
        var cumulative = 0;
        
        for (var type in this.probabilityWeights) {
            cumulative += this.probabilityWeights[type];
            if (roll <= cumulative) {
                var worldEvent = this.getEventByType(type);
                if (worldEvent && worldEvent.canStart()) {
                    debugLog("[WorldEvents] Starting random world event: " + type + " (roll: " + roll.toFixed(2) + ")");
                    worldEvent.start();
                    return;
                }
            }
        }
    },
    
    getEventByType: function(type) {
        for (var i = 0; i < this.events.length; i++) {
            if (this.events[i].type === type) {
                return this.events[i];
            }
        }
        return null;
    },
    
    addActiveEvent: function(worldEvent) {
        this.active.push(worldEvent);
        debugLog("[WorldEvents] Active event count: " + this.active.length);
    },
    
    removeActiveEvent: function(worldEvent) {
        var index = this.active.indexOf(worldEvent);
        if (index > -1) {
            this.active.splice(index, 1);
            debugLog("[WorldEvents] Removed active event, count: " + this.active.length);
        }
    },
    
    getNearbyEvents: function(position, radius) {
        var nearby = [];
        for (var i = 0; i < this.active.length; i++) {
            var event = this.active[i];
            if (event.position && this.getDistance(position, event.position) <= radius) {
                nearby.push(event);
            }
        }
        return nearby;
    },
    
    getDistance: function(pos1, pos2) {
        var dx = pos1.x - pos2.x;
        var dy = pos1.y - pos2.y;
        var dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};

// Brawl World Event
function BrawlEvent() {
    this.name = "Street Brawl";
    this.type = "brawl";
    this.active = false;
    this.participants = [];
    this.position = null;
    this.blip = null;
    this.duration = 300000; // 5 minutes
    this.startTime = null;
}

BrawlEvent.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

BrawlEvent.prototype.start = function() {
    debugLog("[BrawlEvent] Starting: " + this.name);
    this.active = true;
    this.startTime = Date.now();
    
    // Create random position near player
    this.position = this.getRandomPositionNearPlayer(100, 250);
    
    // Create blip
    this.blip = createBlipForCoords(this.position, "brawl", "Disturbance");
    
    // Spawn fighting civilians
    this.spawnParticipants();
    
    // Add to active events
    WorldEvents.Manager.addActiveEvent(this);
    
    // Setup event logic
    this.setupEventLogic();
    
    debugLog("[BrawlEvent] Started at: " + JSON.stringify(this.position));
};

BrawlEvent.prototype.end = function() {
    debugLog("[BrawlEvent] Ending");
    this.active = false;
    
    // Clean up
    if (this.blip) {
        // Remove blip
    }
    
    this.cleanupParticipants();
    
    // Remove from active events
    WorldEvents.Manager.removeActiveEvent(this);
};

BrawlEvent.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

BrawlEvent.prototype.spawnParticipants = function() {
    var civilianModels = [
        "M_Y_GBIK_LO_01", "M_Y_GBIK_HI_01", "M_Y_GRUS_LO_01", 
        "M_Y_GRU2_LO_01", "M_Y_GMAF_LO_01", "M_Y_GMAF_HI_01",
        "F_Y_STRIPPERC01", "F_Y_BUSKER_01", "M_Y_CONSTR_02"
    ];
    
    var numParticipants = 2 + Math.floor(Math.random() * 3); // 2-4 participants
    
    for (var i = 0; i < numParticipants; i++) {
        var offset = {
            x: (Math.random() - 0.5) * 10,
            y: (Math.random() - 0.5) * 10,
            z: 0
        };
        
        var position = {
            x: this.position.x + offset.x,
            y: this.position.y + offset.y,
            z: this.position.z + offset.z
        };
        
        // This would spawn civilian with GTAC ped API
        debugLog("[BrawlEvent] Would spawn participant at: " + JSON.stringify(position) +
            " with model: " + civilianModels[i % civilianModels.length]);
        
        // Store participant reference
        this.participants.push({
            position: position,
            model: civilianModels[i % civilianModels.length],
            health: 100,
            fighting: true
        });
    }
    
    debugLog("[BrawlEvent] Spawned " + numParticipants + " participants");
};

BrawlEvent.prototype.cleanupParticipants = function() {
    // Clean up spawned civilians
    this.participants = [];
};

BrawlEvent.prototype.setupEventLogic = function() {
    var self = this;
    
    // Event timer
    var eventTimer = setInterval(function() {
        if (!self.active) {
            clearInterval(eventTimer);
            return;
        }
        
        // Check if event should end
        var elapsed = Date.now() - self.startTime;
        if (elapsed > self.duration) {
            self.end();
            clearInterval(eventTimer);
            return;
        }
        
        // Random fighting behavior
        self.updateParticipants();
        
        // Check if player intervenes
        self.checkPlayerIntervention();
        
    }, 2000); // Update every 2 seconds
};

BrawlEvent.prototype.updateParticipants = function() {
    // Random fighting animations and health changes
    for (var i = 0; i < this.participants.length; i++) {
        var participant = this.participants[i];
        
        if (participant.fighting && Math.random() < 0.3) {
            // Random damage
            participant.health -= Math.floor(Math.random() * 5);
            
            if (participant.health <= 0) {
                participant.fighting = false;
                participant.health = 0;
            }
        }
    }
    
    // Check if brawl should end (no one fighting)
    var activeFighters = this.participants.filter(function(p) { return p.fighting; });
    if (activeFighters.length < 2) {
        this.end();
    }
};

BrawlEvent.prototype.checkPlayerIntervention = function() {
    if (!localPlayer || !localPlayer.position) return;
    
    var distance = WorldEvents.Manager.getDistance(localPlayer.position, this.position);
    
    if (distance <= 15) {
        // Player is close - can intervene
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("You can intervene in the brawl", "info", false);
        }
        
        // This would trigger interaction mechanics
        // Player could arrest participants, break up fight, etc.
    }
};

// Disturbance Event
function DisturbanceEvent() {
    this.name = "Public Disturbance";
    this.type = "disturbance";
    this.active = false;
    this.position = null;
    this.blip = null;
    this.duration = 240000; // 4 minutes
    this.startTime = null;
}

DisturbanceEvent.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

DisturbanceEvent.prototype.start = function() {
    debugLog("[DisturbanceEvent] Starting: " + this.name);
    this.active = true;
    this.startTime = Date.now();
    
    this.position = this.getRandomPositionNearPlayer(80, 200);
    this.blip = createBlipForCoords(this.position, "disturbance", "Disturbance");
    
    WorldEvents.Manager.addActiveEvent(this);
    this.setupEventLogic();
    
    debugLog("[DisturbanceEvent] Started at: " + JSON.stringify(this.position));
};

DisturbanceEvent.prototype.end = function() {
    debugLog("[DisturbanceEvent] Ending");
    this.active = false;
    
    if (this.blip) {
        // Remove blip
    }
    
    WorldEvents.Manager.removeActiveEvent(this);
};

DisturbanceEvent.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

DisturbanceEvent.prototype.setupEventLogic = function() {
    var self = this;
    
    var eventTimer = setInterval(function() {
        if (!self.active) {
            clearInterval(eventTimer);
            return;
        }
        
        var elapsed = Date.now() - self.startTime;
        if (elapsed > self.duration) {
            self.end();
            clearInterval(eventTimer);
            return;
        }
        
        self.checkPlayerIntervention();
        
    }, 3000);
};

DisturbanceEvent.prototype.checkPlayerIntervention = function() {
    if (!localPlayer || !localPlayer.position) return;
    
    var distance = WorldEvents.Manager.getDistance(localPlayer.position, this.position);
    
    if (distance <= 20) {
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Disturbance reported - investigate", "info", false);
        }
    }
};

// Suspicious Activity Event
function SuspiciousEvent() {
    this.name = "Suspicious Activity";
    this.type = "suspicious";
    this.active = false;
    this.position = null;
    this.blip = null;
    this.duration = 180000; // 3 minutes
    this.startTime = null;
}

SuspiciousEvent.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

SuspiciousEvent.prototype.start = function() {
    debugLog("[SuspiciousEvent] Starting: " + this.name);
    this.active = true;
    this.startTime = Date.now();
    
    this.position = this.getRandomPositionNearPlayer(120, 300);
    this.blip = createBlipForCoords(this.position, "suspicious", "Suspicious");
    
    WorldEvents.Manager.addActiveEvent(this);
    this.setupEventLogic();
    
    debugLog("[SuspiciousEvent] Started at: " + JSON.stringify(this.position));
};

SuspiciousEvent.prototype.end = function() {
    debugLog("[SuspiciousEvent] Ending");
    this.active = false;
    
    if (this.blip) {
        // Remove blip
    }
    
    WorldEvents.Manager.removeActiveEvent(this);
};

SuspiciousEvent.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

SuspiciousEvent.prototype.setupEventLogic = function() {
    var self = this;
    
    var eventTimer = setInterval(function() {
        if (!self.active) {
            clearInterval(eventTimer);
            return;
        }
        
        var elapsed = Date.now() - self.startTime;
        if (elapsed > self.duration) {
            self.end();
            clearInterval(eventTimer);
            return;
        }
        
        self.checkPlayerIntervention();
        
    }, 4000);
};

SuspiciousEvent.prototype.checkPlayerIntervention = function() {
    if (!localPlayer || !localPlayer.position) return;
    
    var distance = WorldEvents.Manager.getDistance(localPlayer.position, this.position);
    
    if (distance <= 25) {
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Suspicious activity detected - investigate", "warning", false);
        }
    }
};

// Medical Event
function MedicalEvent() {
    this.name = "Medical Emergency";
    this.type = "medical";
    this.active = false;
    this.position = null;
    this.blip = null;
    this.duration = 360000; // 6 minutes
    this.startTime = null;
}

MedicalEvent.prototype.canStart = function() {
    return !this.active && localPlayer && localPlayer.position;
};

MedicalEvent.prototype.start = function() {
    debugLog("[MedicalEvent] Starting: " + this.name);
    this.active = true;
    this.startTime = Date.now();
    
    this.position = this.getRandomPositionNearPlayer(150, 350);
    this.blip = createBlipForCoords(this.position, "medical", "Medical");
    
    WorldEvents.Manager.addActiveEvent(this);
    this.setupEventLogic();
    
    debugLog("[MedicalEvent] Started at: " + JSON.stringify(this.position));
};

MedicalEvent.prototype.end = function() {
    debugLog("[MedicalEvent] Ending");
    this.active = false;
    
    if (this.blip) {
        // Remove blip
    }
    
    WorldEvents.Manager.removeActiveEvent(this);
};

MedicalEvent.prototype.getRandomPositionNearPlayer = function(minDist, maxDist) {
    var angle = Math.random() * Math.PI * 2;
    var distance = minDist + Math.random() * (maxDist - minDist);
    
    return {
        x: localPlayer.position.x + Math.cos(angle) * distance,
        y: localPlayer.position.y + Math.sin(angle) * distance,
        z: localPlayer.position.z
    };
};

MedicalEvent.prototype.setupEventLogic = function() {
    var self = this;
    
    var eventTimer = setInterval(function() {
        if (!self.active) {
            clearInterval(eventTimer);
            return;
        }
        
        var elapsed = Date.now() - self.startTime;
        if (elapsed > self.duration) {
            self.end();
            clearInterval(eventTimer);
            return;
        }
        
        self.checkPlayerIntervention();
        
    }, 5000);
};

MedicalEvent.prototype.checkPlayerIntervention = function() {
    if (!localPlayer || !localPlayer.position) return;
    
    var distance = WorldEvents.Manager.getDistance(localPlayer.position, this.position);
    
    if (distance <= 30) {
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Medical emergency - call ambulance", "warning", false);
        }
    }
};

// Initialize world events when resource starts
addEventHandler("onResourceStart", function() {
    if (typeof WorldEvents !== "undefined") {
        setTimeout(function() {
            WorldEvents.Manager.init();
        }, 4000); // Delay to ensure all systems are loaded
    }
});
