"use strict";
/*
 * Liberty Network - Player lifecycle / spawn (LN.Spawn)
 *
 * The single gate in/out of the world. Handles both the initial spawn (after
 * authentication) and death respawn. Subsystems plug into this via
 * LN.Subsystems:
 *   resolveSpawnPoint  - (client, currentPos) => pos|null
 *   beforeSpawn        - (client, opts) => false to veto
 *   afterSpawn         - (client, opts) => void
 *   onDeath            - (client, info) => void
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var SP = (LN.Spawn = LN.Spawn || {});
	var U = LN.U;
	var Subs = LN.Subsystems;

	SP.DEFAULT = {
		position: [239.59, 128.88, 215.63],
		rotation: 0.0,
		respawnDelaySec: 5,
		cooldownMs: 5000,
		healthPollMs: 500,
		fadeOnSpawn: true
	};

	var cfg = null;
	// client.index -> { dead, respawnTimer, lastSpawnMs }
	var state = {};

	SP.init = function (config) {
		cfg = U.deepMerge(SP.DEFAULT, (config && config.spawn) || {});
		state = {};
		SP.state = cfg;
		return cfg;
	};

	function conf() { return cfg || SP.DEFAULT; }

	function requiresAuthentication() {
		var auth = LN.Config && LN.Config.auth;
		return !auth || (auth.enabled !== false && auth.requireLoginBeforeSpawn !== false);
	}

	function canEnterWorld(client) {
		if (!requiresAuthentication()) return true;
		var auth = LN.Auth && LN.Auth.Service;
		return !!(auth && auth.isAuthenticated && auth.isAuthenticated(client));
	}

	SP.getConfig = function () { return conf(); };

	// A stable copy of the current spawn position/rotation.
	SP.defaultPoint = function () {
		var c = conf();
		return { position: (c.position || []).slice(), rotation: c.rotation || 0 };
	};

	// Resolve where a client should spawn, letting subsystems override.
	SP.resolvePoint = function (client) {
		var point = SP.defaultPoint();
		if (Subs && Subs.resolve) {
			var r = Subs.resolve("resolveSpawnPoint", client, point);
			if (r.value && r.value.position) point = r.value;
		}
		return point;
	};

	// Send the canonical spawn state to the client (loops stop pinging).
	// Positional primitives only (this GTAC build can't marshal object args).
	SP.pushState = function (client, extra) {
		var reason = (extra && extra.reason) || "spawn";
		var spawned = "1";
		var dead = "0";
		var meta = JSON.stringify({ reason: reason, at: U.now(), dead: false });
		try { triggerNetworkEvent("ln:spawnState", client, spawned, dead, meta); } catch (e) { /* ignore */ }
	};

	// Spawn (or teleport) a client into the world. The single world-entry point.
	SP.spawnPlayer = function (client, opts) {
		if (!client) return { ok: false, code: "no_client" };
		if (!canEnterWorld(client)) return { ok: false, code: "not_authenticated" };
		opts = opts || {};

		var rec = (state[client.index] = state[client.index] || { dead: false, respawnTimer: null, lastSpawnMs: 0 });

		// Pre-hooks may veto.
		if (Subs && Subs.emit) {
			var pre = Subs.emit("beforeSpawn", client, { reason: opts.reason || "spawn" });
			if (pre.veto) return { ok: false, code: "vetoed" };
		}

		var point = opts.position ? { position: opts.position, rotation: opts.rotation || 0 } : SP.resolvePoint(client);

		try { spawnPlayer(client, point.position, point.rotation); } catch (e) { U.warn("spawnPlayer failed: " + e.message); }

		var fade = (opts.fade !== undefined) ? opts.fade : conf().fadeOnSpawn;
		if (fade) { try { fadeCamera(client, true); } catch (e2) { /* ignore */ } }

		rec.dead = false;
		rec.lastSpawnMs = U.nowMs();

		if (Subs && Subs.emit) Subs.emit("afterSpawn", client, { point: point, reason: opts.reason || "spawn" });

		SP.pushState(client, { reason: opts.reason || "spawn" });
		return { ok: true, point: point };
	};

	// Handle a death: emit hooks, schedule respawn after the configured delay.
	SP.onDeath = function (client) {
		if (!client) return { ok: false, code: "no_client" };
		if (!canEnterWorld(client)) return { ok: false, code: "not_authenticated" };
		var now = U.now();
		var rec = (state[client.index] = state[client.index] || { dead: false, respawnTimer: null, lastSpawnMs: 0 });

		// Dedupe: ignore if already dead/queued or within the respawn cooldown.
		if (rec.dead) return { ok: false, code: "already_dead" };
		if (rec.respawnTimer) return { ok: false, code: "respawning" };

		rec.dead = true;

		// Inform subsystems a player died.
		if (Subs && Subs.emit) Subs.emit("onDeath", client, { at: now });

		var delayMs = conf().respawnDelaySec * 1000;
		rec.respawnTimer = setTimeout(function () {
			rec.respawnTimer = null;
			SP.spawnPlayer(client, { reason: "respawn" });
		}, delayMs);

		return { ok: true, delayMs: delayMs };
	};

	// Manual respawn (used by /respawn and tests) - respects a cooldown.
	SP.forceRespawn = function (client) {
		if (!client) return { ok: false, code: "no_client" };
		if (!canEnterWorld(client)) return { ok: false, code: "not_authenticated" };
		var now = U.nowMs();
		var rec = (state[client.index] = state[client.index] || { dead: false, respawnTimer: null, lastSpawnMs: 0 });
		if (now - rec.lastSpawnMs < conf().cooldownMs && rec.dead !== true) {
			return { ok: false, code: "cooldown", remainingMs: conf().cooldownMs - (now - rec.lastSpawnMs) };
		}
		return SP.spawnPlayer(client, { reason: "manual" });
	};

	// Cancel any pending respawn (e.g. client quit; fire-and-forget).
	SP.cancel = function (client) {
		var rec = state[client.index];
		if (rec && rec.respawnTimer) {
			try { clearTimeout(rec.respawnTimer); } catch (e) { /* ignore */ }
			rec.respawnTimer = null;
		}
		if (rec) rec.dead = false;
	};

	SP.onClientQuit = function (client) {
		SP.cancel(client);
		delete state[client.index];
	};

	// Command helpers
	function msg(client, text, colour) {
		try { if (messageClient) { messageClient(text, client, colour || COLOUR_YELLOW); return; } } catch (e) {}
		try { if (outputChatBox) outputChatBox(text, client, 255, 255, 0); } catch (e2) {}
	}

	SP.registerCommands = function () {
		if (typeof addCommandHandler !== "function") return;
		addCommandHandler("respawn", function (cmd, params, client) {
			var r = SP.forceRespawn(client);
			if (!r.ok) return msg(client, "Respawn blocked: " + r.code, COLOUR_RED);
			msg(client, "Respawning...", COLOUR_YELLOW);
		});
		addCommandHandler("kill", function (cmd, params, client) {
			try { if (client.player) client.player.health = -100; } catch (e) {}
			msg(client, "Killed (sandbox test).", COLOUR_YELLOW);
		});
	};

	// Expose to other server resources via exportFunction (idempotent).
	SP.registerAPI = function () {
		if (typeof exportFunction !== "function") return;
		exportFunction("ln_spawn_player", function (client, opts) { return SP.spawnPlayer(client, opts || {}); });
		exportFunction("ln_spawn_respawn", function (client) { return SP.forceRespawn(client); });
		exportFunction("ln_spawn_onDeath", function (client) { return SP.onDeath(client); });
		exportFunction("ln_spawn_state", function (client) { return SP.state[client && client.index] || null; });
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
