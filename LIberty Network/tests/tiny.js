"use strict";
var passed = 0, failed = 0;
module.exports.ok = function (cond, name, extra) {
	if (cond) { passed++; console.log("  ok - " + name); }
	else { failed++; console.log("  FAIL - " + name + (extra ? " :: " + extra : "")); }
};
module.exports.summary = function () {
	console.log("\n" + passed + " passed, " + failed + " failed");
	process.exit(failed ? 1 : 0);
};
