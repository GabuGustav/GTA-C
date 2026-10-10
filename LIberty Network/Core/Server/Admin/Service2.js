"use strict";
/* LN.Admin.Service part 2a: IP/HWID bans + roles. Needs Service.js first. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var S = LN.Admin.Service;
	var Accounts = LN.Auth.Accounts;
	var U = LN.U;

	S.banIp = function (actor, ip, reason, minutes) {
		var g = LN.Admin.Roles.require(actor, "abanip");
		if (!g.ok) return g;
		if (!ip) return { ok: false, code: "no_target" };
		if (!reason) return { ok: false, code: "reason_required" };
		var until = minutes ? U.now() + Number(minutes) * 60 : 0;
		LN.Admin.Bans.banIp(ip, { reason: reason, by: S.actorName(actor), until: until });
		S.log("banip", "ok", { detail: "reason=" + reason + " by=" + S.actorName(actor) }, actor);
		return { ok: true, until: until };
	};

	S.unbanIp = function (actor, ip) {
		var g = LN.Admin.Roles.require(actor, "aunbanip");
		if (!g.ok) return g;
		if (!LN.Admin.Bans.unbanIp(ip)) return { ok: false, code: "not_found" };
		S.log("unbanip", "ok", { detail: "by=" + S.actorName(actor) }, actor);
		return { ok: true };
	};

	S.hwidBan = function (actor, target, reason) {
		var g = LN.Admin.Roles.require(actor, "ahwidban");
		if (!g.ok) return g;
		if (!target) return { ok: false, code: "no_target" };
		if (!reason) return { ok: false, code: "reason_required" };
		var fp = LN.Admin.Bans.fingerprint(target);
		if (!fp) return { ok: false, code: "no_fingerprint" };
		if (!LN.Admin.Bans.banHwid(fp, { name: target.name, reason: reason, by: S.actorName(actor) })) {
			return { ok: false, code: "already_banned" };
		}
		S.log("hwidban", "ok", { detail: "target=" + (target.name || "?") + " reason=" + reason + " by=" + S.actorName(actor) }, actor);
		S.kickClient(target, "HWID banned: " + reason);
		return { ok: true };
	};

	S.hwidUnban = function (actor, key) {
		var g = LN.Admin.Roles.require(actor, "ahwidunban");
		if (!g.ok) return g;
		if (!LN.Admin.Bans.unbanHwid(key)) return { ok: false, code: "not_found" };
		S.log("hwidunban", "ok", { detail: "by=" + S.actorName(actor) }, actor);
		return { ok: true };
	};

	S.setRole = function (actor, accountId, role) {
		role = String(role || "").toLowerCase();
		var g;
		if (role === "admin") {
			// Only the server console may grant admin. No exceptions.
			g = LN.Admin.Roles.requireConsole(actor);
			if (!g.ok) return g;
		} else {
			g = LN.Admin.Roles.require(actor, "amakemod");
			if (!g.ok) return g;
		}
		var acc = Accounts.getAccount(accountId);
		if (!acc) return { ok: false, code: "unknown_account" };
		Accounts.addRole(acc, role, true);
		S.log(role === "admin" ? "makeadmin" : "makemod", "ok", { accountId: acc.accountId, detail: "by=" + S.actorName(actor) }, actor);
		return { ok: true };
	};

	S.demote = function (actor, accountId, reason) {
		var g = LN.Admin.Roles.require(actor, "ademote");
		if (!g.ok) return g;
		var acc = Accounts.getAccount(accountId);
		if (!acc) return { ok: false, code: "unknown_account" };
		var isAdmin = Accounts.hasRole(acc, "admin");
		var actorIsConsole = LN.Admin.Roles.isConsole(actor);
		// Only console can demote an admin. In-game admins (level 2) may
		// still demote moderators; moderators cannot demote anyone.
		if (isAdmin && !actorIsConsole) return { ok: false, code: "console_only" };
		if (!isAdmin && !actorIsConsole && LN.Admin.Roles.levelForClient(actor) < 2) {
			return { ok: false, code: "not_authorized" };
		}
		Accounts.removeRole(acc, "admin", false);
		Accounts.removeRole(acc, "moderator", true);
		S.log("demote", "ok", { accountId: acc.accountId, detail: "reason=" + (reason || "") + " by=" + S.actorName(actor) }, actor);
		return { ok: true };
	};

	// One-shot purge: revoke every admin/mod role in the store. Console-only.
	// Used to wipe illegitimate grants; each revocation is audit-logged.
	S.purgeStaff = function (actor) {
		var g = LN.Admin.Roles.requireConsole(actor);
		if (!g.ok) return g;
		var all = {};
		try { all = LN.Store.getAccounts(); } catch (e) {}
		var purged = [];
		for (var id in all) {
			var acc = all[id];
			if (!acc) continue;
			var hadAdmin = Accounts.hasRole(acc, "admin");
			var hadMod = Accounts.hasRole(acc, "moderator");
			if (!hadAdmin && !hadMod) continue;
			Accounts.removeRole(acc, "admin", false);
			Accounts.removeRole(acc, "moderator", false);
			try { LN.Store.setAccount(acc, false); } catch (e2) {}
			purged.push(id);
			S.log("purge_staff", "ok", { accountId: id, detail: "was=" + (hadAdmin ? "admin" : "moderator") + " by=" + S.actorName(actor) }, actor);
		}
		try { LN.Store.save("accounts"); } catch (e3) {}
		return { ok: true, purged: purged };
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
