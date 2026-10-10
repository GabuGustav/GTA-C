"use strict";
/*
 * Liberty Network - Admin roles (LN.Admin.Roles)
 *
 * Staff authorization over Accounts.roles (+ fine-grained permissions).
 * Numeric levels kept for v-admin parity: 0=player, 1=moderator, 2=admin.
 * Console clients bypass to 999. Every check is server-side; the F10 panel
 * is convenience only and never trusted.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var R = (LN.Admin.Roles = LN.Admin.Roles || {});
	var Accounts = LN.Auth.Accounts;

	R.LEVELS = { player: 0, moderator: 1, admin: 2 };

	R.DEFAULT = {
		commandLevels: {
			akick: 1, atempban: 1, aban: 2, aunban: 1,
			abanip: 2, aunbanip: 2, abanlist: 1,
			amakeadmin: 2, amakemod: 2, ademote: 2,
			alistplayers: 1, aadminstatus: 1, aadminhelp: 1,
			aannounce: 1, amsay: 1, awsay: 2,
			ascripts: 1, ablockscript: 1, atrainers: 1, adisableweapons: 1,
			amute: 1, aunmute: 1, afreeze: 1, aunfreeze: 1,
			abring: 1, agoto: 1, awarn: 1,
			ahwidban: 2, ahwidunban: 2, ahwidbanlist: 1,
			// Auth session commands gated by the Admin module:
			logoutall: 2
		}
	};

	var cfg = null;
	R.init = function (config) {
		cfg = (config && config.admin) || {};
		if (!cfg.commandLevels) cfg.commandLevels = R.DEFAULT.commandLevels;
		return cfg;
	};

	function conf() { return cfg || R.DEFAULT; }

	R.levelForCommand = function (cmd) {
		var map = (conf() && conf().commandLevels) || R.DEFAULT.commandLevels;
		var lv = map[String(cmd || "").toLowerCase()];
		return typeof lv === "number" ? lv : 2; // fail closed
	};

	function isConsole(client) {
		try { return !!(client && client.console); } catch (e) { return false; }
	}

	// Numeric level for a client: console=999, admin role=2, moderator=1.
	R.levelForClient = function (client) {
		if (isConsole(client)) return 999;
		try {
			var svc = LN.Auth && LN.Auth.Service;
			if (!svc || !svc.accountForClient) return 0;
			var accountId = svc.accountForClient(client);
			if (!accountId) return 0;
			var acc = Accounts.getAccount(accountId);
			if (!acc) return 0;
			if (Accounts.hasRole(acc, "admin")) return 2;
			if (Accounts.hasRole(acc, "moderator")) return 1;
			return 0;
		} catch (e) { return 0; }
	};

	R.can = function (client, cmd) {
		return R.levelForClient(client) >= R.levelForCommand(cmd);
	};

	R.require = function (client, cmd) {
		if (R.can(client, cmd)) return { ok: true, level: R.levelForClient(client) };
		return { ok: false, code: "not_authorized", level: R.levelForClient(client) };
	};

	// True when the F10 panel may be opened (staff only).
	R.isStaff = function (client) {
		return R.levelForClient(client) >= 1;
	};

	R.isConsole = function (client) { return isConsole(client); };

	// Console-only gate: only the server console may grant/revoke admin.
	// In-game admins may still grant/revoke moderator via amakemod/ademote.
	R.requireConsole = function (client) {
		if (isConsole(client)) return { ok: true, level: 999 };
		return { ok: false, code: "console_only", level: R.levelForClient(client) };
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
