"use strict";
/*
 * Liberty Network - Server utilities (LN.U)
 * Pure helpers shared across the auth service.
 * Secure randomness uses crypto.getRandomValues when available.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Auth = root.LN.Auth || {}; // guarantee auth namespace exists
	var LN = root.LN;
	var U = (LN.U = LN.U || {});

	U.nowMs = function () { return Date.now(); };
	U.nowS = function () { return Math.floor(Date.now() / 1000); };
	U.now = function () { return Math.floor(Date.now() / 1000); };

	function safeJSONParse(raw, fallback) {
		try {
			if (!raw || raw.trim() === "") return fallback;
			var p = JSON.parse(raw);
			return p == null ? fallback : p;
		} catch (e) { return fallback; }
	}
	U.safeJSONParse = safeJSONParse;

	U.deepMerge = function deepMerge(base, override) {
		if (!override || typeof override !== "object") return base;
		if (Array.isArray(base) || Array.isArray(override)) return override;
		var out = {};
		var k;
		for (k in base) out[k] = base[k];
		for (k in override) {
			if (!Object.prototype.hasOwnProperty.call(override, k)) continue;
			var bv = out[k], ov = override[k];
			if (ov && typeof ov === "object" && !Array.isArray(ov) && bv && typeof bv === "object" && !Array.isArray(bv)) {
				out[k] = deepMerge(bv, ov);
			} else {
				out[k] = ov;
			}
		}
		return out;
	};

	// Normalize a username / account-id for consistent comparison/storage.
	U.normalizeId = function (v) {
		return String(v || "").trim().toLowerCase();
	};

	U.isPlainObject = function (v) {
		return v && typeof v === "object" && !Array.isArray(v);
	};

	// Constant-time string comparison to reduce timing side-channels on tokens.
	U.ctEqual = function (a, b) {
		a = String(a || ""); b = String(b || "");
		if (a.length !== b.length) return false;
		var diff = 0;
		for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
		return diff === 0;
	};

	U.hexEncode = function (binStr) {
		var out = "";
		for (var i = 0; i < binStr.length; i++) {
			var c = binStr.charCodeAt(i) & 0xff;
			out += (c < 16 ? "0" : "") + c.toString(16);
		}
		return out;
	};

	U.hexDecodeToBin = function (hexStr) {
		var out = "";
		hexStr = String(hexStr || "");
		if (hexStr.length % 2 !== 0) hexStr = "0" + hexStr;
		for (var i = 0; i < hexStr.length; i += 2) {
			out += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
		}
		return out;
	};

	// UTF-8 encode a JS string into a "binary string" (each charCode = one byte).
	// Aviable in mozjs (uses unescape/encodeURIComponent trick).
	U.toBinStr = function (str) {
		try {
			str = String(str || "");
			if (typeof unescape === "function" && typeof encodeURIComponent === "function") {
				return unescape(encodeURIComponent(str));
			}
		} catch (e) { /* fall through */ }
		return String(str);
	};

	// Best-available secure random bytes, returned as an array of byte values.
	U.randomBytes = function (byteLen) {
		byteLen = byteLen || 32;
		var out = [];
		var i;
		if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
			var arr = new Uint8Array(byteLen);
			crypto.getRandomValues(arr);
			for (i = 0; i < arr.length; i++) out.push(arr[i] & 0xff);
			return out;
		}
		// Fallback (non-cryptographic) - never for tokens in production.
		for (i = 0; i < byteLen; i++) out.push(Math.floor(Math.random() * 256));
		return out;
	};

	// Secure random hex token of `byteLen` bytes (2*byteLen hex chars).
	U.randomHex = function (byteLen) {
		var bytes = U.randomBytes(byteLen || 32);
		var out = "";
		for (var i = 0; i < bytes.length; i++) {
			var c = bytes[i] & 0xff;
			out += (c < 16 ? "0" : "") + c.toString(16);
		}
		return out;
	};

	U.log = function (msg) {
		try { if (LN.Config && LN.Config.debug) console.log("[LN] " + msg); } catch (e) { /* ignore */ }
	};
	U.warn = function (msg) {
		try { console.log("[LN] WARN: " + msg); } catch (e) { /* ignore */ }
	};
})(typeof globalThis !== "undefined" ? globalThis : this);