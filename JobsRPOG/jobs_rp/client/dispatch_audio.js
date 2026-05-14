"use strict";

// Dispatch Audio System - Integrates callouts with layered audio sequences
var DispatchAudio = DispatchAudio || {};

DispatchAudio.structure = null;
DispatchAudio.loaded = false;
DispatchAudio.lastCalloutAt = 0;
DispatchAudio.minCalloutGapMs = 1200;

DispatchAudio.readTextFile = function(path) {
    if (typeof loadTextFile === "function") {
        try {
            var txt = loadTextFile(path);
            if (typeof txt === "string" && txt.length > 0) {
                return txt;
            }
        } catch (e0) {
        }
    }

    if (typeof XMLHttpRequest !== "undefined") {
        try {
            var request = new XMLHttpRequest();
            request.open("GET", path, false);
            request.send();
            if (request.status === 200 && request.responseText) {
                return String(request.responseText);
            }
        } catch (e1) {
        }
    }

    return "";
};

DispatchAudio.getScannerManager = function() {
    if (typeof PoliceScanner !== "undefined" && PoliceScanner && PoliceScanner.Manager) {
        return PoliceScanner.Manager;
    }
    return null;
};

DispatchAudio.normalizeClipName = function(name) {
    var raw = String(name || "");
    if (raw === "") {
        return "";
    }
    var slash = raw.lastIndexOf("/");
    if (slash >= 0) {
        raw = raw.substring(slash + 1);
    }
    raw = raw.replace(/\.wav$/i, "");
    return raw.toUpperCase();
};

DispatchAudio.resolveClip = function(category, file) {
    var manager = DispatchAudio.getScannerManager();
    if (!manager || !manager.sounds) {
        return null;
    }

    var clipName = DispatchAudio.normalizeClipName(file);
    var requestedCategory = String(category || "").toLowerCase();

    var aliases = {
        policescanner: ["dispatch", "dispatchReports", "criminal", "officer", "traffic", "pursuit", "directionPhrases", "resolution"],
        resident: ["noise", "ambient"]
    };

    var categoriesToCheck = aliases[requestedCategory] || [category];
    var tryList = [];
    var i;
    for (i = 0; i < categoriesToCheck.length; i++) {
        if (categoriesToCheck[i]) {
            tryList.push(categoriesToCheck[i]);
        }
    }

    for (i = 0; i < tryList.length; i++) {
        var cat = tryList[i];
        if (!manager.sounds[cat]) {
            continue;
        }
        for (var key in manager.sounds[cat]) {
            if (DispatchAudio.normalizeClipName(key) === clipName) {
                return { category: cat, file: key };
            }
        }
    }

    for (var anyCategory in manager.sounds) {
        var group = manager.sounds[anyCategory];
        for (var anyKey in group) {
            if (DispatchAudio.normalizeClipName(anyKey) === clipName) {
                return { category: anyCategory, file: anyKey };
            }
        }
    }

    return null;
};

// Load dispatch structure from JSON
DispatchAudio.loadStructure = function() {
    try {
        var text = DispatchAudio.readTextFile("Audio/dispatch_structure.json");
        if (text && text !== "") {
            var data = JSON.parse(text);
            DispatchAudio.structure = data.dispatch_structure;
            DispatchAudio.loaded = true;
            console.log("[DispatchAudio] Loaded dispatch structure with " + Object.keys(DispatchAudio.structure.callouts).length + " callout types");
        } else {
            console.log("[DispatchAudio] Failed to load dispatch structure");
        }
    } catch (e) {
        console.log("[DispatchAudio] Error loading dispatch structure: " + String(e));
    }
};

// Play layered audio sequence for callout type with random variation
DispatchAudio.playCallout = function(calloutType, position) {
    if (!DispatchAudio.loaded) {
        console.log("[DispatchAudio] Structure not loaded, using fallback");
        return;
    }

    var now = (typeof Date !== "undefined" && Date.now) ? Date.now() : 0;
    if (now > 0 && (now - DispatchAudio.lastCalloutAt) < DispatchAudio.minCalloutGapMs) {
        return;
    }
    DispatchAudio.lastCalloutAt = now;
    
    var calloutData = DispatchAudio.structure.callouts[calloutType];
    if (!calloutData) {
        console.log("[DispatchAudio] Unknown callout type: " + calloutType);
        return;
    }
    
    // Select random variation
    var variation = Math.floor(Math.random() * calloutData.variations) + 1;
    console.log("[DispatchAudio] Playing " + calloutType + " callout, variation " + variation);
    
    // Build sequence with random variations
    var sequence = [];
    for (var i = 0; i < calloutData.sequence.length; i++) {
        var item = calloutData.sequence[i];
        
        // Replace placeholder audio files with variations
        var file = item.file;
        if (file.includes("RANDOMCHAT_")) {
            var randomChatNum = Math.floor(Math.random() * 8) + 1; // RANDOMCHAT_01 to RANDOMCHAT_08
            file = "RANDOMCHAT_0" + randomChatNum + ".wav";
        }
        
        var resolved = DispatchAudio.resolveClip(item.category, file);
        if (resolved) {
            sequence.push({
                category: resolved.category,
                file: resolved.file,
                delay: Number(item.delay) || 0
            });
        } else {
            console.log("[DispatchAudio] Missing clip: " + String(item.category) + "/" + String(file));
        }
    }
    
    // Play the sequence through police scanner
    var manager = DispatchAudio.getScannerManager();
    if (manager && typeof manager.playSequence === "function") {
        manager.playSequence(sequence, position);
    } else {
        console.log("[DispatchAudio] PoliceScanner not available");
    }
};

// Play background ambient scanner audio
DispatchAudio.playAmbient = function() {
    if (!DispatchAudio.loaded || !DispatchAudio.structure.background_scanner) {
        return;
    }
    
    var ambient = DispatchAudio.structure.background_scanner.ambient;
    if (ambient && ambient.files && ambient.files.length > 0) {
        var randomFile = ambient.files[Math.floor(Math.random() * ambient.files.length)];
        var resolvedAmbient = DispatchAudio.resolveClip(ambient.category, randomFile);
        
        var manager = DispatchAudio.getScannerManager();
        if (resolvedAmbient && manager && typeof manager.playSound === "function") {
            manager.playSound(resolvedAmbient.category, resolvedAmbient.file, null, true);
        }
    }
};

// Play ambient effect (cuffs, taser, etc.)
DispatchAudio.playEffect = function(effectName) {
    if (!DispatchAudio.loaded || !DispatchAudio.structure.background_scanner) {
        return;
    }
    
    var effects = DispatchAudio.structure.background_scanner.effects;
    if (effects && effects.files && effects.files.length > 0) {
        var randomFile = effects.files[Math.floor(Math.random() * effects.files.length)];
        var resolvedEffect = DispatchAudio.resolveClip(effects.category, randomFile);
        
        var manager = DispatchAudio.getScannerManager();
        if (resolvedEffect && manager && typeof manager.playSound === "function") {
            manager.playSound(resolvedEffect.category, resolvedEffect.file, null, true);
        }
    }
};

// Get location audio for dynamic callouts
DispatchAudio.getLocationAudio = function(area, direction, vehicle) {
    if (!DispatchAudio.loaded || !DispatchAudio.structure.location_data) {
        return null;
    }
    
    var location = DispatchAudio.structure.location_data;
    var result = {
        area: null,
        direction: null,
        vehicle: null
    };
    
    // Get random area
    if (location.areas && location.areas.length > 0) {
        result.area = location.areas[Math.floor(Math.random() * location.areas.length)];
    }
    
    // Get random direction
    if (location.directions && location.directions.length > 0) {
        result.direction = location.directions[Math.floor(Math.random() * location.directions.length)];
    }
    
    // Get random vehicle
    if (location.vehicles) {
        if (vehicle && location.vehicles.models && location.vehicles.models.length > 0) {
            result.vehicle = location.vehicles.models[Math.floor(Math.random() * location.vehicles.models.length)];
        } else if (location.vehicles.categories && location.vehicles.categories.length > 0) {
            result.vehicle = location.vehicles.categories[Math.floor(Math.random() * location.vehicles.categories.length)];
        }
    }
    
    return result;
};

// Initialize dispatch audio system
DispatchAudio.init = function() {
    DispatchAudio.loadStructure();
    
    // Start ambient scanner sounds periodically
    setInterval(function() {
        if (Math.random() < 0.3) { // 30% chance every interval
            DispatchAudio.playAmbient();
        }
    }, 15000); // Every 15 seconds
    
    console.log("[DispatchAudio] Dispatch audio system initialized");
};

addEventHandler("onResourceStart", function() {
    setTimeout(function() {
        DispatchAudio.init();
    }, 3500);
});
