// =============================================================
// sync_manager/server/validation.js
// Sanity checks on incoming snapshots.
// We don't punish — we silently drop bad data.
// A bad snapshot could be a physics spike, not cheating.
// =============================================================

// ---------------------------------------------------------
// Validate a player or vehicle snapshot.
// Returns true if the snapshot is acceptable.
// Returns false if it should be dropped.
// ---------------------------------------------------------
function validateSnapshot(snapshot) {

    // Must have a position
    if (!snapshot.pos) return false;
    if (typeof snapshot.pos.x !== "number") return false;
    if (typeof snapshot.pos.y !== "number") return false;
    if (typeof snapshot.pos.z !== "number") return false;

    // Must have a timestamp
    if (typeof snapshot.t !== "number") return false;

    // Timestamp must be recent — reject anything older than 5 seconds.
    // Prevents replay of old snapshots.
    var age = Date.now() - snapshot.t;
    if (age > 5000) return false;

    // Must have a valid state
    var validStates = [
        CONFIG.STATES.ON_FOOT,
        CONFIG.STATES.IN_VEHICLE,
        CONFIG.STATES.DEAD,
        CONFIG.STATES.ENTERING,
        CONFIG.STATES.EXITING,
    ];
    if (validStates.indexOf(snapshot.state) === -1) return false;

    // Health must be within valid range
    if (typeof snapshot.health === "number") {
        if (snapshot.health < 0
            || snapshot.health > CONFIG.MAX_HEALTH) return false;
    }

    // Armour must be within valid range
    if (typeof snapshot.armour === "number") {
        if (snapshot.armour < 0
            || snapshot.armour > CONFIG.MAX_ARMOUR) return false;
    }

    // Speed check — catch impossible movement.
    // We compare against previous snapshot if available.
    var player = getPlayerByIndex(snapshot.senderIndex);
    if (player && player.lastSnapshot && player.lastSnapshot.pos) {
        var prev = player.lastSnapshot;
        var dt   = (snapshot.t - prev.t) / 1000; // seconds

        if (dt > 0 && dt < 2) { // only check if time delta is sane
            var dx   = snapshot.pos.x - prev.pos.x;
            var dy   = snapshot.pos.y - prev.pos.y;
            var dz   = snapshot.pos.z - prev.pos.z;
            var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            var speed = dist / dt;

            if (speed > CONFIG.MAX_SPEED_THRESHOLD) {
                // Log but don't drop — could be a teleport or spawn.
                // Just flag it for now.
                console.log("[validation] Speed spike: client "
                    + snapshot.senderIndex + " at " + speed.toFixed(1)
                    + " units/s");
                // Future: track frequency of spikes per client.
            }
        }
    }

    // Position sanity — GTA IV Liberty City rough bounds.
    // Anything wildly outside this is garbage data.
    if (snapshot.pos.x < -4000 || snapshot.pos.x > 4000) return false;
    if (snapshot.pos.y < -4000 || snapshot.pos.y > 4000) return false;
    if (snapshot.pos.z < -100  || snapshot.pos.z > 1000) return false;

    return true;
}

// ---------------------------------------------------------
// Lighter validation for AI traffic snapshots.
// Traffic can behave erratically — we're more permissive.
// ---------------------------------------------------------
function validateTrafficSnapshot(snapshot) {

    if (!snapshot.pos) return false;
    if (typeof snapshot.pos.x !== "number") return false;
    if (typeof snapshot.pos.y !== "number") return false;
    if (typeof snapshot.pos.z !== "number") return false;
    if (typeof snapshot.t !== "number")     return false;

    // Must have a vehicle ID
    if (typeof snapshot.vehicleId === "undefined") return false;

    // Must have an owner
    if (typeof snapshot.ownerIndex === "undefined") return false;

    // Position bounds
    if (snapshot.pos.x < -4000 || snapshot.pos.x > 4000) return false;
    if (snapshot.pos.y < -4000 || snapshot.pos.y > 4000) return false;
    if (snapshot.pos.z < -100  || snapshot.pos.z > 1000) return false;

    return true;
}
