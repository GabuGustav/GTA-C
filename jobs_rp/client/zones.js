"use strict";

var JobsClient = JobsClient || {};
JobsClient.Zones = JobsClient.Zones || {};

var Zones = JobsClient.Zones;

Zones.hubBlips = Zones.hubBlips || [];
Zones.routeBlips = Zones.routeBlips || [];
Zones.hubMarkers = Zones.hubMarkers || [];
Zones.targetMarker = Zones.targetMarker || null;
Zones.markerStateKey = Zones.markerStateKey || "";
Zones.checkpointTestPending = Zones.checkpointTestPending || false;
Zones.checkpointTestShown = Zones.checkpointTestShown || false;
Zones.tickTimer = Zones.tickTimer || null;
Zones.nearbyHub = Zones.nearbyHub || null;
Zones.warnedNoBlipApi = Zones.warnedNoBlipApi || false;
Zones.activeBlipBackend = Zones.activeBlipBackend || null;
Zones.authPromptAtMs = Zones.authPromptAtMs || 0;
Zones.authPromptCooldownMs = Zones.authPromptCooldownMs || 8000;
Zones.blipDiagShown = Zones.blipDiagShown || false;
Zones.testBlipDone = Zones.testBlipDone || false;
Zones.policeBlipIcon = 68; // BLIP_COP_CAR (GTA IV)
Zones.useNativeBlips = true;
Zones.propHandles = Zones.propHandles || [];
Zones.drawEventName = Zones.drawEventName || null;
Zones.drawMarkersViaRender = Zones.drawMarkersViaRender || false;
Zones.processEventName = Zones.processEventName || null;
Zones.renderTimer = Zones.renderTimer || null;

function nowMs() {
    if (typeof Date !== "undefined" && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
}

function sendServer(eventName) {
    if (JobsClient && typeof JobsClient.sendServer === "function") {
        var args = [];
        for (var i = 1; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return JobsClient.sendServer.apply(null, [eventName].concat(args));
    }

    var rawArgs = [];
    for (var j = 1; j < arguments.length; j++) {
        rawArgs.push(arguments[j]);
    }
    if (typeof triggerNetworkEvent === "function") {
        try {
            triggerNetworkEvent.apply(null, [eventName].concat(rawArgs));
            return true;
        } catch (e1) {
        }
    }

    if (typeof triggerServerEvent === "function") {
        try {
            triggerServerEvent.apply(null, [eventName, localPlayer].concat(rawArgs));
            return true;
        } catch (e2) {
        }
    }

    return false;
}

function sendClientDiag(channel, message) {
    if (!message) {
        return;
    }
    sendServer("jobs.clientDiag", String(channel || "blip.test"), String(message));
}

function distance3D(x1, y1, z1, x2, y2, z2) {
    if (typeof getDistanceBetweenPoints3D === "function") {
        return getDistanceBetweenPoints3D(x1, y1, z1, x2, y2, z2);
    }
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dz = z2 - z1;
    return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function getLocalPlayerPosition() {
    if (!localPlayer) {
        return [null, null, null];
    }

    try {
        if (typeof localPlayer.getPosition === "function") {
            var pos = localPlayer.getPosition();
            if (pos && pos.length >= 3) {
                return [pos[0], pos[1], pos[2]];
            }
        }
    } catch (e1) {
    }

    try {
        if (localPlayer.position && typeof localPlayer.position === "object") {
            var p = localPlayer.position;
            if (p.x !== undefined && p.y !== undefined && p.z !== undefined) {
                return [p.x, p.y, p.z];
            }
            if (p[0] !== undefined && p[1] !== undefined && p[2] !== undefined) {
                return [p[0], p[1], p[2]];
            }
        }
    } catch (e2) {
    }

    if (typeof getElementPosition === "function") {
        try {
            var coords = getElementPosition(localPlayer);
            if (coords && coords.length >= 3) {
                return [coords[0], coords[1], coords[2]];
            }
        } catch (e3) {
        }
    }

    return [null, null, null];
}

function vecDistance(coords) {
    if (!localPlayer || !coords) {
        return Infinity;
    }

    var pos = getLocalPlayerPosition();
    var px = pos[0];
    var py = pos[1];
    var pz = pos[2];
    if (px === null || py === null || pz === null) {
        return Infinity;
    }

    return distance3D(px, py, pz, coords[0], coords[1], coords[2]);
}

function isAuthBlocked() {
    if (JobsClient && JobsClient.AuthUI && typeof JobsClient.AuthUI.isBlocking === "function") {
        return JobsClient.AuthUI.isBlocking();
    }

    if (JobsClient && JobsClient.authState) {
        var state = JobsClient.authState;
        if (state.authRequired === true && state.authenticated !== true) {
            return true;
        }
    }

    return false;
}

function extractCoords(target) {
    if (!target) {
        return null;
    }
    if (target.coords) {
        return target.coords;
    }
    if (target.x !== undefined && target.y !== undefined && target.z !== undefined) {
        return [target.x, target.y, target.z];
    }
    if (target[0] !== undefined && target[1] !== undefined && target[2] !== undefined) {
        return [target[0], target[1], target[2]];
    }
    return null;
}

function getRecordedCoordsList() {
    if (typeof JobsRP === "undefined" || !JobsRP || !JobsRP.Config) {
        return [];
    }
    var list = JobsRP.Config.recorded_coords;
    if (!list || typeof list.length !== "number") {
        return [];
    }
    return list;
}

function safeDestroy(handle) {
    if (!handle) {
        return;
    }

    var attempts = [
        function() {
            if (handle.destroy) {
                return handle.destroy();
            }
        },
        function() {
            if (typeof removeBlip === "function") {
                return removeBlip(handle);
            }
        },
        function() {
            if (typeof destroyElement === "function") {
                return destroyElement(handle);
            }
        }
    ];

    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
        } catch (e) {
        }
    }
}

function createObjectAt(modelId, coords, isDynamic) {
    if (!coords || coords.length < 3) {
        return null;
    }
    if (!natives || typeof natives.createObject !== "function") {
        return null;
    }

    var candidates = [
        [coords[0], coords[1], coords[2]],
        makeVec3(coords[0], coords[1], coords[2]),
        { x: coords[0], y: coords[1], z: coords[2] }
    ];

    for (var i = 0; i < candidates.length; i++) {
        var vec = candidates[i];
        if (!vec) {
            continue;
        }
        try {
            var obj = natives.createObject(modelId, vec, isDynamic === true);
            if (obj) {
                return obj;
            }
        } catch (e) {
        }
    }

    return null;
}

function applyPropStreamDistances(handle) {
    if (!handle) {
        return;
    }
    var cfg = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
    var inDist = cfg.prop_stream_in_distance;
    var outDist = cfg.prop_stream_out_distance;

    try {
        if (handle.streamInDistance !== undefined && inDist !== undefined) {
            handle.streamInDistance = inDist;
        }
    } catch (e1) {
    }
    try {
        if (handle.streamOutDistance !== undefined && outDist !== undefined) {
            handle.streamOutDistance = outDist;
        }
    } catch (e2) {
    }
}

Zones.clearProps = function() {
    for (var i = 0; i < Zones.propHandles.length; i++) {
        safeDestroy(Zones.propHandles[i]);
    }
    Zones.propHandles = [];
};

Zones.refreshProps = function() {
    Zones.clearProps();

    var cfg = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
    var models = cfg.prop_models || {};
    if (!models) {
        return;
    }

    function spawnIf(modelId, coords) {
        if (!modelId || modelId <= 0 || !coords) {
            return;
        }
        var obj = createObjectAt(modelId, coords, false);
        if (obj) {
            applyPropStreamDistances(obj);
            Zones.propHandles.push(obj);
        }
    }

    if (JobsRP && JobsRP.JobDefs && JobsRP.JobDefs.list) {
        for (var j = 0; j < JobsRP.JobDefs.list.length; j++) {
            var jobDef = JobsRP.JobDefs.list[j];
            if (!jobDef || !jobDef.id || !jobDef.hub) {
                continue;
            }
            if (jobDef.id === "taxi") {
                spawnIf(models.taxi_hub, jobDef.hub);
            } else if (jobDef.id === "robbery") {
                spawnIf(models.robbery_stash, jobDef.hub);
            } else if (jobDef.id === "police") {
                spawnIf(models.police_dispatch, jobDef.hub);
            }
        }
    }

    if (JobsClient && JobsClient.session && JobsClient.session.target) {
        var target = JobsClient.session.target;
        var coords = [target.x, target.y, target.z];
        if (JobsClient.session.jobId === "robbery") {
            if (target.stageType === "bags") {
                spawnIf(models.robbery_bag, coords);
            } else if (target.stageType === "gather" || target.stageType === "crack") {
                spawnIf(models.robbery_stash, coords);
            }
        }
    }
};

function toInteger(value) {
    var n = Number(value);
    if (!isFinite(n)) {
        return null;
    }
    return Math.floor(n);
}

function collectGlobalBlipSymbols() {
    var out = [];
    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    for (var name in globalEnv) {
        if (!globalEnv.hasOwnProperty(name)) {
            continue;
        }
        var value = globalEnv[name];
        if (typeof name === "string" && typeof value === "function") {
            var lower = name.toLowerCase();
            if (lower.indexOf("blip") !== -1) {
                out.push(name);
            }
        }
    }
    out.sort();
    return out;
}

function warnNoBlipApiOnce() {
    if (Zones.warnedNoBlipApi) {
        return;
    }
    Zones.warnedNoBlipApi = true;

    var known = collectGlobalBlipSymbols();
    var tail = "";
    if (known.length > 0) {
        var limited = [];
        var maxItems = Math.min(known.length, 6);
        for (var i = 0; i < maxItems; i++) {
            limited.push(known[i]);
        }
        tail = " Available globals: " + limited.join(", ");
    }

    var message = "Blips are unavailable in this client runtime. Using proximity prompts only." + tail;
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt(message, "warn", true);
    }
    try {
        if (typeof console !== "undefined" && console && typeof console.log === "function") {
            console.log("[jobs_rp] " + message);
        }
    } catch (e) {
    }
}

function drawCheckpointMarker(entry) {
    if (!entry || !entry.coords || entry.coords.length < 3) {
        return;
    }
    if (typeof natives === "undefined" || !natives || typeof natives.drawCheckpointWithAlpha !== "function") {
        return;
    }
    try {
        var zOffset = (entry.zOffset !== undefined) ? Number(entry.zOffset) : 0.0;
        var vec = new Vec3(entry.coords[0], entry.coords[1], entry.coords[2] + zOffset);
        var radius = Number(entry.radius || 4.0);
        var c = entry.color || [255, 255, 0, 200];
        natives.drawCheckpointWithAlpha(vec, radius, c[0], c[1], c[2], c[3]);
    } catch (e) {
    }
}

function createCheckpointAt(entry) {
    if (!entry || !entry.coords || entry.coords.length < 3) {
        return null;
    }
    if (typeof natives === "undefined" || !natives || typeof natives.createCheckpoint !== "function") {
        return null;
    }
    try {
        var vec = new Vec3(entry.coords[0], entry.coords[1], entry.coords[2]);
        var radius = Number(entry.radius || 4.0);
        var id = natives.createCheckpoint(1, vec, radius, radius);
        if (typeof id === "number" && id > 0) {
            entry.id = id;
            return id;
        }
    } catch (e) {
    }
    return null;
}

function attachFirstHandler(candidates, callback) {
    if (typeof addEventHandler !== "function" || !candidates || candidates.length === 0) {
        return null;
    }
    for (var i = 0; i < candidates.length; i++) {
        var name = candidates[i];
        try {
            addEventHandler(name, callback);
            return name;
        } catch (e) {
        }
    }
    return null;
}

function detachHandler(eventName, callback) {
    if (!eventName || typeof removeEventHandler !== "function") {
        return;
    }
    try {
        removeEventHandler(eventName, callback);
    } catch (e) {
    }
}

function runCheckpointTest(hasUI) {
    if (!Zones.checkpointTestPending) {
        return;
    }
    var pos = getLocalPlayerPosition();
    if (pos[0] == null || typeof natives === "undefined") {
        return;
    }

    if (typeof natives.createCheckpoint === "function") {
        try {
            var vec = new Vec3(pos[0], pos[1], pos[2]);
            var id = natives.createCheckpoint(1, vec, 4.0, 4.0);
            if (typeof id === "number" && id > 0) {
                Zones.targetMarker = { coords: pos, color: [255, 220, 0, 200], radius: 4.0, id: id };
                if (!Zones.checkpointTestShown) {
                    Zones.checkpointTestShown = true;
                    sendClientDiag("checkpoint.test", "created id=" + String(id));
                    if (hasUI) {
                        hasUI.showPrompt("Checkpoint test created id=" + String(id), "info", true);
                    }
                }
            }
            Zones.checkpointTestPending = false;
            return;
        } catch (e) {
            if (!Zones.checkpointTestShown) {
                Zones.checkpointTestShown = true;
                sendClientDiag("checkpoint.test", "createCheckpoint exception: " + String(e));
                if (hasUI) {
                    hasUI.showPrompt("Checkpoint test error: " + String(e), "warn", true);
                }
            }
            Zones.checkpointTestPending = false;
            return;
        }
    }

    if (typeof natives.drawCheckpointWithAlpha === "function") {
        try {
            var vecDraw = new Vec3(pos[0], pos[1], pos[2]);
            natives.drawCheckpointWithAlpha(vecDraw, 4.0, 255, 220, 0, 200);
            if (!Zones.checkpointTestShown) {
                Zones.checkpointTestShown = true;
                sendClientDiag("checkpoint.test", "drawCheckpointWithAlpha only (no createCheckpoint)");
                if (hasUI) {
                    hasUI.showPrompt("Checkpoint test drawn (no createCheckpoint)", "info", true);
                }
            }
        } catch (e2) {
            if (!Zones.checkpointTestShown) {
                Zones.checkpointTestShown = true;
                sendClientDiag("checkpoint.test", "drawCheckpointWithAlpha exception: " + String(e2));
                if (hasUI) {
                    hasUI.showPrompt("Checkpoint test error: " + String(e2), "warn", true);
                }
            }
        }
        Zones.checkpointTestPending = false;
        return;
    }

    if (!Zones.checkpointTestShown) {
        Zones.checkpointTestShown = true;
        sendClientDiag("checkpoint.test", "checkpoint natives missing");
        if (hasUI) {
            hasUI.showPrompt("Checkpoint natives missing", "warn", true);
        }
    }
    Zones.checkpointTestPending = false;
}

Zones.clearMarkers = function() {
    if (typeof natives !== "undefined" && natives && typeof natives.deleteCheckpoint === "function") {
        for (var i = 0; i < Zones.hubMarkers.length; i++) {
            var entry = Zones.hubMarkers[i];
            if (entry && typeof entry.id === "number") {
                try {
                    natives.deleteCheckpoint(entry.id);
                } catch (e) {
                }
            }
        }
        if (Zones.targetMarker && typeof Zones.targetMarker.id === "number") {
            try {
                natives.deleteCheckpoint(Zones.targetMarker.id);
            } catch (e2) {
            }
        }
    }
    Zones.hubMarkers = [];
    Zones.targetMarker = null;
    Zones.markerStateKey = "";
};

Zones.refreshMarkers = function() {
    Zones.clearMarkers();

    var cfg = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
    var hubRadius = Number(cfg.hub_interact_distance || 5.0);

    var recorded = getRecordedCoordsList();
    if (recorded.length > 0) {
        for (var r = 0; r < recorded.length; r++) {
            var item = recorded[r];
            if (!item || !item.coords) {
                continue;
            }
            var coords = extractCoords(item.coords);
            if (!coords) {
                continue;
            }
            var hubEntry = {
                coords: coords,
                color: [255, 220, 0, 200],
                radius: Math.max(3.0, hubRadius),
                zOffset: 0.8
            };
            createCheckpointAt(hubEntry);
            Zones.hubMarkers.push(hubEntry);
        }
    } else if (JobsRP && JobsRP.JobDefs && JobsRP.JobDefs.list) {
        for (var j = 0; j < JobsRP.JobDefs.list.length; j++) {
            var jobDef = JobsRP.JobDefs.list[j];
            if (!jobDef || jobDef.id !== "police") {
                continue;
            }
            var hubEntry = {
                coords: jobDef.hub,
                color: [255, 220, 0, 200],
                radius: Math.max(3.0, hubRadius),
                zOffset: 0.8
            };
            createCheckpointAt(hubEntry);
            Zones.hubMarkers.push(hubEntry);
        }
    }

    if (JobsClient && JobsClient.session && JobsClient.session.target) {
        var target = JobsClient.session.target;
        var coords = extractCoords(target);
        if (coords) {
            var stageType = String(target.stageType || "");
            var label = String(target.label || "");
            var isEnd = (stageType === "escape") || (stageType === "dropoff") || (label.toLowerCase().indexOf("drop") !== -1) || (label.toLowerCase().indexOf("escape") !== -1);
            var color = isEnd ? [120, 255, 120, 200] : [100, 160, 255, 200];
            var targetEntry = {
                coords: coords,
                color: color,
                radius: Math.max(4.0, Number(cfg.action_distance || 8.0))
            };
            createCheckpointAt(targetEntry);
            Zones.targetMarker = targetEntry;
        }
    }
};

function makeVec3(x, y, z) {
    try {
        if (typeof vector3 === "function") {
            return vector3(x, y, z);
        }
    } catch (e1) {
    }

    try {
        if (typeof vec3 === "function") {
            return vec3(x, y, z);
        }
    } catch (e1b) {
    }

    try {
        if (typeof vec3 === "object" && typeof vec3.new === "function") {
            return vec3.new(vec3, x, y, z);
        }
    } catch (e1c) {
    }

    try {
        if (typeof Vec3 === "function") {
            return Vec3(x, y, z);
        }
    } catch (e2) {
    }

    try {
        if (typeof Vec3 === "object" && typeof Vec3.new === "function") {
            return Vec3.new(Vec3, x, y, z);
        }
    } catch (e3) {
    }

    return { x: x, y: y, z: z };
}

function tryCalls(calls) {
    for (var i = 0; i < calls.length; i++) {
        try {
            var result = calls[i]();
            if (result) {
                return result;
            }
        } catch (e) {
        }
    }
    return null;
}

function callFactory(fn, x, y, z, sprite) {
    if (typeof fn !== "function") {
        return null;
    }

    var vec = makeVec3(x, y, z);
    var calls = [
        function() { return fn(sprite, x, y, z); },
        function() { return fn(x, y, z, sprite); },
        function() { return fn(x, y, z); },
        function() { return fn(sprite, vec); },
        function() { return fn(vec, sprite); },
        function() { return fn(vec); }
    ];
    return tryCalls(calls);
}

function callMethodFactory(obj, methodName, x, y, z, sprite) {
    if (!obj) {
        return null;
    }

    var method = obj[methodName];
    if (typeof method !== "function") {
        return null;
    }

    var vec = makeVec3(x, y, z);
    var calls = [
        function() { return method.call(obj, sprite, x, y, z); },
        function() { return method.call(obj, x, y, z, sprite); },
        function() { return method.call(obj, x, y, z); },
        function() { return method.call(obj, sprite, vec); },
        function() { return method.call(obj, vec, sprite); },
        function() { return method.call(obj, vec); }
    ];
    return tryCalls(calls);
}

function setBlipLabel(blip, label) {
    if (!blip || !label || label === "") {
        return;
    }

    var calls = [
        function() {
            if (blip.setName) {
                return blip.setName(label);
            }
        },
        function() {
            if (blip.setText) {
                return blip.setText(label);
            }
        },
        function() {
            if (typeof setBlipName === "function") {
                return setBlipName(blip, label);
            }
        }
    ];

    for (var i = 0; i < calls.length; i++) {
        try {
            calls[i]();
        } catch (e) {
        }
    }
}

function spriteCandidates(kind) {
    var config = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
    var primary = null;
    if (kind === "hub") {
        primary = toInteger(config.hub_blip_sprite);
    } else {
        primary = toInteger(config.route_blip_sprite);
    }

    var values = [];
    var seen = {};

    function push(v) {
        if (v === null || v === undefined) {
            return;
        }
        if (seen[v]) {
            return;
        }
        seen[v] = true;
        values.push(v);
    }

    push(primary);
    push(1);
    push(2);
    push(3);
    push(0);

    return values;
}

function resolveNativeBlipApi() {
    var sources = [
        { obj: (typeof natives !== "undefined") ? natives : null, label: "natives" },
        { obj: (typeof Native !== "undefined") ? Native : null, label: "Native" },
        { obj: (typeof gta !== "undefined" && gta && gta.natives) ? gta.natives : null, label: "gta.natives" },
        { obj: (typeof game !== "undefined" && game && game.natives) ? game.natives : null, label: "game.natives" },
        { obj: (typeof world !== "undefined" && world && world.natives) ? world.natives : null, label: "world.natives" },
        { obj: (typeof _G !== "undefined" && _G && _G.natives) ? _G.natives : null, label: "_G.natives" },
        { obj: (typeof globalThis !== "undefined" && globalThis && globalThis.natives) ? globalThis.natives : null, label: "globalThis.natives" }
    ];

    for (var i = 0; i < sources.length; i++) {
        var entry = sources[i];
        if (entry.obj && typeof entry.obj.addBlipForCoord === "function") {
            return { obj: entry.obj, label: entry.label };
        }
    }
    return { obj: null, label: null };
}

function createNativeBlipForCoords(coords, icon, label, shortRange) {
    if (!coords || coords.length < 3) {
        return null;
    }
    
    // WORKING PATTERN: Use natives.addBlipForCoord directly (from BetterIV working script)
    var resolved = resolveNativeBlipApi();
    var nativeObj = resolved.obj;
    if (nativeObj && typeof nativeObj.addBlipForCoord === "function") {
        try {
            if (typeof console !== "undefined" && console.log) {
                console.log("[jobs_rp] Trying natives.addBlipForCoord at coords: " + JSON.stringify(coords));
            }
            
            // Create Vec3 exactly like BetterIV script
            var vec = new Vec3(coords[0], coords[1], coords[2]);
            var blipHandle = nativeObj.addBlipForCoord(vec);
            
            if (typeof blipHandle === "number" && blipHandle > 0) {
                if (typeof console !== "undefined" && console.log) {
                    console.log("[jobs_rp] natives.addBlipForCoord succeeded, id: " + blipHandle + " source=" + String(resolved.label));
                }
                
                // Set blip properties exactly like BetterIV script
                if (typeof nativeObj.changeBlipSprite === "function" && typeof icon === "number") {
                    nativeObj.changeBlipSprite(blipHandle, icon);
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip sprite set to: " + icon);
                    }
                }
                if (typeof nativeObj.changeBlipColour === "function") {
                    nativeObj.changeBlipColour(blipHandle, 0); // Green color like BetterIV
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip colour set to green");
                    }
                }
                if (typeof nativeObj.changeBlipScale === "function") {
                    nativeObj.changeBlipScale(blipHandle, 1.0); // Normal scale
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip scale set to 1.0");
                    }
                }
                if (typeof nativeObj.changeBlipDisplay === "function") {
                    nativeObj.changeBlipDisplay(blipHandle, 2); // Show on radar and map
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip display set to radar+map");
                    }
                }
                if (typeof nativeObj.setBlipAsShortRange === "function") {
                    nativeObj.setBlipAsShortRange(blipHandle, shortRange === true);
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip short range set to: " + (shortRange === true));
                    }
                }
                if (typeof nativeObj.changeBlipNameFromAscii === "function" && label) {
                    nativeObj.changeBlipNameFromAscii(blipHandle, String(label));
                    if (typeof console !== "undefined" && console.log) {
                        console.log("[jobs_rp] Blip name set to: " + String(label));
                    }
                }
                
                return blipHandle;
            } else {
                if (typeof console !== "undefined" && console.log) {
                    console.log("[jobs_rp] natives.addBlipForCoord failed: invalid blip handle");
                }
            }
        } catch (e) {
            if (typeof console !== "undefined" && console.log) {
                console.log("[jobs_rp] natives.addBlipForCoord exception: " + String(e));
            }
        }
    }
    
    // FALLBACK: Try gta.createMarker if natives fail
    if (globalEnv.gta && typeof globalEnv.gta.createMarker === "function") {
        try {
            if (typeof console !== "undefined" && console.log) {
                console.log("[jobs_rp] Fallback to gta.createMarker at coords: " + JSON.stringify(coords));
            }
            
            var marker = globalEnv.gta.createMarker(coords[0], coords[1], coords[2]);
            if (marker && typeof marker.id === "number") {
                if (typeof console !== "undefined" && console.log) {
                    console.log("[jobs_rp] gta.createMarker succeeded, id: " + marker.id);
                }
                
                // Set marker properties to simulate blip
                if (typeof marker.setColour === "function") {
                    marker.setColour(0, 255, 0); // Green color
                }
                if (typeof marker.setRadius === "function") {
                    marker.setRadius(shortRange ? 25 : 100); // Smaller radius for short range
                }
                if (typeof marker.setName === "function" && label) {
                    marker.setName(String(label));
                }
                if (typeof marker.setShowOnMap === "function") {
                    marker.setShowOnMap(true);
                }
                if (typeof marker.setShowOnRadar === "function") {
                    marker.setShowOnRadar(true);
                }
                return marker.id;
            } else {
                if (typeof console !== "undefined" && console.log) {
                    console.log("[jobs_rp] gta.createMarker failed: invalid marker object");
                }
            }
        } catch (e) {
            if (typeof console !== "undefined" && console.log) {
                console.log("[jobs_rp] gta.createMarker exception: " + String(e));
            }
        }
    }

    if (typeof console !== "undefined" && console.log) {
        console.log("[jobs_rp] All blip creation methods failed");
    }
    return null;
}

function tryNativeBlipForCoords(coords) {
    if (!coords || coords.length < 3) {
        return { id: null, method: null, error: "coords invalid" };
    }
    
    var resolved = resolveNativeBlipApi();
    var natives = resolved.obj;
    var nativesLabel = resolved.label;
    if (!natives) {
        return { id: null, method: null, error: "native addBlipForCoord missing" };
    }

    var candidates = [];
    var vec = makeVec3(coords[0], coords[1], coords[2]);
    candidates.push({ label: "makeVec3", value: vec });
    candidates.push({ label: "object", value: { x: coords[0], y: coords[1], z: coords[2] } });
    candidates.push({ label: "array", value: [coords[0], coords[1], coords[2]] });

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!c.value) {
            lastError = "candidate " + c.label + " is null";
            continue;
        }
        try {
            var id = natives.addBlipForCoord(c.value);
            if (typeof id === "number" && id > 0) {
                return { id: id, method: nativesLabel + " + " + c.label, error: null };
            }
        } catch (e) {
            lastError = e.toString();
        }
    }
    return { id: null, method: null, error: lastError || "all candidates failed" };
}

function createBlipForCoords(coords, kind, label) {
    var x = coords[0], y = coords[1], z = coords[2];
    var created = null;

    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    if (Zones.useNativeBlips) {
        var icon = (kind === "hub") ? Zones.policeBlipIcon : Zones.policeBlipIcon;
        // Hub blips should be short-range (visible within range) if configured
        var cfg = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
        var shortRange = (kind === "hub") ? (cfg.hub_blip_short_range === true) : true;
        created = createNativeBlipForCoords(coords, icon, label, shortRange);
        if (created != null) {
            return created;
        }
    }

    var candidates = spriteCandidates(kind);
    for (var s = 0; s < candidates.length; s++) {
        var sprite = candidates[s];

        var globalFactories = [
            "createBlip",
            "addBlip",
            "addBlipForCoord",
            "addBlipForCoords",
            "createMapBlip"
        ];

        for (var i = 0; i < globalFactories.length; i++) {
            created = callFactory(globalEnv[globalFactories[i]], x, y, z, sprite);
            if (created) {
                Zones.activeBlipBackend = globalFactories[i];
                break;
            }
        }

        if (created) {
            break;
        }

        var objectFactories = [
            { obj: globalEnv.gta, methods: ["createBlip", "addBlip"], label: "gta" },
            { obj: globalEnv.world, methods: ["createBlip", "addBlip"], label: "world" },
            { obj: globalEnv.game, methods: ["createBlip", "addBlip"], label: "game" },
            { obj: globalEnv.localPlayer, methods: ["createBlip", "addBlip"], label: "localPlayer" }
        ];

        for (var j = 0; j < objectFactories.length; j++) {
            var entry = objectFactories[j];
            if (entry.obj) {
                for (var m = 0; m < entry.methods.length; m++) {
                    created = callMethodFactory(entry.obj, entry.methods[m], x, y, z, sprite);
                    if (created) {
                        Zones.activeBlipBackend = entry.label + "." + entry.methods[m];
                        break;
                    }
                }
            }
            if (created) {
                break;
            }
        }

        if (created) {
            break;
        }
    }

    if (created) {
        setBlipLabel(created, String(label || "Job"));
        return created;
    }

    warnNoBlipApiOnce();
    return null;
}

Zones.createPoliceBlipAt = function(coords, label) {
    if (!coords || coords.length < 3) {
        return null;
    }
    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    var vec = makeVec3(coords[0], coords[1], coords[2]);
    var blip = null;

    if (Zones.useNativeBlips && vec) {
        blip = createNativeBlipForCoords(coords, Zones.policeBlipIcon, label || "Police Blip", false);
    }

    if (!blip) {
        // Fallback to generic blip creation with police icon if supported by backend
        blip = createBlipForCoords(coords, "route", label || "Police Blip");
    }

    if (blip) {
        setBlipLabel(blip, String(label || "Police Blip"));
    }
    return blip;
};

Zones.removeNativeBlip = function(blipId) {
    if (typeof blipId !== "number") {
        return;
    }
    
    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    
    // DO NOT use gta.blips - use only natives as per developer instructions
    // Try multiple native access patterns for GTA Connected
    var nativeSources = [
        globalEnv.natives,
        globalEnv.Native,
        globalEnv.gta && globalEnv.gta.natives,
        globalEnv.game && globalEnv.game.natives,
        globalEnv.world && globalEnv.world.natives
    ];
    
    for (var i = 0; i < nativeSources.length; i++) {
        var natives = nativeSources[i];
        if (natives && typeof natives.removeBlipAndClearIndex === "function") {
            try {
                natives.removeBlipAndClearIndex(blipId);
                return;
            } catch (e) {
                // Try next native source
            }
        }
        // Try alternative removal methods
        if (natives && typeof natives.removeBlip === "function") {
            try {
                natives.removeBlip(blipId);
                return;
            } catch (e) {
                // Try next native source
            }
        }
    }
};

Zones.clearRoute = function() {
    for (var i = 0; i < Zones.routeBlips.length; i++) {
        var blip = Zones.routeBlips[i];
        if (typeof blip === "number") {
            Zones.removeNativeBlip(blip);
        } else {
            safeDestroy(blip);
        }
    }
    Zones.routeBlips = [];
};

Zones.setRoute = function(jobId, routePoints) {
    Zones.clearRoute();
    if (!routePoints || typeof routePoints !== "object") {
        return;
    }

    var showAll = false;
    if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.route_blips_show_all) {
        showAll = true;
    }

    for (var index = 0; index < routePoints.length; index++) {
        var point = routePoints[index];
        if (index === 0 || showAll) {
            var coords = extractCoords(point);
            if (coords) {
                var label = point.label || (jobId && (String(jobId) + " objective")) || "Objective";
                var blip = createBlipForCoords(coords, "route", label);
                if (blip) {
                    Zones.routeBlips.push(blip);
                }
            }
        }
    }
};

Zones.refreshHubBlips = function() {
    for (var i = 0; i < Zones.hubBlips.length; i++) {
        var blip = Zones.hubBlips[i];
        var blipId = (blip && typeof blip === "object" && blip.id !== undefined) ? blip.id : blip;
        if (typeof blipId === "number") {
            Zones.removeNativeBlip(blipId);
        } else {
            safeDestroy(blipId);
        }
    }
    Zones.hubBlips = [];

    var recorded = getRecordedCoordsList();
    if (recorded.length > 0) {
        for (var r = 0; r < recorded.length; r++) {
            var item = recorded[r];
            if (!item || !item.coords) {
                continue;
            }
            var coords = extractCoords(item.coords);
            if (!coords) {
                continue;
            }
            var label = item.name || item.label || "Recorded";
            var blip = createBlipForCoords(coords, "hub", label);
            if (blip) {
                Zones.hubBlips.push({ id: blip, coords: coords });
            } else if (!Zones.blipDiagShown) {
                Zones.blipDiagShown = true;
                sendClientDiag("blip.hub", "Recorded hub blip creation failed for coords=" + JSON.stringify(coords || []));
            }
        }
        return;
    }

    if (JobsRP && JobsRP.JobDefs && JobsRP.JobDefs.list) {
        for (var j = 0; j < JobsRP.JobDefs.list.length; j++) {
            var jobDef = JobsRP.JobDefs.list[j];
            if (!jobDef || jobDef.id !== "police") {
                continue;
            }
            var blip = createBlipForCoords(jobDef.hub, "hub", jobDef.label);
            if (blip) {
                Zones.hubBlips.push({ id: blip, coords: jobDef.hub });
            } else if (!Zones.blipDiagShown) {
                Zones.blipDiagShown = true;
                sendClientDiag("blip.hub", "Police hub blip creation failed for coords=" + JSON.stringify(jobDef.hub || []));
            }
        }
    }
};

function updateHubBlipScales() {
    if (!Zones.hubBlips || Zones.hubBlips.length === 0) {
        return;
    }
    var cfg = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) ? JobsRP.Config : {};
    var maxDistance = Number(cfg.hub_blip_range || 800);
    var minScale = Number(cfg.hub_blip_min_scale || 0.5);
    var maxScale = Number(cfg.hub_blip_max_scale || 1.0);
    if (!isFinite(maxDistance) || maxDistance <= 0) {
        maxDistance = 800.0;
    }

    for (var i = 0; i < Zones.hubBlips.length; i++) {
        var entry = Zones.hubBlips[i];
        if (!entry || !entry.coords) {
            continue;
        }
        var distance = vecDistance(entry.coords);
        if (!isFinite(distance)) {
            continue;
        }
        var scale = maxScale - (distance / maxDistance) * (maxScale - minScale);
        if (scale < minScale) {
            scale = minScale;
        } else if (scale > maxScale) {
            scale = maxScale;
        }

        var blipId = (entry && typeof entry === "object" && entry.id !== undefined) ? entry.id : entry;
        if (typeof blipId === "number") {
            try {
                if (typeof natives !== "undefined" && natives && typeof natives.changeBlipScale === "function") {
                    natives.changeBlipScale(blipId, scale);
                }
            } catch (e) {
            }
        }
    }
}

function getNearestHub() {
    var nearest = null;
    var bestDistance = Infinity;
    var recorded = getRecordedCoordsList();
    if (recorded.length > 0) {
        for (var r = 0; r < recorded.length; r++) {
            var item = recorded[r];
            if (!item || !item.coords) {
                continue;
            }
            var coords = extractCoords(item.coords);
            if (!coords) {
                continue;
            }
            var dist = vecDistance(coords);
            if (dist < bestDistance) {
                bestDistance = dist;
                nearest = {
                    jobId: item.category || "recorded",
                    label: item.name || "Recorded",
                    coords: coords,
                    distance: dist
                };
            }
        }
        return nearest;
    }

    if (!JobsRP || !JobsRP.JobDefs || !JobsRP.JobDefs.list) {
        return null;
    }

    for (var i = 0; i < JobsRP.JobDefs.list.length; i++) {
        var jobDef = JobsRP.JobDefs.list[i];
        var dist = vecDistance(jobDef.hub);
        if (dist < bestDistance) {
            bestDistance = dist;
            nearest = {
                jobId: jobDef.id,
                label: jobDef.label,
                coords: jobDef.hub,
                distance: dist
            };
        }
    }
    return nearest;
}

function getSessionTarget() {
    var session = JobsClient.session;
    if (!session || !session.target) {
        return null;
    }
    var coords = extractCoords(session.target);
    if (!coords) {
        return null;
    }
    return {
        label: session.target.label || session.target.id || "objective",
        coords: coords,
        distance: vecDistance(coords)
    };
}

function getMarkerStateKey() {
    var jobId = JobsClient && JobsClient.session ? String(JobsClient.session.jobId || "") : "";
    var target = JobsClient && JobsClient.session ? JobsClient.session.target : null;
    if (!target) {
        return jobId + "|none";
    }
    var coords = extractCoords(target) || [];
    var stage = String(target.stageType || "");
    return jobId + "|" + stage + "|" + coords.join(",");
}

Zones.tick = function() {
    var hasUI = JobsClient && JobsClient.UI;

    updateHubBlipScales();
    var markerKey = getMarkerStateKey();
    if (markerKey !== Zones.markerStateKey) {
        Zones.markerStateKey = markerKey;
        Zones.refreshMarkers();
    }

    if (!Zones.drawMarkersViaRender) {
        runCheckpointTest(hasUI);
        for (var i = 0; i < Zones.hubMarkers.length; i++) {
            drawCheckpointMarker(Zones.hubMarkers[i]);
        }
        if (Zones.targetMarker) {
            drawCheckpointMarker(Zones.targetMarker);
        }
    }

    if (!hasUI) {
        return;
    }

    if (isAuthBlocked()) {
        var ts = nowMs();
        if ((ts - (Zones.authPromptAtMs || 0)) >= (Zones.authPromptCooldownMs || 8000)) {
            Zones.authPromptAtMs = ts;
            hasUI.showPrompt("Authenticate in the Jobs Auth panel before using jobs.", "warn", false);
        }
        return;
    }

    var profile = JobsClient.profile;
    var session = JobsClient.session;
    var nearestHub = getNearestHub();
    Zones.nearbyHub = nearestHub;

    // Update keyboard service hub proximity state
    var wasNearHub = (typeof KeyboardService !== "undefined" && KeyboardService.isNearHub && KeyboardService.isNearHub()) || false;
    var isNearHubNow = nearestHub && nearestHub.distance <= JobsRP.Config.hub_interact_distance;
    
    if (wasNearHub !== isNearHubNow) {
        if (typeof KeyboardService !== "undefined" && KeyboardService.setHubProximity) {
            KeyboardService.setHubProximity(isNearHubNow);
        }
    }

    var target = getSessionTarget();
    if (target) {
        if (target.distance <= JobsRP.Config.action_distance) {
            var interactAvailable = Zones.interactAvailable !== false;
            if (interactAvailable) {
                JobsClient.UI.showPrompt("Press E to perform: " + String(target.label), "info", false);
            } else {
                JobsClient.UI.showPrompt("Use /job action " + String(target.id || "unknown") + " to perform: " + String(target.label), "info", false);
            }
        }
        return;
    }

    if (!nearestHub) {
        return;
    }
    if (nearestHub.distance > JobsRP.Config.hub_interact_distance) {
        return;
    }

    var interactAvailable = Zones.interactAvailable !== false;

    if (!profile || !profile.currentJobId) {
        if (interactAvailable) {
            JobsClient.UI.showPrompt("Press E to join " + nearestHub.label, "info", false);
        } else {
            JobsClient.UI.showPrompt("Use /job join " + nearestHub.jobId + " to join " + nearestHub.label, "info", false);
        }
        return;
    }

    if (profile.currentJobId === nearestHub.jobId && !session) {
        if (interactAvailable) {
            JobsClient.UI.showPrompt("Press E to start " + nearestHub.label, "success", false);
        } else {
            JobsClient.UI.showPrompt("Use /job start to begin " + nearestHub.label, "success", false);
        }
    } else {
        if (interactAvailable) {
            JobsClient.UI.showPrompt("Press E to switch to " + nearestHub.label, "warn", false);
        } else {
            JobsClient.UI.showPrompt("Use /job join " + nearestHub.jobId + " to switch to " + nearestHub.label, "warn", false);
        }
    }
};

Zones.onRender = function() {
    var hasUI = JobsClient && JobsClient.UI;
    runCheckpointTest(hasUI);
    for (var i = 0; i < Zones.hubMarkers.length; i++) {
        drawCheckpointMarker(Zones.hubMarkers[i]);
    }
    if (Zones.targetMarker) {
        drawCheckpointMarker(Zones.targetMarker);
    }
};

Zones.onProcess = function() {
    var hasUI = JobsClient && JobsClient.UI;
    runCheckpointTest(hasUI);
    for (var i = 0; i < Zones.hubMarkers.length; i++) {
        drawCheckpointMarker(Zones.hubMarkers[i]);
    }
    if (Zones.targetMarker) {
        drawCheckpointMarker(Zones.targetMarker);
    }
};

Zones.handleInteractKey = function() {
    if (isAuthBlocked()) {
        if (JobsClient.AuthUI && typeof JobsClient.AuthUI.open === "function") {
            JobsClient.AuthUI.open();
        }
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Authenticate first using the Jobs Auth panel.", "warn", true);
        }
        return;
    }

    var target = getSessionTarget();
    if (target && target.distance <= JobsRP.Config.action_distance) {
        sendServer("jobs.requestAction", "progress", {
            x: target.coords[0],
            y: target.coords[1],
            z: target.coords[2]
        });
        return;
    }

    var hub = Zones.nearbyHub || getNearestHub();
    if (hub && hub.distance <= JobsRP.Config.hub_interact_distance) {
        var profile = JobsClient.profile;
        if (!profile || profile.currentJobId !== hub.jobId) {
            sendServer("jobs.requestJoin", hub.jobId);
            return;
        }
        sendServer("jobs.requestStart");
        return;
    }

    JobsClient.UI.showPrompt("No job interaction nearby. Use /job list.", "warn", false);
};

Zones.start = function() {
    if (Zones.tickTimer && typeof clearInterval === "function") {
        clearInterval(Zones.tickTimer);
        Zones.tickTimer = null;
    }

    // Pattern 16: Run diagnostics on resource start
    Zones.runCapabilityDiagnostics();

    // Pattern 14: Capability gating - check if blips work before enabling features
    if (!Zones.blipCapabilitiesChecked) {
        Zones.blipCapabilitiesChecked = true;
        Zones.blipSystemWorking = false;
        
        var testResult = Zones.testBlipCapability();
        if (testResult.working) {
            Zones.blipSystemWorking = true;
            if (JobsClient.UI) {
                JobsClient.UI.showPrompt("Blip system working: " + testResult.method, "info", true);
            }
        } else {
            // Pattern 14: Disable blip features if APIs missing
            Zones.useNativeBlips = false;
            if (JobsClient.UI) {
                JobsClient.UI.showPrompt("Blip system disabled - using command fallbacks. Reason: " + testResult.error, "warn", true);
            }
        }
    }

    Zones.refreshHubBlips();
    Zones.refreshProps();
    Zones.refreshMarkers();
    Zones.checkpointTestPending = true;

    Zones.drawEventName = attachFirstHandler(["OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", "OnRender", "onRender"], Zones.onRender);
    Zones.processEventName = attachFirstHandler(["OnProcess", "onProcess"], Zones.onProcess);

    Zones.drawMarkersViaRender = false;
    if (Zones.drawEventName || Zones.processEventName) {
        Zones.drawMarkersViaRender = true;
    }
    if (typeof setInterval === "function") {
        if (Zones.renderTimer && typeof clearInterval === "function") {
            clearInterval(Zones.renderTimer);
        }
        Zones.renderTimer = setInterval(function() {
            Zones.onRender();
        }, 16);
        Zones.drawMarkersViaRender = true;
    }

    // Initialize keyboard service E key binding
    if (typeof KeyboardService !== "undefined" && KeyboardService.activateEKey) {
        KeyboardService.activateEKey();
    }

    // Always run a one-time test blip on start (independent of auth flow)
    if (typeof setTimeout === "function") {
        setTimeout(function() {
            Zones.testBlipAtPlayer();
        }, 1000);
    } else {
        Zones.testBlipAtPlayer();
    }


    if (JobsClient.session && JobsClient.session.target) {
        Zones.setRoute(JobsClient.session.jobId, [JobsClient.session.target]);
    }

    if (typeof setInterval === "function") {
        Zones.tickTimer = setInterval(function() {
            Zones.tick();
        }, 500);
    }
};

Zones.stop = function() {
    if (Zones.drawEventName) {
        detachHandler(Zones.drawEventName, Zones.onRender);
        Zones.drawEventName = null;
        Zones.drawMarkersViaRender = false;
    }
    if (Zones.processEventName) {
        detachHandler(Zones.processEventName, Zones.onProcess);
        Zones.processEventName = null;
    }
    if (Zones.renderTimer && typeof clearInterval === "function") {
        clearInterval(Zones.renderTimer);
        Zones.renderTimer = null;
    }
    if (Zones.tickTimer && typeof clearInterval === "function") {
        clearInterval(Zones.tickTimer);
        Zones.tickTimer = null;
    }
    Zones.clearRoute();
    for (var i = 0; i < Zones.hubBlips.length; i++) {
        var blip = Zones.hubBlips[i];
        var blipId = (blip && typeof blip === "object" && blip.id !== undefined) ? blip.id : blip;
        if (typeof blipId === "number") {
            Zones.removeNativeBlip(blipId);
        } else {
            safeDestroy(blipId);
        }
    }
    Zones.hubBlips = [];
    Zones.clearProps();
    Zones.clearMarkers();
};

// Pattern 16: Capability diagnostics
Zones.runCapabilityDiagnostics = function() {
    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    
    // Pattern 22: Emit diagnostics via jobs.clientDiag
    var diagResults = [];
    
    // Test gta.createBlip (Pattern 17)
    if (globalEnv.gta && typeof globalEnv.gta.createBlip === "function") {
        diagResults.push("gta.createBlip: available");
    } else {
        diagResults.push("gta.createBlip: missing");
    }
    
    // Test gta.createMarker (Pattern 17)
    if (globalEnv.gta && typeof globalEnv.gta.createMarker === "function") {
        diagResults.push("gta.createMarker: available");
    } else {
        diagResults.push("gta.createMarker: missing");
    }
    
    // Test native blip functions (Pattern 21)
    var nativeSources = [
        globalEnv.natives,
        globalEnv.Native,
        globalEnv.gta && globalEnv.gta.natives,
        globalEnv.game && globalEnv.game.natives,
        globalEnv.world && globalEnv.world.natives
    ];
    
    var nativeBlipFound = false;
    for (var i = 0; i < nativeSources.length; i++) {
        var natives = nativeSources[i];
        if (natives && typeof natives.addBlipForCoord === "function") {
            nativeBlipFound = true;
            diagResults.push("natives.addBlipForCoord: available");
            break;
        }
    }
    
    if (!nativeBlipFound) {
        diagResults.push("natives.addBlipForCoord: missing");
    }
    
    // Send diagnostics to server (Pattern 22)
    if (typeof sendServer === "function") {
        for (var j = 0; j < diagResults.length; j++) {
            sendServer("jobs.clientDiag", diagResults[j]);
        }
    }
    
    return {
        working: (globalEnv.gta && typeof globalEnv.gta.createBlip === "function") || nativeBlipFound,
        method: (globalEnv.gta && typeof globalEnv.gta.createBlip === "function") ? "gta.createBlip" : (nativeBlipFound ? "natives.addBlipForCoord" : "none"),
        error: (!globalEnv.gta || typeof globalEnv.gta.createBlip !== "function") && !nativeBlipFound ? "all blip APIs missing" : null
    };
};

// Pattern 16: Test blip capability
Zones.testBlipCapability = function() {
    return Zones.runCapabilityDiagnostics();
};

Zones.testBlipAtPlayer = function() {
    if (Zones.testBlipDone) {
        return;
    }
    Zones.testBlipDone = true;

    var diagParts = [];
    function pushDiag(text) {
        if (text && text !== "") {
            diagParts.push(text);
        }
    }
    pushDiag("starting");
    var pos = getLocalPlayerPosition();
    var x = pos[0], y = pos[1], z = pos[2];
    if (x == null || y == null || z == null) {
        pushDiag("no player position available");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Blip test: no player position available.", "warn", true);
        } else {
            try {
                if (typeof console !== "undefined" && console && typeof console.log === "function") {
                    console.log("[jobs_rp] Blip test: no player position available.");
                }
            } catch (e0) {
            }
        }
        if (diagParts.length > 0) {
            sendClientDiag("blip.test", diagParts.join(" | "));
        }
        return;
    }

    pushDiag("player position=" + [x, y, z].join(", "));
    var resolved = resolveNativeBlipApi();
    pushDiag("native api=" + ((resolved.obj && typeof resolved.obj.addBlipForCoord === "function") ? "yes" : "no"));
    if (resolved.label) {
        pushDiag("native source=" + resolved.label);
    }

    var nativeTry = tryNativeBlipForCoords([x, y, z]);
    if (nativeTry.id != null) {
        Zones.useNativeBlips = true;
        Zones.blipSystemWorking = true;
        if (typeof natives.changeBlipSprite === "function") {
            natives.changeBlipSprite(nativeTry.id, Zones.policeBlipIcon);
        }
        if (typeof natives.changeBlipNameFromAscii === "function") {
            natives.changeBlipNameFromAscii(nativeTry.id, "Native Test Blip");
        }
        if (typeof natives.setBlipAsShortRange === "function") {
            natives.setBlipAsShortRange(nativeTry.id, false);
        }
        if (typeof natives.setBlipMarkerLongDistance === "function") {
            natives.setBlipMarkerLongDistance(nativeTry.id, true);
        }

        Zones.refreshHubBlips();
        Zones.routeBlips.push(nativeTry.id);
        pushDiag("native created id=" + String(nativeTry.id) + " method=" + nativeTry.method);
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Blip test: native created.", "success", true);
        }
    } else {
        pushDiag("native failed (" + String(nativeTry.error || "unknown") + ")");
    }

    var blip = createBlipForCoords([x, y, z], "route", "Test Blip");
    if (blip) {
        Zones.routeBlips.push(blip);
        pushDiag("fallback created");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Blip test: created at your position.", "success", true);
        } else {
            try {
                if (typeof console !== "undefined" && console && typeof console.log === "function") {
                    console.log("[jobs_rp] Blip test: created at your position.");
                }
            } catch (e1) {
            }
        }
    } else {
        pushDiag("fallback failed");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt("Blip test: failed (API unavailable).", "warn", true);
        } else {
            try {
                if (typeof console !== "undefined" && console && typeof console.log === "function") {
                    console.log("[jobs_rp] Blip test: failed (API unavailable).");
                }
            } catch (e2) {
            }
        }
    }

    if (diagParts.length > 0) {
        sendClientDiag("blip.test", diagParts.join(" | "));
    }
};

Zones.forceTestBlipAtPlayer = function() {
    Zones.testBlipDone = false;
    Zones.testBlipAtPlayer();
};

function handleRecordedCoordsUpdate(list) {
    if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) {
        JobsRP.Config.recorded_coords = list || [];
    }
    Zones.markerStateKey = "";
    Zones.clearRoute();
    Zones.refreshHubBlips();
    Zones.refreshMarkers();
}

if (typeof addNetworkHandler === "function") {
    addNetworkHandler("jobs.recordedCoords", function(coords) {
        handleRecordedCoordsUpdate(coords);
    });
}
