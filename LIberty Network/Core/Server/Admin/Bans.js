"use strict";
/*
 * Liberty Network - Admin bans (LN.Admin.Bans)
 *
 * Account + IP + best-effort HWID bans with tempban expiry and repeat-
 * offender escalation. HWID is a spoofable signal (serial/guid/ip/name),
 * so it escalates durations but never acts as sole proof: the ban
 * authority stays account + IP. All records persist on the account /
 * in-memory IP+HWID lists; audit goes through Admin.Service.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var B = (LN.Admin.Bans = LN.Admin.Bans || {});
	var U = LN.U;
	var Accounts = LN.Auth.Accounts;
	var Store = LN.Store;

	B.DEFAULT = {
		escalationMultiplier: 2,   // repeat tempban minutes *= multiplier^banCount
		maxEscalatedMin: 10080,    // cap at 7 days
		ipBans: {},                // ip -> { reason, by, at, until }
		hwidBans: []               // { hwidfp, name, reason, by, at }
	};

	var ipBans = {};
	var hwidBans = [];

	B.init = function () { ipBans = {}; hwidBans = []; return true; };

	// Best-effort HWID fingerprint (same inputs as hwid-banning resource).
	// Spoofable — repeat-offender signal only.
	B.fingerprint = function (client) {
		if (!client) return "";
		var parts = [
			client.serial || (client.getData ? client.getData("serial") : ""),
			client.guid || (client.getData ? client.getData("guid") : ""),
			client.ip || "",
			client.name || ""
		];
		var raw = parts.join("|").toLowerCase().trim();
		if (!raw || raw === "|||") return "";
		// Non-secret hash via the shared SHA-256 helper.
		try { return LN.Crypto.sha256("hwid:" + raw); } catch (e) { return raw; }
	};

	B.isIpBanned = function (ip, nowSec) {
		var rec = ipBans[String(ip || "")];
		if (!rec) return false;
		if (rec.until && (nowSec == null ? U.now() : nowSec) >= rec.until) {
			delete ipBans[String(ip || "")];
			return false;
		}
		return true;
	};

	B.banIp = function (ip, opts) {
		opts = opts || {};
		ipBans[String(ip)] = {
			reason: String(opts.reason || "No reason"), by: opts.by || null,
			at: U.now(), until: opts.until || 0
		};
	};

	B.unbanIp = function (ip) {
		var k = String(ip || "");
		if (ipBans[k]) { delete ipBans[k]; return true; }
		return false;
	};

	B.listIpBans = function () {
		var out = [], k;
		for (k in ipBans) out.push({ ip: k, reason: ipBans[k].reason, by: ipBans[k].by, at: ipBans[k].at, until: ipBans[k].until });
		return out;
	};

	B.isHwidBanned = function (fp) {
		fp = String(fp || "");
		if (!fp) return false;
		for (var i = 0; i < hwidBans.length; i++) {
			if (hwidBans[i].hwidfp === fp) return true;
		}
		return false;
	};

	B.banHwid = function (fp, opts) {
		opts = opts || {};
		if (!fp || B.isHwidBanned(fp)) return false;
		hwidBans.push({ hwidfp: String(fp), name: opts.name || "", reason: String(opts.reason || "No reason"), by: opts.by || null, at: U.now() });
		return true;
	};

	B.unbanHwid = function (key) {
		key = String(key || "").toLowerCase();
		var before = hwidBans.length;
		hwidBans = hwidBans.filter(function (b) {
			return !(b.hwidfp.toLowerCase().indexOf(key) !== -1 || String(b.name || "").toLowerCase() === key);
		});
		return hwidBans.length < before;
	};

	B.listHwidBans = function () { return hwidBans.slice(); };

	// Repeat-offender escalation for tempbans: minutes * mult^banCount, capped.
	B.escalatedMinutes = function (account, baseMin) {
		var mult = 2, cap = 10080;
		try {
			var c = LN.Config && LN.Config.admin;
			if (c && c.escalationMultiplier) mult = Number(c.escalationMultiplier) || 2;
			if (c && c.maxEscalatedMin) cap = Number(c.maxEscalatedMin) || 10080;
		} catch (e) {}
		var count = (account && account.banCount) || 0;
		var mins = (Number(baseMin) || 0) * Math.pow(mult, count);
		if (mins > cap) mins = cap;
		return Math.floor(mins);
	};

	// Join-time gate: account ban (with tempban auto-expiry), IP ban, HWID.
	// Returns { banned:true, kind, reason } or { banned:false }.
	B.checkJoin = function (client, account) {
		var now = U.now();
		if (account && account.status === "banned") {
			if (account.banUntil && now >= account.banUntil) {
				Accounts.unbanEx(account, true);
				if (LN.Admin && LN.Admin.Service) LN.Admin.Service.log("unban_expired", "ok", { accountId: account.accountId }, null);
			} else {
				return { banned: true, kind: "account", reason: account.banReason || "Banned" };
			}
		}
		if (client && client.ip && B.isIpBanned(client.ip, now)) {
			return { banned: true, kind: "ip", reason: (ipBans[client.ip] || {}).reason || "IP banned" };
		}
		var fp = B.fingerprint(client);
		if (fp && B.isHwidBanned(fp)) {
			return { banned: true, kind: "hwid", reason: "HWID banned" };
		}
		return { banned: false };
	};

	// Periodic: lift expired tempbans + IP bans.
	B.pruneExpired = function () {
		var now = U.now(), lifted = 0, ip;
		try {
			var all = Store.getAccounts();
			for (var id in all) {
				if (Accounts.isBanExpired(all[id], now)) {
					Accounts.unbanEx(all[id], false);
					lifted++;
				}
			}
			if (lifted) Store.save("accounts");
		} catch (e) {}
		for (ip in ipBans) {
			if (ipBans[ip].until && now >= ipBans[ip].until) delete ipBans[ip];
		}
		return lifted;
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
