"use strict";
/*
 * Liberty Network - Client auth (LN.AuthClient)
 *
 * Keeps refresh tokens in memory only. This GTAC build exposes ordinary file
 * I/O but no verified secure credential store, so tokens are never persisted
 * to disk. Commands (/login, /register, /logout...) are handled server-side
 * by LN.Auth.Network; this client layer emits the corresponding network events.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var AC = (LN.AuthClient = LN.AuthClient || {});

	AC.state = { authenticated: false, accountId: "", busy: false };

	function log(msg) { try { console.log("[LN:client] " + msg); } catch (e) {} }

	function notify(text) {
		try { if (message) { message(text); return; } } catch (e) {}
		try { if (outputChatBox && localPlayer) { outputChatBox(text, localPlayer, 255, 255, 255); return; } } catch (e2) {}
		log(text);
	}

	function emit(eventName, args) {
		try {
			if (typeof triggerNetworkEvent === "function") {
				// Client -> server: positional primitives (this GTAC build cannot
				// marshal objects as network args; use strings/numbers + JSON strings).
				triggerNetworkEvent.apply(null, [eventName].concat(args || []));
				return true;
			}
		} catch (e) { log("emit " + eventName + " failed: " + e.message); }
		return false;
	}

	// Memory-only bearer token. Deliberately NEVER written to disk:
	// this GTAC build exposes only unsandboxed file I/O with no
	// per-user sandbox, ACL,
	// encryption, or OS credential-store API, so any client-side file would
	// be a portable plaintext bearer secret. The token lives only in this
	// closure, is wiped on logout / invalid / expired / device-mismatch
	// errors, and is lost on resource restart (re-login required).
	var memToken = "";

	function clearStoredToken() { memToken = ""; }
	AC.readStoredToken = function () { return memToken; };

	// ---- server<->client event handlers ----
	function bind(name, fn) { try { addNetworkHandler(name, fn); } catch (e) {} }

	function parseJson(jsonStr, fallback) {
		try { var v = JSON.parse(jsonStr || "{}"); return v || fallback; } catch (e) { return fallback; }
	}

	AC.init = function () {
		if (AC.initialized) return;
		AC.initialized = true;

		// Server -> client handlers read positional primitive args.
		bind("ln:authState", function () {
			var authed = arguments[0] === "1" || arguments[0] === true;
			var accountId = arguments[1] || "";
			var data = parseJson(arguments[2], {});
			AC.state.authenticated = authed;
			AC.state.accountId = accountId;
			AC.state.roles = data.roles || [];
			AC.state.permissions = data.permissions || [];
			AC.state.characters = data.characters || [];
		});

		bind("ln:authResult", function () {
			var action = arguments[0] || "";
			var refreshToken = arguments[3] || "";
			if ((action === "refresh" || action === "login" || action === "register") && refreshToken) {
				AC.updateStoredToken(refreshToken);
				notify("Liberty Network authentication updated for this connection.");
			}
			if (action === "logout") clearStoredToken();
		});

		bind("ln:authError", function () {
			var code = arguments[0] || "";
			var message = arguments[1] || "";
			if (code === "invalid_refresh_token" || code === "refresh_expired" || code === "device_mismatch") {
				clearStoredToken();
			}
			notify("Auth: " + (message || code));
		});

		autoRestore();
	};

	function autoRestore() {
		log("Persistent session restore is disabled because secure client storage is unavailable.");
	}

	AC.persistToken = function (t) { memToken = String(t || ""); };
	AC.updateStoredToken = function (t) { memToken = String(t || ""); };
	AC.clearStoredToken = clearStoredToken;
})(typeof globalThis !== "undefined" ? globalThis : this);
