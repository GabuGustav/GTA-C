"use strict";

var JobsAuthUI = {
    started: false,
    visible: false,
    useMexui: false,
    mexuiReady: false,
    mexuiWindow: null,
    mexuiControls: null,
    mode: "register",
    lastMode: "register",
    activeField: "account",
    accountInput: "",
    tokenInput: "",
    statusMessage: "",
    statusLevel: "info",
    pendingToken: "",
    waitingTokenAck: false,
    authState: {
        authenticated: false,
        authRequired: false,
        accountId: "",
        lockRemainingSec: 0,
        lastMessage: ""
    },
    font: null,
    fontTried: false,
    cursorBlink: true,
    blinkTimer: null,
    lastDiagAtMs: 0,
    lastDiagLine: "",
    receivedAuthState: false,
    sentFirstDrawDiag: false,
    warnedTextFail: false,
    warnedRenderException: false,
    lastRenderError: "",
    textRenderer: "",
    lastInjectedChar: "",
    lastInjectedAtMs: 0,
    lastTabAtMs: 0,
    lastShiftToggleAtMs: 0,
    cursorX: 0,
    cursorY: 0,
    toggleButton: null,
    forgotButton: null,
    drawEventName: "",
    keyDownEventName: "",
    keyUpEventName: "",
    charEventName: "",
    cursorDownEventName: "",
    cursorMoveEventName: ""
};

var Hex = {
    White: 0xFFFFFFFF,
    Black: 0xFF000000,
    Red: 0xFFFF5555,
    Green: 0xFF00FF88,
    Yellow: 0xFFFFFF55,
    Gold: 0xFFFFB400,
    Grey: 0xFFDCDCDC,
    BlueDark: 0xFF0078C8,
    BlueLight: 0xFF4A90E2,
    Purple: 0xFF9B59B6,
    Orange: 0xFFFF8C42,
    Teal: 0xFF1ABC9C,
    DarkGrey: 0xFF2C3E50,
    LightGrey: 0xFFECF0F1,
    Shadow: 0x88000000,
    Border: 0xFF34495E,
    Background: 0xFF1A1A2E,
    Panel: 0xFF16213E,
    Input: 0xFF0F3460,
    Button: 0xFFE94560,
    ButtonHover: 0xFFFF6B6B,
    Success: 0xFF00D68F,
    Warning: 0xFFF39C12,
    Error: 0xFFE74C3C
};

var AuthKeyboardService = {
    active: false,
    shiftDown: false,
    bindings: [],
    charBindings: 0,
    specialBindings: 0
};

var KeyCharPairs = {
    "0": ["0", ")"],
    "1": ["1", "!"],
    "2": ["2", "@"],
    "3": ["3", "#"],
    "4": ["4", "$"],
    "5": ["5", "%"],
    "6": ["6", "^"],
    "7": ["7", "&"],
    "8": ["8", "*"],
    "9": ["9", "("],
    "minus": ["-", "_"],
    "equals": ["=", "+"],
    "leftbracket": ["[", "{"],
    "rightbracket": ["]", "}"],
    "backslash": ["\\", "|"],
    "semicolon": [";", ":"],
    "apostrophe": ["'", "\""],
    "comma": [",", "<"],
    "period": [".", ">"],
    "slash": ["/", "?"],
    "grave": ["`", "~"]
};

function statusToColour(level) {
    if (typeof toColour !== "function") {
        return null;
    }
    if (level === "success") {
        return toColour(0, 214, 143, 255);
    }
    if (level === "warn") {
        return toColour(243, 156, 18, 255);
    }
    if (level === "error") {
        return toColour(231, 76, 60, 255);
    }
    return toColour(220, 220, 220, 255);
}

function updateMexuiStatus() {
    if (!JobsAuthUI.mexuiControls || !JobsAuthUI.mexuiControls.statusText) {
        return;
    }
    JobsAuthUI.mexuiControls.statusText.text = JobsAuthUI.statusMessage || "";
    var colour = statusToColour(JobsAuthUI.statusLevel);
    if (colour && JobsAuthUI.mexuiControls.statusText.styles && JobsAuthUI.mexuiControls.statusText.styles.main) {
        JobsAuthUI.mexuiControls.statusText.styles.main.textColour = colour;
    }

    if (JobsAuthUI.mexuiControls.tokenText) {
        if (JobsAuthUI.waitingTokenAck && JobsAuthUI.pendingToken) {
            JobsAuthUI.mexuiControls.tokenText.text = "Token: " + JobsAuthUI.pendingToken;
        } else {
            JobsAuthUI.mexuiControls.tokenText.text = "";
        }
    }
}

function updateMexuiMode() {
    if (!JobsAuthUI.mexuiControls) {
        return;
    }
    var mode = JobsAuthUI.mode === "login" ? "login" : "register";
    var title = (mode === "register") ? "Register" : "Login";
    if (JobsAuthUI.mexuiControls.titleText) {
        JobsAuthUI.mexuiControls.titleText.text = title;
    }
    if (JobsAuthUI.mexuiControls.submitButton) {
        JobsAuthUI.mexuiControls.submitButton.text = title;
    }
    if (JobsAuthUI.mexuiControls.toggleButton) {
        JobsAuthUI.mexuiControls.toggleButton.text = (mode === "register") ? "Switch to Login" : "Switch to Register";
    }
    if (JobsAuthUI.mexuiControls.secretLabel) {
        JobsAuthUI.mexuiControls.secretLabel.text = (mode === "register") ? "Password" : "Password / Token";
    }
    if (JobsAuthUI.mexuiControls.secretInput) {
        JobsAuthUI.mexuiControls.secretInput.placeholder = (mode === "register") ? "password" : "password or token";
    }
}

function syncInputsFromMexui() {
    if (!JobsAuthUI.mexuiControls) {
        return;
    }
    var accountInput = JobsAuthUI.mexuiControls.accountInput;
    var secretInput = JobsAuthUI.mexuiControls.secretInput;
    if (accountInput && typeof accountInput.getText === "function") {
        JobsAuthUI.accountInput = String(accountInput.getText() || "");
    }
    if (secretInput && typeof secretInput.getText === "function") {
        JobsAuthUI.tokenInput = String(secretInput.getText() || "");
    }
}

function syncMexuiInputsFromState() {
    if (!JobsAuthUI.mexuiControls) {
        return;
    }
    var accountInput = JobsAuthUI.mexuiControls.accountInput;
    var secretInput = JobsAuthUI.mexuiControls.secretInput;
    if (accountInput && typeof accountInput.setText === "function") {
        accountInput.setText(JobsAuthUI.accountInput || "");
    }
    if (secretInput && typeof secretInput.setText === "function") {
        secretInput.setText(JobsAuthUI.tokenInput || "");
    }
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

function initMexuiAuthUI() {
    if (JobsAuthUI.mexuiReady) {
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
            backgroundColour: toColour(22, 30, 50, 220),
            textColour: toColour(240, 240, 240, 255)
        },
        title: {
            backgroundColour: toColour(72, 120, 196, 210),
            textColour: toColour(10, 10, 10, 255)
        },
        icon: {
            backgroundColour: toColour(233, 69, 96, 210),
            textColour: toColour(10, 10, 10, 255)
        }
    };

    var inputStyles = {
        main: {
            backgroundColour: toColour(20, 30, 55, 230),
            textColour: toColour(240, 240, 240, 255),
            borderColour: toColour(60, 80, 120, 255),
            hover: {
                backgroundColour: toColour(30, 40, 70, 230),
                textColour: toColour(255, 255, 255, 255)
            }
        },
        focused: {
            borderColour: toColour(120, 180, 255, 255)
        }
    };

    var buttonStyles = {
        main: {
            backgroundColour: toColour(233, 69, 96, 230),
            textColour: toColour(255, 255, 255, 255),
            hover: {
                backgroundColour: toColour(255, 107, 107, 240)
            }
        },
        focused: {
            borderColour: toColour(255, 255, 255, 255)
        }
    };

    var labelStyles = {
        main: {
            textColour: toColour(235, 235, 235, 255),
            textSize: 14,
            textIndent: 0
        }
    };

    var statusStyles = {
        main: {
            textColour: toColour(220, 220, 220, 255),
            textSize: 13,
            textIndent: 0
        }
    };

    var window = ui.window(0, 0, 480, 360, "Authentication", windowStyles);
    window.center();
    window.shown = false;

    var titleText = window.text(20, 50, 440, 24, "Register", labelStyles);
    var accountLabel = window.text(20, 80, 440, 18, "Account", labelStyles);
    var accountInput = window.textInput(20, 100, 440, 30, "", inputStyles);
    accountInput.placeholder = "account id";
    accountInput.maxLength = (JobsRP && JobsRP.Config && JobsRP.Config.auth_ui_max_account_len) ? JobsRP.Config.auth_ui_max_account_len : 24;

    var secretLabel = window.text(20, 140, 440, 18, "Password", labelStyles);
    var secretInput = window.password(20, 160, 440, 30, "", inputStyles);
    secretInput.placeholder = "password";
    secretInput.maxLength = (JobsRP && JobsRP.Config && JobsRP.Config.auth_ui_max_password_len) ? JobsRP.Config.auth_ui_max_password_len : 64;

    var statusText = window.text(20, 210, 440, 20, "", statusStyles);
    var tokenText = window.text(20, 230, 440, 20, "", statusStyles);

    var submitButton = window.button(20, 265, 210, 36, "Register", buttonStyles, function() {
        syncInputsFromMexui();
        submit();
    });

    var toggleButton = window.button(250, 265, 210, 36, "Switch to Login", buttonStyles, function() {
        toggleMode();
    });

    JobsAuthUI.mexuiWindow = window;
    JobsAuthUI.mexuiControls = {
        titleText: titleText,
        accountLabel: accountLabel,
        accountInput: accountInput,
        secretLabel: secretLabel,
        secretInput: secretInput,
        statusText: statusText,
        tokenText: tokenText,
        submitButton: submitButton,
        toggleButton: toggleButton
    };
    JobsAuthUI.mexuiReady = true;
    JobsAuthUI.useMexui = true;

    // Ensure legacy input handlers are disabled to avoid double input
    try {
        stopAuthKeyboardService();
    } catch (eStop) {
    }
    try {
        detachRuntimeHandlers();
    } catch (eDetach) {
    }
    try {
        if (typeof KeyboardService !== "undefined" && KeyboardService && typeof KeyboardService.setConfig === "function") {
            KeyboardService.setConfig(null);
        }
    } catch (eCfg) {
    }

    try {
        if (typeof ui.setInput === "function") {
            ui.setInput(false);
        }
    } catch (e) {
    }

    try {
        if (ui && typeof ui.bindEvents === "function") {
            ui.bindEvents();
        }
        if (ui && typeof ui.startTimers === "function") {
            ui.startTimers();
        }
    } catch (e2) {
    }

    updateMexuiMode();
    updateMexuiStatus();
    syncMexuiInputsFromState();

    bindKeySafe("F3", "down", function() {
        if (!JobsAuthUI.visible) {
            return;
        }
        toggleMode();
    });

    return true;
}

// mode toggle uses dedicated key (F3)

function canCaptureInput() {
    if (!JobsAuthUI.visible) {
        return false;
    }
    if (typeof chatInputEnabled !== "undefined" && chatInputEnabled) {
        return false;
    }
    return true;
}

function rememberInjectedChar(ch) {
    JobsAuthUI.lastInjectedChar = String(ch || "");
    JobsAuthUI.lastInjectedAtMs = nowMs();
}

function isInjectedCharDuplicate(ch) {
    var text = String(ch || "");
    if (text === "") {
        return false;
    }
    if (JobsAuthUI.lastInjectedChar !== text) {
        return false;
    }
    return (nowMs() - JobsAuthUI.lastInjectedAtMs) <= 80;
}

function bindKeySafe(keyName, keyState, fn) {
    if (typeof bindKey !== "function") {
        return false;
    }

    try {
        bindKey(keyName, keyState, fn);
        AuthKeyboardService.bindings.push({
            key: keyName,
            state: keyState,
            fn: fn
        });
        return true;
    } catch (e) {
    }

    return false;
}

function bindAliases(aliases, keyState, fn) {
    if (!aliases || aliases.length === 0) {
        return false;
    }

    for (var i = 0; i < aliases.length; i++) {
        if (bindKeySafe(aliases[i], keyState, fn)) {
            return true;
        }
    }
    return false;
}

function unbindAuthKeyboardService() {
    if (!AuthKeyboardService.bindings || AuthKeyboardService.bindings.length === 0) {
        return;
    }

    for (var i = 0; i < AuthKeyboardService.bindings.length; i++) {
        var item = AuthKeyboardService.bindings[i];
        try {
            if (typeof unbindKey === "function") {
                unbindKey(item.key, item.state, item.fn);
            }
        } catch (e) {
        }
    }

    AuthKeyboardService.bindings = [];
}

function keyToCharacter(canonical) {
    var key = String(canonical || "").toLowerCase();
    if (/^[a-z]$/.test(key)) {
        return AuthKeyboardService.shiftDown ? key.toUpperCase() : key;
    }

    var pair = KeyCharPairs[key];
    if (!pair) {
        return "";
    }

    return AuthKeyboardService.shiftDown ? pair[1] : pair[0];
}

function handleKeyboardSpecial(action) {
    if (action === "shift_down") {
        AuthKeyboardService.shiftDown = true;
        return;
    }

    if (action === "ctrl_down") {
        // Control toggle handled in key event with modifier mask.
        return;
    }

    if (action === "shift_up") {
        AuthKeyboardService.shiftDown = false;
        return;
    }

    if (!canCaptureInput()) {
        return;
    }

    if (action === "tab") {
        handleTabPressed();
        return;
    }

    if (action === "toggle_mode") {
        toggleMode();
        return;
    }

    if (action === "backspace") {
        if (!JobsAuthUI.waitingTokenAck) {
            deleteLastChar();
        }
        return;
    }

    if (action === "enter") {
        submit();
        return;
    }

    if (action === "escape") {
        if (JobsAuthUI.authState.authenticated === true && !JobsAuthUI.waitingTokenAck) {
            setVisible(false);
        } else {
            setStatus("Authentication is required.", "warn");
        }
    }
}

function handleKeyboardCharacter(canonical) {
    if (!canCaptureInput() || JobsAuthUI.waitingTokenAck) {
        return;
    }

    var ch = keyToCharacter(canonical);
    if (!ch) {
        return;
    }

    appendChar(ch);
    rememberInjectedChar(ch);
}

function bindSpecial(action, aliases, state) {
    var handler = function() {
        handleKeyboardSpecial(action);
    };

    if (bindAliases(aliases, state || "down", handler)) {
        AuthKeyboardService.specialBindings += 1;
        return true;
    }

    return false;
}

function bindCharacter(canonical, aliases) {
    var handler = function() {
        handleKeyboardCharacter(canonical);
    };

    if (bindAliases(aliases, "down", handler)) {
        AuthKeyboardService.charBindings += 1;
        return true;
    }

    return false;
}

function startAuthKeyboardService() {
    unbindAuthKeyboardService();
    AuthKeyboardService.active = false;
    AuthKeyboardService.shiftDown = false;
    AuthKeyboardService.charBindings = 0;
    AuthKeyboardService.specialBindings = 0;

    if (typeof bindKey !== "function") {
        sendDiag("auth_ui.input", "bindKey unavailable; using event input fallback", false);
        return;
    }

    bindSpecial("tab", ["tab", "SDLK_TAB"], "down");
    bindSpecial("toggle_mode", ["f3", "SDLK_F3"], "down");
    bindSpecial("enter", ["enter", "return", "kp_enter", "num_enter", "SDLK_RETURN", "SDLK_KP_ENTER"], "down");
    bindSpecial("escape", ["escape", "esc", "SDLK_ESCAPE"], "down");

    bindSpecial("shift_down", ["lshift", "leftshift", "left shift", "SDLK_LSHIFT"], "down");
    bindSpecial("shift_down", ["rshift", "rightshift", "right shift", "SDLK_RSHIFT"], "down");
    bindSpecial("shift_down", ["shift"], "down");
    bindSpecial("ctrl_down", ["lctrl", "leftctrl", "left ctrl", "SDLK_LCTRL"], "down");
    bindSpecial("ctrl_down", ["rctrl", "rightctrl", "right ctrl", "SDLK_RCTRL"], "down");
    bindSpecial("ctrl_down", ["ctrl", "control", "SDLK_CTRL"], "down");
    bindSpecial("shift_up", ["lshift", "leftshift", "left shift", "SDLK_LSHIFT"], "up");
    bindSpecial("shift_up", ["rshift", "rightshift", "right shift", "SDLK_RSHIFT"], "up");
    bindSpecial("shift_up", ["shift"], "up");

    AuthKeyboardService.active = AuthKeyboardService.bindings.length > 0;
    if (AuthKeyboardService.active) {
        sendDiag(
            "auth_ui.input",
            "keyboard service active (special=" + String(AuthKeyboardService.specialBindings) + ", chars=" + String(AuthKeyboardService.charBindings) + ")",
            true
        );
    } else {
        sendDiag("auth_ui.input", "keyboard service failed to bind any keys; using event input fallback", true);
    }
}

function stopAuthKeyboardService() {
    unbindAuthKeyboardService();
    AuthKeyboardService.active = false;
    AuthKeyboardService.shiftDown = false;
    AuthKeyboardService.charBindings = 0;
    AuthKeyboardService.specialBindings = 0;
}

function nowMs() {
    if (Date && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
}

function trim(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
}

function normalizeAccount(value) {
    return trim(value).toLowerCase();
}

function getConfigNumber(name, fallback) {
    var value = Number(fallback);
    if (!isFinite(value)) {
        value = 0;
    }

    try {
        if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) {
            var raw = Number(JobsRP.Config[name]);
            if (isFinite(raw)) {
                value = raw;
            }
        }
    } catch (e) {
    }

    if (!isFinite(value) || value <= 0) {
        return Math.max(1, Number(fallback) || 1);
    }

    return Math.floor(value);
}

function maskToken(token) {
    var raw = String(token || "");
    if (raw.length <= 12) {
        return raw;
    }
    return raw.substring(0, 8) + "..." + raw.substring(raw.length - 4);
}

function shouldShow() {
    // Always show UI if user explicitly opens it, regardless of auth state
    if (JobsAuthUI.visible) {
        return true;
    }
    
    // Show if auth is required and not authenticated
    if (JobsAuthUI.authState.authRequired && !JobsAuthUI.authState.authenticated) {
        return true;
    }
    
    // Show if there's a pending token to acknowledge
    if (JobsAuthUI.waitingTokenAck) {
        return true;
    }
    
    // Show if there's a status message to display
    if (JobsAuthUI.statusMessage !== "") {
        return true;
    }
    
    return false;
}

function setVisible(visible) {
    var next = (visible === true);
    if (JobsAuthUI.visible === next) {
        return;
    }

    JobsAuthUI.visible = next;
    if (JobsAuthUI.useMexui && JobsAuthUI.mexuiWindow) {
        try {
            JobsAuthUI.mexuiWindow.shown = next;
            var ui = getJobsRpUi();
            if (ui && typeof ui.setInput === "function") {
                ui.setInput(next);
            }
            if (next) {
                if (ui && typeof ui.bindEvents === "function") {
                    ui.bindEvents();
                }
                if (ui && typeof ui.startTimers === "function") {
                    ui.startTimers();
                }
            }
        } catch (e0) {
        }
    }

    try {
        if (typeof gui !== "undefined" && gui && typeof gui.showCursor === "function") {
            gui.showCursor(next);
            return;
        }
    } catch (e0) {
        sendDiag("auth_ui.cursor", "gui.showCursor failed: " + String(e0), false);
    }

    try {
        if (typeof gta !== "undefined" && gta && gta.showCursor) {
            gta.showCursor(next);
            return;
        }
    } catch (e1) {
        sendDiag("auth_ui.cursor", "gta.showCursor failed: " + String(e1), false);
    }
}

function setStatus(message, level) {
    JobsAuthUI.statusMessage = String(message || "");
    JobsAuthUI.statusLevel = String(level || "info");
    if (JobsAuthUI.useMexui) {
        updateMexuiStatus();
    }
}

function sendServer(eventName) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    try {
        if (typeof triggerNetworkEvent === "function") {
            triggerNetworkEvent.apply(null, [eventName].concat(args));
            return true;
        }
    } catch (e) {
    }

    return false;
}

function sendDiag(channel, message, force) {
    var text = trim(message);
    if (text === "") {
        return;
    }

    var stamp = nowMs();
    var line = String(channel || "misc") + "|" + text;

    if (!force) {
        if (line === JobsAuthUI.lastDiagLine && (stamp - JobsAuthUI.lastDiagAtMs) < 10000) {
            return;
        }
        if ((stamp - JobsAuthUI.lastDiagAtMs) < 1200) {
            return;
        }
    }

    JobsAuthUI.lastDiagLine = line;
    JobsAuthUI.lastDiagAtMs = stamp;
    sendServer("jobs.clientDiag", String(channel || "misc"), text);
}

function consumeEvent(ev) {
    if (!ev) {
        return;
    }

    try {
        if (typeof ev.preventDefault === "function") {
            ev.preventDefault();
        }
    } catch (e1) {
    }

    try {
        if (typeof ev.stopPropagation === "function") {
            ev.stopPropagation();
        }
    } catch (e2) {
    }
}

function extractCursorPos(args) {
    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (typeof value === "number") {
            var next = args[i + 1];
            if (typeof next === "number") {
                return { x: value, y: next };
            }
        }
        if (value && typeof value === "object") {
            if (typeof value.x === "number" && typeof value.y === "number") {
                return { x: value.x, y: value.y };
            }
            if (typeof value[0] === "number" && typeof value[1] === "number") {
                return { x: value[0], y: value[1] };
            }
        }
    }
    return null;
}

function getCursorNorm() {
    try {
        if (typeof gui !== "undefined" && gui && typeof gui.cursorPosition === "function") {
            var pos = gui.cursorPosition();
            if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
                return { x: pos.x, y: pos.y };
            }
            if (pos && typeof pos[0] === "number" && typeof pos[1] === "number") {
                return { x: pos[0], y: pos[1] };
            }
        }
    } catch (e1) {
    }

    try {
        if (natives && typeof natives.getMousePosition === "function") {
            var vec = natives.getMousePosition();
            if (vec && typeof vec.x === "number" && typeof vec.y === "number") {
                return { x: vec.x, y: vec.y };
            }
            if (vec && typeof vec[0] === "number" && typeof vec[1] === "number") {
                return { x: vec[0], y: vec[1] };
            }
        }
    } catch (e2) {
    }

    return { x: JobsAuthUI.cursorX || 0, y: JobsAuthUI.cursorY || 0 };
}

function setToggleButtonRect(cx, cy, w, h) {
    JobsAuthUI.toggleButton = {
        cx: cx,
        cy: cy,
        w: w,
        h: h
    };
}

function setForgotButtonRect(cx, cy, w, h) {
    JobsAuthUI.forgotButton = {
        cx: cx,
        cy: cy,
        w: w,
        h: h
    };
}

function isCursorInside(rect) {
    if (!rect) {
        return false;
    }
    var pos = getCursorNorm();
    var minX = rect.cx - (rect.w / 2);
    var maxX = rect.cx + (rect.w / 2);
    var minY = rect.cy - (rect.h / 2);
    var maxY = rect.cy + (rect.h / 2);
    return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
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
            sendDiag("auth_ui.hook", "failed to bind " + eventName + ": " + String(e), false);
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

function setTextRenderer(name) {
    var next = String(name || "");
    if (next === "") {
        return;
    }
    if (JobsAuthUI.textRenderer === next) {
        return;
    }

    JobsAuthUI.textRenderer = next;
    sendDiag("auth_ui.text", "renderer=" + next, true);
}
function getLucasFontApi() {
    try {
        if (typeof globalThis !== "undefined") {
            if (globalThis.lucasFont) {
                return globalThis.lucasFont;
            }
            if (globalThis.LucasFont) {
                return globalThis.LucasFont;
            }
        }
    } catch (e3) {
    }

    try {
        if (typeof lucasFont !== "undefined" && lucasFont) {
            return lucasFont;
        }
    } catch (e1) {
    }

    try {
        if (typeof LucasFont !== "undefined" && LucasFont) {
            return LucasFont;
        }
    } catch (e2) {
    }

    return null;
}

function ensureFont() {
    if (JobsAuthUI.font || JobsAuthUI.fontTried) {
        return JobsAuthUI.font != null;
    }

    JobsAuthUI.fontTried = true;

    var fontApi = getLucasFontApi();
    if (!fontApi) {
        JobsAuthUI.lastRenderError = "lucasFont api missing";
        sendDiag("auth_ui.js", "font unavailable", true);
        return false;
    }

    try {
        // mapped file streams in some Galactic builds can assert in CMappedMemory::Unmap; use default font API only
        try {
            JobsAuthUI.font = fontApi.createDefaultFont(28.0);
        } catch (eDefault1) {
            JobsAuthUI.font = null;
        }

        if (!JobsAuthUI.font) {
            try {
                JobsAuthUI.font = fontApi.createDefaultFont();
            } catch (eDefault2) {
                JobsAuthUI.font = null;
            }
        }

        if (JobsAuthUI.font && JobsAuthUI.font.render) {
            sendDiag("auth_ui.js", "default font loaded", false);
            return true;
        }
    } catch (e) {
        JobsAuthUI.lastRenderError = "ensureFont: " + String(e);
        sendDiag("auth_ui.js", "font creation failed: " + String(e), true);
    }

    sendDiag("auth_ui.js", "font unavailable", true);
    return false;
}

function applyNativeTextStyle() {
    try {
        if (!natives) {
            return;
        }

        if (natives.setTextScale) {
            natives.setTextScale(0.20, 0.20);
        }
        if (natives.setTextFont) {
            natives.setTextFont(0);
        }
        if (natives.setTextColour) {
            natives.setTextColour(255, 255, 255, 255);
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
    } catch (e) {
    }
}

function getScreenSize() {
    var width = 1280;
    var height = 720;

    try {
        if (typeof gta !== "undefined" && gta && gta.width) {
            width = Number(gta.width) || width;
        }
        if (typeof gta !== "undefined" && gta && gta.height) {
            height = Number(gta.height) || height;
        }
    } catch (e) {
        sendDiag("auth_ui.screen", "gta dimensions failed: " + String(e), false);
    }

    if (width <= 0) {
        width = 1280;
    }
    if (height <= 0) {
        height = 720;
    }

    return {
        width: width,
        height: height
    };
}

function colourHexToRgba(colourHex) {
    var raw = Number(colourHex);
    if (!isFinite(raw)) {
        raw = Hex.White;
    }
    raw = (raw >>> 0);

    return {
        r: (raw >>> 16) & 255,
        g: (raw >>> 8) & 255,
        b: raw & 255,
        a: (raw >>> 24) & 255
    };
}

function tryGtaDrawText(message, x, y, colourHex) {
    try {
        if (!(gta && gta.drawText)) {
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

        var result = gta.drawText(
            message,
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

        if (result !== false) {
            setTextRenderer("gta.drawText");
            return true;
        }

        return false;
    } catch (e) {
        JobsAuthUI.lastRenderError = "gta.drawText: " + String(e);
        return false;
    }
}

function tryNativeLiteralText(message, x, y, colourHex) {
    if (!(natives && natives.displayTextWithLiteralString)) {
        return false;
    }

    var screen = getScreenSize();
    if (screen.width <= 0 || screen.height <= 0) {
        JobsAuthUI.lastRenderError = "displayText: invalid screen size";
        return false;
    }

    var nx = x / screen.width;
    var ny = y / screen.height;
    var rgba = colourHexToRgba(colourHex);

    try {
        if (natives.setTextScale) {
            natives.setTextScale(0.30, 0.30);
        }
    } catch (eScale) {
    }
    try {
        if (natives.setTextFont) {
            natives.setTextFont(0);
        }
    } catch (eFont) {
    }
    try {
        if (natives.setTextColour) {
            natives.setTextColour(rgba.r, rgba.g, rgba.b, rgba.a);
        }
    } catch (eColour) {
    }
    try {
        if (natives.setTextCentre) {
            natives.setTextCentre(false);
        }
    } catch (eCentre) {
    }
    try {
        if (natives.setTextProportional) {
            natives.setTextProportional(true);
        }
    } catch (eProp) {
    }
    try {
        if (natives.setTextDropshadow) {
            natives.setTextDropshadow(true, 0, 0, 0, 255);
        }
    } catch (eShadow) {
    }

    try {
        var resultVec2 = natives.displayTextWithLiteralString(new Vec2(nx, ny), "STRING", message);
        if (resultVec2 !== false) {
            setTextRenderer("natives.displayTextWithLiteralString");
            return true;
        }
    } catch (eVec2) {
        JobsAuthUI.lastRenderError = "displayText(vec2): " + String(eVec2);
    }

    try {
        var resultNum = natives.displayTextWithLiteralString(nx, ny, "STRING", message);
        if (resultNum !== false) {
            setTextRenderer("natives.displayTextWithLiteralString");
            return true;
        }
        return false;
    } catch (eNum) {
        JobsAuthUI.lastRenderError = "displayText(num): " + String(eNum);
        return false;
    }
}

function renderText(text, x, y, size, colourHex, alignX) {
    var msg = String(text || "");
    if (msg === "") {
        return true;
    }

    var hasFont = ensureFont();
    if (hasFont && JobsAuthUI.font && JobsAuthUI.font.render) {
        try {
            var ax = (typeof alignX === "number") ? alignX : 0.0;
            var result = JobsAuthUI.font.render(msg, new Vec2(x, y), 1, ax, 0.1, size, colourHex, false, true, false, false);
            if (result !== false) {
                setTextRenderer("lucasFont");
                return true;
            }
        } catch (e1) {
            JobsAuthUI.lastRenderError = "Font.render: " + String(e1);
        }

        try {
            var ax2 = (typeof alignX === "number") ? alignX : 0.0;
            var result2 = JobsAuthUI.font.render.call(JobsAuthUI.font, msg, new Vec2(x, y), 1, ax2, 0.1, size, colourHex, false, true, false, false);
            if (result2 !== false) {
                setTextRenderer("lucasFont");
                return true;
            }
        } catch (e2) {
            JobsAuthUI.lastRenderError = "Font.render.call: " + String(e2);
        }
    }

    if (tryGtaDrawText(msg, x, y, colourHex)) {
        return true;
    }

    if (tryNativeLiteralText(msg, x, y, colourHex)) {
        return true;
    }

    return false;
}

function drawRectNorm(cx, cy, w, h, r, g, b, a) {
    try {
        if (natives && natives.drawRect) {
            natives.drawRect(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return true;
        }
    } catch (eNative) {
        JobsAuthUI.lastRenderError = "drawRect(native): " + String(eNative);
    }

    try {
        if (gta && gta.drawRectangle) {
            gta.drawRectangle(cx, cy, w, h, r, g, b, a);
            return true;
        }
    } catch (eGtaA) {
        JobsAuthUI.lastRenderError = "drawRect(gta-args): " + String(eGtaA);
    }

    try {
        if (gta && gta.drawRectangle) {
            gta.drawRectangle(new Vec2(cx, cy), new Vec2(w, h), r, g, b, a);
            return true;
        }
    } catch (eGtaB) {
        JobsAuthUI.lastRenderError = "drawRect(gta-vec2): " + String(eGtaB);
    }

    return false;
}

function levelToHex(level) {
    if (level === "error") {
        return Hex.Red;
    }
    if (level === "warn") {
        return Hex.Yellow;
    }
    if (level === "success") {
        return Hex.Green;
    }
    return Hex.White;
}

function extractAuthState(args) {
    var found = null;
    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (value && typeof value === "object") {
            var hasState = false;
            try {
                hasState = (typeof value.authenticated !== "undefined") || (typeof value.authRequired !== "undefined");
            } catch (e) {
                hasState = false;
            }
            if (hasState) {
                found = value;
                break;
            }
        }
    }

    if (!found) {
        return null;
    }

    var out = {
        authenticated: false,
        authRequired: false,
        accountId: "",
        lockRemainingSec: 0,
        lastMessage: ""
    };

    try {
        out.authenticated = (found.authenticated === true);
        out.authRequired = (found.authRequired === true);
        out.accountId = String(found.accountId || "");
        out.lockRemainingSec = Number(found.lockRemainingSec || 0);
        out.lastMessage = String(found.lastMessage || "");
    } catch (e) {
    }

    return out;
}

function extractAuthResult(args) {
    var out = {
        ok: false,
        code: "",
        message: ""
    };

    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (typeof value === "boolean") {
            out.ok = value;
        } else if (typeof value === "string") {
            if (out.code === "") {
                out.code = value;
            } else if (out.message === "") {
                out.message = value;
            }
        }
    }

    return out;
}

function extractTokenIssued(args) {
    var out = {
        accountId: "",
        token: ""
    };

    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (typeof value !== "string") {
            continue;
        }
        var text = trim(value);
        if (text === "") {
            continue;
        }

        if (out.token === "" && (text.indexOf("JR-") === 0 || text.indexOf("\\JR-") === 0)) {
            out.token = text;
            continue;
        }

        if (out.accountId === "" && /^[a-z0-9_]{3,24}$/i.test(text)) {
            out.accountId = normalizeAccount(text);
            continue;
        }

        if (out.accountId === "") {
            out.accountId = normalizeAccount(text);
        } else if (out.token === "") {
            out.token = text;
        }
    }

    return out;
}

function appendChar(ch) {
    var c = String(ch || "");
    if (c.length === 0) {
        return;
    }
    c = c.charAt(0);

    if (JobsAuthUI.activeField === "account") {
        var lower = c.toLowerCase();
        if (!/^[a-z0-9_]$/.test(lower)) {
            return;
        }
        if (JobsAuthUI.accountInput.length >= 24) {
            return;
        }
        JobsAuthUI.accountInput += lower;
        return;
    }

    if (!/^[\x21-\x7E]$/.test(c)) {
        return;
    }
    var maxPasswordLen = getConfigNumber("auth_ui_max_password_len", 64);
    if (JobsAuthUI.tokenInput.length >= maxPasswordLen) {
        return;
    }
    JobsAuthUI.tokenInput += c;
}
function deleteLastChar() {
    if (JobsAuthUI.activeField === "account") {
        if (JobsAuthUI.accountInput.length > 0) {
            JobsAuthUI.accountInput = JobsAuthUI.accountInput.substring(0, JobsAuthUI.accountInput.length - 1);
        }
        return;
    }

    if (JobsAuthUI.tokenInput.length > 0) {
        JobsAuthUI.tokenInput = JobsAuthUI.tokenInput.substring(0, JobsAuthUI.tokenInput.length - 1);
    }
}
function submit() {
    if (JobsAuthUI.useMexui) {
        syncInputsFromMexui();
    }
    if (JobsAuthUI.waitingTokenAck) {
        JobsAuthUI.waitingTokenAck = false;
        JobsAuthUI.pendingToken = "";
        setStatus("Token acknowledged.", "success");
        setVisible(shouldShow());
        return;
    }

    var account = normalizeAccount(JobsAuthUI.accountInput);
    if (account === "") {
        setStatus("Account id is required.", "warn");
        return;
    }

    var password = trim(JobsAuthUI.tokenInput);
    if (password === "") {
        setStatus("Password is required.", "warn");
        return;
    }

    if (JobsAuthUI.mode === "register") {
        if (sendServer("jobs.authRegister", account, password)) {
            setStatus("Register request sent...", "info");
        } else {
            setStatus("Could not send register request.", "error");
        }
        return;
    }

    if (sendServer("jobs.authLogin", account, password)) {
        setStatus("Login request sent...", "info");
    } else {
        setStatus("Could not send login request.", "error");
    }
}

function setMode(nextMode) {
    var next = String(nextMode || "");
    if (next !== "register" && next !== "login") {
        return;
    }
    JobsAuthUI.mode = next;
    JobsAuthUI.lastMode = next;
    try {
        if (typeof localPlayer !== "undefined" && localPlayer && typeof localPlayer.setData === "function") {
            localPlayer.setData("jobs.auth.lastMode", next);
        }
    } catch (eSet) {
    }
    if (next === "register") {
        JobsAuthUI.activeField = "account";
    }
    if (JobsAuthUI.useMexui) {
        updateMexuiMode();
    }
}

function toggleMode() {
    if (JobsAuthUI.mode === "register") {
        setMode("login");
    } else {
        setMode("register");
    }
}

function switchField() {
    JobsAuthUI.activeField = (JobsAuthUI.activeField === "account") ? "token" : "account";
}

function handleTabPressed() {
    switchField();
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

function matchesKey(key, name, fallback) {
    var code = keyCode(name, fallback);
    if (typeof key === "number") {
        return key === code || key === fallback;
    }
    if (typeof key === "string") {
        return key.toLowerCase() === String(name || "").toLowerCase();
    }
    return false;
}

function isModeToggleKey(keyArg) {
    if (keyArg === 1073741884) { // observed F3 keyArg in this client build
        return true;
    }
    return (
        matchesKey(keyArg, "SDLK_F3", 284) ||
        matchesKey(keyArg, "F3", 284)
    );
}

function extractKeyArg(args) {
    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (typeof value === "number" || typeof value === "string") {
            return value;
        }
    }
    return null;
}

function extractEventArg(args) {
    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (value && typeof value === "object" && typeof value.preventDefault === "function") {
            return value;
        }
    }
    return null;
}

function getEventKeyCode(ev) {
    if (!ev) {
        return null;
    }
    try {
        if (typeof keyEvent !== "undefined" && keyEvent && typeof keyEvent.keyCode === "function") {
            var code = keyEvent.keyCode(ev);
            if (typeof code === "number") {
                return code;
            }
        }
    } catch (e) {
    }
    return null;
}

function getEventMod(ev) {
    if (!ev) {
        return 0;
    }
    try {
        if (typeof keyEvent !== "undefined" && keyEvent && typeof keyEvent.mod === "function") {
            var mod = keyEvent.mod(ev);
            if (typeof mod === "number") {
                return mod;
            }
        }
    } catch (e) {
    }
    return 0;
}

function extractCharArg(args) {
    for (var i = 0; i < args.length; i++) {
        var value = args[i];
        if (typeof value === "string" && value.length > 0) {
            return value.charAt(0);
        }
        if (typeof value === "number" && value >= 32 && value <= 126) {
            return String.fromCharCode(value);
        }
    }
    return null;
}

function onAuthState() {
    var state = extractAuthState(arguments);
    if (!state) {
        sendDiag("auth_ui.state", "authState event received but payload parse failed", false);
        return;
    }

    JobsAuthUI.receivedAuthState = true;
    JobsAuthUI.authState = state;
    sendDiag("auth_ui.state", "authState received authRequired=" + String(state.authRequired) + " authenticated=" + String(state.authenticated), false);

    if (state.accountId !== "") {
        JobsAuthUI.accountInput = normalizeAccount(state.accountId);
    }

    if (state.authRequired && !state.authenticated) {
        if (state.lockRemainingSec > 0) {
            setStatus("Locked: " + String(state.lockRemainingSec) + "s", "warn");
        } else if (state.lastMessage) {
            setStatus(state.lastMessage, "info");
        } else {
            setStatus("Register or login to use jobs.", "info");
        }
    }

    if (JobsClient && JobsClient.UI) {
        if (state.authenticated === true && typeof JobsClient.UI.startHud === "function") {
            JobsClient.UI.startHud();
        } else if (state.authenticated === false && typeof JobsClient.UI.stopHud === "function") {
            JobsClient.UI.stopHud();
        }
    }

    setVisible(shouldShow());
}

function onAuthResult() {
    var result = extractAuthResult(arguments);
    if (result.message !== "") {
        setStatus(result.message, result.ok ? "success" : "warn");
    }

    if (result.ok) {
        if (result.code === "registered" || result.code === "logged_in" || result.code === "already_logged_in") {
            JobsAuthUI.authState.authenticated = true;

            if (JobsClient && JobsClient.UI && typeof JobsClient.UI.startHud === "function") {
                JobsClient.UI.startHud();
            }
            
            // Auto-close menu upon successful authentication
            setTimeout(function() {
                setVisible(false);
                setStatus("Successfully authenticated! Menu closed.", "success");
            }, 1000); // Wait 1 second to show success message
        } else if (result.code === "logged_out") {
            JobsAuthUI.authState.authenticated = false;
            JobsAuthUI.waitingTokenAck = false;
            if (JobsClient && JobsClient.UI && typeof JobsClient.UI.stopHud === "function") {
                JobsClient.UI.stopHud();
            }
        }
    }

    setVisible(shouldShow());
}

function onTokenIssued() {
    var tokenData = extractTokenIssued(arguments);
    if (tokenData.accountId !== "") {
        JobsAuthUI.accountInput = normalizeAccount(tokenData.accountId);
    }
    if (tokenData.token !== "") {
        JobsAuthUI.tokenInput = tokenData.token;
        JobsAuthUI.pendingToken = tokenData.token;
        JobsAuthUI.waitingTokenAck = true;
        setStatus("Token issued. Save it now. Press Enter to acknowledge.", "success");
    } else {
        setStatus("Token issued.", "success");
    }

    if (JobsAuthUI.useMexui) {
        syncMexuiInputsFromState();
        updateMexuiStatus();
    }

    setVisible(true);
}

function drawAuthUI() {
    if (!JobsAuthUI.visible) {
        return;
    }

    if (!JobsAuthUI.sentFirstDrawDiag) {
        JobsAuthUI.sentFirstDrawDiag = true;
        sendDiag("auth_ui.draw", "first draw visible=true mode=" + JobsAuthUI.mode, true);
    }

    var width = 1280;
    var height = 720;

    try {
        if (typeof gta !== "undefined" && gta && gta.width) {
            width = gta.width;
        }
        if (typeof gta !== "undefined" && gta && gta.height) {
            height = gta.height;
        }
    } catch (e) {
        sendDiag("auth_ui.draw", "screen size detection failed: " + String(e), false);
    }

    if (width <= 0) {
        width = 1280;
    }
    if (height <= 0) {
        height = 720;
    }

    var nw = width * 0.5;
    var nh = height * 0.5;
    var scale = Math.min(width / 1280, height / 720);
    if (!isFinite(scale) || scale <= 0) {
        scale = 1.0;
    }
    var textSize = function(value) {
        return Math.max(12, Math.floor(value * scale));
    };
    var px = function(value) {
        return value * scale;
    };

    // Modern dark theme panel with gradient background
    var panelWidth = 0.65;
    var panelHeight = 0.55;
    var panelX = 0.5;
    var panelY = 0.45;
    
    // Background overlay with subtle transparency
    drawRectNorm(0.5, 0.5, 1.0, 1.0, 0, 0, 0, 200);
    
    // Main panel with gradient effect (multiple layers)
    drawRectNorm(panelX, panelY, panelWidth + 0.02, panelHeight + 0.02, 30, 30, 40, 255); // Shadow
    drawRectNorm(panelX, panelY, panelWidth, panelHeight, 22, 33, 62, 255); // Main panel
    drawRectNorm(panelX, panelY, panelWidth - 0.01, panelHeight - 0.01, 41, 50, 65, 255); // Inner highlight
    
    // Header bar with gradient
    drawRectNorm(panelX, panelY - (panelHeight * 0.15), panelWidth, panelHeight * 0.12, 233, 69, 96, 255); // Header background
    drawRectNorm(panelX, panelY - (panelHeight * 0.15), panelWidth - 0.005, panelHeight * 0.12 - 0.005, 255, 107, 107, 255); // Header highlight
    
    // Modern input fields with borders
    var inputWidth = 0.55;
    var inputHeight = 0.035;
    var inputY = panelY + 0.05;
    
    // Account input field
    drawRectNorm(panelX, inputY, inputWidth + 0.005, inputHeight + 0.005, 0, 0, 0, 100); // Input shadow
    drawRectNorm(panelX, inputY, inputWidth, inputHeight, 15, 52, 96, 255); // Input background
    drawRectNorm(panelX, inputY, inputWidth, inputHeight + 0.002, 52, 152, 219, 255); // Input border (active if selected)
    
    // Password input field
    var passwordY = inputY + 0.08;
    drawRectNorm(panelX, passwordY, inputWidth + 0.005, inputHeight + 0.005, 0, 0, 0, 100); // Input shadow
    drawRectNorm(panelX, passwordY, inputWidth, inputHeight, 15, 52, 96, 255); // Input background
    drawRectNorm(panelX, passwordY, inputWidth, inputHeight + 0.002, 52, 152, 219, 255); // Input border (active if selected)

    applyNativeTextStyle();

    var okText = true;
    // Calculate proper text positions based on panel bounds
    var panelLeftPx = panelX * width - (panelWidth * width / 2);
    var panelTopPx = panelY * height - (panelHeight * height / 2);
    
    var leftX = Math.floor(panelLeftPx + px(30));
    var valueX = Math.floor(panelLeftPx + px(280));
    var yTitle = Math.floor((panelY - (panelHeight * 0.15)) * height - (panelHeight * 0.15 * height / 2) + px(25));
    var yMode = yTitle + px(35);
    var yHelp = yMode + px(25);

    // Center-align title and mode text
    var titleWidth = px(200);
    var titleX = Math.floor(panelX * width - titleWidth / 2);
    
    // Modern typography with better hierarchy and proper spacing
    okText = renderText("🔐 JOBS RP AUTH", titleX, yTitle, textSize(32), Hex.White, 0.5) && okText;
    okText = renderText((JobsAuthUI.mode === "register" ? "📝 CREATE ACCOUNT" : "🔑 SIGN IN"), titleX, yMode, textSize(24), Hex.White, 0.5) && okText;
    okText = renderText("Tab: Switch field • F3: Toggle mode • Enter: Submit • Esc: Close", leftX, yHelp, textSize(16), Hex.LightGrey, 0.0) && okText;

    // Modern toggle button with gradient and hover effects - moved to prevent overlap
    var btnCx = panelX;
    var btnCy = panelY - (panelHeight * 0.10); // Moved further up to prevent overlap with mode text
    var btnW = 0.25;
    var btnH = 0.04;
    setToggleButtonRect(btnCx, btnCy, btnW, btnH);
    var hover = isCursorInside(JobsAuthUI.toggleButton);
    
    // Button with gradient effect
    if (hover) {
        drawRectNorm(btnCx, btnCy, btnW + 0.005, btnH + 0.005, 0, 0, 0, 150); // Shadow
        drawRectNorm(btnCx, btnCy, btnW, btnH, 255, 107, 107, 255); // Hover background
        drawRectNorm(btnCx, btnCy, btnW - 0.005, btnH - 0.005, 255, 140, 140, 255); // Hover highlight
    } else {
        drawRectNorm(btnCx, btnCy, btnW + 0.005, btnH + 0.005, 0, 0, 0, 100); // Shadow
        drawRectNorm(btnCx, btnCy, btnW, btnH, 233, 69, 96, 255); // Normal background
        drawRectNorm(btnCx, btnCy, btnW - 0.005, btnH - 0.005, 255, 90, 90, 255); // Normal highlight
    }

    var btnLabel = (JobsAuthUI.mode === "register") ? "🔄 Switch to LOGIN" : "🔄 Switch to REGISTER";
    var btnTextX = Math.floor(btnCx * width - (btnW * width / 2) + px(15));
    var btnTextY = Math.floor(btnCy * height - px(12));
    okText = renderText(btnLabel, btnTextX, btnTextY, textSize(16), Hex.White, 0.5) && okText;

    // Forgot Password button
    console.log("[Debug] Drawing forgot password button...");
    JobsAuthUI.forgotBtnCy = btnCy + px(45); // Position below toggle button
    JobsAuthUI.forgotBtnW = 0.20;
    JobsAuthUI.forgotBtnH = 0.035;
    var forgotHover = isCursorInside({
        x: btnCx,
        y: JobsAuthUI.forgotBtnCy,
        width: JobsAuthUI.forgotBtnW,
        height: JobsAuthUI.forgotBtnH
    });
    console.log("[Debug] Forgot button positioned at: " + JobsAuthUI.forgotBtnCy + "x" + JobsAuthUI.forgotBtnW + "x" + JobsAuthUI.forgotBtnH);
    
    // Forgot password button styling
    if (forgotHover) {
        drawRectNorm(btnCx, JobsAuthUI.forgotBtnCy, JobsAuthUI.forgotBtnW + 0.005, JobsAuthUI.forgotBtnH + 0.005, 0, 0, 0, 100); // Shadow
        drawRectNorm(btnCx, JobsAuthUI.forgotBtnCy, JobsAuthUI.forgotBtnW, JobsAuthUI.forgotBtnH, 100, 100, 255, 255); // Hover background
    } else {
        drawRectNorm(btnCx, JobsAuthUI.forgotBtnCy, JobsAuthUI.forgotBtnW + 0.005, JobsAuthUI.forgotBtnH + 0.005, 0, 0, 0, 50); // Shadow
        drawRectNorm(btnCx, JobsAuthUI.forgotBtnCy, JobsAuthUI.forgotBtnW, JobsAuthUI.forgotBtnH, 60, 60, 150, 255); // Normal background
    }
    
    var forgotBtnLabel = "🔐 Forgot Password";
    var forgotBtnTextX = Math.floor(btnCx * width - (JobsAuthUI.forgotBtnW * width / 2) + px(10));
    var forgotBtnTextY = Math.floor(JobsAuthUI.forgotBtnCy * height - px(8));
    console.log("[Debug] Rendering forgot button text at: " + forgotBtnTextX + ", " + forgotBtnTextY);
    okText = renderText(forgotBtnLabel, forgotBtnTextX, forgotBtnTextY, textSize(14), Hex.White, 0.5) && okText;
    console.log("[Debug] Forgot button text rendered: " + (okText ? "success" : "failed"));
    
    // Set forgot button rect for click detection
    setForgotButtonRect(btnCx, JobsAuthUI.forgotBtnCy, JobsAuthUI.forgotBtnW, JobsAuthUI.forgotBtnH);

    // Enhanced input field labels with icons - properly aligned with better spacing
    var accountLabel = (JobsAuthUI.activeField === "account") ? "👤 > Account ID:" : "👤   Account ID:";
    var accountDisplay = JobsAuthUI.accountInput;
    if (accountDisplay === "") {
        accountDisplay = "Enter account ID...";
    }
    if (JobsAuthUI.activeField === "account" && JobsAuthUI.cursorBlink) {
        accountDisplay += "|";
    }
    var yAccount = Math.floor(inputY * height - px(5)); // Adjusted spacing
    okText = renderText(accountLabel, leftX, yAccount, textSize(18), Hex.White, 0.0) && okText;
    okText = renderText(accountDisplay, valueX, yAccount, textSize(18), Hex.LightGrey, 0.0) && okText;

    var tokenLabel = (JobsAuthUI.activeField === "token") ? "🔒 > Password:" : "🔒   Password:";
    var tokenDisplay = JobsAuthUI.tokenInput !== "" ? maskToken(JobsAuthUI.tokenInput) : "Enter password...";
    var tokenColour = Hex.LightGrey;
    if (JobsAuthUI.activeField === "token" && JobsAuthUI.cursorBlink) {
        tokenDisplay += "|";
    }

    var yPassword = Math.floor(passwordY * height - px(5)); // Adjusted spacing
    okText = renderText(tokenLabel, leftX, yPassword, textSize(18), Hex.White, 0.0) && okText;
    okText = renderText(tokenDisplay, valueX, yPassword, textSize(18), tokenColour, 0.0) && okText;

    // Enhanced status messages with better visual hierarchy and proper spacing
    var statusStartY = yPassword + px(80); // Increased spacing to prevent overlap
    
    if (JobsAuthUI.pendingToken !== "") {
        var yToken = statusStartY;
        var tokenMsgX = Math.floor(panelX * width - (inputWidth * width / 2));
        drawRectNorm(panelX, (yToken / height) + 0.02, inputWidth, 0.03, 0, 255, 0, 50); // Success background
        okText = renderText("✅ NEW TOKEN ISSUED (save now):", tokenMsgX, yToken, textSize(16), Hex.Success, 0.5) && okText;
        okText = renderText(JobsAuthUI.pendingToken, tokenMsgX, yToken + px(20), textSize(14), Hex.White, 0.5) && okText;
        statusStartY = yToken + px(50); // Update status start position
    }

    if (JobsAuthUI.authState.lockRemainingSec > 0) {
        var yLock = statusStartY;
        var lockMsgX = Math.floor(panelX * width - (inputWidth * width / 2));
        drawRectNorm(panelX, (yLock / height) + 0.02, inputWidth, 0.03, 255, 193, 7, 50); // Warning background
        okText = renderText("⏰ LOCKED: " + String(JobsAuthUI.authState.lockRemainingSec) + "s", lockMsgX, yLock, textSize(16), Hex.Warning, 0.5) && okText;
        statusStartY = yLock + px(35); // Update status start position
    }

    if (JobsAuthUI.statusMessage !== "") {
        var yStatus = statusStartY;
        var statusColor = levelToHex(JobsAuthUI.statusLevel);
        var statusMsgX = Math.floor(panelX * width - (inputWidth * width / 2));
        // Add background for status messages
        var bgColor = JobsAuthUI.statusLevel === "success" ? 0x2200D68F : 
                     JobsAuthUI.statusLevel === "warn" ? 0x22F39C12 : 
                     JobsAuthUI.statusLevel === "error" ? 0x22E74C3C : 0x224A90E2;
        drawRectNorm(panelX, (yStatus / height) + 0.02, inputWidth, 0.03, bgColor >> 24, (bgColor >> 16) & 0xFF, (bgColor >> 8) & 0xFF, 50);
        okText = renderText(JobsAuthUI.statusMessage, statusMsgX, yStatus, textSize(16), statusColor, 0.5) && okText;
        statusStartY = yStatus + px(35); // Update status start position
    }

    // Enhanced help text with better positioning and no overlap
    var yHint = statusStartY + px(20); // Extra spacing to prevent overlap
    var hintMsgX = Math.floor(panelX * width - (inputWidth * width / 2));
    
    if (JobsAuthUI.waitingTokenAck) {
        okText = renderText("⌨️  Press Enter to acknowledge token", hintMsgX, yHint, textSize(14), Hex.Teal, 0.5) && okText;
    } else {
        okText = renderText("💡 Esc closes only when authenticated", hintMsgX, yHint, textSize(14), Hex.Grey, 0.5) && okText;
    }

    if (!okText && !JobsAuthUI.warnedTextFail) {
        JobsAuthUI.warnedTextFail = true;
        sendDiag("auth_ui.text", "text render failed: " + String(JobsAuthUI.lastRenderError || "unknown"), true);
    }
}

function onDrawEvent() {
    if (!JobsAuthUI.started) {
        return;
    }
    if (JobsAuthUI.useMexui) {
        return;
    }

    try {
        drawAuthUI();
    } catch (e) {
        if (!JobsAuthUI.warnedRenderException) {
            JobsAuthUI.warnedRenderException = true;
            sendDiag("auth_ui.draw", "render exception: " + String(e), true);
        }
    }
}

function onKeyDownEvent(ev, key) {
    if (!JobsAuthUI.visible) {
        return;
    }
    if (JobsAuthUI.useMexui) {
        return;
    }
    if (typeof chatInputEnabled !== "undefined" && chatInputEnabled) {
        return;
    }

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    var keyArg = extractKeyArg(args);
    var evArg = extractEventArg(args) || ev;
    if (keyArg == null) {
        keyArg = getEventKeyCode(evArg);
    }

    // Debug key capture (throttled in sendDiag)
    var keyText = (keyArg === null || typeof keyArg === "undefined") ? "null" : String(keyArg);
    var evCode = getEventKeyCode(evArg);
    var evText = (evCode === null || typeof evCode === "undefined") ? "null" : String(evCode);
    sendDiag("auth_ui.key", "keyArg=" + keyText + " evCode=" + evText, false);

    // mode toggle handled via dedicated key (F3)

    if (isModeToggleKey(keyArg)) {
        toggleMode();
        consumeEvent(evArg);
        return;
    }

    if (AuthKeyboardService.active) {
        consumeEvent(evArg);
        return;
    }

    if (matchesKey(keyArg, "SDLK_TAB", 9) || matchesKey(keyArg, "TAB", 9)) {
        handleTabPressed();
        consumeEvent(evArg);
        return;
    }

    if (matchesKey(keyArg, "SDLK_BACKSPACE", 8)) {
        if (!JobsAuthUI.waitingTokenAck) {
            deleteLastChar();
        }
        consumeEvent(evArg);
        return;
    }

    if (matchesKey(keyArg, "SDLK_RETURN", 13) || matchesKey(keyArg, "SDLK_KP_ENTER", 271)) {
        submit();
        consumeEvent(evArg);
        return;
    }

    if (matchesKey(keyArg, "SDLK_ESCAPE", 27)) {
        if (JobsAuthUI.authState.authenticated === true && !JobsAuthUI.waitingTokenAck) {
            setVisible(false);
        } else {
            setStatus("Authentication is required.", "warn");
        }
        consumeEvent(evArg);
    }
}

function onKeyUpEvent(ev) {
    if (!AuthKeyboardService.active) {
        return;
    }

    if (JobsAuthUI.visible) {
        consumeEvent(ev);
    }

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    var keyArg = extractKeyArg(args);

    if (
        matchesKey(keyArg, "SDLK_LSHIFT", 304) ||
        matchesKey(keyArg, "SDLK_RSHIFT", 303) ||
        matchesKey(keyArg, "SHIFT", 16)
    ) {
        AuthKeyboardService.shiftDown = false;
    }
}

function onCharacterEvent(ev, ch) {
    if (!JobsAuthUI.visible || JobsAuthUI.waitingTokenAck) {
        return;
    }
    if (JobsAuthUI.useMexui) {
        return;
    }
    if (typeof chatInputEnabled !== "undefined" && chatInputEnabled) {
        return;
    }

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    var character = extractCharArg(args);
    if (!character) {
        return;
    }
    if (isInjectedCharDuplicate(character)) {
        return;
    }

    appendChar(character);
    consumeEvent(ev);
}

function onCursorMoveEvent(ev, x, y) {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    var pos = extractCursorPos(args);
    if (pos) {
        JobsAuthUI.cursorX = pos.x;
        JobsAuthUI.cursorY = pos.y;
    }
}

function onCursorDownEvent(ev, x, y) {
    if (!JobsAuthUI.visible) {
        return;
    }

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    var pos = extractCursorPos(args);
    if (pos) {
        JobsAuthUI.cursorX = pos.x;
        JobsAuthUI.cursorY = pos.y;
    }

    if (isCursorInside(JobsAuthUI.toggleButton)) {
        toggleMode();
        consumeEvent(ev);
    }
    
    // Check forgot password button click
    console.log("[Debug] Checking forgot button click...");
    console.log("[Debug] forgotButton exists: " + (JobsAuthUI.forgotButton ? "yes" : "no"));
    console.log("[Debug] cursor position: " + (JobsAuthUI.cursorX || 0) + ", " + (JobsAuthUI.cursorY || 0));
    
    if (JobsAuthUI.forgotButton && isCursorInside(JobsAuthUI.forgotButton)) {
        console.log("[Debug] Forgot button clicked!");
        if (typeof triggerNetworkEvent === "function") {
            triggerNetworkEvent("jobs.authForgotPassword");
            console.log("[Auth] Password reset requested from UI");
            setStatus("Sending password reset request...", "info");
        } else {
            console.log("[Debug] triggerNetworkEvent not available!");
        }
        consumeEvent(ev);
    } else {
        console.log("[Debug] Forgot button not clicked or not initialized");
    }
}

function attachRuntimeHandlers() {
    JobsAuthUI.drawEventName = attachFirstHandler(
        ["OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", "OnRender", "onRender"],
        onDrawEvent
    );
    JobsAuthUI.keyDownEventName = attachFirstHandler(["OnKeyDown", "onKeyDown"], onKeyDownEvent);
    JobsAuthUI.keyUpEventName = attachFirstHandler(["OnKeyUp", "onKeyUp"], onKeyUpEvent);
    JobsAuthUI.charEventName = attachFirstHandler(["OnCharacter", "onCharacter"], onCharacterEvent);
    JobsAuthUI.cursorMoveEventName = attachFirstHandler(["OnCursorMove", "onCursorMove"], onCursorMoveEvent);
    JobsAuthUI.cursorDownEventName = attachFirstHandler(["OnCursorDown", "onCursorDown"], onCursorDownEvent);

    if (JobsAuthUI.drawEventName !== "") {
        sendDiag("auth_ui.hook", "draw hook active: " + JobsAuthUI.drawEventName, true);
    } else {
        sendDiag("auth_ui.hook", "draw hook unavailable", true);
    }

    if (JobsAuthUI.keyDownEventName !== "") {
        sendDiag("auth_ui.input", "keydown hook active: " + JobsAuthUI.keyDownEventName, true);
    } else {
        sendDiag("auth_ui.input", "keydown hook unavailable; background keys may leak", true);
    }

    if (JobsAuthUI.charEventName !== "") {
        sendDiag("auth_ui.input", "character hook active: " + JobsAuthUI.charEventName, true);
    } else {
        sendDiag("auth_ui.input", "character hook unavailable; relying on key bindings", true);
    }
}

function detachRuntimeHandlers() {
    detachHandler(JobsAuthUI.drawEventName, onDrawEvent);
    detachHandler(JobsAuthUI.keyDownEventName, onKeyDownEvent);
    detachHandler(JobsAuthUI.keyUpEventName, onKeyUpEvent);
    detachHandler(JobsAuthUI.charEventName, onCharacterEvent);
    detachHandler(JobsAuthUI.cursorMoveEventName, onCursorMoveEvent);
    detachHandler(JobsAuthUI.cursorDownEventName, onCursorDownEvent);

    JobsAuthUI.drawEventName = "";
    JobsAuthUI.keyDownEventName = "";
    JobsAuthUI.keyUpEventName = "";
    JobsAuthUI.charEventName = "";
    JobsAuthUI.cursorMoveEventName = "";
    JobsAuthUI.cursorDownEventName = "";
}

function onResourceStartInternal(ev, res) {
    if (typeof thisResource !== "undefined" && res !== thisResource) {
        return;
    }

    if (JobsAuthUI.started) {
        return;
    }
    JobsAuthUI.started = true;

    // Force UI initialization
    sendDiag("auth_ui.start", "resource starting - initializing UI", true);

    var mexuiReady = initMexuiAuthUI();
    if (!mexuiReady) {
        ensureFont();
        startAuthKeyboardService();
        if (typeof KeyboardService !== "undefined" && KeyboardService && typeof KeyboardService.setConfig === "function") {
            KeyboardService.setConfig({
                isActive: function() {
                    return canCaptureInput() && !JobsAuthUI.waitingTokenAck;
                },
                appendChar: function(ch) {
                    if (!ch) {
                        return;
                    }
                    if (isInjectedCharDuplicate(ch)) {
                        return;
                    }
                    appendChar(ch);
                    rememberInjectedChar(ch);
                },
                deleteChar: function() {
                    if (!JobsAuthUI.waitingTokenAck) {
                        deleteLastChar();
                    }
                },
                spaceChar: function() {
                    appendChar(" ");
                }
            });
        }
        attachRuntimeHandlers();

        if (typeof setInterval === "function") {
            JobsAuthUI.blinkTimer = setInterval(function() {
                JobsAuthUI.cursorBlink = !JobsAuthUI.cursorBlink;
            }, 530);
        } else {
            JobsAuthUI.blinkTimer = null;
            sendDiag("auth_ui.hook", "setInterval unavailable", true);
        }
    }

    sendServer("jobs.authRequestState");

    // Bootstrap fallback: keep panel visible until first auth state arrives.
    JobsAuthUI.authState.authRequired = true;
    JobsAuthUI.authState.authenticated = false;
    var restored = false;
    try {
        if (typeof localPlayer !== "undefined" && localPlayer && typeof localPlayer.getData === "function") {
            var savedMode = localPlayer.getData("jobs.auth.lastMode");
            if (savedMode === "register" || savedMode === "login") {
                setMode(savedMode);
                restored = true;
            }
        }
    } catch (eGet) {
        sendDiag("auth_ui.start", "failed to restore mode: " + String(eGet), false);
    }
    if (!restored && JobsAuthUI.lastMode) {
        setMode(JobsAuthUI.lastMode);
    }
    setStatus("Waiting for auth state...", "info");
    setVisible(true);
    sendDiag("auth_ui.state", "bootstrap visible pending authState", true);
}

function onResourceStopInternal(ev, res) {
    if (typeof thisResource !== "undefined" && res !== thisResource) {
        return;
    }

    if (!JobsAuthUI.started) {
        return;
    }

    if (JobsAuthUI.blinkTimer) {
        clearInterval(JobsAuthUI.blinkTimer);
        JobsAuthUI.blinkTimer = null;
    }

    if (!JobsAuthUI.useMexui) {
        detachRuntimeHandlers();
        stopAuthKeyboardService();
        if (typeof KeyboardService !== "undefined" && KeyboardService && typeof KeyboardService.setConfig === "function") {
            KeyboardService.setConfig(null);
        }
    } else {
        try {
            if (JobsAuthUI.mexuiWindow) {
                JobsAuthUI.mexuiWindow.shown = false;
            }
            var ui = getJobsRpUi();
            if (ui && typeof ui.setInput === "function") {
                ui.setInput(false);
            }
        } catch (e) {
        }
    }
    setVisible(false);
    JobsAuthUI.started = false;
}

attachFirstHandler(["OnResourceStart", "onResourceStart"], onResourceStartInternal);
attachFirstHandler(["OnResourceStop", "onResourceStop"], onResourceStopInternal);

addNetworkHandler("jobs.authState", function() {
    onAuthState.apply(null, arguments);
});

addNetworkHandler("jobs.authResult", function() {
    onAuthResult.apply(null, arguments);
});

addNetworkHandler("jobs.authTokenIssued", function() {
    onTokenIssued.apply(null, arguments);
});

addNetworkHandler("jobs.authDebugUI", function() {
    var forceShow = arguments[0];
    if (forceShow === true || forceShow === false) {
        JobsAuthUI.debugForceShow = forceShow;
        setVisible(shouldShow());
        sendDiag("auth_ui.debug", "debugForceShow set to " + String(forceShow), true);
    }
});

// Forgot password command
if (typeof addCommandHandler === "function") {
    addCommandHandler("forgotpass", function() {
        if (typeof triggerNetworkEvent === "function") {
            triggerNetworkEvent("jobs.authForgotPassword");
            console.log("[Auth] Password reset requested");
        }
    });
}

// Handle forgot password result from server
addNetworkHandler("jobs.authForgotPasswordResult", function() {
    var success = arguments[0];
    var message = arguments[1];
    
    if (success) {
        setStatus("Password reset code sent! Check your API.", "success");
        console.log("[Auth] Password reset successful: " + message);
    } else {
        setStatus("Password reset failed: " + message, "error");
        console.log("[Auth] Password reset failed: " + message);
    }
});
