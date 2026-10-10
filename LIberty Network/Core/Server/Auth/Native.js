"use strict";
/*
 * Liberty Network - Native auth bridge (LN.Auth.Native)
 *
 * Detects the C++ module (module.lnauth.*) and exposes capability flags plus
 * thin wrappers. Every function has a pure-JS fallback so the server runs
 * identically with or without the DLL. Server-side only.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var N = (LN.Auth.Native = LN.Auth.Native || {});
	var C = LN.Crypto;
	var U = LN.U;

	// ----- capability detection (runs once at boot) -----
	N.available = false;
	N.version = null;

	N.detect = function () {
		try {
			if (typeof module !== "undefined" && module && module.lnauth &&
				typeof module.lnauth.version === "function") {
				var v = module.lnauth.version();
				if (typeof v === "string" && v) {
					N.available = true;
					N.version = v;
					return true;
				}
			}
		} catch (e) {}
		N.available = false;
		N.version = null;
		return false;
	};

	function native() {
		try {
			if (N.available && typeof module !== "undefined" && module && module.lnauth)
				return module.lnauth;
		} catch (e) {}
		return null;
	}

	// ----- password hashing -----
	// New accounts: Argon2id via native when present, else PBKDF2 (JS).
	// verifyPassword handles both algs + opportunistic upgrade flag.
	N.ARGON2_T = 2;      // iterations
	N.ARGON2_M = 65536;  // KiB (64 MiB)
	N.ARGON2_P = 1;      // lanes

	N.hashPassword = function (password) {
		var mod = native();
		if (mod) {
			try {
				var salt = U.hexEncode(binStr(U.randomBytes(16)));
				var enc = mod.argon2id_hash(String(password), salt, N.ARGON2_T, N.ARGON2_M, N.ARGON2_P);
				if (typeof enc === "string" && enc.indexOf("$argon2id$") === 0)
					return { alg: "argon2id", enc: enc };
			} catch (e) {}
		}
		return null; // caller falls back to PBKDF2
	};

	function binStr(bytes) {
		var s = "";
		for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff);
		return s;
	}

	N.verifyArgon2 = function (password, enc) {
		var mod = native();
		if (!mod) return null; // unknown: caller decides (fail closed unless PBKDF2 spec)
		try {
			var ok = mod.argon2id_verify(String(enc), String(password));
			return ok === true;
		} catch (e) { return false; }
	};

	// ----- HMAC (DeviceHash/UserID in Section 3) -----
	// Inputs/outputs are hex strings, byte-identical to LN.Crypto.hmacSha256.
	N.hmacSha256Hex = function (keyHex, msgHex) {
		var mod = native();
		if (mod) {
			try {
				var r = mod.hmac_sha256(String(keyHex), String(msgHex));
				if (typeof r === "string" && /^[0-9a-f]{64}$/i.test(r)) return r.toLowerCase();
			} catch (e) {}
		}
		// JS fallback via LN.Crypto (bin-string based).
		try {
			return U.hexEncode(C.hmacSha256(U.hexDecodeToBin(keyHex), U.hexDecodeToBin(msgHex)));
		} catch (e) { return null; }
	};

	// ----- secure random -----
	N.randomHex = function (n) {
		var mod = native();
		if (mod) {
			try {
				var r = mod.random_bytes(n);
				if (typeof r === "string" && r.length === n * 2) return r.toLowerCase();
			} catch (e) {}
		}
		return U.hexEncode(binStr(U.randomBytes(n)));
	};

	// ----- constant-time compare -----
	N.safeEqual = function (a, b) {
		var mod = native();
		if (mod) {
			try {
				var r = mod.timing_safe_equals(String(a), String(b));
				if (r === true || r === false) return r;
			} catch (e) {}
		}
		return U.ctEqual(String(a), String(b));
	};

	// ----- pepper file (outside resource dir; JS cannot do this) -----
	N.readPepperFile = function (path) {
		var mod = native();
		if (!mod || typeof mod.secure_read !== "function") return null;
		try {
			var r = mod.secure_read(String(path));
			return (typeof r === "string" && r) ? r : null;
		} catch (e) { return null; }
	};

	N.writePepperFile = function (path, text) {
		var mod = native();
		if (!mod || typeof mod.secure_write !== "function") return false;
		try { return mod.secure_write(String(path), String(text)) === true; }
		catch (e) { return false; }
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
