"use strict";
/*
 * Liberty Network - Brute-force protection (LN.Auth.Throttle)
 *
 * In-memory throttling keyed by account id and by IP. Locks out accounts that
 * accumulate too many failed attempts, and rate-limits registration + login
 * attempts per IP. Resets on success or after the lock window.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var T = (LN.Auth.Throttle = LN.Auth.Throttle || {});
	var U = LN.U;

	var cfg = null;
	function C() { return LN.Auth.Config; }

	T.init = function () { cfg = null; };
	T.reset = function () { cfg = null; };

	// Record a failed login attempt. Returns remaining lock seconds or 0.
	T.recordFailure = function (accountId, ip) {
		accountId = U.normalizeId(accountId);
		var conf = C();
		var now = U.now();
		// Per-account
		var ac = (LN.Auth.failures.account[accountId] = LN.Auth.failures.account[accountId] || { count: 0, windowStart: now, lockedUntil: 0 });
		// Per-ip
		var key = U.normalizeId(ip || "unknown");
		var ipc = (LN.Auth.failures.ip[key] = LN.Auth.failures.ip[key] || { count: 0, windowStart: now, lockedUntil: 0 });

		// Expire old windows.
		if (now - ac.windowStart > conf.throttle.windowSec) { ac.count = 0; ac.windowStart = now; }
		if (now - ipc.windowStart > conf.throttle.windowSec) { ipc.count = 0; ipc.windowStart = now; }

		ac.count++;
		ipc.count++;

		if (ac.count >= conf.throttle.maxAttempts) {
			ac.lockedUntil = now + conf.throttle.lockSec;
		}
		if (ipc.count >= conf.throttle.maxIpAttempts) {
			ipc.lockedUntil = now + conf.throttle.ipLockSec;
		}
		return T.lockRemaining(accountId, ip);
	};

	T.clearFailures = function (accountId, ip) {
		accountId = U.normalizeId(accountId);
		if (accountId) delete LN.Auth.failures.account[accountId];
		if (ip) delete LN.Auth.failures.ip[U.normalizeId(ip)];
	};

	// Remaining lock seconds for a login attempt (account or ip lock).
	T.lockRemaining = function (accountId, ip) {
		var now = U.now();
		var ac = LN.Auth.failures.account[U.normalizeId(accountId)];
		if (ac && ac.lockedUntil > now) return ac.lockedUntil - now;
		var ipc = LN.Auth.failures.ip[U.normalizeId(ip)];
		if (ipc && ipc.lockedUntil > now) return ipc.lockedUntil - now;
		return 0;
	};

	// Per-IP registration/window throttle.
	T.allowRegister = function (ip) {
		var conf = C();
		var now = U.now();
		var key = U.normalizeId(ip || "unknown");
		var rc = (LN.Auth.failures.regIp[key] = LN.Auth.failures.regIp[key] || { attrs: [], start: now });
		// keep list of recent registration timestamps from this ip
		var cutoff = now - conf.throttle.regWindowSec;
		rc.attrs = rc.attrs.filter(function (t) { return t > cutoff; });
		rc.attrs.push(now);
		return rc.attrs.length <= conf.throttle.maxRegistrations;
	};

	// Periodic cleanup of stale in-memory entries.
	T.cleanup = function () {
		var F = LN.Auth.failures;
		var now = U.now();
		var key;
		function purge(map, maxAge) {
			for (key in map) {
				var e = map[key];
				if (e && (e.lockedUntil ? (e.lockedUntil - now) < -maxAge : (now - e.windowStart) > maxAge)) delete map[key];
			}
		}
		purge(F.account, 24 * 3600);
		purge(F.ip, 24 * 3600);
		purge(F.regIp, 24 * 3600);
	};
})(typeof globalThis !== "undefined" ? globalThis : this);