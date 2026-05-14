"use strict";

const BANS_FILE = "hwid_bans.json";
const CONFIG_FILE = "config.json";
const LOG_FILE = "hwid_log.json";

let scriptConfig = {
    commandLevels: {
        hwidban: 2,
        hwidunban: 2,
        hwidbanlist: 1,
        hwidwhoami: 1,
        hwidreload: 2
    },
    disconnectMessage: "You are banned from this server (HWID).",
    allowConsoleBypass: true,
    admins: [],
    autoBanOnJoinCheck: true,
    maxLogEntries: 1000
};

let hwidBans = [];

function safeJSONParse(raw, fallback) {
    try {
        if (!raw || raw.trim() === "") return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch (_e) {
        return fallback;
    }
}

function loadConfig() {
    const raw = loadTextFile(CONFIG_FILE);
    const parsed = safeJSONParse(raw, null);
    if (parsed && typeof parsed === "object") {
        scriptConfig = Object.assign({}, scriptConfig, parsed);
    }
}

function loadBans() {
    const raw = loadTextFile(BANS_FILE);
    const parsed = safeJSONParse(raw, []);
    hwidBans = Array.isArray(parsed) ? parsed : [];
}

function saveBans() {
    saveTextFile(BANS_FILE, JSON.stringify(hwidBans, null, "\t"));
}

function appendLog(actor, action, details) {
    const raw = loadTextFile(LOG_FILE);
    const parsed = safeJSONParse(raw, []);
    const logs = Array.isArray(parsed) ? parsed : [];

    logs.push({
        timestamp: new Date().toISOString(),
        actor: actor || "unknown",
        action: action || "event",
        details: details || ""
    });

    const max = Number(scriptConfig.maxLogEntries) || 1000;
    while (logs.length > max) logs.shift();
    saveTextFile(LOG_FILE, JSON.stringify(logs, null, "\t"));
}

function messageClientSafe(text, client, colour) {
    try {
        messageClient(text, client, colour || COLOUR_YELLOW);
        return true;
    } catch (_e) {}
    try {
        outputChatBox(text, client, 255, 255, 0);
        return true;
    } catch (_e2) {}
    return false;
}

function normalize(v) {
    return String(v || "").toLowerCase().trim();
}

function parseTarget(params) {
    if (!params || !params.trim()) return null;
    const first = params.trim().split(" ")[0];
    return first;
}

function getLevelForCommand(command) {
    const map = scriptConfig.commandLevels || {};
    const level = map[String(command || "").toLowerCase()];
    return typeof level === "number" ? level : 2;
}

function levelFromAdminRule(client, rule) {
    try {
        if (!client || !rule || typeof rule !== "object") return 0;
        const level = Number(rule.level) || 0;
        if (level <= 0) return 0;

        const byName = normalize(rule.name);
        const bySerial = normalize(rule.serial);
        const byGuid = normalize(rule.guid);
        const byIp = normalize(rule.ip);

        if (byName && normalize(client.name) === byName) return level;
        if (bySerial && normalize(client.serial || client.getData("serial")) === bySerial) return level;
        if (byGuid && normalize(client.guid || client.getData("guid")) === byGuid) return level;
        if (byIp && normalize(client.ip) === byIp) return level;

        return 0;
    } catch (_e) {
        return 0;
    }
}

function getConfiguredAdminLevel(client) {
    try {
        if (!client) return 0;
        if (client.console === true) return 99999999;
        const rules = Array.isArray(scriptConfig.admins) ? scriptConfig.admins : [];
        let highest = 0;
        for (let i = 0; i < rules.length; i++) {
            const lvl = levelFromAdminRule(client, rules[i]);
            if (lvl > highest) highest = lvl;
        }
        return highest;
    } catch (_e) {
        return 0;
    }
}

function isTrustedAdmin(client, commandName) {
    const required = getLevelForCommand(commandName);

    if (client && client.console === true && scriptConfig.allowConsoleBypass !== false) {
        return true;
    }

    return getConfiguredAdminLevel(client) >= required;
}

function bestEffortHWID(client) {
    const signals = [];

    try {
        const serial = client.serial || client.getData("serial") || "";
        if (serial) signals.push(`serial:${serial}`);
    } catch (_e) {}

    try {
        const guid = client.guid || client.getData("guid") || "";
        if (guid) signals.push(`guid:${guid}`);
    } catch (_e2) {}

    try {
        const token = client.getData("b.token") || "";
        if (token) signals.push(`token:${token}`);
    } catch (_e3) {}

    try {
        const ip = client.ip || "";
        if (ip) signals.push(`ip:${ip}`);
    } catch (_e4) {}

    try {
        const name = client.name || "";
        if (name) signals.push(`name:${name.toLowerCase()}`);
    } catch (_e5) {}

    return signals.join("|");
}

function getClientFromParams(params) {
    const key = normalize(parseTarget(params));
    if (!key) return null;

    const clients = getClients();
    if (!Array.isArray(clients)) return null;

    if (key.startsWith("id:")) {
        const id = Number(key.slice(3));
        if (!isNaN(id)) {
            return clients.find(c => Number(c.index) === id) || null;
        }
    }

    const byName = clients.find(c => normalize(c.name) === key);
    if (byName) return byName;

    const byIp = clients.find(c => normalize(c.ip) === key);
    if (byIp) return byIp;

    const byToken = clients.find(c => normalize(c.getData("b.token")) === key);
    if (byToken) return byToken;

    return null;
}

function findBanByHWID(hwid) {
    const normalized = normalize(hwid);
    return hwidBans.find(b => normalize(b.hwid) === normalized) || null;
}

function isClientBanned(client) {
    const hwid = bestEffortHWID(client);
    if (!hwid) return null;

    const byExact = findBanByHWID(hwid);
    if (byExact) return byExact;

    return null;
}

function disconnectBannedClient(client, ban) {
    const reason = ban && ban.reason ? ` (${ban.reason})` : "";
    messageClientSafe(`${scriptConfig.disconnectMessage}${reason}`, client, COLOUR_RED);
    appendLog("System", "join_blocked", `${client.name} blocked by HWID ban`);
    client.disconnect();
}

addEventHandler("OnPlayerJoined", function(client) {
    if (!scriptConfig.autoBanOnJoinCheck) return;
    const ban = isClientBanned(client);
    if (ban) {
        disconnectBannedClient(client, ban);
    }
});

addCommandHandler("hwidwhoami", (command, params, client) => {
    if (!isTrustedAdmin(client, command)) {
        messageClientSafe("Not authorized.", client, COLOUR_RED);
        return false;
    }

    const hwid = bestEffortHWID(client);
    messageClientSafe(`HWID fingerprint for ${client.name}: ${hwid || "<none>"}`, client, COLOUR_YELLOW);
    return true;
});

addCommandHandler("hwidban", (command, params, client) => {
    if (!isTrustedAdmin(client, command)) {
        messageClientSafe("Not authorized.", client, COLOUR_RED);
        return false;
    }

    const targetClient = getClientFromParams(params || "");
    const pieces = String(params || "").trim().split(" ");
    const reason = pieces.length > 1 ? pieces.slice(1).join(" ").trim() : "No reason";

    if (!targetClient) {
        messageClientSafe("Usage: /hwidban <ID:name:ip:token> [reason]", client, COLOUR_RED);
        return false;
    }

    const hwid = bestEffortHWID(targetClient);
    if (!hwid) {
        messageClientSafe("Could not derive HWID fingerprint for target.", client, COLOUR_RED);
        return false;
    }

    if (findBanByHWID(hwid)) {
        messageClientSafe("Target HWID is already banned.", client, COLOUR_YELLOW);
        return false;
    }

    hwidBans.push({
        hwid,
        name: targetClient.name,
        ip: targetClient.ip,
        token: targetClient.getData("b.token") || "",
        reason,
        bannedBy: client && client.name ? client.name : "Console",
        bannedAt: new Date().toISOString()
    });

    saveBans();
    appendLog(client && client.name ? client.name : "Console", "hwidban", `${targetClient.name} reason=${reason}`);

    messageClientSafe(`HWID banned ${targetClient.name}.`, client, COLOUR_YELLOW);
    disconnectBannedClient(targetClient, { reason });
    return true;
});

addCommandHandler("hwidunban", (command, params, client) => {
    if (!isTrustedAdmin(client, command)) {
        messageClientSafe("Not authorized.", client, COLOUR_RED);
        return false;
    }

    const target = parseTarget(params || "");
    if (!target) {
        messageClientSafe("Usage: /hwidunban <hwid-fragment|name|token>", client, COLOUR_RED);
        return false;
    }

    const key = normalize(target);
    const before = hwidBans.length;
    hwidBans = hwidBans.filter(b => {
        const h = normalize(b.hwid);
        const n = normalize(b.name);
        const t = normalize(b.token);
        return !(h.includes(key) || n === key || t === key);
    });

    if (hwidBans.length === before) {
        messageClientSafe("No matching HWID ban found.", client, COLOUR_YELLOW);
        return false;
    }

    saveBans();
    appendLog(client && client.name ? client.name : "Console", "hwidunban", `target=${target}`);
    messageClientSafe(`Unbanned ${before - hwidBans.length} HWID entry(s).`, client, COLOUR_YELLOW);
    return true;
});

addCommandHandler("hwidbanlist", (command, params, client) => {
    if (!isTrustedAdmin(client, command)) {
        messageClientSafe("Not authorized.", client, COLOUR_RED);
        return false;
    }

    if (!Array.isArray(hwidBans) || hwidBans.length === 0) {
        messageClientSafe("No HWID bans found.", client, COLOUR_YELLOW);
        return true;
    }

    const lines = hwidBans.slice(0, 30).map((b, i) => `${i + 1}. ${b.name || "unknown"} | by ${b.bannedBy || "?"} | ${b.reason || "No reason"}`);
    messageClientSafe(`HWID bans (${hwidBans.length}):\n${lines.join("\n")}`, client, COLOUR_YELLOW);
    return true;
});

addCommandHandler("hwidreload", (command, params, client) => {
    if (!isTrustedAdmin(client, command)) {
        messageClientSafe("Not authorized.", client, COLOUR_RED);
        return false;
    }

    loadConfig();
    loadBans();
    messageClientSafe("HWID config and bans reloaded.", client, COLOUR_YELLOW);
    appendLog(client && client.name ? client.name : "Console", "hwidreload", "manual reload");
    return true;
});

(function init() {
    loadConfig();
    loadBans();
    if (loadTextFile(LOG_FILE) === "") {
        saveTextFile(LOG_FILE, JSON.stringify([], null, "\t"));
    }
    console.log("[hwid-banning] Loaded basic HWID banning resource");
})();
