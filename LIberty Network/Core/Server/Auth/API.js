"use strict";
/*
 * Liberty Network - Public RP-server API (LN.Auth.API)
 *
 * Exposes the auth service to other server-side resources via
 * exportFunction(...). RP servers query verified identity (no passwords,
 * no tokens) and request short-lived handoff tickets for the account a
 * client is authenticated as. Character data is queried separately from
 * account credentials.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var API = (LN.Auth.API = LN.Auth.API || {});
	var Service = LN.Auth.Service;

	function safe(fn) {
		return function () {
			try { return fn.apply(null, arguments); }
			catch (e) { return { ok: false, code: "internal_error" }; }
		};
	}

	// Is this GTAC client authenticated to an LN account?
	function isAuthenticated(client) {
		return Service.isAuthenticated(client);
	}

	// Verified secret-free identity for an authenticated client.
	function getIdentity(client) {
		return Service.getAccountIdentity(client);
	}

	// Ask the auth service to issue a one-time handoff ticket for a client.
	// serverId is a label/nonce so tickets can be scoped to a specific RP server.
	function issueTicket(client, serverId) {
		return Service.issueServerTicket(client, serverId);
	}

	// Redeem a ticket issued earlier (returns the identity payload).
	function redeemTicket(ticket, serverId) {
		return Service.redeemTicket(ticket, serverId);
	}

	// List characters for an account (RP-level data is separate from credentials).
	function listCharacters(accountId) {
		return LN.Characters.listByAccount(accountId);
	}

	API.init = function () {
		if (typeof exportFunction !== "function") return;
		exportFunction("ln_auth_isAuthenticated", safe(isAuthenticated));
		exportFunction("ln_auth_identity", safe(getIdentity));
		exportFunction("ln_auth_issueTicket", safe(issueTicket));
		exportFunction("ln_auth_redeemTicket", safe(redeemTicket));
		exportFunction("ln_auth_characters", safe(listCharacters));
	};
})(typeof globalThis !== "undefined" ? globalThis : this);