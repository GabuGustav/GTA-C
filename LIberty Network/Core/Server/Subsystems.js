"use strict";
/*
 * Liberty Network - Subsystem registry (LN.Subsystems)
 *
 * A tiny hook dispatcher so future modules (jobs, economy, characters,
 * properties, map) can plug lifecycle behaviour into the core without us
 * hard-coding each one into Init.js.
 *
 *   LN.Subsystems.register("police", {
 *       resolveSpawnPoint: (client, current) => newPosOrNull,
 *       beforeSpawn:       (client, opts) => { ... },   // may veto
 *       afterSpawn:        (client, opts) => { ... },
 *       onDeath:           (client, info) => { ... }
 *   });
 *
 * Hooks run in registration order; results are collected so a spawn provider
 * can pick the best position. A hook returning false vetoes the action.
 */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	var LN = root.LN;
	var S = (LN.Subsystems = LN.Subsystems || {});
	var U = LN.U;

	var registry = {}; // name -> hooks object
	var order = [];    // names in registration order

	function nameOf(name) { return String(name || "anonymous").toLowerCase(); }

	S.register = function (name, hooks) {
		var key = nameOf(name);
		if (!hooks || typeof hooks !== "object") return false;
		if (registry[key]) U.warn("Subsystem '" + key + "' overriding existing hooks.");
		registry[key] = hooks;
		if (order.indexOf(key) === -1) order.push(key);
		return true;
	};

	S.unregister = function (name) {
		var key = nameOf(name);
		if (registry[key]) { delete registry[key]; }
		var i = order.indexOf(key);
		if (i !== -1) order.splice(i, 1);
		return true;
	};

	S.get = function (name) { return registry[nameOf(name)] || null; };

	S.has = function (name) { return !!registry[nameOf(name)]; };

	// Emit an event to every registered subsystem.
	// Returns:
	//   - veto: true if any hook returned false
	//   - results: array of {subsystem, value} for all hook return values
	S.emit = function (eventName, a, b, c) {
		var veto = false;
		var results = [];
		for (var i = 0; i < order.length; i++) {
			var hooks = registry[order[i]];
			if (!hooks || typeof hooks[eventName] !== "function") continue;
			var out;
			try { out = hooks[eventName](a, b, c); }
			catch (e) { U.warn("Subsystem '" + order[i] + "'." + eventName + " threw: " + e.message); continue; }
			if (out === false) veto = true;
			results.push({ subsystem: order[i], value: out });
		}
		return { veto: veto, results: results };
	};

	// Convenience: emit a hook that resolves a value, merging non-null results.
	// Each hook receives (client, currentValue) and returns a replacement or null.
	S.resolve = function (eventName, client, initial) {
		var current = initial;
		var results = [];
		for (var i = 0; i < order.length; i++) {
			var hooks = registry[order[i]];
			if (!hooks || typeof hooks[eventName] !== "function") continue;
			var out;
			try { out = hooks[eventName](client, current); }
			catch (e) { U.warn("Subsystem '" + order[i] + "'." + eventName + " threw: " + e.message); continue; }
			if (out !== null && out !== undefined) {
				current = out;
			}
			results.push({ subsystem: order[i], value: out });
		}
		return { value: current, results: results };
	};

	S.clear = function () { registry = {}; order = []; };

	S.init = function () { registry = registry || {}; order = order || []; };
})(typeof globalThis !== "undefined" ? globalThis : this);