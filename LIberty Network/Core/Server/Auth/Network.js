"use strict";
/*
 * Liberty Network - Auth network layer (LN.Auth.Network)
 *
 * Wires the GTAC networking to the Auth Service. Receives register/login/
 * refresh/logout/device actions from the client, and pushes auth state and
 * errors back. Also exposes the in-game chat commands for the foundation.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var N = (LN.Auth.Network = LN.Auth.Network || {});
	var U = LN.U;
	var Service = LN.Auth.Service;

	// Server -> client. IMPORTANT: this GTAC build cannot marshal JS objects as
	// network args (CArgument::Create(ARGUMENT_JSVALUE) fails), so we only send
	// primitives; structured data is JSON-stringified.
	function send(client, eventName /*, ...args */) {
		var args = Array.prototype.slice.call(arguments, 2);
		try { triggerNetworkEvent.apply(null, [eventName, client].concat(args)); return; } catch (e) {}
		try { if (pushClientEvent) pushClientEvent.apply(null, [client, eventName].concat(args)); } catch (e2) {}
	}

	function sendError(client, code, extra) {
		var msg = (extra && extra.message) || code;
		send(client, "ln:authError", code || "", msg || "", (extra && extra.lockRemaining) || 0);
	}

	function pushState(client) {
		var accountId = Service.accountForClient(client);
		var authed = accountId ? "1" : "0";
		var data = { authenticated: !!accountId, roles: [], permissions: [], characters: [] };
		if (accountId) {
			var id = Service.getAccountIdentity(client);
			data.roles = id.roles;
			data.permissions = id.permissions;
			data.characters = LN.Characters.listByAccount(accountId);
		}
		send(client, "ln:authState", authed, accountId || "", JSON.stringify(data));
	}

	N.pushState = pushState;

	function registerEvent(name) { try { if (typeof addEvent === "function") addEvent(name); } catch (e) {} }

	N.init = function () {
		if (N.initialized) return;
		N.initialized = true;

		registerEvent("ln:register");
		addNetworkHandler("ln:register", function (client, username, password, email) {
			var r = Service.register(client, { username: username, password: password, email: email });
			if (!r.ok) return void sendError(client, r.code, r);
			pushState(client);
			send(client, "ln:authResult", "register", "1", r.accountId || "", r.refreshToken || "", JSON.stringify({ newDevice: true, characters: LN.Characters.listByAccount(r.accountId) }));
		});

		registerEvent("ln:login");
		addNetworkHandler("ln:login", function (client, username, password) {
			var r = Service.login(client, { username: username, password: password });
			if (!r.ok) return void sendError(client, r.code, r);
			pushState(client);
			send(client, "ln:authResult", "login", "1", r.accountId || "", r.refreshToken || "", JSON.stringify({ newDevice: !!r.newDevice, characters: r.characters }));
		});

		registerEvent("ln:refresh");
		addNetworkHandler("ln:refresh", function (client, refreshToken) {
			var r = Service.refresh(client, { refreshToken: refreshToken });
			if (!r.ok) return void sendError(client, r.code, r);
			pushState(client);
			send(client, "ln:authResult", "refresh", "1", r.accountId || "", r.refreshToken || "", JSON.stringify({ characters: r.characters }));
		});

		registerEvent("ln:logout");
		addNetworkHandler("ln:logout", function (client, all) {
			var r = Service.logout(client, all === "1" || all === true);
			if (!r.ok) return void sendError(client, r.code, r);
			pushState(client);
			send(client, "ln:authResult", "logout", "1", "", "", JSON.stringify({ revoked: r.revoked }));
		});

		registerEvent("ln:listSessions");
		addNetworkHandler("ln:listSessions", function (client) {
			var r = Service.listSessions(client);
			if (!r.ok) return void sendError(client, r.code, r);
			send(client, "ln:sessionList", JSON.stringify(r.sessions || []));
		});

		registerEvent("ln:revokeSession");
		addNetworkHandler("ln:revokeSession", function (client, sessionId) {
			var r = Service.revokeSession(client, sessionId);
			if (!r.ok) return void sendError(client, r.code, r);
			if (r.currentSessionRevoked) pushState(client);
			send(client, "ln:authResult", "revoke", "1", "", sessionId || "", JSON.stringify({}));
		});

		N.registerCommands();
	};

	function msg(client, text, colour) {
		try { if (messageClient) { messageClient(text, client, colour || COLOUR_YELLOW); return; } } catch (e) {}
		try { if (outputChatBox) outputChatBox(text, client, 255, 255, 0); } catch (e2) {}
	}

	N.registerCommands = function () {
		if (typeof addCommandHandler !== "function") return;

		addCommandHandler("register", function (cmd, params, client) {
			var p = parseArgs(params);
			if (!p[0] || !p[1]) return msg(client, "Usage: /register <username> <password> [email]", COLOUR_RED);
			var r = Service.register(client, { username: p[0], password: p[1], email: p[2] });
			if (!r.ok) return msg(client, "Register failed: " + r.code, COLOUR_RED);
			msg(client, "Account created. Welcome, " + r.accountId + "!", COLOUR_GREEN);
			pushState(client);
		});

		addCommandHandler("login", function (cmd, params, client) {
			var p = parseArgs(params);
			if (!p[0] || !p[1]) return msg(client, "Usage: /login <username> <password>", COLOUR_RED);
			var r = Service.login(client, { username: p[0], password: p[1] });
			if (!r.ok) return msg(client, "Login failed: " + r.code, COLOUR_RED);
			msg(client, "Logged in. Welcome back, " + r.accountId + "!", COLOUR_GREEN);
			pushState(client);
		});

		addCommandHandler("logout", function (cmd, params, client) {
			var r = Service.logout(client, false);
			if (!r.ok) return msg(client, "Not logged in.", COLOUR_RED);
			msg(client, "Logged out on this device.", COLOUR_YELLOW);
			pushState(client);
		});

		addCommandHandler("logoutall", function (cmd, params, client) {
			// Admin/console only: fail closed if the Admin module is missing.
			var roles = LN.Admin && LN.Admin.Roles;
			var gate = (roles && roles.require) ? roles.require(client, "logoutall") : { ok: false };
			if (!gate.ok) return msg(client, "logoutall is admin only (console or admin).", COLOUR_RED);
			var r = Service.logout(client, true);
			if (!r.ok) return msg(client, "Not logged in.", COLOUR_RED);
			msg(client, "Logged out of all devices. (" + r.revoked + " session(s) revoked)", COLOUR_YELLOW);
			pushState(client);
		});

		addCommandHandler("sessions", function (cmd, params, client) {
			var r = Service.listSessions(client);
			if (!r.ok) return msg(client, "Not logged in.", COLOUR_RED);
			if (!r.sessions.length) return msg(client, "No active sessions.", COLOUR_YELLOW);
			var lines = ["Active sessions:"];
			r.sessions.forEach(function (s) {
				lines.push("  " + s.sessionId + " | device=" + s.deviceId + " | until " + s.accessExpiresAt);
			});
			msg(client, lines.join("\n"), COLOUR_YELLOW);
		});

		addCommandHandler("revoke", function (cmd, params, client) {
			var sid = String(params || "").trim();
			if (!sid) return msg(client, "Usage: /revoke <sessionId>", COLOUR_RED);
			var r = Service.revokeSession(client, sid);
			if (!r.ok) return msg(client, "Revoke failed: " + r.code, COLOUR_RED);
			if (r.currentSessionRevoked) pushState(client);
			msg(client, "Session revoked.", COLOUR_GREEN);
		});
	};

	function parseArgs(str) {
		return String(str || "").trim().split(/\s+/).filter(function (x) { return x; });
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
