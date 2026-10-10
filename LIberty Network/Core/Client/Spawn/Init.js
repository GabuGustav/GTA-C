"use strict";
/*
 * Liberty Network - Client spawn driver (LN.SpawnClient)
 *
 * Detects player death on the client and asks the server to respawn, since
 * sandbox death detection is unreliable. Two belts:
 *   1. OnPedWasted event -> triggerNetworkEvent("ln:requestRespawn").
 *   2. Health poll fallback -> if health <= 0, keep sending the request until
 *      the server confirms a spawn with "ln:spawnState".
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var SC = (LN.SpawnClient = LN.SpawnClient || {});
	var U = LN.U;

	var POLL_MS = 500;             // default, overridable via config push
	var REQUEST_RETRY_MS = 800;    // how often to re-request while unspawned
	var MAX_RETRIES = 30;          // safety cap per death
	var timer = null;
	var retries = 0;
	var pendingDeath = false;
	var lastHealth = 100;
	var networkBound = false;

	function log(msg) { try { console.log("[LN:SpawnClient] " + msg); } catch (e) {} }

	function requestRespawn() {
		try { triggerNetworkEvent("ln:requestRespawn"); } catch (e) { /* ignore */ }
	}

	// Start/stop the fallback health monitor.
	function startMonitor() {
		stopMonitor();
		pendingDeath = false;
		retries = 0;
		timer = setInterval(function () {
			try {
				if (typeof localPlayer === "undefined" || !localPlayer) return;
				var hp = localPlayer.health;
				if (typeof hp !== "number") return;

				if (hp <= 0 && lastHealth > 0) {
					// Death detected via health.
					pendingDeath = true;
					retries = 0;
					log("Health-based death detected, requesting respawn");
					requestRespawn();
				}
				lastHealth = hp;

				// If we've requested but the server hasn't confirmed, keep asking.
				if (pendingDeath) {
					retries++;
					if (retries <= MAX_RETRIES) {
						requestRespawn();
					} else {
						pendingDeath = false; // stop; /respawn is the manual fallback
					}
				}
			} catch (e) { /* ignore */ }
		}, POLL_MS);
	}

	function stopMonitor() {
		if (timer && typeof clearInterval === "function") {
			try { clearInterval(timer); } catch (e) {}
		}
		timer = null;
	}

	function confirmSpawn() {
		pendingDeath = false;
		retries = 0;
		lastHealth = 100;
	}

	function bindNetworkHandlers() {
		if (networkBound) return;
		networkBound = true;
		try {
			addNetworkHandler("ln:spawnState", function () {
				if (arguments[0] === "1" || arguments[0] === true) confirmSpawn();
			});
		} catch (e) {
			networkBound = false;
			log("Could not bind ln:spawnState: " + e.message);
		}
	}

	SC.init = function () {
		if (SC.initialized) return;
		SC.initialized = true;

		bindNetworkHandlers();

		// Belt 1: explicit death event.
		try {
			addEventHandler("OnPedWasted", function (event, ped) {
				if (typeof localPlayer !== "undefined" && ped && ped === localPlayer) {
					pendingDeath = true;
					retries = 0;
					log("OnPedWasted fired, requesting respawn");
					requestRespawn();
				} else if (typeof localPlayer !== "undefined" && !ped) {
					// Some builds fire without the actor; treat as own death.
					pendingDeath = true;
					retries = 0;
					requestRespawn();
				}
			});
		} catch (e) { /* ignore */ }

		// Belt 2: continuous health monitor fallback.
		startMonitor();

		// Expose manual command (server also has /respawn; this forces a local retry).
		try {
			if (typeof addCommandHandler === "function") {
				addCommandHandler("retryrespawn", function () { requestRespawn(); });
			}
		} catch (e) {}
	};

	SC.stop = function () {
		stopMonitor();
		pendingDeath = false;
		retries = 0;
	};

	bindNetworkHandlers();
})(typeof globalThis !== "undefined" ? globalThis : this);
