"use strict";
/*
 * Liberty Network - Pure-JS cryptography (LN.Crypto)
 *
 * SHA-256 + HMAC-SHA256 + PBKDF2 implemented from scratch so the auth service
 * has a real, modern password KDF without native dependencies. The GTAC runtime
 * (mozjs-60) exposes no crypto hashing API, so we provide our own. These
 * implementations are verified against standard test vectors.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var C = (LN.Crypto = LN.Crypto || {});

	// ---------------- utilities ----------------
	function utf8Bytes(str) {
		var bin = (typeof LN.U !== "undefined" && LN.U.toBinStr) ? LN.U.toBinStr(str) : str;
		var out = [];
		for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) & 0xff);
		return out;
	}
	function binStrToBytes(bin) {
		var out = [];
		for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) & 0xff);
		return out;
	}

	// ---------------- SHA-256 ----------------
	// Compute SHA-256 of a byte array, return hex string.
	function sha256Bytes(msg) {
		var bitLen = msg.length * 8;
		var padded = msg.slice();
		padded.push(0x80);
		while (padded.length % 64 !== 56) padded.push(0);
		for (var i = 7; i >= 0; i--) padded.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);

		var h = [
			0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
			0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
		];
		var K = [
			0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
			0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
			0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
			0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
			0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
			0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
			0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
		];

		function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

		for (var chunk = 0; chunk < Math.floor(padded.length / 64); chunk++) {
			var w = [];
			for (var t = 0; t < 16; t++) {
				var o = chunk * 64 + t * 4;
				w[t] = (padded[o] << 24) | (padded[o + 1] << 16) | (padded[o + 2] << 8) | padded[o + 3];
			}
			for (t = 16; t < 64; t++) {
				var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
				var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
				w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
			}

			var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
			for (var i2 = 0; i2 < 64; i2++) {
				var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
				var ch = (e & f) ^ (~e & g);
				var temp1 = (hh + S1 + ch + K[i2] + w[i2]) | 0;
				var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
				var maj = (a & b) ^ (a & c) ^ (b & c);
				var temp2 = (S0 + maj) | 0;
				hh = g; g = f; f = e; e = (d + temp1) | 0;
				d = c; c = b; b = a;
				a = (temp1 + temp2) | 0;
			}
			h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
			h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
		}

		var out = "";
		for (var o2 = 0; o2 < 8; o2++) {
			var sv = h[o2] >>> 0;
			var sh = sv.toString(16);
			while (sh.length < 8) sh = "0" + sh;
			out += sh;
		}
		return out;
	}

	function sha256BinBytes(msgBytes) {
		var hex = sha256Bytes(msgBytes);
		var out = "";
		for (var i = 0; i < hex.length; i += 2) {
			out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
		}
		return out;
	}

	// Public API
	C.sha256 = function (str) { return sha256Bytes(utf8Bytes(str)); };
	C.sha256Bin = function (binStr) { return sha256Bytes(binStrToBytes(binStr)); };

	// ---------------- HMAC-SHA256 ----------------
	C.hmacSha256 = function (keyBin, msgBin) {
		var blockSize = 64;
		var k = binStrToBytes(keyBin);
		if (k.length > blockSize) k = binStrToBytes(sha256BinBytes(k));
		while (k.length < blockSize) k.push(0);
		var oPad = [], iPad = [];
		for (var i = 0; i < blockSize; i++) {
			oPad.push(k[i] ^ 0x5c);
			iPad.push(k[i] ^ 0x36);
		}
		var inner = iPad.concat(binStrToBytes(msgBin));
		var innerDigest = sha256BinBytes(inner);
		var outer = oPad.concat(binStrToBytes(innerDigest));
		return sha256BinBytes(outer);
	};

	// ---------------- PBKDF2-HMAC-SHA256 ----------------
	// Returns hex string of the derived key.
	C.pbkdf2 = function (passwordStr, saltStr, iterations, dkLenBytes) {
		iterations = iterations || 10000;
		dkLenBytes = dkLenBytes || 32;
		var P = (typeof LN.U !== "undefined" && LN.U.toBinStr) ? LN.U.toBinStr(passwordStr) : passwordStr;
		var S = (typeof LN.U !== "undefined" && LN.U.toBinStr) ? LN.U.toBinStr(saltStr) : saltStr;
		var hLen = 32;
		var blocks = Math.ceil(dkLenBytes / hLen);
		if (blocks > 0xffffffff) throw new Error("pbkdf2: too many blocks");
		var DK = "";
		for (var i = 1; i <= blocks; i++) {
			var salt = S + String.fromCharCode(
				(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff
			);
			var U = C.hmacSha256(P, salt);
			var T = U;
			for (var c = 2; c <= iterations; c++) {
				U = C.hmacSha256(P, U);
				var xor = "";
				for (var b = 0; b < U.length; b++) {
					xor += String.fromCharCode(T.charCodeAt(b) ^ U.charCodeAt(b));
				}
				T = xor;
			}
			DK += T;
		}
		var hex = "";
		for (var d = 0; d < dkLenBytes; d++) {
			var cV = DK.charCodeAt(d) & 0xff;
			hex += (cV < 16 ? "0" : "") + cV.toString(16);
		}
		return hex;
	};
})(typeof globalThis !== "undefined" ? globalThis : this);