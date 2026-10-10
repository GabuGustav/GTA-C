"use strict";
/*
 * Liberty Network - Admin service (LN.Admin.Service) part 1.
 * Orchestration over Roles + Bans + Auth: punishments, audit.
 * Requires Auth booted. Audit goes to the bounded security_log.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var S = (LN.Admin.Service = LN.Admin.Service || {});
	var U = LN.U;
	var Accounts = LN.Auth.Accounts;

	S.available = false;

	S.init = function (config) {
		if (!LN.Auth || !LN.Auth.Service || !Accounts) {
			U.warn("Admin service requires Auth; refusing to boot.");
			S.available = false;
			return false;
		}
		if (LN.Admin.Roles && LN.Admin.Roles.init) LN.Admin.Roles.init(config);
		if (LN.Admin.Bans && LN.Admin.Bans.init) LN.Admin.Bans.init();
		S.available = true;
		U.log("Admin service initialised.");
		return true;
	};

	S.log = function (action, outcome, detail, client) {
		try {
			var svc = LN.Auth && LN.Auth.Service;
			if (svc && svc.log) { svc.log("admin:" + action, outcome, detail, client); return; }
			LN.Store.appendSecurity({
				ts: U.now(), action: "admin:" + action, outcome: outcome || "ok",
				accountId: (detail && detail.accountId) || null,
				detail: (detail && detail.detail) || "",
				clientName: (client && client.name) || null, ip: (client && client.ip) || null
			}, true);
		} catch (e) {}
	};

	function actorName(client) {
		try {
			if (client && client.console) return "Console";
			var id = LN.Auth.Service.accountForClient(client);
			return id || (client && client.name) || "unknown";
		} catch (e) { return "unknown"; }
	}
	S.actorName = actorName;

	function targetAccount(client) {
		try {
			var id = LN.Auth.Service.accountForClient(client);
			return id ? Accounts.getAccount(id) : null;
		} catch (e) { return null; }
	}
	S.targetAccount = targetAccount;

	function kickClient(client, reason) {
		try {
			if (client && typeof client.disconnect === "function") { client.disconnect(String(reason || "Kicked")); return; }
		} catch (e) {}
		try {
			if (typeof disconnectClient === "function") { disconnectClient(client); return; }
		} catch (e2) {}
	}
	S.kickClient = kickClient;

	S.kick = function (actor, target, reason) {
		var g = LN.Admin.Roles.require(actor, "akick");
		if (!g.ok) return g;
		if (!target) return { ok: false, code: "no_target" };
		if (!reason) return { ok: false, code: "reason_required" };
		var tAcc = targetAccount(target);
		S.log("kick", "ok", { accountId: tAcc ? tAcc.accountId : null, detail: "target=" + (target.name || "?") + " reason=" + reason + " by=" + actorName(actor) }, actor);
		kickClient(target, "Kicked: " + reason);
		return { ok: true };
	};

	S.ban = function (actor, target, reason, minutes) {
		var cmd = minutes ? "atempban" : "aban";
		var g = LN.Admin.Roles.require(actor, cmd);
		if (!g.ok) return g;
		if (!target) return { ok: false, code: "no_target" };
		if (!reason) return { ok: false, code: "reason_required" };
		var tAcc = targetAccount(target);
		if (!tAcc) return { ok: false, code: "target_not_authenticated" };
		var until = 0;
		if (minutes) {
			var mins = LN.Admin.Bans.escalatedMinutes(tAcc, Number(minutes));
			until = U.now() + mins * 60;
		}
		var fp = LN.Admin.Bans.fingerprint(target);
		Accounts.banEx(tAcc, { reason: reason, by: actorName(actor), until: until, hwidfp: fp }, true);
		try { LN.Auth.Service.logout(target, true); } catch (e) {}
		S.log(minutes ? "tempban" : "ban", "ok", {
			accountId: tAcc.accountId,
			detail: "target=" + tAcc.accountId + " reason=" + reason + (until ? " until=" + until : " perm") + " count=" + tAcc.banCount + " by=" + actorName(actor)
		}, actor);
		kickClient(target, "Banned: " + reason);
		return { ok: true, until: until, banCount: tAcc.banCount };
	};

	S.unban = function (actor, accountId) {
		var g = LN.Admin.Roles.require(actor, "aunban");
		if (!g.ok) return g;
		var acc = Accounts.getAccount(accountId);
		if (!acc) return { ok: false, code: "unknown_account" };
		Accounts.unbanEx(acc, true);
		S.log("unban", "ok", { accountId: acc.accountId, detail: "by=" + actorName(actor) }, actor);
		return { ok: true };
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
