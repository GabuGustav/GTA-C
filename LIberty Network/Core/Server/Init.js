"use strict";
/*
 * =============================================================
 *  Liberty Network RP - Server Core Bootstrap
 *
 *  Phase 1: foundation (roster, config, bridge helpers).
 *  Phase 2: boots the central Authorization/Account Service:
 *    - registration / login / refresh / logout / device sessions
 *    - multi-character accounts (characters != account identity)
 *    - RP-server identity tickets (no passwords/tokens leaked)
 *    - brute-force throttle + security log
 *    - spawn is gated until the account is authenticated.
 *
 *  GTAC conventions on this build:
 *    - OnPlayerJoined / OnPlayerQuit pass ZERO args -> diff getClients().
 *    - Server -> client : triggerNetworkEvent(name, target|null, ...)
 *    - Client -> server : addEvent(name) + addNetworkHandler(name, cb)
 *    - Config : loadTextFile() with deep-merged defaults.
 * =============================================================
 */
(function (root) {
	"use strict";

	// Namespace: LN (Liberty Network)
	root.LN = root.LN || {};
	var LN = root.LN;

	var CONFIG_PATH = "Configs/config.json";

	// ------------------------------------------------------------------
	// Defaults - deep-merged with Configs/config.json at resource start.
	// ------------------------------------------------------------------
	var DEFAULTS = {
		server_id: "liberty_network",
		server_display_name: "Liberty Network",
		debug: true,

		player: {
			spawn: [39.59, 128.88, 15.63],
			spawn_rotation: 0.0
		},

		messages: {
			welcome: "Welcome to Liberty Network.",
			help_hint: "Register or log in with /register or /login, then /help.",
			help: "Liberty Network RP: /register <name> <pass> [email], /login <name> <pass>, /logout, /sessions, /revoke <id>. /logoutall = admin only."
		},

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

	// ------------------------------------------------------------------
	// Small utilities (kept local to avoid a dependency in this file).
	// ------------------------------------------------------------------
	function safeJSONParse(raw, fallback) {
		try {
			if (!raw || raw.trim() === "") return fallback;
			var parsed = JSON.parse(raw);
			return parsed == null ? fallback : parsed;
		} catch (e) { return fallback; }
	}

	function deepMerge(base, override) {
		if (!override || typeof override !== "object") return base;
		var out = {};
		var key;
		for (key in base) out[key] = base[key];
		for (key in override) {
			if (!Object.prototype.hasOwnProperty.call(override, key)) continue;
			var bv = out[key];
			var ov = override[key];
			if (ov && typeof ov === "object" && !Array.isArray(ov) &&
				bv && typeof bv === "object" && !Array.isArray(bv)) {
				out[key] = deepMerge(bv, ov);
			} else {
				out[key] = ov;
			}
		}
		return out;
	}

	function log(msg) { if (LN.Config && LN.Config.debug === true) console.log("[LN] " + msg); }
	function warn(msg) { console.log("[LN] WARN: " + msg); }

	// ------------------------------------------------------------------
	// Runtime state.
	// ------------------------------------------------------------------
	LN.state = { started: false, onlineCount: 0 };
	LN.players = {}; // keyed by client.index

	// ------------------------------------------------------------------
	// Config.
	// ------------------------------------------------------------------
	LN.loadConfig = function () {
		var raw = loadTextFile(CONFIG_PATH);
		var fileConfig = safeJSONParse(raw, {});
		LN.Config = deepMerge(DEFAULTS, fileConfig);
		log("Config loaded from " + CONFIG_PATH);
		return LN.Config;
	};

	// ------------------------------------------------------------------
	// Networking bridge helpers.
	// ------------------------------------------------------------------
	LN.sendToClient = function (client, eventName /*, ...args */) {
		var args = Array.prototype.slice.call(arguments, 2);
		try { triggerNetworkEvent.apply(null, [eventName, client].concat(args)); } catch (e) {
			warn("Failed to send " + eventName + " to " + (client && client.name) + ": " + e.message);
		}
	};
	LN.broadcast = function (eventName /*, ...args */) {
		var args = Array.prototype.slice.call(arguments, 1);
		try { triggerNetworkEvent.apply(null, [eventName, null].concat(args)); } catch (e) {
			warn("Failed to broadcast " + eventName + ": " + e.message);
		}
	};

	function enableSpawn(client) {
		var auth = LN.Auth && LN.Auth.Service;
		var authConfig = LN.Config && LN.Config.auth;
		var requiresLogin = !authConfig || (authConfig.enabled !== false && authConfig.requireLoginBeforeSpawn !== false);
		if (!requiresLogin || (auth && auth.isAuthenticated && auth.isAuthenticated(client))) {
			if (LN.Spawn && LN.Spawn.spawnPlayer) {
				LN.Spawn.spawnPlayer(client, { reason: "enable" });
			} else {
				spawnPlayer(client, LN.Config.player.spawn);
				try { fadeCamera(client, true); } catch (e) {}
			}
		}
	}

	// Called by the auth service after a successful register/login/refresh.
	LN.onPlayerAuthenticated = function (client) {
		log("Player authenticated: " + (client && client.name));
		// Account-side join gate (tempban expiry honoured; banned = no spawn).
		try {
			if (LN.Admin && LN.Admin.Service && LN.Admin.Service.available && LN.Admin.Bans) {
				var accountId = LN.Auth.Service.accountForClient(client);
				var account = accountId ? LN.Auth.Accounts.getAccount(accountId) : null;
				var gate = LN.Admin.Bans.checkJoin(client, account);
				if (gate.banned) {
					LN.Admin.Service.log("auth_rejected", "ok", { accountId: accountId, detail: "kind=" + gate.kind + " reason=" + gate.reason }, client);
					try { LN.Auth.Service.logout(client, true); } catch (e3) {}
					try {
						if (client && typeof client.disconnect === "function") client.disconnect("Banned: " + gate.reason);
					} catch (e4) {}
					return;
				}
				if (LN.Admin.Network && LN.Admin.Network.pushState) LN.Admin.Network.pushState(client);
			}
		} catch (e) {}
		enableSpawn(client);
		if (LN.Auth && LN.Auth.Network && LN.Auth.Network.pushState) {
			LN.Auth.Network.pushState(client);
		} else {
			LN.sendToClient(client, "ln:authState", { authenticated: true, accountId: "" });
		}
	};

	// ------------------------------------------------------------------
	// Player lifecycle (getClients() diff pattern).
	// ------------------------------------------------------------------
	function findNewClients() {
		var current = getClients();
		var found = [];
		for (var i = 0; i < current.length; i++) {
			var c = current[i];
			if (c && !LN.players[c.index]) found.push(c);
		}
		return found;
	}

	function findGoneClients() {
		var current = getClients();
		var map = {};
		for (var i = 0; i < current.length; i++) {
			if (current[i]) map[current[i].index] = true;
		}
		var gone = [];
		for (var idx in LN.players) {
			if (!map[idx]) gone.push(LN.players[idx].client);
		}
		return gone;
	}

	LN.onPlayerJoined = function (client) {
		if (LN.players[client.index]) return;

		// Admin join gate: banned IP/HWID never gets past the door
		// (account bans are refused at login/refresh by the Auth Service).
		try {
			if (LN.Admin && LN.Admin.Service && LN.Admin.Service.available && LN.Admin.Bans) {
				var gate = LN.Admin.Bans.checkJoin(client, null);
				if (gate.banned) {
					LN.Admin.Service.log("join_rejected", "ok", { detail: "kind=" + gate.kind + " reason=" + gate.reason }, client);
					try {
						if (client && typeof client.disconnect === "function") client.disconnect("Banned: " + gate.reason);
						else if (typeof disconnectClient === "function") disconnectClient(client);
					} catch (e2) {}
					return;
				}
			}
		} catch (e) {}

		LN.players[client.index] = {
			client: client,
			joinedAt: Date.now(),
			authenticated: false,
			character: null
		};
		LN.state.onlineCount = Object.keys(LN.players).length;
		log("Player joined: " + client.name);

		LN.sendToClient(client, "ln:greet",
			LN.Config.server_display_name || "Liberty Network",
			LN.Config.messages.welcome || "",
			LN.Config.messages.help_hint || "",
			LN.state.onlineCount);

		var authEnabled = LN.Config.auth && LN.Config.auth.enabled !== false;
		var requireLogin = authEnabled && LN.Config.auth.requireLoginBeforeSpawn !== false;

		if (requireLogin) {
			try { fadeCamera(client, false); } catch (e) {}
			if (LN.Auth && LN.Auth.Network && LN.Auth.Network.pushState) {
				LN.Auth.Network.pushState(client);
			}
			return;
		}

		enableSpawn(client);
	};

	LN.onPlayerQuit = function (client) {
		if (!LN.players[client.index]) return;
		delete LN.players[client.index];
		LN.state.onlineCount = Object.keys(LN.players).length;
		if (LN.Auth && LN.Auth.Service && LN.Auth.Service.onClientQuit) {
			LN.Auth.Service.onClientQuit(client);
		}
		// Cancel any pending death respawn for the departed client.
		if (LN.SpawnNet && LN.SpawnNet.cancelFor) LN.SpawnNet.cancelFor(client);
		log("Player quit: " + client.name);
	};

	// ------------------------------------------------------------------
	// Core event handlers (registered at script load time).
	// ------------------------------------------------------------------
	addEventHandler("OnPlayerJoined", function () {
		var newcomers = findNewClients();
		for (var i = 0; i < newcomers.length; i++) LN.onPlayerJoined(newcomers[i]);
	});

	addEventHandler("OnPlayerQuit", function () {
		var leavers = findGoneClients();
		for (var i = 0; i < leavers.length; i++) LN.onPlayerQuit(leavers[i]);
	});

	addCommandHandler("help", function (command, params, client) {
		var text = LN.Config.messages.help || "Liberty Network RP is online.";
		try { messageClient(text, client, COLOUR_GREEN); }
		catch (e) { try { outputChatBox(text, client, 0, 255, 0); } catch (e2) { /* ignore */ } }
	});

	// ------------------------------------------------------------------
	// Resource lifecycle.
	// ------------------------------------------------------------------
	bindEventHandler("OnResourceStart", thisResource, function (event, resource) {
		LN.loadConfig();
		LN.state.started = true;
		log("Resource start: " + (resource && resource.name));

		// Boot the Spawn/Lifecycle subsystem (subsystems can register before this).
		try {
			if (LN.Subsystems && LN.Subsystems.init) LN.Subsystems.init();
			if (LN.Spawn && LN.Spawn.init) LN.Spawn.init(LN.Config);
			if (LN.SpawnNet && LN.SpawnNet.init) LN.SpawnNet.init();
			if (LN.Spawn && LN.Spawn.registerCommands) LN.Spawn.registerCommands();
			if (LN.Spawn && LN.Spawn.registerAPI) LN.Spawn.registerAPI();
			log("Spawn subsystem online.");
		} catch (err) {
			warn("Spawn subsystem failed to start: " + err.message);
		}

		// Boot the Authorization/Account Service.
		try {
			try {
				if (LN.Auth.Native && LN.Auth.Native.detect)
					log("Native auth module: " + (LN.Auth.Native.detect() ? "active (v" + LN.Auth.Native.version + ")" : "absent (JS fallbacks)"));
			} catch (e) { log("Native auth module: absent (JS fallbacks)"); }
			LN.Auth.Service.init(LN.Config);
			LN.Auth.Network.init();
			LN.Auth.API.init();
			LN.Auth.Service.onAuthenticated = LN.onPlayerAuthenticated;
			if (typeof setInterval === "function") {
				setInterval(function () {
					if (LN.Auth && LN.Auth.Throttle) LN.Auth.Throttle.cleanup();
					if (LN.Auth && LN.Auth.Sessions) LN.Auth.Sessions.pruneExpired(true);
					if (LN.Admin && LN.Admin.Bans) LN.Admin.Bans.pruneExpired();
				}, 60 * 1000);
			}
			log("Auth service online.");
		} catch (err) {
			warn("Auth service failed to start: " + err.message);
		}

		// Boot the Admin module (depends on Auth; refuses without it).
		try {
			if (LN.Admin && LN.Admin.Service && LN.Admin.Service.init) {
				if (LN.Admin.Service.init(LN.Config)) {
					if (LN.Admin.Network && LN.Admin.Network.init) LN.Admin.Network.init();
					if (LN.Admin.Network && LN.Admin.Network.registerCommands) LN.Admin.Network.registerCommands();
					log("Admin module online.");
				} else {
					warn("Admin module offline (Auth unavailable).");
				}
			}
		} catch (err) {
			warn("Admin module failed to start: " + err.message);
		}

		// Prime the registry with any clients already connected.
		var existing = findNewClients();
		for (var i = 0; i < existing.length; i++) {
			LN.players[existing[i].index] = {
				client: existing[i],
				joinedAt: Date.now(),
				authenticated: false,
				character: null
			};
		}
		LN.state.onlineCount = Object.keys(LN.players).length;
	});

	bindEventHandler("OnResourceStop", thisResource, function () {
		LN.state.started = false;
		if (LN.Spawn && LN.Spawn.onClientQuit) {
			// Clear all pending respawn state.
			for (var idx in LN.players) LN.Spawn.onClientQuit(LN.players[idx].client);
		}
		LN.players = {};
		LN.state.onlineCount = 0;
		if (LN.Subsystems && LN.Subsystems.clear) LN.Subsystems.clear();
		log("Resource stopped.");
	});

})(typeof globalThis !== "undefined" ? globalThis : this);
