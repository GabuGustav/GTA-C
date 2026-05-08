"use strict";

var PoliceScanner = PoliceScanner || {};

// Police Scanner Audio System
PoliceScanner.Manager = {
    sounds: {},
    _streams: [],
    active: false,
    volume: 0.8,
    enabled: true,
    _autoEnableTimer: null,
    structuredMode: true,
    structuredMaxClips: 8,
    _isPlaying: false,
    _currentSequence: null,
    _sequenceTimers: [],
    
    init: function() {
        console.log("[PoliceScanner] Initializing police scanner audio system");
        
        // Load audio files
        this.loadAudioFiles();
        
        // Setup audio system
        this.setupAudioSystem();
        
        console.log("[PoliceScanner] Audio system initialized");
    },
    
    loadAudioFiles: function() {
        // Define audio categories and files
        var audioFiles = {
            // Dispatch messages
            dispatch: {
                "ALL_UNITS": "ALL_UNITS.wav",
                "ATTENTION_ALL_UNITS": "ATTENTION_ALL_UNITS.wav", 
                "DISPATCHING_TO": "DISPATCHING_TO.wav",
                "THIS_IS_CONTROL": "THIS_IS_CONTROL.wav",
                "INS_THIS_IS_CONTROL_WE_HAVE": "INS_THIS_IS_CONTROL_WE_HAVE.wav",
                "INS_CIVILIANS_REPORT": "INS_CIVILIANS_REPORT.wav",
                "INS_AVAILABLE_UNITS_RESPOND_TO": "INS_AVAILABLE_UNITS_RESPOND_TO.wav",
                "UNITS_PLEASE_BE_ADVISED": "UNITS_PLEASE_BE_ADVISED.wav",
                "ALL_UNITS_PLEASE_RESPOND": "ALL_UNITS_PLEASE_RESPOND.wav",
                "SUSPECT_APPREHENDED": "SUSPECT_APPREHENDED.wav",
                "DFROM_DISPATCH_2_UNITS_FROM": "DFROM_DISPATCH_2_UNITS_FROM.wav",
                "DFROM_DISPATCH_3_UNITS_FROM": "DFROM_DISPATCH_3_UNITS_FROM.wav",
                "DFROM_DISPATCH_AIR_UNIT_FROM": "DFROM_DISPATCH_AIR_UNIT_FROM.wav"
            },
            
            // Criminal activities
            criminal: {
                "ARMED_AND_DANGEROUS": "ARMED_AND_DANGEROUS.wav",
                "ASSISTANCE_REQUIRED": "ASSISTANCE_REQUIRED.wav",
                "CRIMINAL_RESISTING_ARREST": "CRIM_A_CRIMINAL_RESISTING_ARREST.wav",
                "DOMESTIC_DISTURBANCE": "CRIM_A_DOMESTIC_DISTURBANCE.wav",
                "DRUNKEN_DISTURBANCE": "CRIM_A_DRUNKEN_DISTURBANCE.wav",
                "GRAND_THEFT_AUTO": "CRIM_A_GRAND_THEFT_AUTO.wav",
                "MEDICAL_EMERGENCY": "CRIM_A_MEDICAL_EMERGENCY.wav",
                "MUGGING": "CRIM_A_MUGGING.wav",
                "RECKLESS_DRIVER": "CRIM_A_RECKLESS_DRIVER.wav",
                "SHOOTING": "CRIM_A_SHOOTING.wav",
                "SHOTS_FIRED": "CRIM_SHOTS_FIRED.wav",
                "SUSPICIOUS_ACTIVITY": "CRIM_SUSPICIOUS_ACTIVITY.wav",
                "STOLEN_VEHICLE": "CRIM_A_STOLEN_VEHICLE.wav"
            },
            
            // Officer status
            officer: {
                "OFFICER_DOWN": "CRIM_AN_OFFICER_DOWN.wav",
                "OFFICER_IN_DANGER": "CRIM_AN_OFFICER_IN_DANGER.wav",
                "OFFICER_ASSAULT": "CRIM_AN_ASSAULT_ON_AN_OFFICER.wav"
            },
            
            // Traffic
            traffic: {
                "TRAFFIC_VIOLATION": "CRIM_A_TRAFFIC_VIOLATION.wav",
                "TRAFFIC_ALERT": "CRIM_A_TRAFFIC_ALERT.wav",
                "RECKLESS_DRIVING": "CRIM_DANGEROUS_DRIVING.wav"
            },
            
            // Location areas
            areas: {
                "ALGONQUIN": "Areas/ALGONQUIN.wav",
                "BOHAN": "Areas/SOUTH_BOHAN.wav",
                "DUKES": "Areas/ALGONQUIN_DUKES.wav",
                "ALDERNEY": "Areas/ALDERNEY_CITY.wav",
                "CHARGE_ISLAND": "Areas/CHARGE_ISLAND.wav"
            },
            
            // Directions
            directions: {
                "HEADING_NORTH": "SUSPECT_HEADED_NORTH.wav",
                "HEADING_SOUTH": "SUSPECT_HEADING_SOUTH.wav", 
                "HEADING_EAST": "SUSPECT_HEADED_EAST.wav",
                "HEADING_WEST": "SUSPECT_HEADED_WEST.wav",
                "LOOKS_LIKE_HES_HEADING": "LOOKS_LIKE_HES_HEADING.wav",
                "ON_FOOT": "ON_FOOT.wav",
                "LAST_SEEN": "LAST_SEEN.wav"
            },

            streets: {
                "ALBANY_AVE": "Streets/ALBANY_AVE.wav",
                "ALGONQUIN_BRIDGE": "Streets/ALGONQUIN_BRIDGE.wav",
                "COLUMBUS_AVE": "Streets/COLUMBUS_AVE.wav",
                "FRANKLIN_DRIVE": "Streets/FRANKLIN_DRIVE.wav",
                "HARRISON_ST": "Streets/HARRISON_ST.wav",
                "IVY_RD": "Streets/IVY_RD.wav",
                "SARATOGA_AVE": "Streets/SARATOGA_AVE.wav",
                "UNION_DRIVE_WEST": "Streets/UNION_DRIVE_WEST.wav"
            },
            
            // Vehicle categories
            vehicleCategory: {
                "SEDAN": "VehicleCategory/SEDAN.wav",
                "SPORTS_CAR": "VehicleCategory/SPORTS_CAR.wav",
                "SUV": "VehicleCategory/SUV.wav",
                "TRUCK": "VehicleCategory/TRUCK.wav"
            },
            
            // Vehicle models
            model: {
                "ADMIRAL": "Model/MOD_ADMIRAL.wav",
                "BANSHEE": "Model/MOD_BANSHEE.wav",
                "BLISTA": "Model/MOD_BLISTA.wav",
                "FUTO": "Model/MOD_FUTO.wav",
                "INGOT": "Model/MOD_INGOT.wav",
                "FACTION": "Model/MOD_FACTION.wav",
                "LANDSTALKER": "Model/MOD_LANDSTALKER.wav",
                "ORACLE": "Model/MOD_ORACLE.wav",
                "SENTINEL": "Model/MOD_SENTINEL.wav"
            }
        };
        
        // Load all audio files
        var totalFiles = 0;
        var openedFiles = 0;
        var createdSounds = 0;
        for (var category in audioFiles) {
            this.sounds[category] = {};
            for (var file in audioFiles[category]) {
                var path = "Audio/PoliceScanner/" + audioFiles[category][file];
                console.log("[PoliceScanner] Loading audio: " + path);
                totalFiles += 1;
                
                var stream = null;
                var sound = null;

                try {
                    stream = openFile(path);
                    if (!stream) {
                        console.log("[PoliceScanner] Failed to open audio file: " + path);
                        continue;
                    }
                    openedFiles += 1;

                    // GTAC expects a boolean as the 2nd argument (likely loop)
                    sound = audio.createSound(stream, false);
                } catch (e) {
                    console.log("[PoliceScanner] Exception creating sound for " + path + ": " + String(e));
                }

                if (!sound) {
                    if (stream && typeof stream.close === "function") {
                        stream.close();
                    }
                    console.log("[PoliceScanner] Failed to create sound: " + path);
                    continue;
                }

                this._streams.push(stream);
                this.sounds[category][file] = sound;
                createdSounds += 1;
            }
        }
        
        console.log("[PoliceScanner] Loaded " + Object.keys(audioFiles).length + " audio categories");
        console.log("[PoliceScanner] Audio load summary: total=" + totalFiles + ", opened=" + openedFiles + ", sounds=" + createdSounds);
    },
    
    setupAudioSystem: function() {
        // Setup 3D audio positioning
        this.active = true;
        console.log("[PoliceScanner] 3D audio system ready");
    },
    
    playDispatch: function(calloutType, position) {
        if (!this.enabled) {
            console.log("[PoliceScanner] Playback disabled (playDispatch blocked)");
            return;
        }
        if (!this.active) return;
        
        console.log("[PoliceScanner] Playing dispatch for: " + calloutType);

        // Build structured sequence (short, coherent)
        var sequence = this.structuredMode
            ? this.buildStructuredSequence(calloutType, position)
            : this.buildDispatchSequence(calloutType, position);

        this.playSequence(sequence, position);
    },
    
    buildDispatchSequence: function(calloutType, position) {
        var sequence = [];
        
        // Start with attention
        sequence.push({
            category: "dispatch",
            file: "ATTENTION_ALL_UNITS",
            delay: 0
        });
        
        // Add callout specific message
        switch (calloutType) {
            case "shooting":
                sequence.push({
                    category: "criminal", 
                    file: "SHOTS_FIRED",
                    delay: 1000
                });
                break;
                
            case "pursuit":
                sequence.push({
                    category: "criminal",
                    file: "CRIMINAL_RESISTING_ARREST", 
                    delay: 1000
                });
                break;
                
            case "brawl":
                sequence.push({
                    category: "criminal",
                    file: "DOMESTIC_DISTURBANCE",
                    delay: 1000
                });
                break;
                
            case "traffic":
                sequence.push({
                    category: "traffic",
                    file: "TRAFFIC_VIOLATION",
                    delay: 1000
                });
                break;
        }
        
        // Add location information
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({
                category: "areas",
                file: area,
                delay: 2000
            });
        }
        
        return sequence;
    },

    buildStructuredSequence: function(calloutType, position) {
        var sequence = [];

        // 1) Open with a realistic dispatch intro phrase
        var intros = [
            { category: "dispatch", file: "ATTENTION_ALL_UNITS", delay: 0 },
            { category: "dispatch", file: "THIS_IS_CONTROL", delay: 0 },
            { category: "dispatch", file: "INS_THIS_IS_CONTROL_WE_HAVE", delay: 0 }
        ];
        sequence.push(this.pickVariant(intros));

        // 2) Source context / report style
        if (Math.random() < 0.6) {
            sequence.push({ category: "dispatch", file: "INS_CIVILIANS_REPORT", delay: 900 });
        }

        // 3) Core incident phrase
        var calloutClip = null;
        switch (calloutType) {
            case "shooting":
                calloutClip = { category: "criminal", file: "SHOTS_FIRED", delay: 1000 };
                break;
            case "pursuit":
                calloutClip = { category: "criminal", file: "CRIMINAL_RESISTING_ARREST", delay: 1000 };
                break;
            case "brawl":
                calloutClip = { category: "criminal", file: "DOMESTIC_DISTURBANCE", delay: 1000 };
                break;
            case "traffic":
                calloutClip = { category: "traffic", file: "TRAFFIC_VIOLATION", delay: 1000 };
                break;
        }
        if (calloutClip) {
            sequence.push(calloutClip);
        }

        // 4) Optional deployment phrase
        if (Math.random() < 0.45) {
            var unitDispatch = this.pickAvailable("dispatch", [
                "DFROM_DISPATCH_2_UNITS_FROM",
                "DFROM_DISPATCH_3_UNITS_FROM",
                "DFROM_DISPATCH_AIR_UNIT_FROM"
            ]);
            if (unitDispatch) {
                sequence.push({ category: "dispatch", file: unitDispatch, delay: 900 });
            }
        }

        // 5) Location (area and/or street)
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({ category: "areas", file: area, delay: 1200 });
        }
        if (Math.random() < 0.5) {
            var street = this.pickAvailable("streets", [
                "ALBANY_AVE",
                "ALGONQUIN_BRIDGE",
                "COLUMBUS_AVE",
                "FRANKLIN_DRIVE",
                "HARRISON_ST",
                "IVY_RD",
                "SARATOGA_AVE",
                "UNION_DRIVE_WEST"
            ]);
            if (street) {
                sequence.push({ category: "streets", file: street, delay: 900 });
            }
        }

        // 6) Optional suspect movement phrase
        if (Math.random() < 0.6) {
            sequence.push({ category: "directions", file: "LOOKS_LIKE_HES_HEADING", delay: 900 });
        }
        if (Math.random() < 0.6) {
            var dirs = ["HEADING_NORTH", "HEADING_SOUTH", "HEADING_EAST", "HEADING_WEST"];
            var dir = dirs[Math.floor(Math.random() * dirs.length)];
            sequence.push({ category: "directions", file: dir, delay: 1200 });
        }
        if (Math.random() < 0.35) {
            sequence.push({ category: "directions", file: "ON_FOOT", delay: 700 });
        }

        // 7) Close with response request occasionally
        if (Math.random() < 0.45) {
            var response = this.pickAvailable("dispatch", ["INS_AVAILABLE_UNITS_RESPOND_TO", "ALL_UNITS_PLEASE_RESPOND"]);
            if (response) {
                sequence.push({ category: "dispatch", file: response, delay: 900 });
            }
        }

        return this.finalizeSequence(sequence);
    },

    hasClip: function(category, file) {
        return !!(this.sounds && this.sounds[category] && this.sounds[category][file]);
    },

    pickAvailable: function(category, candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }
        var available = [];
        for (var i = 0; i < candidates.length; i++) {
            if (this.hasClip(category, candidates[i])) {
                available.push(candidates[i]);
            }
        }
        if (available.length === 0) {
            return null;
        }
        return available[Math.floor(Math.random() * available.length)];
    },

    pickVariant: function(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return null;
        }
        var idx = Math.floor(Math.random() * items.length);
        return items[idx];
    },

    finalizeSequence: function(sequence) {
        var filtered = [];
        for (var i = 0; i < sequence.length; i++) {
            var item = sequence[i];
            if (item && item.category && item.file && this.hasClip(item.category, item.file)) {
                filtered.push(item);
            }
        }
        if (filtered.length > this.structuredMaxClips) {
            filtered = filtered.slice(0, this.structuredMaxClips);
        }
        return filtered;
    },
    
    getAreaFromPosition: function(position) {
        // Simple area detection based on Liberty City districts
        var x = position.x;
        var y = position.y;
        
        if (x > 0 && y > 0) return "ALGONQUIN";
        if (x < 0 && y > 0) return "BOHAN";
        if (x < 0 && y < 0) return "ALDERNEY";
        if (x > 0 && y < 0) return "DUKES";
        
        return "ALGONQUIN"; // Default
    },
    
    playSequence: function(sequence, position) {
        if (!this.enabled) {
            console.log("[PoliceScanner] Playback disabled (playSequence blocked)");
            return;
        }
        
        sequence = this.finalizeSequence(sequence || []);
        if (!sequence.length) {
            console.log("[PoliceScanner] No valid clips available for sequence");
            return;
        }

        // Stop any currently playing sequence to prevent overlap
        this.stopCurrentSequence();
        
        this._isPlaying = true;
        this._currentSequence = sequence;
        var delay = 0;
        
        console.log("[PoliceScanner] Starting new sequence with " + sequence.length + " clips");
        
        sequence.forEach(function(item) {
            var timerId = setTimeout(function() {
                if (PoliceScanner.Manager._currentSequence === sequence) {
                    PoliceScanner.Manager.playSound(item.category, item.file, position);
                }
            }, delay);
            
            PoliceScanner.Manager._sequenceTimers.push(timerId);
            delay += item.delay + 500; // Add pause between clips
        });
        
        // Mark sequence as finished after all clips
        var finishTimerId = setTimeout(function() {
            if (PoliceScanner.Manager._currentSequence === sequence) {
                PoliceScanner.Manager._isPlaying = false;
                PoliceScanner.Manager._currentSequence = null;
                PoliceScanner.Manager._sequenceTimers = [];
                console.log("[PoliceScanner] Sequence finished");
            }
        }, delay);
        
        this._sequenceTimers.push(finishTimerId);
    },
    
    stopCurrentSequence: function() {
        if (this._sequenceTimers.length > 0) {
            console.log("[PoliceScanner] Stopping current sequence (" + this._sequenceTimers.length + " timers)");
            this._sequenceTimers.forEach(function(timerId) {
                clearTimeout(timerId);
            });
            this._sequenceTimers = [];
        }
        
        this._isPlaying = false;
        this._currentSequence = null;
    },
    
    playSound: function(category, file, position, force) {
        if (!this.enabled && !force) {
            return;
        }
        if (!this.sounds[category] || !this.sounds[category][file]) {
            console.log("[PoliceScanner] Sound not found: " + category + "/" + file);
            return;
        }
        
        var sound = this.sounds[category][file];
        
        // Set 3D position
        if (position && sound.setPosition) {
            sound.position = position;
            sound.maxDistance = 100; // 100 units range
            sound.referenceDistance = 10; // Reference distance for 3D audio
        }
        
        // Set volume
        if (sound.volume !== undefined) {
            sound.volume = this.volume;
        }
        
        // Play sound
        if (sound.play) {
            sound.play();
            console.log("[PoliceScanner] Playing: " + category + "/" + file + " at " + JSON.stringify(position));
        }
    },
    
    setVolume: function(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        console.log("[PoliceScanner] Volume set to: " + this.volume);
    },

    setEnabled: function(enabled) {
        this.enabled = !!enabled;
        console.log("[PoliceScanner] Playback " + (this.enabled ? "ENABLED" : "DISABLED"));
    },

    scheduleAutoEnable: function(delayMs) {
        if (this._autoEnableTimer) {
            clearTimeout(this._autoEnableTimer);
            this._autoEnableTimer = null;
        }
        var self = this;
        this._autoEnableTimer = setTimeout(function() {
            self.setEnabled(true);
            console.log("[PoliceScanner] Auto re-enabled after manual playback");
            self._autoEnableTimer = null;
        }, delayMs);
        console.log("[PoliceScanner] Auto re-enable scheduled in " + delayMs + " ms");
    },

    shutdown: function() {
        for (var i = 0; i < this._streams.length; i++) {
            var stream = this._streams[i];
            if (stream && typeof stream.close === "function") {
                stream.close();
            }
        }
        this._streams = [];
        this.active = false;
        console.log("[PoliceScanner] Audio system shutdown");
    },
    
    playBackupRequest: function(position) {
        var sequence = [
            {
                category: "dispatch",
                file: "ALL_UNITS_PLEASE_RESPOND",
                delay: 0
            },
            {
                category: "officer",
                file: "OFFICER_IN_DANGER", 
                delay: 1000
            }
        ];
        
        this.playSequence(sequence, position);
    },
    
    playCalloutComplete: function() {
        var sequence = [
            {
                category: "dispatch",
                file: "SUSPECT_APPREHENDED",
                delay: 0
            }
        ];
        
        this.playSequence(sequence);
    }
};

// Test command to play random sound
if (typeof addCommandHandler === "function") {
    addCommandHandler("testaudio", function() {
        console.log("[TestAudio] Testing police scanner audio...");
        
        if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager && PoliceScanner.Manager.sounds) {
            // Get all available sounds
            var allSounds = [];
            for (var category in PoliceScanner.Manager.sounds) {
                for (var file in PoliceScanner.Manager.sounds[category]) {
                    allSounds.push({
                        category: category,
                        file: file,
                        sound: PoliceScanner.Manager.sounds[category][file]
                    });
                }
            }
            
            if (allSounds.length > 0) {
                // Pick random sound
                var randomSound = allSounds[Math.floor(Math.random() * allSounds.length)];
                console.log("[TestAudio] Playing random sound: " + randomSound.category + "/" + randomSound.file);
                
                // Play the loaded sound
                if (randomSound.sound && typeof randomSound.sound.play === "function") {
                    PoliceScanner.Manager.playSound(randomSound.category, randomSound.file, null, true);
                    console.log("[TestAudio] Random sound played");
                    PoliceScanner.Manager.scheduleAutoEnable(60000);
                } else {
                    console.log("[TestAudio] Sound object invalid");
                }
                
                console.log("[TestAudio] Audio testing complete.");
            } else {
                console.log("[TestAudio] No sounds available to test");
                console.log("[TestAudio] Attempting direct file test...");
                try {
                    var testPath = "Audio/PoliceScanner/ATTENTION_ALL_UNITS.wav";
                    var testStreamFile = openFile(testPath);
                    if (!testStreamFile) {
                        console.log("[TestAudio] openFile failed for: " + testPath);
                    } else {
                        console.log("[TestAudio] openFile success for: " + testPath);
                        var testSoundDirect = audio.createSound(testStreamFile, false);
                        if (testSoundDirect && testSoundDirect.play) {
                            testSoundDirect.play();
                            console.log("[TestAudio] Direct createSound SUCCESS");
                        } else {
                            console.log("[TestAudio] Direct createSound failed or invalid");
                        }
                    }
                } catch (eDirect) {
                    console.log("[TestAudio] Direct file test exception: " + String(eDirect));
                }
            }
        } else {
            console.log("[TestAudio] PoliceScanner not initialized");
        }
    });

    addCommandHandler("scannerall", function() {
        console.log("[ScannerAll] Playing all police scanner sounds sequentially...");

        if (!PoliceScanner || !PoliceScanner.Manager || !PoliceScanner.Manager.sounds) {
            console.log("[ScannerAll] PoliceScanner not initialized");
            return;
        }

        var queue = [];
        for (var category in PoliceScanner.Manager.sounds) {
            for (var file in PoliceScanner.Manager.sounds[category]) {
                queue.push({ category: category, file: file });
            }
        }

        if (queue.length === 0) {
            console.log("[ScannerAll] No sounds available to play");
            return;
        }

        var delay = 0;
        queue.forEach(function(item) {
            setTimeout(function() {
                PoliceScanner.Manager.playSound(item.category, item.file, null, true);
                console.log("[ScannerAll] Played: " + item.category + "/" + item.file);
            }, delay);

            delay += 1500;
        });

        console.log("[ScannerAll] Queue length: " + queue.length);

        // Re-enable automatic playback 1 minute after the last clip
        var totalDuration = delay;
        PoliceScanner.Manager.scheduleAutoEnable(totalDuration + 60000);
    });

    addCommandHandler("scanneronly", function() {
        PoliceScanner.Manager.setEnabled(false);
        console.log("[ScannerOnly] Automatic scanner audio disabled. It will auto re-enable 1 minute after manual playback.");
    });

    addCommandHandler("scanneron", function() {
        PoliceScanner.Manager.setEnabled(true);
        if (PoliceScanner.Manager._autoEnableTimer) {
            clearTimeout(PoliceScanner.Manager._autoEnableTimer);
            PoliceScanner.Manager._autoEnableTimer = null;
        }
        console.log("[ScannerOnly] Automatic scanner audio enabled.");
    });

    addCommandHandler("scannermode", function(cmd, mode) {
        var m = (mode || "").toLowerCase();
        if (m === "structured") {
            PoliceScanner.Manager.structuredMode = true;
        } else if (m === "legacy") {
            PoliceScanner.Manager.structuredMode = false;
        } else {
            console.log("[ScannerMode] Usage: /scannermode structured|legacy");
            return;
        }
        console.log("[ScannerMode] Mode set to: " + (PoliceScanner.Manager.structuredMode ? "structured" : "legacy"));
    });

    addCommandHandler("scannerdemo", function() {
        if (!localPlayer || !localPlayer.position) {
            console.log("[ScannerDemo] localPlayer not ready");
            return;
        }
        console.log("[ScannerDemo] Playing structured demo sequence");
        PoliceScanner.Manager.playDispatch("shooting", localPlayer.position);
    });
}

// Initialize police scanner when resource starts
addEventHandler("onResourceStart", function() {
    if (typeof PoliceScanner !== "undefined") {
        setTimeout(function() {
            PoliceScanner.Manager.init();
        }, 3000);
    }
});

addEventHandler("onResourceStop", function() {
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.shutdown();
    }
});
