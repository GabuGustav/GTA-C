"use strict";
/* Deterministic unit tests for Liberty Network (issue #7), part 1.
 * Covers: PBKDF2 vectors, account validation, token rotation/replay.
 * Run: node tests/run.js
 */
var H = require("./harness");
var nodeCrypto = require("crypto");
var T = require("./tiny");
var sb = H.makeSandbox();
var LN = H.loadServer(sb);
module.exports.LN = LN;
module.exports.sb = sb;

// ---------- 1. PBKDF2 / SHA-256 vectors ----------
console.log("[1] crypto vectors");
T.ok(LN.Crypto.sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256('abc')");
[["password", "salt", 1, 32], ["password", "salt", 2, 32], ["password", "salt", 4096, 32],
 ["Password", "NaCl", 80000, 64], ["pass\0word", "sa\0lt", 4096, 16]
].forEach(function (v, i) {
	var expect = nodeCrypto.pbkdf2Sync(v[0], v[1], v[2], v[3], "sha256").toString("hex");
	var got = LN.Crypto.pbkdf2(v[0], v[1], v[2], v[3]);
	T.ok(got === expect, "pbkdf2 vector #" + i + " (iter=" + v[2] + " dkLen=" + v[3] + ")", got + " != " + expect);
});
function binToHex(bin) { var o = ""; for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i) & 255; o += (c < 16 ? "0" : "") + c.toString(16); } return o; }
var hmacGot = binToHex(LN.Crypto.hmacSha256(LN.U.toBinStr("key"), LN.U.toBinStr("The quick brown fox jumps over the lazy dog")));
T.ok(hmacGot === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", "hmac-sha256 RFC 4231 #2");

// ---------- 2. account validation ----------
console.log("[2] account validation");
H.freshService(LN, { password: { iterations: 50, minPasswordLen: 8 } });
var r;
r = LN.Auth.Accounts.createAccount("ab", "longpassword1"); T.ok(!r.ok && r.code === "invalid_username", "reject short username");
r = LN.Auth.Accounts.createAccount("bad name!", "longpassword1"); T.ok(!r.ok && r.code === "invalid_username", "reject illegal chars");
r = LN.Auth.Accounts.createAccount("goodname", "short"); T.ok(!r.ok && r.code === "invalid_password", "reject short password");
r = LN.Auth.Accounts.createAccount("goodname", "longpassword1", "not-an-email"); T.ok(!r.ok && r.code === "invalid_email", "reject bad email");
r = LN.Auth.Accounts.createAccount("TestUser", "longpassword1", "A@B.co"); T.ok(r.ok && r.accountId === "testuser", "create ok + normalized");
var acc = LN.Auth.Accounts.getAccount("TESTUSER"); T.ok(!!acc && acc.displayName === "TestUser", "lookup case-insensitive");
T.ok(acc.password && acc.password.alg === "pbkdf2-hmac-sha256" && JSON.stringify(acc).indexOf("longpassword1") === -1, "no plaintext stored");
T.ok(LN.Auth.Accounts.verifyPassword("longpassword1", acc.password) === true, "verify correct password");
T.ok(LN.Auth.Accounts.verifyPassword("wrongpass1", acc.password) === false, "reject wrong password");
r = LN.Auth.Accounts.createAccount("testuser", "anotherpass1"); T.ok(!r.ok && r.code === "account_exists", "reject duplicate");

// ---------- 3. token rotation / replay / expiry / devices ----------
console.log("[3] sessions");
H.freshService(LN, { password: { iterations: 50, minPasswordLen: 8 }, sessions: { accessTtlSec: 3600, refreshTtlSec: 1000 } });
var c1 = H.fakeClient(11);
var reg = LN.Auth.Service.register(c1, { username: "sessuser", password: "longpassword1" });
T.ok(reg.ok && reg.refreshToken, "register issues refresh token");
var rt1 = reg.refreshToken;
T.ok(LN.Store.getSessions().every(function (s) { return JSON.stringify(s).indexOf(rt1) === -1; }), "raw refresh token never persisted (hash only)");
var ref1 = LN.Auth.Service.refresh(H.fakeClient(11), { refreshToken: rt1 });
T.ok(ref1.ok && ref1.refreshToken && ref1.refreshToken !== rt1, "refresh rotates token");
var replay = LN.Auth.Service.refresh(H.fakeClient(11), { refreshToken: rt1 });
T.ok(!replay.ok && replay.code === "invalid_refresh_token", "replayed (rotated) token rejected");
var wrongDev = LN.Auth.Service.refresh(H.fakeClient(12, { serial: "OTHER", guid: "X" }), { refreshToken: ref1.refreshToken });
T.ok(!wrongDev.ok && wrongDev.code === "device_mismatch", "cross-device replay -> device_mismatch + revoke");
var afterMismatch = LN.Auth.Service.refresh(H.fakeClient(11), { refreshToken: ref1.refreshToken });
T.ok(!afterMismatch.ok, "mismatched token stays revoked");
var c2 = H.fakeClient(21);
var reg2 = LN.Auth.Service.register(c2, { username: "expuser", password: "longpassword1" });
H.clock.nowMs += 1001 * 1000;
var exp = LN.Auth.Service.refresh(H.fakeClient(21), { refreshToken: reg2.refreshToken });
T.ok(!exp.ok && exp.code === "refresh_expired", "expired refresh rejected + revoked");
T.ok(LN.Auth.Service.isAuthenticated(c2) === false, "expiry visible via isAuthenticated");
T.ok(LN.Auth.Sessions.pruneExpired(true) >= 1, "pruneExpired removes stale records");
H.clock.nowMs = 1700000000000;
H.freshService(LN, { password: { iterations: 50, minPasswordLen: 8 } });
var c3 = H.fakeClient(31);
LN.Auth.Service.register(c3, { username: "revuser", password: "longpassword1" });
T.ok(LN.Auth.Service.isAuthenticated(c3) === true, "authenticated after register");
var rec = LN.Auth.Service.authForClient(c3);
LN.Auth.Service.revokeSession(c3, rec.sessionId);
T.ok(LN.Auth.Service.isAuthenticated(c3) === false, "revoking active session de-authenticates");
var c4 = H.fakeClient(41);
LN.Auth.Service.register(c4, { username: "logoutuser", password: "longpassword1" });
T.ok(LN.Auth.Service.logout(c4, false).ok === true, "logout ok");
T.ok(LN.Auth.Service.isAuthenticated(c4) === false, "logged-out client not authenticated");
