"use strict";
/*
 * Liberty Network - Spawn network wiring (LN.SpawnNet)
 *
 * Wires GTAC death events + the client respawn request into LN.Spawn.
 *
 * Death detection (two belts):
 *   1. Server-side OnPedWasted (the player's own ped wasted).
 *   2. Client-driven ln:requestRespawn (client health poll / OnPedWasted),
 *      sent through a network event - robust against sandbox quirks.
 *
 * The server remains the authority: respawns are gated/scheduled here and
 * routed through LN.Spawn so every subsystem hook still runs.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var Net = (LN.SpawnNet = LN.SpawnNet || {});
	var U = LN.U;
	var SP = LN.Spawn;

	// Map a GTAC "element" (a ped) back to its client. When GTAC gives us the
	// client directly we use it; otherwise fall back to getClients() diffing.
	function clientFromActor(actor) {
		if (!actor) return null;
		// actor may already be the client (some events pass the client).
		if (actor.index !== undefined && actor.name !== undefined) return actor;
		// actor may be a player element that links to a client.
		try {
			if (actor.player && actor.player.index !== undefined) {
				var clients = getClients();
				for (var i = 0; i < clients.length; i++) {
					if (clients[i].index === actor.player.index) return clients[i];
				}
			}
		} catch (e) { /* ignore */ }
		// If it looks like the local player element of the calling context, ignore.
		return null;
	}

	// Resolve the requesting client for a network event. On this GTAC build,
	// network handlers receive (client, payload), so use that directly.
	function onClientRequest(client) {
		if (!client) return;
		SP.onDeath(client);
	}

	Net.init = function () {
		if (Net.initialized) return;
		Net.initialized = true;

		// Server-side death event. Some builds pass the wasted element, others
		// pass nothing and rely on the client request - we use the request as
		// the primary signal (two belts covered), so this is best-effort.
		try {
			addEventHandler("OnPedWasted", function (event, actor) {
				var client = clientFromActor(actor);
				if (!client) return; // not our player (e.g. an NPC or unknown)
				SP.onDeath(client);
			});
		} catch (e) { U.warn("Could not bind OnPedWasted: " + e.message); }

		// Client-driven request (primary). Fire-and-forget respawn request.
		try {
			addEvent("ln:requestRespawn");
			addNetworkHandler("ln:requestRespawn", function (client) {
				onClientRequest(client);
			});
		} catch (e) { U.warn("Could not bind ln:requestRespawn: " + e.message); }
	};

	// Used by Init.js on player quit to cancel any pending respawn.
	Net.cancelFor = function (client) { SP.onClientQuit(client); };
})(typeof globalThis !== "undefined" ? globalThis : this);