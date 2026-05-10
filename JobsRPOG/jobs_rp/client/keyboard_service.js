"use strict";

// Reusable keyboard service for UI input (bindKey-only).
// Routes characters to the active UI context via callbacks.

var KeyboardService = (function() {
    var config = null; // { isActive:()=>bool, appendChar:(ch)=>void, deleteChar:()=>void, spaceChar:()=>void }
    var caps = false;
    var hubProximityActive = false;
    var eKeyBinding = null;

    function isActive() {
        try {
            return !!(config && typeof config.isActive === "function" && config.isActive());
        } catch (_) {
            return false;
        }
    }

    function setConfig(newConfig) {
        config = newConfig || null;
    }

    function setHubProximity(active) {
        if (hubProximityActive === active) {
            return;
        }
        
        hubProximityActive = active;
    }
    
    // Callout keybinds
    function setupCalloutKeybinds() {
        if (typeof bindKey !== "undefined") {
            // B key for manual callout
            try {
                bindKey(SDLK_b, KEYSTATE_DOWN, function() {
                    if (isActive()) {
                        Callouts.Manager.checkRandomCallout();
                    }
                });
                
                console.log("[KeyboardService] Callout keybinds setup (B key)");
            } catch (e) {
                console.log("[KeyboardService] Failed to setup B keybind: " + String(e));
            }
        }
    }
    
    // Initialize keybinds when service is ready
    setTimeout(setupCalloutKeybinds, 3000);
    
    // Callout UI keybinds
    function setupCalloutUIKeybinds() {
        if (typeof bindKey !== "undefined") {
            // Y key to toggle callout UI
            try {
                bindKey(SDLK_y, KEYSTATE_DOWN, function() {
                    if (isActive()) {
                        if (CalloutUI && CalloutUI.Manager) {
                            CalloutUI.Manager.show();
                        }
                    }
                });
                
                console.log("[KeyboardService] Callout UI keybind setup (Y key)");
            } catch (e) {
                console.log("[KeyboardService] Failed to setup Y keybind: " + String(e));
            }
        }
    }
    
    // Initialize UI keybinds
    setTimeout(setupCalloutUIKeybinds, 7000);
    
    // Handle E key binding dynamically
    function setHubProximity(active) {
        if (hubProximityActive === active) {
            return;
        }
        
        hubProximityActive = active;
        
        if (active) {
            // Near hub - deactivate E key for text input
            deactivateEKey();
        } else {
            // Away from hub - reactivate E key for text input
            activateEKey();
        }
    }

    function deactivateEKey() {
        try {
            if (eKeyBinding && typeof unbindKey === "function") {
                unbindKey(SDLK_e, KEYSTATE_DOWN, eKeyBinding);
                eKeyBinding = null;
            }
        } catch (_) {
        }
    }

    function activateEKey() {
        try {
            if (!eKeyBinding && typeof bindKey === "function") {
                eKeyBinding = function() { append(caps ? "E" : "e"); };
                bindKey(SDLK_e, KEYSTATE_DOWN, eKeyBinding);
            }
        } catch (_) {
        }
    }

    function isNearHub() {
        return hubProximityActive;
    }

    function append(ch) {
        try {
            if (!isActive()) { return; }
            if (config && typeof config.appendChar === "function") { config.appendChar(ch); }
        } catch (_) {
        }
    }
    function del() {
        try {
            if (!isActive()) { return; }
            if (config && typeof config.deleteChar === "function") { config.deleteChar(); }
        } catch (_) {
        }
    }
    function space() {
        try {
            if (!isActive()) { return; }
            if (config && typeof config.spaceChar === "function") { config.spaceChar(); }
        } catch (_) {
        }
    }

    try { bindKey(SDLK_CAPSLOCK, KEYSTATE_DOWN, function() { if (!isActive()) { return; } caps = !caps; }); } catch (_) { }

    // Letters a–z (excluding E which is handled dynamically)
    try { bindKey(SDLK_a, KEYSTATE_DOWN, function() { append(caps ? "A" : "a"); }); } catch (_) { }
    try { bindKey(SDLK_b, KEYSTATE_DOWN, function() { append(caps ? "B" : "b"); }); } catch (_) { }
    try { bindKey(SDLK_c, KEYSTATE_DOWN, function() { append(caps ? "C" : "c"); }); } catch (_) { }
    try { bindKey(SDLK_d, KEYSTATE_DOWN, function() { append(caps ? "D" : "d"); }); } catch (_) { }
    // E key is handled dynamically by activateEKey()
    try { bindKey(SDLK_f, KEYSTATE_DOWN, function() { append(caps ? "F" : "f"); }); } catch (_) { }
    try { bindKey(SDLK_g, KEYSTATE_DOWN, function() { append(caps ? "G" : "g"); }); } catch (_) { }
    try { bindKey(SDLK_h, KEYSTATE_DOWN, function() { append(caps ? "H" : "h"); }); } catch (_) { }
    try { bindKey(SDLK_i, KEYSTATE_DOWN, function() { append(caps ? "I" : "i"); }); } catch (_) { }
    try { bindKey(SDLK_j, KEYSTATE_DOWN, function() { append(caps ? "J" : "j"); }); } catch (_) { }
    try { bindKey(SDLK_k, KEYSTATE_DOWN, function() { append(caps ? "K" : "k"); }); } catch (_) { }
    try { bindKey(SDLK_l, KEYSTATE_DOWN, function() { append(caps ? "L" : "l"); }); } catch (_) { }
    try { bindKey(SDLK_m, KEYSTATE_DOWN, function() { append(caps ? "M" : "m"); }); } catch (_) { }
    try { bindKey(SDLK_n, KEYSTATE_DOWN, function() { append(caps ? "N" : "n"); }); } catch (_) { }
    try { bindKey(SDLK_o, KEYSTATE_DOWN, function() { append(caps ? "O" : "o"); }); } catch (_) { }
    try { bindKey(SDLK_p, KEYSTATE_DOWN, function() { append(caps ? "P" : "p"); }); } catch (_) { }
    try { bindKey(SDLK_q, KEYSTATE_DOWN, function() { append(caps ? "Q" : "q"); }); } catch (_) { }
    try { bindKey(SDLK_r, KEYSTATE_DOWN, function() { append(caps ? "R" : "r"); }); } catch (_) { }
    try { bindKey(SDLK_s, KEYSTATE_DOWN, function() { append(caps ? "S" : "s"); }); } catch (_) { }
    try { bindKey(SDLK_t, KEYSTATE_DOWN, function() { append(caps ? "T" : "t"); }); } catch (_) { }
    try { bindKey(SDLK_u, KEYSTATE_DOWN, function() { append(caps ? "U" : "u"); }); } catch (_) { }
    try { bindKey(SDLK_v, KEYSTATE_DOWN, function() { append(caps ? "V" : "v"); }); } catch (_) { }
    try { bindKey(SDLK_w, KEYSTATE_DOWN, function() { append(caps ? "W" : "w"); }); } catch (_) { }
    try { bindKey(SDLK_x, KEYSTATE_DOWN, function() { append(caps ? "X" : "x"); }); } catch (_) { }
    try { bindKey(SDLK_y, KEYSTATE_DOWN, function() { append(caps ? "Y" : "y"); }); } catch (_) { }
    try { bindKey(SDLK_z, KEYSTATE_DOWN, function() { append(caps ? "Z" : "z"); }); } catch (_) { }

    // Numbers 0–9
    try { bindKey(SDLK_0, KEYSTATE_DOWN, function() { append("0"); }); } catch (_) { }
    try { bindKey(SDLK_1, KEYSTATE_DOWN, function() { append("1"); }); } catch (_) { }
    try { bindKey(SDLK_2, KEYSTATE_DOWN, function() { append("2"); }); } catch (_) { }
    try { bindKey(SDLK_3, KEYSTATE_DOWN, function() { append("3"); }); } catch (_) { }
    try { bindKey(SDLK_4, KEYSTATE_DOWN, function() { append("4"); }); } catch (_) { }
    try { bindKey(SDLK_5, KEYSTATE_DOWN, function() { append("5"); }); } catch (_) { }
    try { bindKey(SDLK_6, KEYSTATE_DOWN, function() { append("6"); }); } catch (_) { }
    try { bindKey(SDLK_7, KEYSTATE_DOWN, function() { append("7"); }); } catch (_) { }
    try { bindKey(SDLK_8, KEYSTATE_DOWN, function() { append("8"); }); } catch (_) { }
    try { bindKey(SDLK_9, KEYSTATE_DOWN, function() { append("9"); }); } catch (_) { }

    // Delete, space, specials
    try { bindKey(SDLK_BACKSPACE, KEYSTATE_DOWN, function() { del(); }); } catch (_) { }
    try { bindKey(SDLK_SPACE, KEYSTATE_DOWN, function() { space(); }); } catch (_) { }
    try { bindKey(SDLK_PERIOD, KEYSTATE_DOWN, function() { append("."); }); } catch (_) { }
    try { bindKey(SDLK_MINUS, KEYSTATE_DOWN, function() { append("-"); }); } catch (_) { }
    try { bindKey(SDLK_KP_MINUS, KEYSTATE_DOWN, function() { append("-"); }); } catch (_) { }
    try { bindKey(SDLK_AT, KEYSTATE_DOWN, function() { append("@"); }); } catch (_) { }
    try { bindKey(SDLK_UNDERSCORE, KEYSTATE_DOWN, function() { append("_"); }); } catch (_) { }

    // Temporary shortcuts
    try { bindKey(SDLK_F8, KEYSTATE_DOWN, function() { append("@"); }); } catch (_) { }
    try { bindKey(SDLK_F9, KEYSTATE_DOWN, function() { append("_"); }); } catch (_) { }

    return {
        setConfig: setConfig,
        isActive: isActive,
        setHubProximity: setHubProximity,
        isNearHub: isNearHub,
        activateEKey: activateEKey,
        deactivateEKey: deactivateEKey
    };
})();

try {
    if (typeof globalThis !== "undefined") {
        globalThis.KeyboardService = KeyboardService;
    }
} catch (_) {
}
