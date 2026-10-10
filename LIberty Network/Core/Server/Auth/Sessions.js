"use strict";
/*
 * Liberty Network - Sessions & Devices (LN.Auth.Sessions)
 *
 * Persistent device sessions with short-lived access tokens + long-lived
 * refresh tokens. The RAW tokens are returned to the client exactly once;
 * only their SHA-256 hashes are stored. Refresh tokens rotate on every use
 * (the prior refresh hash is invalidated). Sessions/devices can be revoked
 * individually or for the whole account.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var S = (LN.Auth.Sessions = LN.Auth.Sessions || {});
	var U = LN.U;
	var C = LN.Crypto;
	var Store = LN.Store;

	function conf() { return LN.Auth.Config; }

	// Hash a token for storage/lookup.
	S.tokenHash = function (token) {
		return C.sha256("ln:" + token);
	};

	// Derive a stable device id from a client's emitted fingerprint (serial/guid).
	S.deviceIdFor = function (fingerprint) {
		return U.normalizeId(fingerprint) || ("dev_" + U.randomHex(8));
	};

	S.registerDevice = function (accountId, deviceId, label) {
		if (Store.getDevice(deviceId)) return Store.getDevice(deviceId);
		var device = {
			deviceId: deviceId,
			accountId: U.normalizeId(accountId),
			label: label || "Unknown device",
			createdAt: U.now(),
			lastSeenAt: U.now(),
			newDevice: true
		};
		Store.setDevice(device, true);
		return device;
	};

	S.touchDevice = function (device) {
		device.lastSeenAt = U.now();
		Store.setDevice(device, true);
	};

	S._issue = function (accountId, deviceId) {
		var c = conf().sessions;
		var accessToken = U.randomHex(24);
		var refreshToken = U.randomHex(32);
		var now = U.now();
		var session = {
			sessionId: "s_" + U.randomHex(12),
			accountId: U.normalizeId(accountId),
			deviceId: deviceId,
			accessTokenHash: S.tokenHash(accessToken),
			refreshTokenHash: S.tokenHash(refreshToken),
			createdAt: now,
			lastActiveAt: now,
			accessExpiresAt: now + c.accessTtlSec,
			refreshExpiresAt: now + c.refreshTtlSec,
			revoked: false,
			revokedAt: 0
		};
		Store.addSession(session, true);
		return { session: session, accessToken: accessToken, refreshToken: refreshToken };
	};

	// Full credential login -> issue new session for a device.
	S.issueForCredentials = function (accountId, deviceId) {
		return S._issue(accountId, deviceId);
	};

	// Refresh: validate a presented refresh token, rotate it, and return a new pair.
	// Returns { ok, accessToken?, refreshToken?, session? } or { ok:false, code }.
	S.refresh = function (refreshToken, deviceId) {
		if (!refreshToken) return { ok: false, code: "missing_token" };
		var hash = S.tokenHash(refreshToken);
		var list = Store.getSessions();
		var found = null;
		for (var i = 0; i < list.length; i++) {
			if (!list[i].revoked && U.ctEqual(list[i].refreshTokenHash, hash)) { found = list[i]; break; }
		}
		if (!found) return { ok: false, code: "invalid_refresh_token" };

		var now = U.now();
		if (found.refreshExpiresAt < now) {
			found.revoked = true;
			found.revokedAt = now;
			Store.touchSessions(true);
			return { ok: false, code: "refresh_expired" };
		}
		if (deviceId && found.deviceId !== deviceId) {
			// Same token presented from a different device => suspicious; revoke it.
			found.revoked = true; found.revokedAt = now;
			Store.touchSessions(true);
			return { ok: false, code: "device_mismatch" };
		}

		// Rotate: invalidate old refresh hash, issue a new session, mark old as rotated.
		var prevRefresh = found.refreshTokenHash;
		var issued = S._issue(found.accountId, found.deviceId);
		found.revoked = true; found.revokedAt = now;
		issued.session.rotatedFrom = prevRefresh.slice(0, 16);
		Store.touchSessions(true);

		return { ok: true, accessToken: issued.accessToken, refreshToken: issued.refreshToken, session: issued.session };
	};

	// Resolve a session by access token hash (for authenticating in-session actions).
	S.resolveSession = function (accessToken) {
		if (!accessToken) return null;
		var hash = S.tokenHash(accessToken);
		var list = Store.getSessions();
		var now = U.now();
		for (var i = 0; i < list.length; i++) {
			var s = list[i];
			if (!s.revoked && U.ctEqual(s.accessTokenHash, hash) && s.accessExpiresAt > now) return s;
		}
		return null;
	};

	S.revokeSession = function (sessionId, save) {
		var list = Store.getSessions();
		for (var i = 0; i < list.length; i++) {
			if (list[i].sessionId === sessionId && !list[i].revoked) {
				list[i].revoked = true;
				list[i].revokedAt = U.now();
				if (save) Store.touchSessions(true);
				return true;
			}
		}
		return false;
	};

	S.getSession = function (sessionId) {
		var list = Store.getSessions();
		for (var i = 0; i < list.length; i++) {
			if (list[i].sessionId === sessionId) return list[i];
		}
		return null;
	};

	S.revokeAllForAccount = function (accountId, exceptDeviceId, save) {
		var list = Store.getSessions();
		var now = U.now();
		var count = 0;
		for (var i = 0; i < list.length; i++) {
			var s = list[i];
			if (s.accountId === U.normalizeId(accountId) && !s.revoked && (!exceptDeviceId || s.deviceId !== exceptDeviceId)) {
				s.revoked = true;
				s.revokedAt = now;
				count++;
			}
		}
		if (save) Store.touchSessions(true);
		return count;
	};

	S.listSessions = function (accountId) {
		return Store.sessionsByAccount(U.normalizeId(accountId)).map(function (s) {
			return { sessionId: s.sessionId, deviceId: s.deviceId, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, accessExpiresAt: s.accessExpiresAt };
		});
	};

	S.isExpired = function (session) {
		return session.accessExpiresAt < U.now();
	};

	S.pruneExpired = function (save) {
		var list = Store.getSessions();
		var now = U.now();
		var kept = [];
		var removed = 0;
		for (var i = 0; i < list.length; i++) {
			if (!list[i] || !list[i].refreshExpiresAt || list[i].refreshExpiresAt < now) {
				removed++;
			} else {
				kept.push(list[i]);
			}
		}
		if (removed) {
			list.length = 0;
			for (var j = 0; j < kept.length; j++) list.push(kept[j]);
			if (save) Store.touchSessions(true);
		}
		return removed;
	};
})(typeof globalThis !== "undefined" ? globalThis : this);
