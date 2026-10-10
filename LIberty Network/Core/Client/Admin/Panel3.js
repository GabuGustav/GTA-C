"use strict";
/* LN.AdminPanel part 2b: keyboard + mouse + init. Needs Panel/Panel2. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var P = root.LN.AdminPanel;

	function normKey(key) {
		if (typeof key !== "string") return key;
		var s = key.toLowerCase();
		if (s === "f10" || s === "sdlk_f10") return P.F10;
		if (s === "escape" || s === "esc") return P.ESC;
		if (s === "enter" || s === "return") return P.ENTER;
		if (s === "backspace") return P.BACK;
		if (s === "up") return P.UP;
		if (s === "down") return P.DOWN;
		if (s === "left") return P.LEFT;
		if (s === "right") return P.RIGHT;
		return -1;
	}

	P.onKeyDown = function (key) {
		var k = normKey(key);
		// F10 only: SDL code 291 (alt 1073741891) on this GTAC build.
		// 0x79 removed: it equals ASCII 'y', which wrongly opened the panel.
		if (k === P.F10 || k === P.F10_ALT) { P.toggle(); return; }
		if (!P.state.visible) return;
		if (k === P.ESC) {
			if (P.state.confirm) { P.state.confirm = null; P.state.reasonMode = false; }
			else P.hide();
			return;
		}
		if (P.state.reasonMode) {
			if (k === P.ENTER) { P.doConfirm(); return; }
			if (k === P.BACK) { P.state.reason = P.state.reason.slice(0, -1); return; }
			return;
		}
		if (k === P.UP) { P.state.sel--; if (P.state.sel < 0) P.state.sel = 0; return; }
		if (k === P.DOWN) { P.state.sel++; return; }
		if (k === P.LEFT) { P.state.tab = (P.state.tab + P.TABS.length - 1) % P.TABS.length; P.state.sel = 0; return; }
		if (k === P.RIGHT) { P.state.tab = (P.state.tab + 1) % P.TABS.length; P.state.sel = 0; return; }
		if (k === P.BACK) { P.state.sel = 0; return; }
		if (k === P.ENTER) {
			var row = P.currentRow();
			if (!row || row.hint) return;
			var acts = ["kick", "tempban", "ban", "mute", "warn"];
			var ai = P.state.actSel || 0;
			P.openConfirm(acts[ai] + " -> " + (row.name || "?"), acts[ai]);
		}
	};

	P.onCharacter = function (ch) {
		if (!P.state.visible || !P.state.reasonMode) return;
		var c = ch;
		if (typeof c === "number") c = String.fromCharCode(c);
		c = String(c || "");
		if (c.length !== 1) return;
		var code = c.charCodeAt(0);
		if (code < 32 || code > 126) return;
		if (P.state.reason.length < 80) P.state.reason += c;
	};

	P.onCursorDown = function (x, y) {
		if (!P.state.visible) return;
		var nx = x, ny = y;
		if (typeof x === "number" && x > 1) {
			var w = 1280, h = 720;
			try { if (typeof game !== "undefined" && game) { w = game.width || w; h = game.height || h; } } catch (e) {}
			nx = x / w; ny = y / h;
		}
		var i, yy, list = P.rows();
		for (i = 0; i < Math.min(list.length, 12); i++) {
			yy = 0.26 + i * 0.035;
			if (nx >= 0.22 && nx <= 0.78 && ny >= yy && ny <= yy + 0.032) {
				P.state.sel = i;
				if (P.state.confirm) P.doConfirm();
				return;
			}
		}
	};

	P.init = function () {
		if (P.initialized) return;
		P.initialized = true;
		var cands = ["OnDrawnHUD", "OnDrawHUD", "OnBeforeDrawHUD", "OnPostRender2D"];
		for (var i = 0; i < cands.length; i++) {
			try { addEventHandler(cands[i], function () { P.draw(); }); break; } catch (e) {}
		}
		var kc = ["OnKeyDown", "onKeyDown"];
		for (var k = 0; k < kc.length; k++) {
			try { addEventHandler(kc[k], function (ev, key) { P.onKeyDown(key === undefined ? ev : key); }); break; } catch (e) {}
		}
		var cc = ["OnCharacter", "onCharacter"];
		for (var c = 0; c < cc.length; c++) {
			try { addEventHandler(cc[c], function (ev, ch) { P.onCharacter(ch === undefined ? ev : ch); }); break; } catch (e) {}
		}
		var mc = ["OnCursorDown", "onCursorDown"];
		for (var m = 0; m < mc.length; m++) {
			try { addEventHandler(mc[m], function (ev, x, y) {
				if (y === undefined) P.onCursorDown(ev, x);
				else P.onCursorDown(x, y);
			}); break; } catch (e) {}
		}
		try {
			addNetworkHandler("ln:adminState", function () {
				var staff = arguments[0] === "1" || arguments[0] === true;
				P.state.staff = staff;
				P.state.level = parseInt(arguments[1], 10) || 0;
				if (!staff) P.hide();
			});
		} catch (e) {}
		try {
			addNetworkHandler("ln:adminRoster", function () {
				try { P.state.roster = JSON.parse(arguments[0] || "[]") || []; } catch (e2) { P.state.roster = []; }
			});
		} catch (e) {}
		try {
			addNetworkHandler("ln:adminResult", function () {
				P.state.status = "OK: " + (arguments[0] || "");
				P.send("ln:adminList");
			});
		} catch (e) {}
		try {
			addNetworkHandler("ln:adminError", function () {
				P.state.status = "Error: " + (arguments[1] || arguments[0] || "");
			});
		} catch (e) {}
		try {
			addNetworkHandler("ln:adminAnnounce", function () {
				var t = arguments[0] || "";
				try { if (typeof message === "function") message("[ANNOUNCE] " + t); } catch (e2) {}
			});
		} catch (e) {}
	};

	P._test = { onKeyDown: function (k) { P.onKeyDown(k); }, onCharacter: function (c) { P.onCharacter(c); }, onCursorDown: function (x, y) { P.onCursorDown(x, y); } };
})(typeof globalThis !== "undefined" ? globalThis : this);
