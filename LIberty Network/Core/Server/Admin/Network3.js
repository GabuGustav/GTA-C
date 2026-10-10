"use strict";
/* LN.Admin.Network part 2b: roster/roles/announce/HWID commands. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var N = LN.Admin.Network;

	N.registerCommandsB = function () {
		var msg = N.msg;

		addCommandHandler("alistplayers", function (cmd, params, client) {
			var r = LN.Admin.Service.roster(client);
			if (!r.ok) return msg(client, "Not authorized.", COLOUR_RED);
			var lines = r.players.map(function (p) { return p.name + " [ID:" + p.index + "]" + (p.ip ? " " + p.ip : ""); });
			msg(client, "Players (" + lines.length + "):\n" + lines.join("\n"), COLOUR_YELLOW);
		});

		addCommandHandler("abanlist", function (cmd, params, client) {
			var r = LN.Admin.Service.banList(client);
			if (!r.ok) return msg(client, "Not authorized.", COLOUR_RED);
			msg(client, "Bans: " + r.bans.length + " account, " + r.ipBans.length + " IP, " + r.hwidBans.length + " HWID.", COLOUR_YELLOW);
		});

		addCommandHandler("amakeadmin", function (cmd, params, client) {
			var id = String(params || "").trim();
			if (!id) return msg(client, "Usage: /amakeadmin <accountId>  (CONSOLE ONLY)", COLOUR_RED);
			var r = LN.Admin.Service.setRole(client, id, "admin");
			if (!r.ok) return msg(client, "Failed: " + r.code + " (console only).", COLOUR_RED);
			msg(client, id + " is now admin.", COLOUR_GREEN);
		});

		addCommandHandler("amakemod", function (cmd, params, client) {
			var id = String(params || "").trim();
			if (!id) return msg(client, "Usage: /amakemod <accountId>", COLOUR_RED);
			var r = LN.Admin.Service.setRole(client, id, "moderator");
			if (!r.ok) return msg(client, "Failed: " + r.code, COLOUR_RED);
			msg(client, id + " is now moderator.", COLOUR_GREEN);
		});

		addCommandHandler("ademote", function (cmd, params, client) {
			var p = N.splitParams(params);
			if (!p.target) return msg(client, "Usage: /ademote <accountId> [reason]  (console: demotes anyone; admin: demotes moderators only)", COLOUR_RED);
			var r = LN.Admin.Service.demote(client, p.target, p.rest.join(" "));
			if (!r.ok) return msg(client, "Demote failed: " + r.code, COLOUR_RED);
			msg(client, "Demoted " + p.target + ".", COLOUR_GREEN);
		});

		addCommandHandler("apurgestaff", function (cmd, params, client) {
			var r = LN.Admin.Service.purgeStaff(client);
			if (!r.ok) return msg(client, "Purge failed: " + r.code + " (console only).", COLOUR_RED);
			msg(client, "Purged " + r.purged.length + " staff role(s): " + r.purged.join(", "), COLOUR_GREEN);
		});

		addCommandHandler("aannounce", function (cmd, params, client) {
			var g = LN.Admin.Roles.require(client, "aannounce");
			if (!g.ok) return msg(client, "Not authorized.", COLOUR_RED);
			var text = String(params || "").trim();
			if (!text) return msg(client, "Usage: /aannounce <message>", COLOUR_RED);
			try { triggerNetworkEvent("ln:adminAnnounce", null, text); } catch (e) {}
			LN.Admin.Service.log("announce", "ok", { detail: text.slice(0, 200) }, client);
			msg(client, "Announced.", COLOUR_GREEN);
		});

		addCommandHandler("ahwidban", function (cmd, params, client) {
			var p = N.splitParams(params);
			var reason = p.rest.join(" ");
			if (!p.target || !reason) return msg(client, "Usage: /ahwidban <ID:n|name> <reason>", COLOUR_RED);
			var r = LN.Admin.Service.hwidBan(client, N.resolveTarget(p.target), reason);
			if (!r.ok) return msg(client, "HWID ban failed: " + r.code, COLOUR_RED);
			msg(client, "HWID banned.", COLOUR_GREEN);
		});

		addCommandHandler("ahwidunban", function (cmd, params, client) {
			var key = String(params || "").trim();
			if (!key) return msg(client, "Usage: /ahwidunban <hwid-fragment|name>", COLOUR_RED);
			var r = LN.Admin.Service.hwidUnban(client, key);
			if (!r.ok) return msg(client, "HWID unban failed: " + r.code, COLOUR_RED);
			msg(client, "HWID unbanned.", COLOUR_GREEN);
		});
	};

	N.registerCommands = function () {
		if (typeof addCommandHandler !== "function") return;
		N.registerCommandsA();
		N.registerCommandsB();
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
