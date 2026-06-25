// =============================================================
// sync_manager/client/snapshot.js
// Collects and sends local state every SNAPSHOT_RATE_MS.
//
// Key fix: added turnVelocity to vehicle snapshots.
// This is the angular velocity — critical for high-speed sync.
// Without it every snapshot is a position-only correction
// and the physics engine fights back at speed.
// =============================================================

var ownedVehicles = {};

function startSnapshotLoop() {
    setInterval(sendPlayerSnapshot,   CONFIG.SNAPSHOT_RATE_MS);
    setInterval(sendVehicleSnapshots, CONFIG.SNAPSHOT_RATE_MS);
}

// ---------------------------------------------------------
// Player on-foot snapshot.
// Note: health/armour are readonly on Ped so we still send
// them for the server registry, but the receiver won't apply
// them directly to the ped element.
// ---------------------------------------------------------
function sendPlayerSnapshot() {
    var player = localPlayer;
    if (!player) return;

    var pos = player.position;
    var vel = player.velocity;
    if (!pos) return;

    var state = CONFIG.STATES.ON_FOOT;
    if (player.health <= 0) {
        state = CONFIG.STATES.DEAD;
    } else if (player.isEnteringVehicle) {
        state = CONFIG.STATES.ENTERING;
    } else if (player.isExitingVehicle) {
        state = CONFIG.STATES.EXITING;
    } else if (player.isInVehicle) {
        state = CONFIG.STATES.IN_VEHICLE;
    }

    var snapshot = {
        t:       Date.now(),
        state:   state,
        pos: {
            x: pos.x,
            y: pos.y,
            z: pos.z,
        },
        vel: {
            x: vel ? vel.x : 0,
            y: vel ? vel.y : 0,
            z: vel ? vel.z : 0,
        },
        heading:   player.heading,
        health:    player.health,
        armour:    player.armour,
        weapon:    player.weapon,
        vehicleId: (player.isInVehicle && player.vehicle)
            ? player.vehicle.id : null,
        seat: player.seat,
    };

    triggerNetworkEvent(CONFIG.EVENTS.PLAYER_SNAPSHOT, snapshot);
}

// ---------------------------------------------------------
// Vehicle snapshots for all owned vehicles.
// ---------------------------------------------------------
function sendVehicleSnapshots() {
    for (var vehicleId in ownedVehicles) {
        if (ownedVehicles[vehicleId] === "pending") continue;
        sendVehicleSnapshot(vehicleId);
    }
}

function sendVehicleSnapshot(vehicleId) {
    var vehicle = getElementFromId(vehicleId);
    if (!vehicle) {
        releaseVehicleOwnership(vehicleId);
        return;
    }

    var pos = vehicle.position;
    var vel = vehicle.velocity;
    var tv  = vehicle.turnVelocity; // angular velocity — KEY for high speed

    if (!pos) return;

    var snapshot = {
        t:         Date.now(),
        vehicleId: vehicleId,
        state:     CONFIG.STATES.IN_VEHICLE,

        pos: {
            x: pos.x,
            y: pos.y,
            z: pos.z,
        },
        vel: {
            x: vel ? vel.x : 0,
            y: vel ? vel.y : 0,
            z: vel ? vel.z : 0,
        },

        // Angular velocity — how fast the vehicle is rotating.
        // Without this, high-speed corrections cause physics explosions
        // because the engine can't reconcile a position jump with
        // zero rotational continuity.
        turnVelocity: {
            x: tv ? tv.x : 0,
            y: tv ? tv.y : 0,
            z: tv ? tv.z : 0,
        },

        heading: vehicle.heading,
        health:  vehicle.health,
        engine:  vehicle.engine,
    };

    triggerNetworkEvent(CONFIG.EVENTS.VEHICLE_SNAPSHOT, snapshot);
}

// ---------------------------------------------------------
// Ownership events from server.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.ASSIGN_OWNERSHIP, function(data) {
    if (data.preparing) {
        ownedVehicles[data.vehicleId] = "pending";
        return;
    }

    ownedVehicles[data.vehicleId] = true;

    triggerNetworkEvent(CONFIG.EVENTS.REQUEST_OWNERSHIP, {
        vehicleId: data.vehicleId,
    });

    console.log("[snapshot] Now owning vehicle: " + data.vehicleId);
});

addNetworkHandler(CONFIG.EVENTS.REVOKE_OWNERSHIP, function(data) {
    delete ownedVehicles[data.vehicleId];
    console.log("[snapshot] Released vehicle: " + data.vehicleId);
});

// ---------------------------------------------------------
// Vehicle entry/exit hooks.
// ---------------------------------------------------------
addEventHandler("OnPedEnterVehicle", function(ped, vehicle, seat) {
    if (ped !== localPlayer) return;
    if (seat !== 0) return; // driver only

    triggerNetworkEvent(CONFIG.EVENTS.REQUEST_OWNERSHIP, {
        vehicleId: vehicle.id,
        pos:       vehicle.position,
    });
});

addEventHandler("OnPedExitVehicle", function(ped, vehicle) {
    if (ped !== localPlayer) return;
    if (ownedVehicles[vehicle.id]) {
        releaseVehicleOwnership(vehicle.id);
    }
});

function releaseVehicleOwnership(vehicleId) {
    var vehicle = getElementFromId(vehicleId);
    triggerNetworkEvent(CONFIG.EVENTS.RELEASE_OWNERSHIP, {
        vehicleId: vehicleId,
        pos:       vehicle ? vehicle.position : null,
    });
    delete ownedVehicles[vehicleId];
}
