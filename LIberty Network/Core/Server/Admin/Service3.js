"use strict";
/* LN.Admin.Service part 2b: mute/warn + roster/banlist views. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var S = LN.Admin.Service;
	var Accounts = LN.Auth.Accounts;
	var U = LN.U;

	S.mute = function (actor, target, minutes) {
		var g = LN.Admin.Roles.require(actor, "amute");
		if (!g.ok) return g;
		if (!target) return { ok: false, code: "no_target" };
		var tAcc = S.targetAccount(target);
		if (!tAcc) return { ok: false, code: "target_not_authenticated" };
		var until = minutes ? U.now() + Number(minutes) * 60 : 0;
		Accounts.setMuted(tAcc, true, until, true);
		S.log("mute", "ok", { accountId: tAcc.accountId, detail: "by=" + S.actorName(actor) + (until ? " until=" + until : " indefinite") }, actor);
		return { ok: true, until: until };
	};

	S.unmute = function (actor, targetOrId) {
		var g = LN.Admin.Roles.require(actor, "aunmute");
		if (!g.ok) return g;
		var acc = null;
		if (targetOrId && targetOrId.index !== undefined) acc = S.targetAccount(targetOrId);
		if (!acc) acc = Accounts.getAccount(targetOrId);
		if (!acc) return { ok: false, code: "unknown_account" };
		Accounts.setMuted(acc, false, 0, true);
		S.log("unmute", "ok", { accountId: acc.accountId, detail: "by=" + S.actorName(actor) }, actor);
		return { ok: true };
	};

	S.warn = function (actor, target, reason) {
		var g = LN.Admin.Roles.require(actor, "awarn");
		if (!g.ok) return g;
		if (!target) return { ok: false, code: "no_target" };
		if (!reason) return { ok: false, code: "reason_required" };
		var tAcc = S.targetAccount(target);
		if (!tAcc) return { ok: false, code: "target_not_authenticated" };
		var count = Accounts.addWarning(tAcc, reason, S.actorName(actor), true);
		S.log("warn", "ok", { accountId: tAcc.accountId, detail: "reason=" + reason + " count=" + count + " by=" + S.actorName(actor) }, actor);
		return { ok: true, warnings: count };
	};

	S.roster = function (actor) {
		var g = LN.Admin.Roles.require(actor, "alistplayers");
		if (!g.ok) return g;
		var seeIp = LN.Admin.Roles.levelForClient(actor) >= 2;
		var out = [];
		try {
			var clients = getClients();
			for (var i = 0; i < clients.length; i++) {
				var c = clients[i], id = null;
				try { id = LN.Auth.Service.accountForClient(c); } catch (e) {}
				var row = { index: c.index, name: c.name, accountId: id || "" };
				if (seeIp) row.ip = c.ip || "";
				out.push(row);
			}
		} catch (e) {}
		return { ok: true, players: out };
	};

	S.banList = function (actor) {
		var g = LN.Admin.Roles.require(actor, "abanlist");
		if (!g.ok) return g;
		var out = [];
		try {
			var all = LN.Store.getAccounts();
			for (var id in all) {
				if (all[id] && all[id].status === "banned") {
					out.push({ accountId: id, reason: all[id].banReason, until: all[id].banUntil || 0, by: all[id].banBy || null, count: all[id].banCount || 1 });
				}
			}
		} catch (e) {}
		return { ok: true, bans: out, ipBans: LN.Admin.Bans.listIpBans(), hwidBans: LN.Admin.Bans.listHwidBans() };
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
