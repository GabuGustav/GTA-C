// =============================================================
// sync_manager/server/interest.js
// Determines which clients receive a given snapshot.
// =============================================================

function getInterestedClients(sender, pos, radius) {
    radius = radius || CONFIG.INTEREST_RADIUS;

    var players    = getPlayers();
    var interested = [];

    for (var idx in players) {
        var p = players[idx];

        if (p.client.index === sender.index) continue;

        // No known position yet — include to be safe (just connected).
        if (!p.lastSnapshot || !p.lastSnapshot.pos) {
            interested.push(p.client);
            continue;
        }

        // Use native vec3.distance
        var dist = vec3.distance(p.lastSnapshot.pos, pos);

        if (dist <= radius) {
            interested.push(p.client);
        }
    }

    return interested;
}
