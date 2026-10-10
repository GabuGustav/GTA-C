"use strict";
/*
 * Liberty Network - Accounts (LN.Auth.Accounts)
 *
 * Registration, password hashing/verification, roles/permissions, and bans.
 * Passwords are NEVER stored or logged; only PBKDF2-HMAC-SHA256 hashes with a
 * per-account random salt and the KDF parameters needed to re-derive.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var A = (LN.Auth.Accounts = LN.Auth.Accounts || {});
	var U = LN.U;
	var C = LN.Crypto;
	var Store = LN.Store;

	function conf() { return LN.Auth.Config; }

	// ----- validation -----
	function cleanUsername(raw) {
		var v = String(raw || "").trim();
		if (v.length < 3 || v.length > 32) return null;
		if (!/^[a-zA-Z0-9_\-\.]+$/.test(v)) return null;
		return v.toLowerCase();
	}

	function validPassword(pw) {
		return typeof pw === "string" && pw.length >= conf().password.minPasswordLen && pw.length <= 128;
	}

	function validEmail(raw) {
		var v = String(raw || "").trim();
		if (!v) return null; // optional
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return null;
		return v.toLowerCase();
	}

	// ----- password hashing -----
	// hashSpec stored on the account. Two algs:
	//   argon2id: { alg:"argon2id", enc:"$argon2id$..." } (native module present)
	//   pbkdf2-hmac-sha256: { alg, iterations, salt(hex), hash(hex) } (fallback)
	// verifyPassword handles both; successful PBKDF2 logins get flagged for
	// opportunistic upgrade (Service re-hashes on next login when native exists).
	A.makeHashSpec = function (password) {
		try {
			if (LN.Auth.Native) {
				var spec = LN.Auth.Native.hashPassword(password);
				if (spec) return spec;
			}
		} catch (e) {}
		var saltBytes = U.randomBytes(16);
		var salt = U.hexEncode(binFromBytes(saltBytes));
		var iterations = conf().password.iterations;
		var hashHex = C.pbkdf2(password, salt, iterations, 32);
		return { alg: "pbkdf2-hmac-sha256", iterations: iterations, salt: salt, hash: hashHex };
	};

	function binFromBytes(bytes) {
		var s = "";
		for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff);
		return s;
	}

	A.verifyPassword = function (password, spec) {
		if (!spec) return false;
		// Argon2id path (native module).
		if (spec.alg === "argon2id" && spec.enc) {
			try {
				if (LN.Auth.Native) {
					var r = LN.Auth.Native.verifyArgon2(password, spec.enc);
					if (r === true || r === false) return r;
				}
			} catch (e) {}
			return false; // fail closed: cannot verify argon2 without native
		}
		if (!spec.hash || !spec.salt) return false;
		var iterations = spec.iterations || conf().password.iterations;
		var hashHex = C.pbkdf2(password, spec.salt, iterations, 32);
		return U.ctEqual(hashHex, spec.hash);
	};

	// True when this account's password should be re-hashed (PBKDF2 -> Argon2id).
	A.needsUpgrade = function (spec) {
		if (!spec || spec.alg === "argon2id") return false;
		try { return !!(LN.Auth.Native && LN.Auth.Native.available); }
		catch (e) { return false; }
	};

	// ----- accounts -----
	A.createAccount = function (username, password, email) {
		var normalized = cleanUsername(username);
		if (!normalized) return { ok: false, code: "invalid_username" };
		if (!validPassword(password)) return { ok: false, code: "invalid_password" };
		var cleanEmail = validEmail(email);
		if (email && !cleanEmail) return { ok: false, code: "invalid_email" };

		var accounts = Store.getAccounts();
		if (accounts[normalized]) return { ok: false, code: "account_exists" };

		var account = {
			accountId: normalized,
			username: normalized,
			displayName: String(username).trim(),
			email: cleanEmail || null,
			password: A.makeHashSpec(password),
			createdAt: U.now(),
			lastLoginAt: 0,
			roles: [],
			permissions: [],
			status: "active",
			banReason: null,
			bannedAt: 0,
			characterIds: []
		};
		// New accounts always get at least one character slot (characters are
		// separate concepts stored in characters.json, not here).
		var charId = LN.Characters.createDefaultCharacter(account.accountId);
		account.characterIds.push(charId);
		Store.setAccount(account, true);
		return { ok: true, accountId: normalized, characterId: charId };
	};

	A.getAccount = function (accountId) { return Store.getAccount(U.normalizeId(accountId)); };

	A.findByLogin = function (username) { return A.getAccount(username); };

	A.isBanned = function (account) {
		return account && account.status === "banned";
	};

	A.updateLastLogin = function (account, save) {
		account.lastLoginAt = U.now();
		if (save) Store.setAccount(account, true);
	};

	A.hasRole = function (account, role) {
		return !!account && Array.isArray(account.roles) && account.roles.indexOf(role) !== -1;
	};
	A.hasPermission = function (account, perm) {
		return !!account && Array.isArray(account.permissions) && account.permissions.indexOf(perm) !== -1;
	};
	// ----- roles -----
	A.addRole = function (account, role, save) {
		if (!account) return;
		role = String(role || "").trim().toLowerCase();
		if (!role) return;
		if (!Array.isArray(account.roles)) account.roles = [];
		if (account.roles.indexOf(role) === -1) account.roles.push(role);
		if (save) Store.setAccount(account, true);
	};

	A.removeRole = function (account, role, save) {
		if (!account) return;
		role = String(role || "").trim().toLowerCase();
		if (!Array.isArray(account.roles)) account.roles = [];
		var i = account.roles.indexOf(role);
		if (i !== -1) account.roles.splice(i, 1);
		if (save) Store.setAccount(account, true);
	};

	A.removePermission = function (account, perm, save) {
		if (!account || !Array.isArray(account.permissions)) return;
		var i = account.permissions.indexOf(perm);
		if (i !== -1) account.permissions.splice(i, 1);
		if (save) Store.setAccount(account, true);
	};

	// Extended ban record for admin module (temp bans, escalation, HWID).
	// Keeps legacy {status,banReason,bannedAt} semantics: status==="banned"
	// while banUntil===0 (perm) or banUntil>now (temp).
	A.banEx = function (account, opts, save) {
		if (!account) return;
		opts = opts || {};
		account.status = "banned";
		account.banReason = opts.reason || "No reason";
		account.bannedAt = U.now();
		account.banBy = opts.by || null;
		account.banUntil = opts.until || 0; // 0 = permanent
		account.banCount = (account.banCount || 0) + 1;
		if (opts.hwidfp) account.hwidfp = String(opts.hwidfp);
		if (save) Store.setAccount(account, true);
	};

	A.unbanEx = function (account, save) {
		if (!account) return;
		account.status = "active";
		account.banReason = null;
		account.bannedAt = 0;
		account.banBy = null;
		account.banUntil = 0;
		if (save) Store.setAccount(account, true);
	};

	A.banExpiresAt = function (account) {
		if (!account || account.status !== "banned") return 0;
		return account.banUntil || 0;
	};

	A.isBanExpired = function (account, nowSec) {
		if (!account || account.status !== "banned") return false;
		if (!account.banUntil) return false; // permanent
		return (nowSec == null ? U.now() : nowSec) >= account.banUntil;
	};

	// Moderation state (mute/freeze/warn). Persisted on the account so a
	// rejoin cannot dodge an active mute; freeze is in-memory by nature and
	// only the flag persists for audit.
	A.setMuted = function (account, muted, until, save) {
		if (!account) return;
		account.muted = !!muted;
		account.mutedUntil = muted ? (until || 0) : 0;
		if (save) Store.setAccount(account, true);
	};

	A.isMuted = function (account, nowSec) {
		if (!account || !account.muted) return false;
		if (account.mutedUntil && (nowSec == null ? U.now() : nowSec) >= account.mutedUntil) return false;
		return true;
	};

	A.addWarning = function (account, reason, by, save) {
		if (!account) return 0;
		if (!Array.isArray(account.warnings)) account.warnings = [];
		account.warnings.push({ reason: String(reason || "No reason"), by: by || null, at: U.now() });
		if (account.warnings.length > 50) account.warnings.splice(0, account.warnings.length - 50);
		if (save) Store.setAccount(account, true);
		return account.warnings.length;
	};

	A.ban = function (account, reason, save) {
		if (!account) return;
		account.status = "banned";
		account.banReason = reason || "No reason";
		account.bannedAt = U.now();
		if (save) Store.setAccount(account, true);
	};
	A.unban = function (account, save) {
		if (!account) return;
		account.status = "active";
		account.banReason = null;
		if (save) Store.setAccount(account, true);
	};
})(typeof globalThis !== "undefined" ? globalThis : this);