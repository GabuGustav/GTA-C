"use strict";

var Freeroam = Freeroam || {};
Freeroam.Controls = Freeroam.Controls || {};

var Controls = Freeroam.Controls;

Controls.chatEnabled = Controls.chatEnabled !== false;
Controls.hudEnabled = Controls.hudEnabled !== false;
Controls.keyDownEventName = "";
Controls.drawEventName = "";
Controls.overlay = Controls.overlay || {
    activeUntil: 0,
    title: "",
    lines: []
};

function outputChat(text, r, g, b) {
    var messageText = String(text || "");
    if (messageText === "") {
        return false;
    }
    if (typeof outputChatBox === "function") {
        try {
            outputChatBox(messageText, r || 255, g || 255, b || 255);
            return true;
        } catch (e1) {
            try {
                outputChatBox(messageText);
                return true;
            } catch (e2) {
            }
        }
    }
    try {
        if (typeof message === "function") {
            message(messageText);
            return true;
        }
    } catch (e3) {
    }
    return false;
}

function nowMs() {
    if (typeof Date !== "undefined" && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
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
    if (width <= 0) {
        width = 1280;
    }
    if (height <= 0) {
        height = 720;
    }
    return { width: width, height: height };
}

function drawRectNorm(cx, cy, w, h, r, g, b, a) {
    try {
        if (natives && natives.drawRect && typeof Vec2 !== "undefined") {
            natives.drawRect(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return true;
        }
    } catch (e1) {
    }
    try {
        if (gta && gta.drawRectangle) {
            gta.drawRectangle(cx, cy, w, h, r, g, b, a);
            return true;
        }
    } catch (e2) {
    }
    try {
        if (gta && gta.drawRectangle && typeof Vec2 !== "undefined") {
            gta.drawRectangle(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return true;
        }
    } catch (e3) {
    }
    return false;
}

function drawTextNative(text, x, y, r, g, b, a) {
    if (!(natives && natives.displayTextWithLiteralString) || typeof Vec2 === "undefined") {
        return false;
    }
    try {
        if (natives.setTextScale) {
            natives.setTextScale(0.30, 0.30);
        }
        if (natives.setTextFont) {
            natives.setTextFont(0);
        }
        if (natives.setTextColour) {
            natives.setTextColour(r, g, b, a);
        }
        if (natives.setTextCentre) {
            natives.setTextCentre(false);
        }
        if (natives.setTextProportional) {
            natives.setTextProportional(true);
        }
        if (natives.setTextDropshadow) {
            natives.setTextDropshadow(false, 0, 0, 0, 255);
        }
    } catch (e1) {
    }
    try {
        natives.displayTextWithLiteralString(new Vec2(x, y), "STRING", String(text || ""));
        return true;
    } catch (e2) {
    }
    return false;
}

function showOverlay(title, list) {
    var lines = [];
    if (list && list.length) {
        for (var i = 0; i < list.length; i++) {
            lines.push(String(i + 1) + ". " + String(list[i]));
        }
    } else {
        lines.push("(no rules configured)");
    }
    Controls.overlay.title = String(title || "");
    Controls.overlay.lines = lines;
    Controls.overlay.activeUntil = nowMs() + 8000;
}

function toggleOverlay(title, list) {
    var now = nowMs();
    if (Controls.overlay.activeUntil > now && Controls.overlay.title === String(title || "")) {
        Controls.overlay.activeUntil = 0;
        return;
    }
    showOverlay(title, list);
}

function drawOverlay() {
    var now = nowMs();
    if (Controls.overlay.activeUntil <= now) {
        return;
    }

    var screen = getScreenSize();
    var scale = Math.min(screen.width / 1280, screen.height / 720);
    var padding = 0.018 * scale;
    var lineHeight = 0.028 * scale;
    var titleHeight = 0.03 * scale;
    var boxWidth = 0.48 * scale;
    var lines = Controls.overlay.lines || [];
    var totalHeight = titleHeight + (lines.length * lineHeight) + padding * 2;

    var cx = 0.5;
    var cy = 0.25;
    drawRectNorm(cx, cy, boxWidth, totalHeight, 0, 0, 0, 190);
    drawRectNorm(cx, cy - (totalHeight / 2) + (titleHeight / 2) + padding * 0.2, boxWidth, titleHeight, 255, 180, 0, 220);

    var startX = cx - (boxWidth / 2) + padding;
    var titleY = cy - (totalHeight / 2) + padding * 0.2;
    drawTextNative(Controls.overlay.title, startX, titleY, 0, 0, 0, 255);

    var baseY = titleY + titleHeight * 0.9;
    for (var i = 0; i < lines.length; i++) {
        drawTextNative(lines[i], startX, baseY + (i * lineHeight), 255, 255, 255, 255);
    }
}

function keyCode(name, fallback) {
    try {
        if (typeof globalThis !== "undefined" && typeof globalThis[name] !== "undefined") {
            return globalThis[name];
        }
    } catch (e) {
    }
    return fallback;
}

function matchesKey(key, name, fallback, altFallback) {
    var code = keyCode(name, fallback);
    if (typeof key === "number") {
        return key === code || key === fallback || (altFallback !== undefined && key === altFallback);
    }
    if (typeof key === "string") {
        return key.toLowerCase() === String(name || "").toLowerCase();
    }
    return false;
}

function handleKeyDown(evArg, keyArg) {
    var key = keyArg;
    try {
        if ((key === undefined || key === null) && typeof keyEvent !== "undefined" && keyEvent && typeof keyEvent.keyCode === "function") {
            key = keyEvent.keyCode(evArg);
        }
    } catch (e0) {
    }

    if (matchesKey(key, "SDLK_F5", 286, 1073741886) || matchesKey(key, "F5", 286, 1073741886)) {
        setHudEnabled(!Controls.hudEnabled);
    } else if (matchesKey(key, "SDLK_F8", 289, 1073741889) || matchesKey(key, "F8", 289, 1073741889)) {
        setChatEnabled(!Controls.chatEnabled);
    } else if (matchesKey(key, "SDLK_F9", 290, 1073741890) || matchesKey(key, "F9", 290, 1073741890)) {
        toggleOverlay("Rules", Freeroam.Config.rules || []);
    } else if (matchesKey(key, "SDLK_F10", 291, 1073741891) || matchesKey(key, "F10", 291, 1073741891)) {
        toggleOverlay("Gamemode Rules", Freeroam.Config.gamemode_rules || []);
    } else {
        return;
    }

    try {
        if (typeof keyEvent !== "undefined" && keyEvent && typeof keyEvent.preventDefault === "function") {
            keyEvent.preventDefault(evArg);
        }
    } catch (e1) {
    }
}

function attachFirstHandler(candidates, callback) {
    if (typeof addEventHandler !== "function" || !candidates || candidates.length === 0) {
        return "";
    }

    for (var i = 0; i < candidates.length; i++) {
        var eventName = String(candidates[i] || "");
        if (eventName === "") {
            continue;
        }

        try {
            var result = addEventHandler(eventName, callback);
            if (result !== false) {
                return eventName;
            }
        } catch (e) {
        }
    }

    return "";
}

function setChatEnabled(next) {
    Controls.chatEnabled = (next === true);
    try {
        if (typeof setChatWindowEnabled === "function") {
            setChatWindowEnabled(Controls.chatEnabled);
        } else if (typeof chatWindowEnabled === "function") {
            chatWindowEnabled(Controls.chatEnabled);
        } else if (typeof chatWindowEnabled !== "undefined") {
            chatWindowEnabled = Controls.chatEnabled;
        }
    } catch (e1) {
    }
}

function setHudEnabled(next) {
    Controls.hudEnabled = (next === true);
    try {
        if (natives && natives.displayHud) {
            natives.displayHud(Controls.hudEnabled);
        }
    } catch (e1) {
    }
    try {
        if (natives && natives.displayRadar) {
            natives.displayRadar(Controls.hudEnabled);
        }
    } catch (e2) {
    }
}

function bindToggleKeys() {
    if (typeof bindKey !== "function") {
        return false;
    }

    var success = false;
    var binds = [
        { key: "F5", code: 286, handler: function() { setHudEnabled(!Controls.hudEnabled); } },
        { key: "SDLK_F5", code: 286, handler: function() { setHudEnabled(!Controls.hudEnabled); } },
        { key: "F8", code: 289, handler: function() { setChatEnabled(!Controls.chatEnabled); } },
        { key: "SDLK_F8", code: 289, handler: function() { setChatEnabled(!Controls.chatEnabled); } },
        { key: "F9", code: 290, handler: function() { showRules("Rules", Freeroam.Config.rules || []); } },
        { key: "SDLK_F9", code: 290, handler: function() { showRules("Rules", Freeroam.Config.rules || []); } },
        { key: "F10", code: 291, handler: function() { showRules("Gamemode", Freeroam.Config.gamemode_rules || []); } },
        { key: "SDLK_F10", code: 291, handler: function() { showRules("Gamemode", Freeroam.Config.gamemode_rules || []); } }
    ];

    for (var i = 0; i < binds.length; i++) {
        var item = binds[i];
        try {
            bindKey(item.key, "down", item.handler);
            success = true;
        } catch (e1) {
            try {
                bindKey(item.code, "down", item.handler);
                success = true;
            } catch (e2) {
            }
        }
    }

    return success;
}

addEventHandler("OnResourceStart", function(ev, res) {
    if (typeof thisResource !== "undefined" && res !== thisResource) {
        return;
    }
    bindToggleKeys();
    Controls.keyDownEventName = attachFirstHandler(["OnKeyDown", "onKeyDown"], handleKeyDown);
    Controls.drawEventName = attachFirstHandler(["OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", "OnRender", "onRender"], drawOverlay);
});
