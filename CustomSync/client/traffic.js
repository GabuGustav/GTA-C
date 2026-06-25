// =============================================================
// sync_manager/client/traffic.js
// Handles AI traffic sync.
// Each nearby AI vehicle is owned by the closest client.
// Owner broadcasts its state, others interpolate.
//
// NOTE: This is Phase 3. The system is designed but
// we activate it only after confirming via testing that
// GTAC does NOT sync AI traffic by default.
// Set TRAFFIC_ENABLED = true to activate.
// =============================================================

var TRAFFIC_ENABLED = false; // Flip after Phase 0 testing confirms need

// ---------------------------------------------------------
// AI vehicles this client currently owns.
// Key: vehicleId, Value: snapshot data
// ---------------------------------------------------------
var ownedTraffic = {};

// ---------------------------------------------------------
// Start traffic loop if enabled.
// ---------------------------------------------------------
function startTrafficLoop() {
    if (!TRAFFIC_ENABLED) return;
    setInterval(scanAndSendTraffic, CONFIG.TRAFFIC_SNAPSHOT_RATE_MS);
}

// ---------------------------------------------------------
// Scan nearby AI vehicles, claim ownership of unclaimed ones,
// and send snapshots for owned ones.
// ---------------------------------------------------------
function scanAndSendTraffic() {
    var player = localPlayer;
    if (!player || !player.position) return;

    var vehicles = getVehicles();
    var owned    = 0;

    for (var i = 0; i < vehicles.length; i++) {
        var vehicle = vehicles[i];
        if (!vehicle) continue;

        // Skip player-controlled vehicles — ownership.js handles those.
        if (vehicle.getOccupant(0)) continue;

        var pos  = vehicle.position;
        if (!pos) continue;

        var dist = distance3D(player.position, pos);
        if (dist > CONFIG.TRAFFIC_INTEREST_RADIUS) continue;

        // Within range — if we own it, send snapshot.
        if (ownedTraffic[vehicle.id]) {
            if (owned < CONFIG.MAX_TRAFFIC_OWNED) {
                sendTrafficSnapshot(vehicle);
                owned++;
            }
        }
    }
}

// ---------------------------------------------------------
// Send a traffic snapshot for a single AI vehicle.
// ---------------------------------------------------------
function sendTrafficSnapshot(vehicle) {
    var pos = vehicle.position;
    var vel = vehicle.velocity;

    if (!pos) return;

    var snapshot = {
        t:          Date.now(),
        vehicleId:  vehicle.id,
        ownerIndex: localClient.index,
        state:      "traffic",

        pos: { x: pos.x, y: pos.y, z: pos.z },
        vel: {
            x: vel ? vel.x : 0,
            y: vel ? vel.y : 0,
            z: vel ? vel.z : 0,
        },

        heading:    vehicle.heading,
        health:     vehicle.health,
        modelIndex: vehicle.modelIndex,
    };

    triggerNetworkEvent(CONFIG.EVENTS.TRAFFIC_SNAPSHOT, snapshot);
}

// ---------------------------------------------------------
// Receive relayed traffic snapshot — apply to local world.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.RELAY_TRAFFIC, function(snapshot) {
    if (!TRAFFIC_ENABLED) return;

    // Push into interpolation buffer via interpolator.js
    pushToBuffer("t_" + snapshot.vehicleId, snapshot);
});

// ---------------------------------------------------------
// 3D distance helper (self-contained)
// ---------------------------------------------------------
function distance3D(a, b) {
    if (!a || !b) return Infinity;
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var dz = a.z - b.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}
