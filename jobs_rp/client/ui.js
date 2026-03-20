"use strict";

var JobsClient = JobsClient || {};
JobsClient.UI = JobsClient.UI || {};

var UI = JobsClient.UI;

UI.lastPromptMessage = UI.lastPromptMessage || "";
UI.lastPromptAt = UI.lastPromptAt || 0;
UI.promptCooldownMs = 1000;
UI.hud = UI.hud || {
    active: false,
    drawEventName: "",
    useJobsUi: false,
    uiReady: false,
    uiWindow: null,
    uiControls: null,
    cash: 0,
    cashKnown: false,
    currentJobId: null,
    policeGrade: 0,
    xpGainAt: 0,
    xpFromPct: 0,
    xpToPct: 0,
    xpJobId: null
};

function nowMs() {
    var clock = 0;
    if (typeof Date !== "undefined" && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
}

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

function safeChat(message, r, g, b) {
    var text = String(message || "");
    if (text === "") {
        return;
    }

    var sent = false;

    if (typeof outputChatBox === "function") {
        try {
            outputChatBox(text, r || 255, g || 255, b || 255);
            sent = true;
        } catch (e1) {
            try {
                outputChatBox(text);
                sent = true;
            } catch (e2) {
            }
        }
    }

    if (!sent && typeof _G !== "undefined" && _G && typeof _G.message === "function") {
        try {
            _G.message(text, COLOUR_WHITE);
            sent = true;
        } catch (e3) {
        }
    }

    if (!sent) {
        try {
            if (typeof console !== "undefined" && console && typeof console.log === "function") {
                console.log("[jobs_rp] " + text);
                return;
            }
        } catch (e4) {
        }
    }
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
        width = gta.width || 1280;
    }
    if (height <= 0) {
        height = gta.height || 720;
    }

    return {
        width: width,
        height: height
    };
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

function detachHandler(eventName, callback) {
    var name = String(eventName || "");
    if (name === "" || typeof removeEventHandler !== "function") {
        return;
    }

    try {
        removeEventHandler(name, callback);
    } catch (e) {
    }
}

function drawRectNorm(cx, cy, w, h, r, g, b, a) {
    try {
        if (natives && natives.drawRect && typeof Vec2 !== "undefined") {
            natives.drawRect(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return;
        }
    } catch (e0) {
    }
    try {
        if (gta && gta.drawRectangle) {
            gta.drawRectangle(cx, cy, w, h, r, g, b, a);
            return;
        }
    } catch (e1) {
    }

    try {
        if (gta && gta.drawRectangle && typeof Vec2 !== "undefined") {
            gta.drawRectangle(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return;
        }
    } catch (e2) {
    }
}

function drawTextSimple(text, x, y, colourHex) {
    if (!(gta && gta.drawText) || typeof Vec2 === "undefined") {
        return false;
    }

    var fontValue = 0;
    try {
        if (typeof GTAFont !== "undefined" && GTAFont && typeof GTAFont.BANK !== "undefined") {
            fontValue = GTAFont.BANK;
        }
    } catch (eFont) {
    }

    var alignValue = 0;
    try {
        if (typeof GTATextAlignment !== "undefined" && GTATextAlignment && typeof GTATextAlignment.LEFT !== "undefined") {
            alignValue = GTATextAlignment.LEFT;
        }
    } catch (eAlign) {
    }

    var shadowValue = 0;
    try {
        if (typeof GTAShadow !== "undefined" && GTAShadow && typeof GTAShadow.DROP !== "undefined") {
            shadowValue = GTAShadow.DROP;
        }
    } catch (eShadow) {
    }

    try {
        var result = gta.drawText(
            String(text || ""),
            new Vec2(x, y),
            new Vec2(1024.0, 24.0),
            1.0,
            fontValue,
            alignValue,
            1.0,
            colourHex,
            colourHex,
            false,
            shadowValue
        );
        return result !== false;
    } catch (e) {
        return false;
    }
}

function clamp01(value) {
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function calcXpPercent(xp, thresholds) {
    if (!thresholds || thresholds.length === 0) {
        return 0;
    }
    var nextIndex = thresholds.length - 1;
    for (var i = 0; i < thresholds.length; i++) {
        if (xp < thresholds[i]) {
            nextIndex = i;
            break;
        }
    }
    if (nextIndex <= 0) {
        var nextValue = thresholds[0];
        if (nextValue <= 0) {
            return 0;
        }
        return clamp01(xp / nextValue);
    }
    var prevValue = thresholds[nextIndex - 1];
    var nextValue2 = thresholds[nextIndex];
    if (nextValue2 <= prevValue) {
        return 1;
    }
    return clamp01((xp - prevValue) / (nextValue2 - prevValue));
}

function getPoliceRankName(grade) {
    var cfg = JobsRP && JobsRP.Config ? JobsRP.Config : {};
    var names = cfg.police_rank_names || [
        "Recruit",
        "Officer",
        "Senior Officer",
        "Sergeant",
        "Lieutenant",
        "Captain"
    ];
    var idx = Math.max(0, Math.min(names.length - 1, Number(grade) || 0));
    return names[idx] || "";
}

function initHudUi() {
    if (UI.hud.uiReady) {
        return true;
    }

    var ui = getJobsRpUi();
    if (!ui || typeof ui.window !== "function") {
        return false;
    }
    if (typeof toColour !== "function") {
        return false;
    }

    var windowStyles = {
        main: {
            backgroundColour: toColour(0, 0, 0, 0),
            textColour: toColour(255, 255, 255, 255)
        },
        title: {
            backgroundColour: toColour(0, 0, 0, 0),
            textColour: toColour(255, 255, 255, 255)
        },
        icon: {
            backgroundColour: toColour(0, 0, 0, 0),
            textColour: toColour(255, 255, 255, 255)
        }
    };

    var rectStyles = {
        main: {
            backgroundColour: toColour(0, 0, 0, 160)
        }
    };

    var fillStyles = {
        main: {
            backgroundColour: toColour(60, 200, 120, 220)
        }
    };

    var xpFillStyles = {
        main: {
            backgroundColour: toColour(80, 160, 255, 220)
        }
    };

    var textStyles = {
        main: {
            textColour: toColour(255, 255, 255, 255),
            textIndent: 2
        }
    };

    var rankTextStyles = {
        main: {
            textColour: toColour(255, 224, 128, 255),
            textIndent: 0
        }
    };

    var window = ui.window(0, 0, 1280, 720, "", windowStyles);
    window.titleBarShown = false;
    window.titleBarIconShown = false;
    window.shown = false;

    var cashBox = window.rectangle(0, 0, 10, 10, rectStyles);
    var cashFill = window.rectangle(0, 0, 10, 10, fillStyles);
    var cashText = window.text(0, 0, 10, 10, "", textStyles);

    var rankText = window.text(0, 0, 10, 10, "", rankTextStyles);
    var pipRects = [];
    for (var i = 0; i < 6; i++) {
        pipRects.push(window.rectangle(0, 0, 10, 10, rectStyles));
    }

    var xpBarBg = window.rectangle(0, 0, 10, 10, rectStyles);
    var xpBarFill = window.rectangle(0, 0, 10, 10, xpFillStyles);

    UI.hud.uiWindow = window;
    UI.hud.uiControls = {
        cashBox: cashBox,
        cashFill: cashFill,
        cashText: cashText,
        rankText: rankText,
        pipRects: pipRects,
        xpBarBg: xpBarBg,
        xpBarFill: xpBarFill
    };
    UI.hud.uiReady = true;
    UI.hud.useJobsUi = true;
    return true;
}

function updateHudUi() {
    if (!UI.hud.uiReady || !UI.hud.uiControls || !UI.hud.uiWindow) {
        return;
    }

    var ui = getJobsRpUi();
    if (!ui) {
        return;
    }

    var screen = getScreenSize();
    var scale = Math.min(screen.width / 1280, screen.height / 720);
    var cfg = JobsRP && JobsRP.Config ? JobsRP.Config : {};
    var cashEnabled = cfg.hud_cash_enabled !== false;
    var nativeCash = cfg.hud_use_native_cash === true;
    var now = nowMs();

    UI.hud.uiWindow.position = new Vec2(0, 0);
    UI.hud.uiWindow.size = new Vec2(screen.width, screen.height);

    var rightPx = screen.width * 0.95;
    var topPx = screen.height * 0.06;

    var cashBox = UI.hud.uiControls.cashBox;
    var cashFill = UI.hud.uiControls.cashFill;
    var cashText = UI.hud.uiControls.cashText;

    if (cashEnabled && !nativeCash) {
        var cashBoxW = 230 * scale;
        var cashBoxH = 28 * scale;
        var cashX = rightPx - cashBoxW;
        var cashY = topPx;

        cashBox.shown = true;
        cashBox.position = new Vec2(cashX, cashY);
        cashBox.size = new Vec2(cashBoxW, cashBoxH);

        var cap = (cfg.payout_cap_amount || 1500);
        var ratio = cap > 0 ? Math.min((UI.hud.cash || 0) / cap, 1) : 0;
        cashFill.shown = true;
        cashFill.position = new Vec2(cashX + 2, cashY + cashBoxH * 0.2);
        cashFill.size = new Vec2((cashBoxW - 4) * ratio, cashBoxH * 0.6);

        cashText.shown = true;
        cashText.position = new Vec2(cashX + 6, cashY + 2);
        cashText.size = new Vec2(cashBoxW - 12, cashBoxH);
        cashText.text = "$" + String(Math.floor(UI.hud.cash || 0));
    } else {
        cashBox.shown = false;
        cashFill.shown = false;
        cashText.shown = false;
    }

    var rankText = UI.hud.uiControls.rankText;
    var pipRects = UI.hud.uiControls.pipRects;
    if (UI.hud.currentJobId === "police") {
        var pipCount = pipRects.length;
        var grade = Math.max(0, Math.min(pipCount - 1, Number(UI.hud.policeGrade) || 0));
        var pipW = 18 * scale;
        var pipH = 12 * scale;
        var gap = 4 * scale;
        var totalW = (pipW * pipCount) + (gap * (pipCount - 1));
        var baseX = rightPx - totalW;
        var baseY = topPx + (30 * scale);
        for (var p = 0; p < pipCount; p++) {
            var filled = p <= grade;
            var color = filled ? toColour(255, 215, 80, 220) : toColour(40, 40, 40, 160);
            pipRects[p].shown = true;
            pipRects[p].position = new Vec2(baseX + p * (pipW + gap), baseY);
            pipRects[p].size = new Vec2(pipW, pipH);
            pipRects[p].styles.main.backgroundColour = color;
        }
        var rankName = getPoliceRankName(grade);
        rankText.shown = true;
        rankText.position = new Vec2(baseX, baseY + pipH + (4 * scale));
        rankText.size = new Vec2(totalW, 18 * scale);
        rankText.text = rankName;
    } else {
        for (var i = 0; i < pipRects.length; i++) {
            pipRects[i].shown = false;
        }
        rankText.shown = false;
    }

    var xpBarBg = UI.hud.uiControls.xpBarBg;
    var xpBarFill = UI.hud.uiControls.xpBarFill;

    var duration = cfg.hud_xp_bar_duration_ms || 2500;
    var fade = cfg.hud_xp_bar_fade_ms || 600;
    var elapsed = now - UI.hud.xpGainAt;
    if (UI.hud.xpGainAt > 0 && elapsed >= 0 && elapsed <= (duration + fade)) {
        var barW = 300 * scale;
        var barH = 18 * scale;
        var barX = rightPx - barW;
        var barY = topPx + (60 * scale);
        var t = clamp01(elapsed / duration);
        var fillPct = lerp(UI.hud.xpFromPct, UI.hud.xpToPct, t);
        var alpha = 220;
        if (elapsed > duration) {
            var fadeT = clamp01((elapsed - duration) / fade);
            alpha = Math.floor(220 * (1 - fadeT));
        }
        xpBarBg.shown = true;
        xpBarBg.position = new Vec2(barX, barY);
        xpBarBg.size = new Vec2(barW, barH);
        xpBarBg.styles.main.backgroundColour = toColour(0, 0, 0, Math.floor(alpha * 0.7));

        xpBarFill.shown = true;
        xpBarFill.position = new Vec2(barX + 2, barY + barH * 0.2);
        xpBarFill.size = new Vec2((barW - 4) * fillPct, barH * 0.6);
        xpBarFill.styles.main.backgroundColour = toColour(80, 160, 255, alpha);
    } else {
        xpBarBg.shown = false;
        xpBarFill.shown = false;
    }
}

function drawHud() {
    if (!UI.hud.active) {
        return;
    }

    if (UI.hud.useJobsUi) {
        updateHudUi();
        return;
    }

    var screen = getScreenSize();
    var scale = Math.min(screen.width / 1280, screen.height / 720);

    var cfg = JobsRP && JobsRP.Config ? JobsRP.Config : {};
    var cashEnabled = cfg.hud_cash_enabled !== false;
    var nativeCash = cfg.hud_use_native_cash === true;
    var now = nowMs();

    var right = 0.95;
    var top = 0.06;

    if (cashEnabled && nativeCash) {
        try {
            if (localPlayer && typeof localPlayer.displayedMoney !== "undefined") {
                var nextCash = UI.hud.cash || 0;
                if (localPlayer.displayedMoney !== nextCash) {
                    if (typeof natives !== "undefined" && natives && natives.displayMoney) {
                        natives.displayMoney(nextCash);
                    }
                    localPlayer.displayedMoney = nextCash;
                } else if (localPlayer.money !== undefined) {
                    localPlayer.money = nextCash;
                }
            }
        } catch (eMoney) {
        }
    }

    if (cashEnabled && !nativeCash) {
        var cashBoxW = 0.18 * scale;
        var cashBoxH = 0.028 * scale;
        var cashCx = right - (cashBoxW / 2);
        var cashCy = top;

        drawRectNorm(cashCx, cashCy, cashBoxW, cashBoxH, 0, 0, 0, 160);
        var cap = (cfg.payout_cap_amount || 1500);
        var ratio = cap > 0 ? Math.min((UI.hud.cash || 0) / cap, 1) : 0;
        drawRectNorm(cashCx - (cashBoxW / 2) + (cashBoxW * ratio / 2), cashCy, cashBoxW * ratio, cashBoxH * 0.6, 60, 200, 120, 220);
        var cashTextX = cashCx - (cashBoxW / 2) + 0.005 * scale;
        var cashTextY = cashCy - 0.004 * scale;
        drawTextSimple("$" + String(Math.floor(UI.hud.cash || 0)), cashTextX, cashTextY, 0xFFFFFFFF);
    }

    if (UI.hud.currentJobId === "police") {
        var pipCount = 6;
        var grade = Math.max(0, Math.min(pipCount - 1, Number(UI.hud.policeGrade) || 0));
        var pipW = 0.018 * scale;
        var pipH = 0.012 * scale;
        var gap = 0.004 * scale;
        var totalW = (pipW * pipCount) + (gap * (pipCount - 1));
        var baseCx = right - (totalW / 2);
        var baseCy = top + 0.03 * scale;
        for (var p = 0; p < pipCount; p++) {
            var px = baseCx - (totalW / 2) + (pipW / 2) + p * (pipW + gap);
            var filled = p <= grade;
            var color = filled ? [255, 215, 80, 220] : [40, 40, 40, 160];
            drawRectNorm(px, baseCy, pipW, pipH, color[0], color[1], color[2], color[3]);
        }
        var rankName = getPoliceRankName(grade);
        if (rankName !== "") {
            var rankTextX = baseCx - (totalW / 2);
            var rankTextY = baseCy + (pipH * 0.8);
            drawTextSimple(rankName, rankTextX, rankTextY, 0xFFFFE080);
        }
    }

    var duration = cfg.hud_xp_bar_duration_ms || 2500;
    var fade = cfg.hud_xp_bar_fade_ms || 600;
    var elapsed = now - UI.hud.xpGainAt;
    if (UI.hud.xpGainAt > 0 && elapsed >= 0 && elapsed <= (duration + fade)) {
        var barW = 0.30 * scale;
        var barH = 0.018 * scale;
        var barCx = right - (barW / 2);
        var barCy = top + 0.06 * scale;
        var t = clamp01(elapsed / duration);
        var fillPct = lerp(UI.hud.xpFromPct, UI.hud.xpToPct, t);
        var alpha = 220;
        if (elapsed > duration) {
            var fadeT = clamp01((elapsed - duration) / fade);
            alpha = Math.floor(220 * (1 - fadeT));
        }
        drawRectNorm(barCx, barCy, barW, barH, 0, 0, 0, Math.floor(alpha * 0.7));
        drawRectNorm(barCx - (barW / 2) + (barW * fillPct / 2), barCy, barW * fillPct, barH * 0.6, 80, 160, 255, alpha);
    }
}

function onHudDraw() {
    try {
        drawHud();
    } catch (e) {
    }
}

UI.startHud = function() {
    if (UI.hud.active) {
        return;
    }
    UI.hud.active = true;
    initHudUi();
    if (UI.hud.uiWindow) {
        UI.hud.uiWindow.shown = true;
    }
    UI.hud.drawEventName = attachFirstHandler(
        ["OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", "OnRender", "onRender"],
        onHudDraw
    );
    if (UI.hud.drawEventName === "") {
        try {
            if (typeof console !== "undefined" && console && typeof console.log === "function") {
                console.log("[jobs_rp] HUD draw hook unavailable.");
            }
        } catch (e) {
        }
    }
};

UI.stopHud = function() {
    if (!UI.hud.active) {
        return;
    }
    detachHandler(UI.hud.drawEventName, onHudDraw);
    UI.hud.drawEventName = "";
    if (UI.hud.uiWindow) {
        UI.hud.uiWindow.shown = false;
    }
    UI.hud.active = false;
};


UI.showPrompt = function(message, level, force) {
    var msg = String(message || "");
    if (msg === "") {
        return;
    }

    var ts = nowMs();
    if (!force) {
        if (msg === UI.lastPromptMessage && (ts - UI.lastPromptAt) < UI.promptCooldownMs) {
            return;
        }
    }

    UI.lastPromptMessage = msg;
    UI.lastPromptAt = ts;

    var colors = {
        info: [140, 200, 255],
        warn: [255, 215, 120],
        error: [255, 120, 120],
        success: [140, 255, 140]
    };
    var rgb = colors[level || "info"] || colors.info;
    safeChat("[Jobs] " + msg, rgb[0], rgb[1], rgb[2]);
};

UI.showWallet = function(cash, delta, reason) {
    UI.hud.cash = Number(cash || 0) || 0;
    UI.hud.cashKnown = true;
    var amount = Math.round(Number(delta || 0));
    var signed = amount >= 0 ? ("+" + String(amount)) : String(amount);
    var text = "Wallet: $" + String(cash || 0) + " (" + signed + ")";
    if (reason && reason !== "") {
        text = text + " [" + String(reason) + "]";
    }
    safeChat("[Jobs] " + text, 140, 255, 140);
};

UI.setProfile = function(profile) {
    if (!profile || typeof profile !== "object") {
        return;
    }
    if (profile.cash !== undefined) {
        UI.hud.cash = Number(profile.cash || 0) || 0;
        UI.hud.cashKnown = true;
    }
    UI.hud.currentJobId = profile.currentJobId || null;
    if (profile.jobs && profile.jobs.police) {
        UI.hud.policeGrade = Number(profile.jobs.police.grade || 0) || 0;
    }
};

UI.handleJobReward = function(jobId, xpGain, xpTotal, gradeBefore, gradeAfter, payoutGranted) {
    var cfg = JobsRP && JobsRP.Config ? JobsRP.Config : {};
    var thresholds = cfg.grade_thresholds || [];
    var now = nowMs();

    var gain = Number(xpGain || 0) || 0;
    var total = Number(xpTotal || 0) || 0;
    var beforeTotal = total - gain;
    if (beforeTotal < 0) {
        beforeTotal = 0;
    }

    UI.hud.xpFromPct = calcXpPercent(beforeTotal, thresholds);
    UI.hud.xpToPct = calcXpPercent(total, thresholds);
    UI.hud.xpGainAt = now;
    UI.hud.xpJobId = jobId || null;

    if (jobId === "police") {
        UI.hud.policeGrade = Number(gradeAfter || 0) || 0;
    }
};
