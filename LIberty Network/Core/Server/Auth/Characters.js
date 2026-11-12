"use strict";
/*
 * Liberty Network - Characters (LN.Characters)
 *
 * A character belongs to an account but is a SEPARATE concept with its own
 * data file (data/characters.json). No credential or password data ever lives
 * here. The RP framework (later phases) will own job/economy/playtime fields.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var CH = (LN.Characters = LN.Characters || {});
	var U = LN.U;
	var Store = LN.Store;
	var Accounts = LN.Auth.Accounts;
	var Service = LN.Auth.Service;

	function conf() { return LN.Auth.Config; }

	// client.index -> characterId (active character for the session)
	var activeByClient = {};

	// Default appearance presets (GTA IV ped models). Players can override
	// with a custom model hash/name via the create UI.
	CH.MODEL_PRESETS = {
		"Civilian Male": 90,
		"Civilian Female": 103,
		"Police Officer": 20,
		"Criminal": 234,
		"Homeless": 221,
		"Business": 177
	};

	function normalizeName(raw) {
		return String(raw || "").trim();
	}

	function validateName(name) {
		name = normalizeName(name);
		if (!name || name.length < 2 || name.length > 32) return { ok: false, code: "invalid_name" };
		if (!/^[a-zA-Z0-9_\-\. ']+$/.test(name)) return { ok: false, code: "invalid_name" };
		return { ok: true, name: name };
	}

	// Appearance normalisation. model may be a number (ped hash) or a string
	// (model name). Everything else is free-form RP flavour.
	function normalizeAppearance(raw) {
		var out = { model: null, createdAt: U.now() };
		if (!raw || typeof raw !== "object") return out;
		if (typeof raw.model === "number") out.model = raw.model;
		else if (typeof raw.model === "string" && raw.model.length) out.model = raw.model;
		if (typeof raw.outfit === "string") out.outfit = raw.outfit.trim();
		if (typeof raw.notes === "string") out.notes = raw.notes.trim();
		return out;
	}

	CH.createDefaultCharacter = function (accountId) {
		return CH.createCharacter(accountId, { name: "New Character", appearance: { model: 90 } });
	};

	// Create a new character for an account. data = { name, appearance }.
	CH.createCharacter = function (accountId, data) {
		accountId = U.normalizeId(accountId);
		var account = LN.Auth.Accounts.getAccount(accountId);
		if (!account) return { ok: false, code: "no_account" };
		if (Accounts.isBanned && Accounts.isBanned(account)) return { ok: false, code: "account_banned" };

		var nameCheck = validateName(data && data.name);
		if (!nameCheck.ok) return nameCheck;
		var name = nameCheck.name;

		var appearance = normalizeAppearance(data && data.appearance);
		var characterId = "c_" + U.randomHex(12);
		var character = {
			characterId: characterId,
			accountId: accountId,
			name: name,
			appearance: appearance,
			job: null,
			rpData: {},
			createdAt: U.now(),
			updatedAt: U.now()
		};
		Store.setCharacter(character, true);

		// Link character to account.
		if (!Array.isArray(account.characterIds)) account.characterIds = [];
		account.characterIds.push(characterId);
		if (LN.Auth.Accounts.setAccount) LN.Auth.Accounts.setAccount(account, true);

		return { ok: true, characterId: characterId, character: character };
	};

	CH.getCharacter = function (characterId) { return Store.getCharacter(characterId); };

	CH.listByAccount = function (accountId) {
		accountId = U.normalizeId(accountId);
		var all = Store.getCharacters();
		var out = [];
		var k;
		for (k in all) {
			if (all[k] && all[k].accountId === accountId) {
				var c = all[k];
				out.push({
					characterId: c.characterId,
					name: c.name,
					appearance: c.appearance || {},
					job: c.job || null,
					createdAt: c.createdAt || 0,
					updatedAt: c.updatedAt || 0
				});
			}
		}
		// newest first
		out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
		return out;
	};

	CH.rename = function (character, name, save) {
		if (!character || !name) return { ok: false, code: "invalid_name" };
		var checked = validateName(name);
		if (!checked.ok) return checked;
		character.name = checked.name;
		character.updatedAt = U.now();
		if (save) Store.setCharacter(character, true);
		return { ok: true };
	};

	// Mark a character as the active one for a client (session-level).
	CH.selectCharacter = function (client, characterId) {
		if (!client) return { ok: false, code: "no_client" };
		var accountId = Service.accountForClient ? Service.accountForClient(client) : null;
		if (!accountId) {
			// fall back to client data
			try { accountId = client.getData("ln.auth.accountId") || ""; } catch (e) { accountId = ""; }
		}
		if (!accountId) return { ok: false, code: "not_authenticated" };

		var account = LN.Auth.Accounts.getAccount(accountId);
		if (!account) return { ok: false, code: "no_account" };
		var character = CH.getCharacter(characterId);
		if (!character || character.accountId !== accountId) {
			return { ok: false, code: "invalid_character" };
		}
		if (account.characterIds && account.characterIds.indexOf(characterId) === -1) {
			return { ok: false, code: "not_your_character" };
		}

		activeByClient[client.index] = characterId;
		try { client.setData("ln.char.active", characterId, true); } catch (e) {}
		CH.logSelect(accountId, characterId, client);
		return { ok: true, characterId: characterId, character: character };
	};

	CH.getActiveCharacter = function (client) {
		if (!client) return null;
		var id = activeByClient[client.index];
		if (!id) {
			try { id = client.getData("ln.char.active") || null; } catch (e) { id = null; }
		}
		return id ? CH.getCharacter(id) : null;
	};

	CH.deselectCharacter = function (client) {
		if (!client) return;
		delete activeByClient[client.index];
		try { client.setData("ln.char.active", "", true); } catch (e) {}
	};

	CH.logSelect = function (accountId, characterId, client) {
		try {
			if (LN.Auth.Service && LN.Auth.Service.log) {
				LN.Auth.Service.log("character_select", "ok", {
					accountId: accountId,
					characterId: characterId,
					detail: client ? (client.name || "") : ""
				}, client);
			}
		} catch (e) { /* ignore */ }
	};

	CH.rename = function (character, name, save) {
		if (!character || !name) return { ok: false, code: "invalid_name" };
		name = String(name).trim();
		if (name.length < 2 || name.length > 32) return { ok: false, code: "invalid_name" };
		character.name = name;
		character.updatedAt = U.now();
		if (save) Store.setCharacter(character, true);
		return { ok: true };
	};

	// RP servers call this to mark a character as currently selected/active
	// for a given authenticated client. Actual in-game character spawning is
	// owned by the RP layer - here we only persist the selection.
	CH.setActive = function (accountId, characterId) {
		var account = LN.Auth.Accounts.getAccount(accountId);
		if (!account) return { ok: false, code: "no_account" };
		var character = CH.getCharacter(characterId);
		if (!character || character.accountId !== U.normalizeId(accountId)) {
			return { ok: false, code: "invalid_character" };
		}
		return { ok: true, characterId: characterId, name: character.name };
	};
})(typeof globalThis !== "undefined" ? globalThis : this);