"use strict";
/*
 * Liberty Network - Auth Service orchestration (LN.Auth.Service)
 *
 * Central coordinator. Initialises config + in-memory state, ties sessions to
 * connected GTAC clients, performs register/login/refresh/logout flows, writes
 * the security log (never secrets), and issues short-lived single-use tickets
 * that RP-server resources can exchange for verified identity.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var Service = (LN.Auth.Service = LN.Auth.Service || {});
	var U = LN.U;
	var Store = LN.Store;
	var Accounts = LN.Auth.Accounts;
	var Sessions = LN.Auth.Sessions;
	var Throttle = LN.Auth.Throttle;

	/****** config & init ******/
	Service.DEFAULT = {
		auth: {
			enabled: true,
			requireLoginBeforeSpawn: true,
			password: { iterations: 60000, minPasswordLen: 8 },
			throttle: {
				maxAttempts: 5, windowSec: 900, lockSec: 900,
				maxIpAttempts: 20, ipLockSec: 600,
				regWindowSec: 3600, maxRegistrations: 4
			},
			sessions: { accessTtlSec: 3600, refreshTtlSec: 30 * 86400 },
			devices: { newDeviceOtpSeam: true }
		}
	};

	// tickets issued but not yet redeemed (short-lived, single-use).
	var ticketStore = {};
	var activeByClient = {};   // client.index -> { accountId, sessionId, deviceId }
	var clientByAccount = {};  // accountId -> client.index (single active client map)

	// Hook the core (Init.js) sets to run after a client authenticates/restores,
	// e.g. to spawn the player / remove the pre-auth fade.
	Service.onAuthenticated = null;

	Service.init = function (config) {
		LN.Auth.Config = U.deepMerge(Service.DEFAULT.auth, (config && config.auth) || {});
		LN.Auth.failures = { account: {}, ip: {}, regIp: {} };
		ticketStore = {}; activeByClient = {}; clientByAccount = {};
		// ensure data files exist
		Store.init(config && config.paths);
		Store.getAccounts(); Store.getCharacters(); Store.getSessions(); Store.getDevices(); Store.securityLog();
		Sessions.pruneExpired(true);
		Store.saveAll();
		U.log("Auth Service initialised.");
		return LN.Auth.Config;
	};

	/****** security log ******/
	Service.log = function (action, outcome, detail, client) {
		try {
			var e = {
				ts: U.now(),
				action: action,
				outcome: outcome || "ok",
				accountId: (detail && detail.accountId) || null,
				detail: (detail && detail.detail) || ""
			};
			if (client) {
				e.clientName = client.name || null;
				e.ip = client.ip || null;
			}
			Store.appendSecurity(e, true);
		} catch (err) { U.warn("security log failed: " + err.message); }
	};

	/****** client binding helpers ******/
	function fireAuthenticated(client) {
		if (typeof Service.onAuthenticated === "function") {
			try { Service.onAuthenticated(client); } catch (e) { U.warn("onAuthenticated hook error: " + e.message); }
		}
	}
	function setClientAuth(client, accountId, sessionId, deviceId) {
		var idx = client.index;
		var previous = activeByClient[idx];
		if (previous && previous.accountId && clientByAccount[previous.accountId] === idx) {
			delete clientByAccount[previous.accountId];
		}
		activeByClient[idx] = { accountId: accountId, sessionId: sessionId, deviceId: deviceId };
		if (accountId) clientByAccount[accountId] = idx;
		try { client.setData("ln.auth.accountId", accountId || "", true); } catch (e) {}
		try { client.setData("ln.auth.authenticated", accountId ? true : false, true); } catch (e) {}
	}

	Service.authForClient = function (client) {
		return activeByClient[client && client.index] || null;
	};
	Service.isAuthenticated = function (client) {
		var rec = Service.authForClient(client);
		if (!rec || !rec.accountId) return false;
		var session = Sessions.getSession(rec.sessionId);
		if (!session || session.revoked || session.refreshExpiresAt < U.now()) {
			setClientAuth(client, null, null, null);
			return false;
		}
		return true;
	};
	Service.accountForClient = function (client) {
		var rec = Service.authForClient(client);
		return Service.isAuthenticated(client) && rec ? rec.accountId : null;
	};

	function getDeviceFingerprint(client) {
		var out = "";
		try { if (client.serial) out += client.serial; } catch (e) {}
		try { if (client.guid) out += ":" + (client.guid || ""); } catch (e) {}
		return out || ("ip:" + (client && client.ip ? client.ip : "unknown"));
	}

	/****** flows ******/
	Service.register = function (client, payload) {
		var ip = client && client.ip;
		if (!Throttle.allowRegister(ip)) {
			Service.log("register", "throttled", {}, client);
			return { ok: false, code: "rate_limited" };
		}
		var r = Accounts.createAccount(payload.username, payload.password, payload.email);
		if (!r.ok) { Service.log("register", "denied:" + r.code, {}, client); return r; }

		Throttle.clearFailures(r.accountId, ip);
		var deviceId = Sessions.deviceIdFor(getDeviceFingerprint(client));
		var device = Sessions.registerDevice(r.accountId, deviceId, deviceName(client));
		// The registering device is implicitly trusted - do not flag it as new.
		if (device.newDevice) { device.newDevice = false; Store.setDevice(device, true); }
		var sess = Sessions.issueForCredentials(r.accountId, deviceId);
		setClientAuth(client, r.accountId, sess.session.sessionId, deviceId);
		Service.log("register", "ok", { accountId: r.accountId, detail: "account+device registered" }, client);
		fireAuthenticated(client);
		return { ok: true, accountId: r.accountId, accessToken: sess.accessToken, refreshToken: sess.refreshToken, characterId: r.characterId };
	};

	Service.login = function (client, payload) {
		var username = U.normalizeId(payload.username);
		var ip = client && client.ip;
		var lock = Throttle.lockRemaining(username, ip);
		if (lock > 0) return { ok: false, code: "locked", lockRemaining: lock };

		var account = Accounts.findByLogin(username);
		if (!account || !Accounts.verifyPassword(payload.password, account.password)) {
			var remaining = Throttle.recordFailure(username, ip);
			Service.log("login", "bad_credentials", { accountId: username, detail: "remaining_lock=" + remaining }, client);
			return { ok: false, code: "invalid_credentials", lockRemaining: remaining };
		}
		if (Accounts.isBanned(account)) {
			Service.log("login", "banned", { accountId: account.accountId, detail: account.banReason || "" }, client);
			return { ok: false, code: "banned", reason: account.banReason };
		}

		Throttle.clearFailures(account.accountId, ip);
		Accounts.updateLastLogin(account, true);

		// Opportunistic PBKDF2 -> Argon2id upgrade (native present, login proved password).
		try {
			if (Accounts.needsUpgrade && Accounts.needsUpgrade(account.password)) {
				var upgraded = Accounts.makeHashSpec(payload.password);
				if (upgraded && upgraded.alg === "argon2id") {
					account.password = upgraded;
					Store.setAccount(account, true);
					Service.log("login", "hash_upgraded", { accountId: account.accountId, detail: "pbkdf2->argon2id" }, client);
				}
			}
		} catch (e) {}

		var deviceId = Sessions.deviceIdFor(getDeviceFingerprint(client));
		var device = Sessions.registerDevice(account.accountId, deviceId, deviceName(client));
		var isNew = !!device.newDevice;
		if (isNew) { device.newDevice = false; Store.setDevice(device, true); }

		var sess = Sessions.issueForCredentials(account.accountId, deviceId);
		setClientAuth(client, account.accountId, sess.session.sessionId, deviceId);
		Service.log("login", "ok", { accountId: account.accountId, detail: (isNew ? "new_device" : "existing_device") }, client);
		fireAuthenticated(client);
		return {
			ok: true, accountId: account.accountId, newDevice: isNew,
			accessToken: sess.accessToken, refreshToken: sess.refreshToken,
			characters: LN.Characters.listByAccount(account.accountId)
		};
	};

	// Returning device: presented stored refresh token restores the session.
	Service.refresh = function (client, payload) {
		var deviceId = Sessions.deviceIdFor(getDeviceFingerprint(client));
		var r = Sessions.refresh(payload.refreshToken, deviceId);
		if (!r.ok) { Service.log("refresh", "denied:" + r.code, {}, client); return r; }
		var account = Accounts.getAccount(r.session.accountId);
		if (!account || Accounts.isBanned(account)) return { ok: false, code: "banned" };
		setClientAuth(client, r.session.accountId, r.session.sessionId, r.session.deviceId);
		Service.log("refresh", "ok", { accountId: r.session.accountId, detail: "token rotated" }, client);
		fireAuthenticated(client);
		return { ok: true, accountId: r.session.accountId, accessToken: r.accessToken, refreshToken: r.refreshToken, characters: LN.Characters.listByAccount(r.session.accountId) };
	};

	Service.logout = function (client, allDevices) {
		var rec = Service.authForClient(client);
		if (!rec || !rec.accountId) return { ok: false, code: "not_authenticated" };
		var revoked;
		if (allDevices) {
			revoked = Sessions.revokeAllForAccount(rec.accountId, null, true);
		} else {
			revoked = Sessions.revokeSession(rec.sessionId, true) ? 1 : 0;
		}
		setClientAuth(client, null, null, null);
		Service.log(allDevices ? "logout_all" : "logout", "ok", { accountId: rec.accountId, detail: "revoked:" + revoked }, client);
		return { ok: true, revoked: revoked };
	};

	Service.listSessions = function (client) {
		var accountId = Service.accountForClient(client);
		if (!accountId) return { ok: false, code: "not_authenticated" };
		return { ok: true, sessions: Sessions.listSessions(accountId) };
	};

	Service.revokeSession = function (client, sessionId) {
		var rec = Service.authForClient(client);
		var accountId = rec && rec.accountId;
		if (!accountId) return { ok: false, code: "not_authenticated" };
		var mine = Sessions.listSessions(accountId);
		var ownsIt = mine.some(function (s) { return s.sessionId === sessionId; });
		if (!ownsIt) return { ok: false, code: "not_your_session" };
		Sessions.revokeSession(sessionId, true);
		var currentSessionRevoked = rec.sessionId === sessionId;
		if (currentSessionRevoked) setClientAuth(client, null, null, null);
		Service.log("revoke_session", "ok", { accountId: accountId, detail: "session=" + sessionId }, client);
		return { ok: true, currentSessionRevoked: currentSessionRevoked };
	};

	function deviceName(client) {
		try { if (client && client.episode) return String(client.episode); } catch (e) {}
		return "Game client";
	}

	/****** RP-server handoff tickets ******/
	// Short-lived single-use ticket another resource redeems for identity.
	Service.issueServerTicket = function (client, serverId) {
		var accountId = Service.accountForClient(client);
		if (!accountId) return { ok: false, code: "not_authenticated" };
		var account = Accounts.getAccount(accountId);
		if (!account || Accounts.isBanned(account)) return { ok: false, code: "account_unavailable" };
		var ticket = U.randomHex(20);
		ticketStore[ticket] = {
			accountId: accountId,
			clientIndex: client.index,
			serverId: serverId || null,
			expiresAt: U.now() + 30,
			redeemed: false
		};
		Service.log("issue_ticket", "ok", { accountId: accountId, detail: "server=" + (serverId || "?") }, client);
		return { ok: true, ticket: ticket };
	};

	// Redeem a previously-issued ticket. DELIBERATELY strips anything secret.
	Service.redeemTicket = function (ticket, serverId) {
		var t = ticketStore[ticket];
		if (!t) return { ok: false, code: "invalid_ticket" };
		if (t.redeemed) { delete ticketStore[ticket]; return { ok: false, code: "ticket_used" }; }
		if (t.expiresAt < U.now()) { delete ticketStore[ticket]; return { ok: false, code: "ticket_expired" }; }
		if (serverId && t.serverId && t.serverId !== serverId) { delete ticketStore[ticket]; return { ok: false, code: "wrong_server" }; }
		t.redeemed = true;
		delete ticketStore[ticket];

		var account = Accounts.getAccount(t.accountId);
		if (!account || Accounts.isBanned(account)) return { ok: false, code: "account_unavailable" };
		return {
			ok: true,
			identity: {
				authenticated: true,
				accountId: account && account.accountId,
				username: account && account.displayName,
				roles: account && account.roles ? account.roles.slice() : [],
				permissions: account && account.permissions ? account.permissions.slice() : [],
				sessionValid: true,
				status: account ? account.status : "unknown",
				banned: !!account && account.status === "banned",
				characterIds: account && account.characterIds ? account.characterIds.slice() : []
			}
		};
	};

	// Expose full (but secret-free) identity for an already-authenticated client.
	Service.getAccountIdentity = function (client) {
		var accountId = Service.accountForClient(client);
		if (!accountId) return { authenticated: false };
		var account = Accounts.getAccount(accountId);
		return {
			authenticated: true,
			accountId: accountId,
			username: account ? account.displayName : accountId,
			roles: account ? account.roles.slice() : [],
			permissions: account ? account.permissions.slice() : [],
			sessionValid: true,
			banned: !!account && account.status === "banned",
			characterIds: account ? account.characterIds.slice() : []
		};
	};

	Service.onClientQuit = function (client) {
		var rec = activeByClient[client.index];
		if (rec && rec.accountId && clientByAccount[rec.accountId] === client.index) {
			delete clientByAccount[rec.accountId];
		}
		delete activeByClient[client.index];
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
