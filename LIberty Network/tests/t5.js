"use strict";
/* Part 5: native auth bridge (module.lnauth) with mocked module global.
 * Run: node tests/t5.js (or via run-tests).
 * Covers: detect() present/absent, fallbacks, argon2 fail-closed,
 * HMAC fallback byte-match vs LN.Crypto, safeEqual, pepper file null,
 * needsUpgrade flag, PBKDF2 path untouched.
 */
var H = require("./harness");
var T = require("./tiny");
var T1 = require("./t1");
var LN = T1.LN, sb = T1.sb;

console.log("[13] native bridge absent (JS fallbacks)");
T.ok(LN.Auth.Native && typeof LN.Auth.Native.detect === "function", "Native bridge loaded");
T.ok(LN.Auth.Native.detect() === false, "detect false without module global");
T.ok(LN.Auth.Native.available === false, "available false");
T.ok(LN.Auth.Native.verifyArgon2("pw", "$argon2id$v=19$m=x") === null, "argon2 verify null without native");
T.ok(LN.Auth.Native.readPepperFile("/nope") === null, "pepper read null without native");
T.ok(LN.Auth.Native.writePepperFile("/nope", "x") === false, "pepper write false without native");

// HMAC fallback must byte-match LN.Crypto on fixed inputs.
var keyHex = "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b";
var msgHex = "4869205468657265"; // "Hi There"
T.ok(LN.Auth.Native.hmacSha256Hex(keyHex, msgHex) === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", "hmac fallback RFC4231 TC1");

// safeEqual fallback.
T.ok(LN.Auth.Native.safeEqual("abc", "abc") === true, "safeEqual equal");
T.ok(LN.Auth.Native.safeEqual("abc", "abd") === false, "safeEqual differ");

// randomHex fallback length.
T.ok(/^[0-9a-f]{64}$/.test(LN.Auth.Native.randomHex(32)), "randomHex fallback 64 hex");

// needsUpgrade false without native.
T.ok(LN.Auth.Accounts.needsUpgrade({ alg: "pbkdf2-hmac-sha256" }) === false, "no upgrade without native");
T.ok(LN.Auth.Accounts.needsUpgrade({ alg: "argon2id", enc: "x" }) === false, "argon2 never needs upgrade");

// PBKDF2 accounts still verify (regression) — create fresh (t3 resets store).
var mk = LN.Auth.Accounts.createAccount("nativefall", "longpassword1", "");
T.ok(mk.ok, "pbkdf2 account created");
var acc = LN.Auth.Accounts.getAccount("nativefall");
T.ok(!!acc && acc.password.alg === "pbkdf2-hmac-sha256", "pbkdf2 spec without native");
T.ok(LN.Auth.Accounts.verifyPassword("longpassword1", acc.password) === true, "pbkdf2 still verifies");
T.ok(LN.Auth.Accounts.verifyPassword("wrongpass1", acc.password) === false, "pbkdf2 rejects wrong");

console.log("[14] native bridge present (mocked module)");
// Mock lives on the vm sandbox (sb), not Node's global — the LN scripts run in vm context.
sb.module = {
	lnauth: {
		version: function () { return "1.0.0"; },
		argon2id_hash: function (pw, salt, t, m, p) { return "$argon2id$v=19$m=" + m + ",t=" + t + ",p=" + p + "$salthex$hashhex"; },
		argon2id_verify: function (enc, pw) { return pw === "correct"; },
		hmac_sha256: function (k, m2) { return "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"; },
		timing_safe_equals: function (a, b) { return a === b; },
		random_bytes: function (n) { var s = ""; for (var i = 0; i < n * 2; i++) s += "a"; return s; },
		secure_read: function (p) { return "pepper-data"; },
		secure_write: function (p, t) { return true; }
	}
};
T.ok(LN.Auth.Native.detect() === true, "detect true with mock");
T.ok(LN.Auth.Native.version === "1.0.0", "version captured");
var spec = LN.Auth.Native.hashPassword("secret123");
T.ok(spec && spec.alg === "argon2id" && spec.enc.indexOf("$argon2id$") === 0, "hashPassword argon2id spec");
T.ok(LN.Auth.Native.verifyArgon2("correct", spec.enc) === true, "argon2 verify true");
T.ok(LN.Auth.Native.verifyArgon2("wrong", spec.enc) === false, "argon2 verify false");
T.ok(LN.Auth.Native.hmacSha256Hex(keyHex, msgHex) === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", "hmac via native");
T.ok(LN.Auth.Native.safeEqual("x", "x") === true, "safeEqual via native");
T.ok(LN.Auth.Native.randomHex(16) === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "random via native");
T.ok(LN.Auth.Native.readPepperFile("/p") === "pepper-data", "pepper read via native");
T.ok(LN.Auth.Native.writePepperFile("/p", "d") === true, "pepper write via native");
T.ok(LN.Auth.Accounts.needsUpgrade({ alg: "pbkdf2-hmac-sha256" }) === true, "upgrade flagged with native");

// Argon2 specs verify through Accounts layer.
T.ok(LN.Auth.Accounts.verifyPassword("correct", spec) === true, "Accounts verify argon2 true");
T.ok(LN.Auth.Accounts.verifyPassword("wrong", spec) === false, "Accounts verify argon2 false");

// Module that throws -> graceful fallback, never crashes.
sb.module = { lnauth: { version: function () { throw new Error("boom"); } } };
T.ok(LN.Auth.Native.detect() === false, "detect false on throwing version");
delete sb.module;
T.ok(LN.Auth.Native.detect() === false, "detect false after removal");

T.summary();
