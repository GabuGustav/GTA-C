"use strict";
/* LN.Admin.Network part 2a: staff chat commands (moderation). */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var N = LN.Admin.Network;

	function splitParams(params) {
		var parts = String(params || "").trim().split(/\s+/).filter(function (x) { return x; });
		return { target: parts[0] || "", rest: parts.slice(1) };
	}
	N.splitParams = splitParams;

	function needReason(r, client, usage) {
		if (!r.ok && r.code === "reason_required") { N.msg(client, "Usage: " + usage, COLOUR_RED); return true; }
		if (!r.ok) { N.msg(client, "Admin: " + r.code, COLOUR_RED); return true; }
		return false;
	}

	N.registerCommandsA = function () {
		var msg = N.msg;

		addCommandHandler("admin", function (cmd, params, client) {
			N.pushState(client);
			msg(client, "Admin panel: press F10 (staff only).", COLOUR_YELLOW);
		});

		addCommandHandler("aadminhelp", function (cmd, params, client) {
			msg(client, "Admin: /akick /atempban /aban /aunban /amute /aunmute /awarn /alistplayers /abanlist /amakeadmin /amakemod /ademote /aannounce /ahwidban (F10 panel).", COLOUR_YELLOW);
		});

		addCommandHandler("aadminstatus", function (cmd, params, client) {
			var lv = LN.Admin.Roles.levelForClient(client);
			var label = lv >= 999 ? "console" : (lv === 2 ? "admin" : (lv === 1 ? "moderator" : "player"));
			msg(client, "Admin status: " + label + " (level " + lv + ").", COLOUR_YELLOW);
		});

		addCommandHandler("akick", function (cmd, params, client) {
			var p = splitParams(params);
			if (!p.target) return msg(client, "Usage: /akick <ID:n|name> <reason>", COLOUR_RED);
			var reason = String(params).slice(String(params).indexOf(p.target) + p.target.length).trim();
			var r = LN.Admin.Service.kick(client, N.resolveTarget(p.target), reason);
			if (needReason(r, client, "/akick <ID:n|name> <reason>")) return;
			msg(client, "Kicked.", COLOUR_GREEN);
		});

		addCommandHandler("atempban", function (cmd, params, client) {
			var p = splitParams(params);
			var mins = parseInt(p.rest[0], 10);
			var reason = p.rest.slice(1).join(" ");
			if (!p.target || !mins || !reason) return msg(client, "Usage: /atempban <ID:n|name> <minutes> <reason>", COLOUR_RED);
			var r = LN.Admin.Service.ban(client, N.resolveTarget(p.target), reason, mins);
			if (needReason(r, client, "/atempban <ID:n|name> <minutes> <reason>")) return;
			msg(client, "Tempbanned.", COLOUR_GREEN);
		});

		addCommandHandler("aban", function (cmd, params, client) {
			var p = splitParams(params);
			var reason = String(params).slice(String(params).indexOf(p.target) + (p.target || "").length).trim();
			if (!p.target) return msg(client, "Usage: /aban <ID:n|name> <reason>", COLOUR_RED);
			var r = LN.Admin.Service.ban(client, N.resolveTarget(p.target), reason, 0);
			if (needReason(r, client, "/aban <ID:n|name> <reason>")) return;
			msg(client, "Banned.", COLOUR_GREEN);
		});

		addCommandHandler("aunban", function (cmd, params, client) {
			var id = String(params || "").trim();
			if (!id) return msg(client, "Usage: /aunban <accountId>", COLOUR_RED);
			var r = LN.Admin.Service.unban(client, id);
			if (!r.ok) return msg(client, "Unban failed: " + r.code, COLOUR_RED);
			msg(client, "Unbanned " + id + ".", COLOUR_GREEN);
		});

		addCommandHandler("amute", function (cmd, params, client) {
			var p = splitParams(params);
			var mins = parseInt(p.rest[0], 10) || 0;
			var r = LN.Admin.Service.mute(client, N.resolveTarget(p.target), mins);
			if (!r.ok) return msg(client, "Mute failed: " + r.code, COLOUR_RED);
			msg(client, "Muted.", COLOUR_GREEN);
		});

		addCommandHandler("aunmute", function (cmd, params, client) {
			var t = String(params || "").trim();
			if (!t) return msg(client, "Usage: /aunmute <ID:n|name|accountId>", COLOUR_RED);
			var r = LN.Admin.Service.unmute(client, N.resolveTarget(t) || t);
			if (!r.ok) return msg(client, "Unmute failed: " + r.code, COLOUR_RED);
			msg(client, "Unmuted.", COLOUR_GREEN);
		});

		addCommandHandler("awarn", function (cmd, params, client) {
			var p = splitParams(params);
			var reason = p.rest.join(" ");
			if (!p.target || !reason) return msg(client, "Usage: /awarn <ID:n|name> <reason>", COLOUR_RED);
			var r = LN.Admin.Service.warn(client, N.resolveTarget(p.target), reason);
			if (!r.ok) return msg(client, "Warn failed: " + r.code, COLOUR_RED);
			msg(client, "Warned (" + r.warnings + " total).", COLOUR_GREEN);
		});
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
