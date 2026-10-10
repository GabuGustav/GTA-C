"use strict";
/*
 * =============================================================
 *  Liberty Network RP - Client Core Bootstrap (Phase 1)
 *
 *  Verifies the resource loads client-side and proves the
 *  server <-> client bridge works (ln:greet).
 * =============================================================
 */
(function (root) {
	"use strict";

	// Namespace: LN (Liberty Network)
	root.LN = root.LN || {};
	var LN = root.LN;

	LN.state = {
		ready: false
	};

	function log(msg) {
		console.log("[LN] " + msg);
	}

	// Push a message into the chat window (best-effort across contexts).
	function notify(text) {
		try {
			if (typeof message === "function") {
				message(text);
				return;
			}
		} catch (e) { /* ignore */ }
		try {
			if (typeof outputChatBox === "function" && typeof localPlayer !== "undefined") {
				outputChatBox(text, localPlayer, 255, 255, 255);
				return;
			}
		} catch (e2) { /* ignore */ }
		log(text);
	}

	// Server -> client greeting. Proves the bridge works.
	// Positional primitives only (this GTAC build can't marshal object args).
	addNetworkHandler("ln:greet", function () {
		var serverName = arguments[0] || "server";
		var welcome = arguments[1] || "";
		var hint = arguments[2] || "";
		var onlineCount = arguments[3];
		log("Greeting received from " + serverName);

		var lines = [];
		if (welcome) lines.push(welcome);
		if (hint) lines.push(hint);
		if (onlineCount != null) lines.push("Players online: " + onlineCount);
		if (lines.length) notify(lines.join(" | "));
	});

	bindEventHandler("OnResourceStart", thisResource, function () {
		LN.state.ready = true;
		log("Client resource ready.");
		notify("Liberty Network RP client core online.");

		// Boot the client-side auth (auto-restore stored device session).
		try {
			if (LN.AuthClient && typeof LN.AuthClient.init === "function") {
				LN.AuthClient.init();
				log("Auth client initialised.");
			}
		} catch (e) {
			log("Auth client init failed: " + e.message);
		}

		// Boot the on-screen login/register UI.
		try {
			if (LN.AuthUI && typeof LN.AuthUI.init === "function") {
				LN.AuthUI.init();
				log("Auth UI initialised.");
			}
		} catch (e) {
			log("Auth UI init failed: " + e.message);
		}

		try {
			if (LN.AdminPanel && typeof LN.AdminPanel.init === "function") {
				LN.AdminPanel.init();
				log("Admin panel initialised.");
			}
		} catch (e) {
			log("Admin panel init failed: " + e.message);
		}

		try {
			if (LN.SpawnClient && typeof LN.SpawnClient.init === "function") {
				LN.SpawnClient.init();
				log("Spawn client initialised.");
			}
		} catch (e) {
			log("Spawn client init failed: " + e.message);
		}
	});

	bindEventHandler("OnResourceStop", thisResource, function () {
		if (LN.SpawnClient && typeof LN.SpawnClient.stop === "function") LN.SpawnClient.stop();
		LN.state.ready = false;
	});

})(typeof globalThis !== "undefined" ? globalThis : this);
