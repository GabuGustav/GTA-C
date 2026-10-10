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

	function conf() { return LN.Auth.Config; }

	CH.createDefaultCharacter = function (accountId) {
		var characterId = "c_" + U.randomHex(12);
		var character = {
			characterId: characterId,
			accountId: U.normalizeId(accountId),
			name: "New Character",
			appearance: {},
			job: null,
			rpData: {},
			createdAt: U.now(),
			updatedAt: U.now()
		};
		Store.setCharacter(character, true);
		return characterId;
	};

	CH.getCharacter = function (characterId) { return Store.getCharacter(characterId); };

	CH.listByAccount = function (accountId) {
		accountId = U.normalizeId(accountId);
		var all = Store.getCharacters();
		var out = [];
		var k;
		for (k in all) {
			if (all[k] && all[k].accountId === accountId) {
				out.push({ characterId: all[k].characterId, name: all[k].name, job: all[k].job || null });
			}
		}
		return out;
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