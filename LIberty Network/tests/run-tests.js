"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.resolve(__dirname, "..");

function context(extra) {
	var sandbox = {
		console: console, Date: Date, JSON: JSON, Math: Math, Array: Array,
		Object: Object, String: String, Number: Number, Boolean: Boolean,
		RegExp: RegExp, Uint8Array: Uint8Array,
		setTimer: function () { return 1; }, clearTimer: function () {},
		triggerNetworkEvent: function () {}, fadeCamera: function () {},
		spawnPlayer: function () {}
	};
	Object.keys(extra || {}).forEach(function (key) { sandbox[key] = extra[key]; });
	sandbox.globalThis = sandbox;
	return vm.createContext(sandbox);
}

function load(sandbox, relativePath) {
	vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), sandbox, { filename: relativePath });
}

function loadAuthBase(sandbox) {
	load(sandbox, "Core/Server/Auth/Util.js");
	load(sandbox, "Core/Server/Auth/Hash.js");
	load(sandbox, "Core/Server/Auth/Store.js");
}

function memoryStore() {
	var files = {};
	return {
		loadTextFile: function (file) { return files[file] || ""; },
		saveTextFile: function (file, value) { files[file] = value; }
	};
}

function testCrypto() {
	var sandbox = context();
	loadAuthBase(sandbox);
	assert.strictEqual(sandbox.LN.Crypto.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	assert.strictEqual(sandbox.LN.Crypto.pbkdf2("password", "salt", 1, 32), "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
}

function testAccounts() {
	var sandbox = context(memoryStore());
	loadAuthBase(sandbox);
	sandbox.LN.Auth.Config = { password: { iterations: 2, minPasswordLen: 8 } };
	load(sandbox, "Core/Server/Auth/Characters.js");
	load(sandbox, "Core/Server/Auth/Accounts.js");
	sandbox.LN.Store.init();
	assert.strictEqual(sandbox.LN.Auth.Accounts.createAccount("x", "password", "").code, "invalid_username");
	assert.strictEqual(sandbox.LN.Auth.Accounts.createAccount("valid_user", "short", "").code, "invalid_password");
	var created = sandbox.LN.Auth.Accounts.createAccount("Valid_User", "password", "user@example.com");
	assert.strictEqual(created.ok, true);
	assert.strictEqual(sandbox.LN.Auth.Accounts.verifyPassword("password", sandbox.LN.Auth.Accounts.getAccount("valid_user").password), true);
	assert.strictEqual(sandbox.LN.Auth.Accounts.createAccount("valid_user", "password", "").code, "account_exists");
}

function testSessions() {
	var sandbox = context(memoryStore());
	loadAuthBase(sandbox);
	sandbox.LN.Auth.Config = { sessions: { accessTtlSec: 60, refreshTtlSec: 60 } };
	load(sandbox, "Core/Server/Auth/Sessions.js");
	sandbox.LN.Store.init();
	var issued = sandbox.LN.Auth.Sessions.issueForCredentials("player", "device");
	var rotated = sandbox.LN.Auth.Sessions.refresh(issued.refreshToken, "device");
	assert.strictEqual(rotated.ok, true);
	assert.strictEqual(sandbox.LN.Auth.Sessions.refresh(issued.refreshToken, "device").code, "invalid_refresh_token");
	assert.strictEqual(sandbox.LN.Auth.Sessions.refresh(rotated.refreshToken, "other-device").code, "device_mismatch");
}

function testThrottle() {
	var sandbox = context();
	load(sandbox, "Core/Server/Auth/Util.js");
	sandbox.LN.Auth.Config = { throttle: { maxAttempts: 2, windowSec: 60, lockSec: 60, maxIpAttempts: 99, ipLockSec: 60, regWindowSec: 60, maxRegistrations: 2 } };
	sandbox.LN.Auth.failures = { account: {}, ip: {}, regIp: {} };
	load(sandbox, "Core/Server/Auth/Throttle.js");
	assert.strictEqual(sandbox.LN.Auth.Throttle.recordFailure("player", "127.0.0.1"), 0);
	assert.ok(sandbox.LN.Auth.Throttle.recordFailure("player", "127.0.0.1") > 0);
	assert.strictEqual(sandbox.LN.Auth.Throttle.allowRegister("127.0.0.1"), true);
	assert.strictEqual(sandbox.LN.Auth.Throttle.allowRegister("127.0.0.1"), true);
	assert.strictEqual(sandbox.LN.Auth.Throttle.allowRegister("127.0.0.1"), false);
}

function testSpawn() {
	var spawned = 0;
	var now = 1000;
	var sandbox = context({ spawnPlayer: function () { spawned++; } });
	load(sandbox, "Core/Server/Auth/Util.js");
	sandbox.LN.U.nowMs = function () { return now; };
	sandbox.LN.Config = { auth: { enabled: true, requireLoginBeforeSpawn: true } };
	sandbox.LN.Auth.Service = { isAuthenticated: function (client) { return !!client.authenticated; } };
	load(sandbox, "Core/Server/Subsystems.js");
	load(sandbox, "Core/Server/Spawn.js");
	sandbox.LN.Spawn.init({ spawn: { cooldownMs: 5000 } });
	var client = { index: 1, authenticated: false };
	assert.strictEqual(sandbox.LN.Spawn.spawnPlayer(client, {}).code, "not_authenticated");
	client.authenticated = true;
	assert.strictEqual(sandbox.LN.Spawn.spawnPlayer(client, {}).ok, true);
	assert.strictEqual(spawned, 1);
	assert.strictEqual(sandbox.LN.Spawn.forceRespawn(client).code, "cooldown");
	now += 5000;
	assert.strictEqual(sandbox.LN.Spawn.forceRespawn(client).ok, true);
	assert.strictEqual(spawned, 2);
}

testCrypto();
testAccounts();
testSessions();
testThrottle();
testSpawn();
console.log("Liberty Network core tests passed.");
