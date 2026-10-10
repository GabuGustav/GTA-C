"use strict";
/* LN.AdminPanel part 1: state, draw helpers, show/hide/toggle. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var P = (LN.AdminPanel = LN.AdminPanel || {});

	P.state = {
		visible: false, staff: false, level: 0,
		tab: 0, sel: 0, actSel: 0, confirm: null,
		reason: "", reasonMode: false,
		roster: [], status: ""
	};
	P.TABS = ["Players", "Bans", "Server"];
	P.ACTIONS = ["Kick", "Tempban 60m", "Ban", "Mute 30m", "Warn"];

	P.F10 = 291; P.F10_ALT = 1073741891;
	P.ESC = 0x1B; P.ENTER = 0x0D; P.BACK = 0x08;
	P.UP = 0x26; P.DOWN = 0x28; P.LEFT = 0x25; P.RIGHT = 0x27;

	var font = null;

	function v2(x, y) {
		if (typeof Vec2 !== "undefined") { try { return new Vec2(x, y); } catch (e) {} }
		return { x: x, y: y };
	}

	P.rect = function (cx, cy, w, h, c) {
		try {
			if (typeof natives !== "undefined" && natives && typeof natives.drawRect === "function") {
				natives.drawRect(v2(cx, cy), v2(w, h), c[0], c[1], c[2], c[3]);
				return;
			}
		} catch (e) {}
		try {
			if (typeof gta !== "undefined" && gta && typeof gta.drawRectangle === "function") {
				gta.drawRectangle(cx, cy, w, h, c[0], c[1], c[2], c[3]);
			}
		} catch (e2) {}
	};

	function getFont() {
		if (font) return font;
		try {
			if (typeof lucasFont !== "undefined" && lucasFont && typeof lucasFont.createDefaultFont === "function") {
				try { font = lucasFont.createDefaultFont(28); } catch (e0) { font = null; }
				if (!font) { try { font = lucasFont.createDefaultFont(); } catch (e1) { font = null; } }
				return font;
			}
		} catch (e) {}
		return null;
	}

	// Text goes through the Auth UI's proven renderer chain
	// (lucasFont -> gta.drawText -> natives.displayTextWithLiteralString),
	// converting rgba -> hex and mapping panel scale -> render size.
	// The old direct call passed size=0 and an rgba array where a hex int is
	// expected, which rendered nothing (silently swallowed by try/catch).
	var textDiagDone = false;
	P.text = function (str, x, y, scale, col) {
		var w = 1280, h = 720;
		try { if (typeof game !== "undefined" && game) { w = game.width || w; h = game.height || h; } } catch (e) {}
		var msg = String(str == null ? "" : str);
		if (!msg) return;
		var px = x * w, py = y * h;
		var size = 0.5 + ((scale || 0.45) * 1.0);
		var rgb = col || [255, 255, 255, 255];
		var ok = false;
		var via = "local";
		try {
			if (LN.AuthUI && typeof LN.AuthUI.drawTextPx === "function") {
				ok = LN.AuthUI.drawTextPx(msg, px, py, size, rgb) !== false;
				via = "shared(LN.AuthUI)";
			}
		} catch (e2) {}
		if (!ok) { ok = localText(msg, px, py, size, rgb); via = "local"; }
		if (!textDiagDone) {
			textDiagDone = true;
			try {
				console.log("[AdminPanel] text renderer " + (ok ? "active via " + via : "FAILED (all renderers unavailable)"));
			} catch (e3) {}
		}
	};

	// Fallback chain: faithful port of Auth/UI.js renderTextPx so the panel
	// can never regress to "boxes only" if the shared module is absent.
	function toHex(rgb) {
		rgb = rgb || [255, 255, 255, 255];
		var r = rgb[0] & 0xff, g = rgb[1] & 0xff, b = rgb[2] & 0xff;
		var a = rgb.length > 3 ? (rgb[3] & 0xff) : 255;
		return (((a << 24) >>> 0) | (r << 16) | (g << 8) | b) >>> 0;
	}

	function localText(msg, px, py, size, rgb) {
		var hex = toHex(rgb);
		var f = getFont();
		if (f && typeof f.render === "function") {
			try {
				var r = f.render(msg, v2(px, py), 1, 0, 0.1, size, hex, false, true, false, false);
				if (r !== false) return true;
			} catch (e) {}
		}
		try {
			if (typeof gta !== "undefined" && gta && typeof gta.drawText === "function") {
				var fontValue = 0, alignValue = 0, shadowValue = 0;
				try { if (typeof GTAFont !== "undefined" && GTAFont && GTAFont.BANK !== undefined) fontValue = GTAFont.BANK; } catch (e1) {}
				try { if (typeof GTATextAlignment !== "undefined" && GTATextAlignment && GTATextAlignment.LEFT !== undefined) alignValue = GTATextAlignment.LEFT; } catch (e2) {}
				try { if (typeof GTAShadow !== "undefined" && GTAShadow && GTAShadow.DROP !== undefined) shadowValue = GTAShadow.DROP; } catch (e3) {}
				var r2 = gta.drawText(msg, v2(px, py), v2(1024.0, 24.0), 1.0, fontValue, alignValue, 1.0, hex, hex, false, shadowValue);
				if (r2 !== false) return true;
			}
		} catch (e4) {}
		try {
			if (typeof natives !== "undefined" && natives && typeof natives.displayTextWithLiteralString === "function") {
				var screenW = 1280, screenH = 720;
				try { if (typeof game !== "undefined" && game && game.width) { screenW = game.width; screenH = game.height; } } catch (e5) {}
				var nx = px / screenW, ny = py / screenH;
				try { if (natives.setTextScale) natives.setTextScale(0.30, 0.30); } catch (e6) {}
				try { if (natives.setTextFont) natives.setTextFont(0); } catch (e7) {}
				try { if (natives.setTextColour) natives.setTextColour((hex >>> 16) & 255, (hex >>> 8) & 255, hex & 255, (hex >>> 24) & 255); } catch (e8) {}
				try { if (natives.setTextCentre) natives.setTextCentre(false); } catch (e9) {}
				try { if (natives.setTextProportional) natives.setTextProportional(true); } catch (e10) {}
				try { if (natives.setTextDropshadow) natives.setTextDropshadow(true, 0, 0, 0, 255); } catch (e11) {}
				try {
					var r3 = natives.displayTextWithLiteralString(v2(nx, ny), "STRING", msg);
					if (r3 !== false) return true;
				} catch (e12) {}
				try {
					var r4 = natives.displayTextWithLiteralString(nx, ny, "STRING", msg);
					if (r4 !== false) return true;
				} catch (e13) {}
			}
		} catch (e14) {}
		return false;
	}

	function cursor(on) {
		try { if (typeof gui !== "undefined" && gui && typeof gui.showCursor === "function") gui.showCursor(on); } catch (e) {}
		try { if (typeof gui !== "undefined" && gui && typeof gui.showInput === "function") gui.showInput(on); } catch (e2) {}
	}

	function send(name) {
		var args = Array.prototype.slice.call(arguments, 1);
		try { triggerNetworkEvent.apply(null, [name].concat(args)); } catch (e) {}
	}
	P.send = send;

	P.show = function () {
		if (!P.state.staff) { P.state.status = "No permission."; return; }
		P.state.visible = true;
		P.state.sel = 0; P.state.confirm = null; P.state.reasonMode = false; P.state.reason = "";
		cursor(true);
		send("ln:adminList");
	};

	P.hide = function () {
		P.state.visible = false;
		P.state.confirm = null; P.state.reasonMode = false;
		cursor(false);
	};

	P.toggle = function () {
		if (P.state.visible) P.hide();
		else P.show();
	};

	P.rows = function () {
		if (P.state.tab === 0) return P.state.roster;
		return [{ name: "Announce", hint: "via /aannounce" }, { name: "Scripts", hint: "via /ascripts" }];
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
