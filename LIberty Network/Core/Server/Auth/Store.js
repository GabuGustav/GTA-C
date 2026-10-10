"use strict";
/*
 * Liberty Network - Persistence layer (LN.Store)
 *
 * JSON persistence under data/ using GTAC loadTextFile/saveTextFile.
 * Each collection keeps an in-memory cache, is loaded lazily on first access,
 * and is saved to disk on change. Nothing sensitive is ever logged.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var STORE = (LN.Store = LN.Store || {});
	var U = LN.U;

	// A single "document" per file to keep loads/saves simple and atomic.
	// Map: storeKey -> { path, data, dirty }
	var collections = {};
	var paths = {};

	STORE.DEFAULT_PATHS = {
		accounts: "data/accounts.json",
		characters: "data/characters.json",
		sessions: "data/sessions.json",
		devices: "data/devices.json",
		security: "data/security_log.json"
	};

	function ensure(s) {
		if (!collections[s]) throw new Error("[Store] Unknown collection: " + s);
		if (collections[s].data === undefined) STORE.load(s);
		return collections[s];
	}

	STORE.init = function (pathMap) {
		pathMap = pathMap || {};
		paths = {};
		collections = {};
		var k;
		for (k in STORE.DEFAULT_PATHS) paths[k] = pathMap[k] || STORE.DEFAULT_PATHS[k];
		for (k in paths) {
			collections[k] = { path: paths[k], data: undefined, dirty: false };
		}
		return STORE;
	};

	STORE.load = function (s) {
		var c = collections[s];
		if (!c) return;
		var raw = null;
		try { raw = loadTextFile(c.path); } catch (e) { raw = null; }
		var parsed = U.safeJSONParse(raw, null);
		if (parsed === null) parsed = {};
		c.data = parsed;
		c.dirty = false;
		return c.data;
	};

	STORE.save = function (s) {
		var c = collections[s];
		if (!c) return false;
		try {
			saveTextFile(c.path, JSON.stringify(c.data, null, "\t"));
			c.dirty = false;
			return true;
		} catch (e) {
			U.warn("Store.save failed for " + s + ": " + e.message);
			return false;
		}
	};

	STORE.saveAll = function () {
		var s, ok = true;
		for (s in collections) {
			if (collections[s].dirty) ok = STORE.save(s) && ok;
		}
		return ok;
	};

	function touch(s) { ensure(s).dirty = true; }

	// --- Accounts ---
	STORE.getAccounts = function () { return ensure("accounts").data; };
	STORE.getAccount = function (accountId) { return STORE.getAccounts()[accountId] || null; };
	STORE.setAccount = function (account, save) { STORE.getAccounts()[account.accountId] = account; touch("accounts"); if (save) STORE.save("accounts"); };

	// --- Characters ---
	STORE.getCharacters = function () { return ensure("characters").data; };
	STORE.getCharacter = function (characterId) { return STORE.getCharacters()[characterId] || null; };
	STORE.setCharacter = function (character, save) { STORE.getCharacters()[character.characterId] = character; touch("characters"); if (save) STORE.save("characters"); };

	// --- Sessions (stored as an array) ---
	STORE.getSessions = function () {
		var all = ensure("sessions").data;
		if (!Array.isArray(all)) all = ensure("sessions").data = [];
		return all;
	};
	STORE.sessionsByAccount = function (accountId) {
		return STORE.getSessions().filter(function (s) { return s.accountId === accountId && !s.revoked; });
	};
	STORE.addSession = function (session, save) {
		STORE.getSessions().push(session);
		touch("sessions");
		if (save) STORE.save("sessions");
	};
	STORE.touchSessions = function (save) {
		touch("sessions");
		if (save) STORE.save("sessions");
	};

	// --- Devices ---
	STORE.getDevices = function () { return ensure("devices").data; };
	STORE.getDevice = function (deviceId) { return STORE.getDevices()[deviceId] || null; };
	STORE.setDevice = function (device, save) { STORE.getDevices()[device.deviceId] = device; touch("devices"); if (save) STORE.save("devices"); };

	// --- Security log ---
	STORE.securityLog = function () {
		var all = ensure("security").data;
		if (!Array.isArray(all)) all = ensure("security").data = [];
		return all;
	};
	STORE.appendSecurity = function (entry, save) {
		var all = STORE.securityLog();
		all.push(entry);
		if (all.length > 2000) all.splice(0, all.length - 2000);
		touch("security");
		if (save) STORE.save("security");
	};
})(typeof globalThis !== "undefined" ? globalThis : this);