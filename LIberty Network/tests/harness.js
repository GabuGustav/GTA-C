"use strict";
/* Liberty Network - deterministic Node test harness.
 * Loads the mozjs-style LN server/client scripts with stubbed GTAC globals,
 * seeded RNG, and a controllable clock. Run: node tests/run.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }

// Deterministic PRNG (mulberry32) so randomHex/salts are repeatable.
var _seed = 0xC0FFEE;
function rnd() {
	_seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
	var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
var rndBytes = [];
function refill(n) { while (rndBytes.length < n) rndBytes.push(Math.floor(rnd() * 256)); }

var clock = { nowMs: 1700000000000 }; // fixed epoch ms
function nowSec() { return Math.floor(clock.nowMs / 1000); }

// In-memory file system for LN.Store (no disk writes during tests).
var memFs = {};

function makeSandbox() {
	var sandbox = {
		console: console,
		// clock
		Date: Date,
		// timers: GTAC uses setTimeout/clearTimeout (one-shot) + setInterval.
		__timers: [],
		setTimeout: function (fn, ms) { var t = { fn: fn, ms: ms }; sandbox.__timers.push(t); return t; },
		clearTimeout: function (t) { var i = sandbox.__timers.indexOf(t); if (i !== -1) sandbox.__timers.splice(i, 1); },
		setInterval: function () { return 0; },
		// GTAC file I/O
		loadTextFile: function (p) { return Object.prototype.hasOwnProperty.call(memFs, p) ? memFs[p] : null; },
		saveTextFile: function (p, text) { memFs[p] = String(text); },
		// GTAC server/client stubs
		triggerNetworkEvent: function () {},
		addNetworkHandler: function () {},
		addEvent: function () {},
		addEventHandler: function () {},
		bindEventHandler: function () {},
		addCommandHandler: function () {},
		exportFunction: function () {},
		spawnPlayer: function () {},
		fadeCamera: function () {},
		messageClient: function () {},
		outputChatBox: function () {},
		message: function () {},
		getClients: function () { return []; },
		COLOUR_RED: 1, COLOUR_GREEN: 2, COLOUR_YELLOW: 3,
		thisResource: { name: "test" },
	};
	sandbox.globalThis = sandbox;
	// Deterministic crypto + clock.
	sandbox.crypto = { getRandomValues: function (arr) { refill(arr.length); for (var i = 0; i < arr.length; i++) arr[i] = rndBytes.shift(); return arr; } };
	sandbox.Math = Object.create(Math);
	sandbox.Math.random = rnd;
	return sandbox;
}

function loadServer(sandbox) {
	var files = [
		"Core/Server/Auth/Util.js",
		"Core/Server/Auth/Hash.js",
		"Core/Server/Auth/Native.js",
		"Core/Server/Auth/Store.js",
		"Core/Server/Auth/Throttle.js",
		"Core/Server/Auth/Characters.js",
		"Core/Server/Auth/Accounts.js",
		"Core/Server/Auth/Sessions.js",
		"Core/Server/Auth/Service.js",
		"Core/Server/Admin/Roles.js",
		"Core/Server/Admin/Bans.js",
		"Core/Server/Admin/Service.js",
		"Core/Server/Admin/Service2.js",
		"Core/Server/Admin/Service3.js",
		"Core/Server/Subsystems.js",
		"Core/Server/Spawn.js",
	];
	var ctx = vm.createContext(sandbox);
	files.forEach(function (f) { vm.runInContext(read(f), ctx, { filename: f }); });
	// Controllable clock: U.now/U.nowMs/U.nowS drive everything.
	sandbox.LN.U.nowMs = function () { return clock.nowMs; };
	sandbox.LN.U.nowS = nowSec;
	sandbox.LN.U.now = nowSec;
	return sandbox.LN;
}

function freshService(LN, overrides) {
	memFs = {};
	LN.Store.init({});
	var cfg = LN.U.deepMerge(LN.Auth.Service.DEFAULT.auth, overrides || {});
	LN.Auth.Service.init({ auth: cfg });
	return cfg;
}

function fakeClient(idx, extra) {
	var c = { index: idx == null ? 1 : idx, name: "tester", ip: "10.0.0.1", serial: "SER1", guid: "G1", _data: {} };
	c.setData = function (k, v) { c._data[k] = v; };
	if (extra) for (var k in extra) c[k] = extra[k];
	return c;
}

module.exports = { loadServer: loadServer, makeSandbox: makeSandbox, freshService: freshService, fakeClient: fakeClient, clock: clock, memFs: function () { return memFs; } };
