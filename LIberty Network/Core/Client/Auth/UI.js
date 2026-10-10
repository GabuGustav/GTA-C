"use strict";
/*
 * Liberty Network - Login/Register UI (LN.AuthUI)
 *
 * A lean, self-contained on-screen authentication panel. Players can't spawn
 * until they are authenticated (server keeps them unspawned/faded), so this is
 * the front door. Uses the proven rendering technique from jobs_rp's auth_ui:
 *   - rects: natives.drawRect / gta.drawRectangle (normalized center coords)
 *   - text:  lucasFont.createDefaultFont().render OR gta.drawText (pixel-space)
 *            OR natives.displayTextWithLiteralString
 *
 * Network contract (this GTAC build CANNOT marshal JS objects as event args):
 *   submit -> triggerNetworkEvent("ln:register", user, pass, email)
 *          -> triggerNetworkEvent("ln:login", user, pass)
 *   receive (positional): ln:authState(authed, accountId, json)
 *                          ln:authResult(action, ok, accountId, refreshToken, json)
 *                          ln:authError(code, message, lockRemaining)
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var UI = (LN.AuthUI = LN.AuthUI || {});

	// ---- state ----
	UI.state = {
		visible: false,
		mode: "login",           // "login" | "register"
		username: "",
		password: "",
		email: "",
		activeField: 0,          // 0=username, 1=password, 2=email
		status: "",
		statusLevel: "info"      // info | ok | error
	};

	var events = { draw: "", keyDown: "", character: "", cursorDown: "" };
	var font = null;
	var fontTried = false;

	// ---- colors ----
	var COL = {
		OVERLAY: [0, 0, 0, 210],
		PANEL: [22, 33, 62, 255],
		PANEL_INNER: [41, 50, 65, 255],
		TITLE: [255, 255, 255, 255],
		LABEL: [190, 200, 215, 255],
		TEXT: [255, 255, 255, 255],
		INPUT_BG: [15, 52, 96, 255],
		INPUT_ACTIVE: [70, 90, 140, 255],
		BUTTON: [233, 69, 96, 255],
		BUTTON_HOVER: [255, 107, 107, 255],
		BUTTON2: [50, 90, 150, 255],
		OK: [0, 214, 143, 255],
		ERR: [231, 76, 60, 255]
	};

	function log(msg) { try { console.log("[LN:AuthUI] " + msg); } catch (e) {} }

	// ---- Vec2 may or may not exist; provide a safe factory ----
	function v2(x, y) {
		if (typeof Vec2 !== "undefined") { try { return new Vec2(x, y); } catch (e) {} }
		return { x: x, y: y };
	}

	// ---- screen size ----
	function getScreen() {
		var w = 1280, h = 720;
		try { if (typeof game !== "undefined" && game && game.width) w = Number(game.width) || w; } catch (e) {}
		try { if (typeof game !== "undefined" && game && game.height) h = Number(game.height) || h; } catch (e) {}
		try { if (typeof gta !== "undefined" && gta && gta.width) w = Number(gta.width) || w; } catch (e) {}
		try { if (typeof gta !== "undefined" && gta && gta.height) h = Number(gta.height) || h; } catch (e) {}
		return { width: w, height: h };
	}

	// ---- rect (normalized center coords) ----
	function drawRectNorm(cx, cy, w, h, rgba) {
		if (typeof natives !== "undefined" && natives && typeof natives.drawRect === "function") {
			try { natives.drawRect(v2(cx, cy), v2(w, h), rgba[0], rgba[1], rgba[2], rgba[3]); return true; } catch (e) {}
		}
		if (typeof gta !== "undefined" && gta && typeof gta.drawRectangle === "function") {
			try { gta.drawRectangle(cx, cy, w, h, rgba[0], rgba[1], rgba[2], rgba[3]); return true; } catch (e) {}
			try { gta.drawRectangle(v2(cx, cy), v2(w, h), rgba[0], rgba[1], rgba[2], rgba[3]); return true; } catch (e) {}
		}
		return false;
	}

	// ---- font ----
function getFontApi() {
try {
if (typeof globalThis !== "undefined" && globalThis && globalThis.lucasFont) return globalThis.lucasFont;
if (typeof globalThis !== "undefined" && globalThis && globalThis.LucasFont) return globalThis.LucasFont;
} catch (e) {}
try { if (typeof lucasFont !== "undefined" && lucasFont) return lucasFont; } catch (e) {}
try { if (typeof LucasFont !== "undefined" && LucasFont) return LucasFont; } catch (e) {}
return null;
}

function ensureFont() {
if (font || fontTried) return font != null;
fontTried = true;
try {
var api = getFontApi();
if (!api || typeof api.createDefaultFont !== "function") return false;
font = api.createDefaultFont(28);
if (font && font.render) return true;
font = null;
} catch (e) { font = null; }
return font != null;
}

function colourToHex(rgb) {
var r = rgb[0] & 0xff, g = rgb[1] & 0xff, b = rgb[2] & 0xff, a = (rgb.length > 3) ? (rgb[3] & 0xff) : 255;
return (((a << 24) >>> 0) | (r << 16) | (g << 8) | b) >>> 0;
}

function colourToRgba(hex) {
hex = (hex >>> 0);
return { r: (hex >>> 16) & 255, g: (hex >>> 8) & 255, b: hex & 255, a: (hex >>> 24) & 255 };
}

// ---- text renderers (faithful port of jobs_rp auth_ui) ----
function tryGtaDrawText(message, x, y, colourHex) {
try {
if (!(typeof gta !== "undefined" && gta && gta.drawText)) return false;
var fontValue = 0;
try { if (typeof GTAFont !== "undefined" && GTAFont && typeof GTAFont.BANK !== "undefined") fontValue = GTAFont.BANK; } catch (e) {}
var alignValue = 0;
try { if (typeof GTATextAlignment !== "undefined" && GTATextAlignment && typeof GTATextAlignment.LEFT !== "undefined") alignValue = GTATextAlignment.LEFT; } catch (e) {}
var shadowValue = 0;
try { if (typeof GTAShadow !== "undefined" && GTAShadow && typeof GTAShadow.DROP !== "undefined") shadowValue = GTAShadow.DROP; } catch (e) {}
var res = gta.drawText(message, new Vec2(x, y), new Vec2(1024.0, 24.0), 1.0, fontValue, alignValue, 1.0, colourHex, colourHex, false, shadowValue);
if (res !== false) return true;
} catch (e) {}
return false;
}

function tryNativeLiteralText(message, x, y, colourHex) {
if (!(typeof natives !== "undefined" && natives && natives.displayTextWithLiteralString)) return false;
var screen = getScreen();
if (screen.width <= 0 || screen.height <= 0) return false;
var nx = x / screen.width;
var ny = y / screen.height;
var rgba = colourToRgba(colourHex);
try { if (natives.setTextScale) natives.setTextScale(0.30, 0.30); } catch (e) {}
try { if (natives.setTextFont) natives.setTextFont(0); } catch (e) {}
try { if (natives.setTextColour) natives.setTextColour(rgba.r, rgba.g, rgba.b, rgba.a); } catch (e) {}
try { if (natives.setTextCentre) natives.setTextCentre(false); } catch (e) {}
try { if (natives.setTextProportional) natives.setTextProportional(true); } catch (e) {}
try { if (natives.setTextDropshadow) natives.setTextDropshadow(true, 0, 0, 0, 255); } catch (e) {}
try {
var r1 = natives.displayTextWithLiteralString(new Vec2(nx, ny), "STRING", message);
if (r1 !== false) return true;
} catch (e) {}
try {
var r2 = natives.displayTextWithLiteralString(nx, ny, "STRING", message);
if (r2 !== false) return true;
} catch (e) {}
return false;
}

// main text dispatcher. x,y in PIXELS.
function renderTextPx(msg, x, y, size, colourHex) {
msg = String(msg == null ? "" : msg);
if (msg === "") return true;
if (ensureFont() && font && font.render) {
try {
var r = font.render(msg, new Vec2(x, y), 1, 0, 0.1, size, colourHex, false, true, false, false);
if (r !== false) return true;
} catch (e) {}
try {
var r2 = font.render.call(font, msg, new Vec2(x, y), 1, 0, 0.1, size, colourHex, false, true, false, false);
if (r2 !== false) return true;
} catch (e) {}
}
if (tryGtaDrawText(msg, x, y, colourHex)) return true;
if (tryNativeLiteralText(msg, x, y, colourHex)) return true;
return false;
}

// public text helper: normalized (0..1) -> pixels.
function writeText(nx, ny, scale, msg, rgb) {
var s = getScreen();
var px = (typeof theme !== "undefined" ? 0 : nx) * s.width;
var py = ny * s.height;
var size = 0.5 + (scale * 1.0);
return renderTextPx(msg, px, py, size, colourToHex(rgb));
}
// Public shared text renderer for other client UIs (e.g. the admin panel).
// x/y in pixels, size is the font render size, rgb = [r,g,b,a].
// Returns true when some renderer accepted the text.
UI.drawTextPx = function (msg, x, y, size, rgb) {
return renderTextPx(msg, x, y, size, colourToHex(rgb || [255, 255, 255, 255]));
};
// ---- layout (normalized) ----
	UI.layout = {
		panel: { cx: 0.5, cy: 0.45, w: 0.44, h: 0.60 },
		title: { x: 0.5, y: 0.20, s: 0.68 },
		status: { x: 0.5, y: 0.30, s: 0.4 },
		field1: { cx: 0.5, cy: 0.39, w: 0.34, h: 0.055 },
		field2: { cx: 0.5, cy: 0.48, w: 0.34, h: 0.055 },
		field3: { cx: 0.5, cy: 0.57, w: 0.34, h: 0.055 },
		toggle: { cx: 0.5, cy: 0.63, w: 0.24, h: 0.045 },
		button: { cx: 0.5, cy: 0.69, w: 0.22, h: 0.055 }
	};

	function drawField(rect, label, value, masked, active) {
		writeText(rect.cx, rect.cy - rect.h - 0.012, 0.28, label, COL.LABEL);
		drawRectNorm(rect.cx, rect.cy, rect.w, rect.h, active ? COL.INPUT_ACTIVE : COL.INPUT_BG);
		var shown = masked ? String(value || "").replace(/./g, "*") : String(value || "");
		writeText(rect.cx, rect.cy - 0.012, 0.34, shown || "\u00A0", COL.TEXT);
	}

	function drawButton(rect, label, hover) {
		var col = hover ? COL.BUTTON_HOVER : COL.BUTTON;
		drawRectNorm(rect.cx, rect.cy, rect.w, rect.h, col);
		writeText(rect.cx, rect.cy - 0.012, 0.36, label, COL.TEXT);
	}

	function rectHits(rect, mx, my) {
		return mx >= rect.cx - rect.w / 2 && mx <= rect.cx + rect.w / 2 &&
			my >= rect.cy - rect.h / 2 && my <= rect.cy + rect.h / 2;
	}

	function cursorNorm() {
		try {
			if (typeof gui !== "undefined" && gui && typeof gui.cursorPosition === "function") {
				var p = gui.cursorPosition();
				if (p && typeof p.x === "number" && typeof p.y === "number") {
					var s = getScreen();
					return { x: s.width ? p.x / s.width : 0.5, y: s.height ? p.y / s.height : 0.5 };
				}
			}
		} catch (e) {}
		return { x: 0.5, y: 0.5 };
	}

	function draw() {
		if (!UI.state.visible) return;
		var L = UI.layout;
		var cur = cursorNorm();

		drawRectNorm(0.5, 0.5, 1, 1, COL.OVERLAY);
		drawRectNorm(L.panel.cx, L.panel.cy, L.panel.w + 0.012, L.panel.h + 0.012, [0, 0, 0, 220]);
		drawRectNorm(L.panel.cx, L.panel.cy, L.panel.w, L.panel.h, COL.PANEL);
		drawRectNorm(L.panel.cx, L.panel.cy, L.panel.w - 0.01, L.panel.h - 0.01, COL.PANEL_INNER);

		var title = UI.state.mode === "login" ? "LIBERTY NETWORK  -  SIGN IN" : "LIBERTY NETWORK  -  REGISTER";
		writeText(L.title.x, L.title.y, L.title.s, title, COL.TITLE);

		drawField(L.field1, "Username", UI.state.username, false, UI.state.activeField === 0);
		drawField(L.field2, "Password", UI.state.password, true, UI.state.activeField === 1);
		if (UI.state.mode === "register") {
			drawField(L.field3, "Email (optional)", UI.state.email, false, UI.state.activeField === 2);
		}

		var toggleHover = rectHits(L.toggle, cur.x, cur.y);
		var toggleLabel = UI.state.mode === "login" ? "No account? Register" : "Have an account? Login";
		drawRectNorm(L.toggle.cx, L.toggle.cy, L.toggle.w, L.toggle.h, toggleHover ? [70, 110, 170, 255] : COL.BUTTON2);
		writeText(L.toggle.cx, L.toggle.cy - 0.012, 0.32, toggleLabel, COL.TEXT);

		var btnHover = rectHits(L.button, cur.x, cur.y);
		drawButton(L.button, UI.state.mode === "login" ? "SIGN IN" : "CREATE ACCOUNT", btnHover);

		if (UI.state.status) {
			var col = UI.state.statusLevel === "ok" ? COL.OK : (UI.state.statusLevel === "error" ? COL.ERR : COL.LABEL);
			writeText(L.status.x, L.status.y, L.status.s, UI.state.status, col);
		}

		writeText(0.5, 0.76, 0.32, "Tab = switch   Enter = submit   Esc = close", COL.LABEL);
	}

	function setStatus(text, level) {
		UI.state.status = text || "";
		UI.state.statusLevel = level || "info";
	}

	// ---- camera/gameplay control while the modal is open ----
	function setCameraLocked(locked) {
		if (typeof natives !== "undefined" && natives) {
			try { if (natives.setGameCamControlsEnabled) natives.setGameCamControlsEnabled(!locked); } catch (e) {}
			try { if (natives.setPlayerControl && typeof natives.setPlayerControl === "function") natives.setPlayerControl(!!locked === false); } catch (e) {}
			try { if (natives.disableControlAction) natives.disableControlAction(0, 0, locked); } catch (e) {}
		}
	}

	function show() {
		UI.state.visible = true;
		UI.state.activeField = 0;
		try { if (typeof gui !== "undefined" && gui && typeof gui.showCursor === "function") gui.showCursor(true); } catch (e) {}
		try { if (typeof gui !== "undefined" && gui && typeof gui.showInput === "function") gui.showInput(true); } catch (e) {}
		setCameraLocked(true);
	}

	function hide() {
		UI.state.visible = false;
		try { if (typeof gui !== "undefined" && gui && typeof gui.showCursor === "function") gui.showCursor(false); } catch (e) {}
		try { if (typeof gui !== "undefined" && gui && typeof gui.showInput === "function") gui.showInput(false); } catch (e) {}
		setCameraLocked(false);
	}

	UI.show = show;
	UI.hide = hide;
	UI.setVisible = function (v) { if (v) show(); else hide(); };

	// ---- input ----
	function cycleField(dir) {
		var max = UI.state.mode === "register" ? 2 : 1;
		UI.state.activeField = (UI.state.activeField + dir + max + 1) % (max + 1);
	}

	function handleChar(ch) {
		if (!UI.state.visible || !ch) return;
		if (ch.length > 1) ch = ch[0];
		var f = UI.state.activeField;
		if (f === 0) { if (UI.state.username.length < 32) UI.state.username += ch; }
		else if (f === 1) { if (UI.state.password.length < 128) UI.state.password += ch; }
		else if (f === 2) { if (UI.state.email.length < 128) UI.state.email += ch; }
	}

	function backspace() {
		var f = UI.state.activeField;
		if (f === 0) UI.state.username = UI.state.username.slice(0, -1);
		else if (f === 1) UI.state.password = UI.state.password.slice(0, -1);
		else if (f === 2) UI.state.email = UI.state.email.slice(0, -1);
	}

	function submit() {
		// Trim username/email; password kept verbatim.
		var user = UI.state.username.trim();
		if (!user || !UI.state.password) {
			setStatus("Enter a username and password.", "error");
			return;
		}
		if (UI.state.mode === "login") {
			triggerNetworkEvent("ln:login", user, UI.state.password);
			setStatus("Signing in...", "info");
		} else {
			triggerNetworkEvent("ln:register", user, UI.state.password, UI.state.email.trim());
			setStatus("Creating account...", "info");
		}
	}

	function toggleMode() {
		UI.state.mode = (UI.state.mode === "login") ? "register" : "login";
		UI.state.activeField = 0;
		UI.state.status = "";
	}

	function onKeyDown(key) {
		if (!UI.state.visible) return;
		if (key === 0x1B || key === "esc" || key === "escape" || key === "BACK") { hide(); return; }
		if (key === 0x09 || key === "tab" || key === "TAB" || key === "Tab") { cycleField(1); return; }
		if (key === 0x0D || key === 0x0A || key === "return" || key === "enter" || key === "RETURN" || key === "Enter") { submit(); return; }
		if (key === 0x08 || key === "backspace" || key === "BACKSPACE" || key === "Backspace") { backspace(); return; }
	}

	function onCursorDown(x, y) {
		if (!UI.state.visible) return;
		var s = getScreen();
		var nx = s.width ? x / s.width : 0.5;
		var ny = s.height ? y / s.height : 0.5;
		var L = UI.layout;
		// click fields to focus
		if (rectHits(L.field1, nx, ny)) { UI.state.activeField = 0; return; }
		if (rectHits(L.field2, nx, ny)) { UI.state.activeField = 1; return; }
		if (UI.state.mode === "register" && rectHits(L.field3, nx, ny)) { UI.state.activeField = 2; return; }
		if (rectHits(L.toggle, nx, ny)) { toggleMode(); return; }
		if (rectHits(L.button, nx, ny)) { submit(); return; }
	}

	// ---- lifecycle ----
	function attachFirst(candidates, callback) {
		for (var i = 0; i < candidates.length; i++) {
			try { if (typeof addEventHandler === "function") { addEventHandler(candidates[i], callback); return candidates[i]; } } catch (e) {}
		}
		return "";
	}

	UI.init = function () {
		if (UI.initialized) return;
		UI.initialized = true;

		// Draw: try the widest set of render events across builds.
		events.draw = attachFirst(["OnDrawnHUD", "OnDrawHUD", "OnBeforeDrawHUD", "OnPostRender2D", "OnPreRender", "OnRender", "onRender"], function () {
			draw();
		});

		events.keyDown = attachFirst(["OnKeyDown", "onKeyDown"], function (event, key) {
			onKeyDown(key);
		});
		events.character = attachFirst(["OnCharacter", "onCharacter"], function (event, ch) {
			handleChar(ch);
		});
		events.cursorDown = attachFirst(["OnCursorDown", "onCursorDown"], function (event, x, y) {
			onCursorDown(x, y);
		});

		try {
			if (typeof bindKey === "function") {
				bindKey(0x09, "down", function () { cycleField(1); });
				bindKey(0x1B, "down", function () { hide(); });
				bindKey(0x0D, "down", function () { submit(); });
			}
		} catch (e) {}

		// Auth network state (positional primitives).
		try { addNetworkHandler("ln:authState", function () {
			var authed = arguments[0] === "1" || arguments[0] === true;
			if (authed) hide();
		}); } catch (e) {}

		try { addNetworkHandler("ln:authResult", function () {
			var action = arguments[0] || "";
			var ok = arguments[1] === "1" || arguments[1] === true;
			if (ok) {
				if (action === "login") setStatus("Signed in!", "ok");
				else if (action === "register") setStatus("Account created!", "ok");
				else if (action === "refresh") setStatus("Restored session", "ok");
			}
		}); } catch (e) {}

		try { addNetworkHandler("ln:authError", function () {
			var code = arguments[0] || "";
			var message = arguments[1] || "";
			setStatus(message || code, "error");
		}); } catch (e) {}

		// If a stored session token exists, the server auto-restore (ln:refresh)
		// will hide the panel once it confirms; otherwise show the panel.
		show();
	};

	// Test hooks (underscore-prefixed; harmless in production).
	UI._test = {
		submit: submit, onKeyDown: onKeyDown, onCursorDown: onCursorDown,
		toggleMode: toggleMode, handleChar: handleChar, backspace: backspace,
		cycleField: cycleField, renderTextPx: renderTextPx, drawRectNorm: drawRectNorm
	};

})(typeof globalThis !== "undefined" ? globalThis : this);