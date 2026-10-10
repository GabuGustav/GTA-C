"use strict";
/* LN.Admin.Network part 1: helpers, target resolution, panel events. */
(function (root) {
	"use strict";
	root.LN = root.LN || {};
	root.LN.Admin = root.LN.Admin || {};
	var LN = root.LN;
	var N = (LN.Admin.Network = LN.Admin.Network || {});

	function send(client, eventName) {
		var args = Array.prototype.slice.call(arguments, 2);
		try { triggerNetworkEvent.apply(null, [eventName, client].concat(args)); return; } catch (e) {}
	}
	N.send = send;

	function sendError(client, code, message) {
		send(client, "ln:adminError", code || "", message || code || "");
	}

	function msg(client, text, colour) {
		try { if (messageClient) { messageClient(text, client, colour || COLOUR_YELLOW); return; } } catch (e) {}
		try { if (outputChatBox) outputChatBox(text, client, 255, 255, 0); } catch (e2) {}
	}
	N.msg = msg;

	function resolveTarget(arg) {
		if (arg == null || String(arg) === "") return null;
		var s = String(arg).trim();
		var clients = [];
		try { clients = getClients(); } catch (e) { return null; }
		var m = s.match(/^\[?ID:(\d+)\]?$/i);
		var i, n;
		if (m) {
			n = parseInt(m[1], 10);
			for (i = 0; i < clients.length; i++) {
				if (clients[i].index === n) return clients[i];
			}
			return null;
		}
		if (/^\d+$/.test(s)) {
			n = parseInt(s, 10);
			for (i = 0; i < clients.length; i++) {
				if (clients[i].index === n) return clients[i];
			}
		}
		var low = s.toLowerCase();
		for (i = 0; i < clients.length; i++) {
			if (String(clients[i].name || "").toLowerCase() === low) return clients[i];
		}
		return null;
	}
	N.resolveTarget = resolveTarget;

	function pushState(client) {
		var staff = "0", level = 0;
		try {
			if (LN.Admin.Service.available && LN.Admin.Roles.isStaff(client)) {
				staff = "1";
				level = LN.Admin.Roles.levelForClient(client);
			}
		} catch (e) {}
		send(client, "ln:adminState", staff, String(level));
	}
	N.pushState = pushState;

	function registerEvent(name) { try { if (typeof addEvent === "function") addEvent(name); } catch (e) {} }

	N.init = function () {
		if (N.initialized) return;
		N.initialized = true;

		registerEvent("ln:adminList");
		addNetworkHandler("ln:adminList", function (client) {
			var r = LN.Admin.Service.roster(client);
			if (!r.ok) return void sendError(client, r.code, "Not authorized.");
			send(client, "ln:adminRoster", JSON.stringify(r.players || []));
		});

		registerEvent("ln:adminAction");
		addNetworkHandler("ln:adminAction", function (client, action, targetArg, argJson) {
			var a = String(action || "").toLowerCase();
			var arg = {};
			try { arg = JSON.parse(argJson || "{}") || {}; } catch (e) {}
			var target = resolveTarget(targetArg);
			var r = null;
			if (a === "kick") r = LN.Admin.Service.kick(client, target, arg.reason);
			else if (a === "ban") r = LN.Admin.Service.ban(client, target, arg.reason, 0);
			else if (a === "tempban") r = LN.Admin.Service.ban(client, target, arg.reason, arg.minutes);
			else if (a === "mute") r = LN.Admin.Service.mute(client, target, arg.minutes);
			else if (a === "unmute") r = LN.Admin.Service.unmute(client, target || arg.accountId);
			else if (a === "warn") r = LN.Admin.Service.warn(client, target, arg.reason);
			else if (a === "unban") r = LN.Admin.Service.unban(client, arg.accountId || targetArg);
			else if (a === "banlist") r = LN.Admin.Service.banList(client);
			else return void sendError(client, "unknown_action", "Unknown admin action.");
			if (!r.ok) return void sendError(client, r.code, "Admin: " + r.code);
			send(client, "ln:adminResult", a, "1", JSON.stringify({}));
		});

		// Mute enforcement: swallow chat from muted accounts.
		try {
			addEventHandler("OnPlayerChat", function (event, client) {
				try {
					if (!LN.Admin.Service.available) return;
					var id = LN.Auth.Service.accountForClient(client);
					if (!id) return;
					var acc = LN.Auth.Accounts.getAccount(id);
					if (LN.Auth.Accounts.isMuted(acc)) {
						try { if (event && event.preventDefault) event.preventDefault(); } catch (e2) {}
						try { if (messageClient) messageClient("You are muted.", client, COLOUR_RED); } catch (e3) {}
					}
				} catch (e) {}
			});
		} catch (e4) {}

	};
})(typeof globalThis !== "undefined" ? globalThis : this);
