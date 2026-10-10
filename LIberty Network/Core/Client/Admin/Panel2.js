"use strict";
/* LN.AdminPanel part 2a: draw + selection. Needs Panel.js first. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var P = root.LN.AdminPanel;

	P.draw = function () {
		if (!P.state.visible) return;
		P.rect(0.5, 0.5, 1.0, 1.0, [0, 0, 0, 150]);
		P.rect(0.5, 0.42, 0.62, 0.62, [22, 33, 62, 255]);
		P.text("LIBERTY NETWORK - ADMIN (F10)", 0.22, 0.14, 0.55, [255, 255, 255, 255]);
		var x, label;
		for (x = 0; x < P.TABS.length; x++) {
			label = (x === P.state.tab ? "> " : "  ") + P.TABS[x];
			P.text(label, 0.22 + x * 0.16, 0.20, 0.45, x === P.state.tab ? [0, 214, 143, 255] : [190, 200, 215, 255]);
		}
		var list = P.rows(), i, r, yy;
		for (i = 0; i < Math.min(list.length, 12); i++) {
			r = list[i];
			yy = 0.26 + i * 0.035;
			if (i === P.state.sel) P.rect(0.5, yy + 0.012, 0.56, 0.032, [70, 90, 140, 255]);
			P.text((i === P.state.sel ? "> " : "  ") + (r.name || "?") + (r.index !== undefined ? " [ID:" + r.index + "]" : "") + (r.hint ? " - " + r.hint : ""), 0.23, yy, 0.42, [255, 255, 255, 255]);
		}
		if (P.state.confirm) {
			P.rect(0.5, 0.5, 0.5, 0.2, [15, 20, 35, 250]);
			P.text(P.state.confirm.label, 0.28, 0.44, 0.5, [255, 255, 255, 255]);
			P.text("Reason: " + (P.state.reason || "(type)"), 0.28, 0.49, 0.42, [190, 200, 215, 255]);
			P.text("Enter=confirm  Backspace=back  Esc=cancel", 0.28, 0.54, 0.4, [0, 214, 143, 255]);
		} else {
			P.text("Up/Down=select Left/Right=tab Enter=action Esc=close", 0.23, 0.70, 0.38, [190, 200, 215, 255]);
		}
		if (P.state.status) P.text(P.state.status, 0.23, 0.68, 0.4, [231, 76, 60, 255]);
	};

	P.currentRow = function () {
		var list = P.rows();
		if (!list.length) return null;
		if (P.state.sel < 0) P.state.sel = 0;
		if (P.state.sel >= list.length) P.state.sel = list.length - 1;
		return list[P.state.sel];
	};

	P.openConfirm = function (actionLabel, action) {
		P.state.confirm = { label: actionLabel, action: action };
		P.state.reasonMode = true;
		P.state.reason = "";
	};

	P.doConfirm = function () {
		var c = P.state.confirm;
		if (!c) return;
		var row = P.currentRow();
		if (!row) { P.state.status = "No target."; P.state.confirm = null; return; }
		var target = row.index !== undefined ? ("ID:" + row.index) : row.name;
		var reason = P.state.reason || "No reason";
		if (c.action === "kick") P.send("ln:adminAction", "kick", target, JSON.stringify({ reason: reason }));
		else if (c.action === "ban") P.send("ln:adminAction", "ban", target, JSON.stringify({ reason: reason }));
		else if (c.action === "tempban") P.send("ln:adminAction", "tempban", target, JSON.stringify({ reason: reason, minutes: 60 }));
		else if (c.action === "mute") P.send("ln:adminAction", "mute", target, JSON.stringify({ minutes: 30 }));
		else if (c.action === "warn") P.send("ln:adminAction", "warn", target, JSON.stringify({ reason: reason }));
		P.state.status = "Sent: " + c.action;
		P.state.confirm = null;
		P.state.reasonMode = false;
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
