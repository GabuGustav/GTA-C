// =============================================================
// sync_manager/server/main.js
//
// Key discovery from reverse engineering:
//   OnPlayerJoined, OnPlayerQuit pass ZERO arguments.
//   We detect who joined/quit by diffing getClients()
//   against our known registry.
//
//   Client object has: .index .name .ping .player .ip etc.
//   We use getClients() which returns all current clients.
// =============================================================

var players = {};

// ---------------------------------------------------------
// Share ping with clients the same way v-scoreboard does.
// The client UI reads cached data instead of touching ping
// directly, which avoids context-specific access errors.
// ---------------------------------------------------------
var PING_SYNC_INTERVAL_MS = 3000;

function updateClientPingCache() {
    var clients = getClients();
    for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (!client) continue;

        try {
            client.setData("CustomSync.ping", client.ping, true);
        } catch (e) {
        }
    }
}

// ---------------------------------------------------------
// Diff helper — find clients in getClients() not in registry.
// ---------------------------------------------------------
function findNewClients() {
    var current = getClients();
    var newOnes = [];
    for (var i = 0; i < current.length; i++) {
        var c = current[i];
        if (!players[c.index]) {
            newOnes.push(c);
        }
    }
    return newOnes;
}

// Find clients in registry no longer in getClients().
function findGoneClients() {
    var current  = getClients();
    var currentMap = {};
    for (var i = 0; i < current.length; i++) {
        currentMap[current[i].index] = true;
    }

    var gone = [];
    for (var idx in players) {
        if (!currentMap[parseInt(idx)]) {
            gone.push(players[idx].client);
        }
    }
    return gone;
}

// ---------------------------------------------------------
// OnPlayerJoined — no arguments passed by GTAC.
// Diff getClients() to find who just joined.
// ---------------------------------------------------------
addEventHandler("OnPlayerJoined", function() {
    var newClients = findNewClients();
    for (var i = 0; i < newClients.length; i++) {
        var client = newClients[i];
        players[client.index] = {
            client:       client,
            lastSnapshot: null,
            lastSeen:     Date.now(),
            state:        CONFIG.STATES.ON_FOOT,
        };
        console.log("[sync_manager] Player joined: "
            + client.name + " (index: " + client.index + ")");
    }

    updateClientPingCache();
});

// ---------------------------------------------------------
// OnPlayerQuit — no arguments passed by GTAC.
// Diff getClients() to find who just left.
// ---------------------------------------------------------
addEventHandler("OnPlayerQuit", function() {
    var goneClients = findGoneClients();
    for (var i = 0; i < goneClients.length; i++) {
        var client = goneClients[i];
        if (!players[client.index]) continue;

        onPlayerLeft(client);
        delete players[client.index];

        console.log("[sync_manager] Player quit: " + client.name);
    }

    updateClientPingCache();
});

// Keep ping data fresh for the client HUD and scoreboard-like UI.
addEventHandler("OnResourceStart", function() {
    updateClientPingCache();
    setInterval(updateClientPingCache, PING_SYNC_INTERVAL_MS);
});

// ---------------------------------------------------------
// Incoming player snapshot.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.PLAYER_SNAPSHOT, function(client, snapshot) {
    snapshot.senderIndex = client.index;
    snapshot.receivedAt  = Date.now();

    if (players[client.index]) {
        players[client.index].lastSnapshot = snapshot;
        players[client.index].lastSeen     = Date.now();
        players[client.index].state        = snapshot.state;
    }

    if (!validateSnapshot(snapshot)) return;

    var recipients = getInterestedClients(client, snapshot.pos);
    for (var i = 0; i < recipients.length; i++) {
        triggerNetworkEvent(CONFIG.EVENTS.RELAY_PLAYER, recipients[i], snapshot);
    }
});

// ---------------------------------------------------------
// Incoming vehicle snapshot.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.VEHICLE_SNAPSHOT, function(client, snapshot) {
    snapshot.senderIndex = client.index;
    snapshot.receivedAt  = Date.now();

    if (!validateSnapshot(snapshot)) return;

    var recipients = getInterestedClients(client, snapshot.pos);
    for (var i = 0; i < recipients.length; i++) {
        triggerNetworkEvent(CONFIG.EVENTS.RELAY_VEHICLE, recipients[i], snapshot);
    }
});

// ---------------------------------------------------------
// Incoming traffic snapshot.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.TRAFFIC_SNAPSHOT, function(client, snapshot) {
    snapshot.senderIndex = client.index;
    snapshot.receivedAt  = Date.now();

    if (!validateTrafficSnapshot(snapshot)) return;

    var recipients = getInterestedClients(
        client, snapshot.pos, CONFIG.TRAFFIC_INTEREST_RADIUS
    );
    for (var i = 0; i < recipients.length; i++) {
        triggerNetworkEvent(CONFIG.EVENTS.RELAY_TRAFFIC, recipients[i], snapshot);
    }
});

// ---------------------------------------------------------
// Expose registry to other server scripts.
// ---------------------------------------------------------
function getPlayers() { return players; }
function getPlayerByIndex(index) { return players[index] || null; }

exportFunction("getPlayers",       getPlayers);
exportFunction("getPlayerByIndex", getPlayerByIndex);
