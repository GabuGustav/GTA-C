// =============================================================
// sync_manager/client/interpolator.js
// Smooth movement between received snapshots.
// Reports real-time diagnostic data to diag_logger.js.
// Health/armour now applied via natives (not readonly props).
// =============================================================

var buffers = {};

addNetworkHandler(CONFIG.EVENTS.RELAY_PLAYER, function(snapshot) {
    pushToBuffer(snapshot.senderIndex, snapshot);
});

addNetworkHandler(CONFIG.EVENTS.RELAY_VEHICLE, function(snapshot) {
    pushToBuffer("v_" + snapshot.vehicleId, snapshot);
});

function pushToBuffer(entityId, snapshot) {
    if (!buffers[entityId]) {
        buffers[entityId] = {
            snapshots:  [],
            lastPlayed: 0,
        };
    }

    var buf = buffers[entityId];
    if (snapshot.t <= buf.lastPlayed) return;

    buf.snapshots.push(snapshot);
    buf.snapshots.sort(function(a, b) { return a.t - b.t; });

    if (buf.snapshots.length > 10) {
        buf.snapshots.splice(0, buf.snapshots.length - 10);
    }
}

function processInterpolation() {
    var renderTime = Date.now() - CONFIG.INTERPOLATION_DELAY_MS;

    for (var entityId in buffers) {
        interpolateEntity(entityId, renderTime);
    }
}

function interpolateEntity(entityId, renderTime) {
    var buf = buffers[entityId];
    if (!buf || buf.snapshots.length === 0) return;

    // Snapshot age — how long since we last received data
    var latest       = buf.snapshots[buf.snapshots.length - 1];
    var snapshotAge  = Date.now() - latest.t;
    var bufferDepth  = buf.snapshots.length;

    var snapA = null;
    var snapB = null;

    for (var i = 0; i < buf.snapshots.length - 1; i++) {
        if (buf.snapshots[i].t   <= renderTime
         && buf.snapshots[i+1].t >= renderTime) {
            snapA = buf.snapshots[i];
            snapB = buf.snapshots[i+1];
            break;
        }
    }

    if (!snapA || !snapB) {
        if (latest && renderTime > latest.t) {
            extrapolateEntity(entityId, latest, renderTime);
            // Report extrapolation to logger
            if (typeof reportRemoteDiag === "function") {
                reportRemoteDiag(entityId, {
                    bufferDepth:     bufferDepth,
                    snapshotAge:     snapshotAge,
                    isExtrapolating: true,
                    posErrorMag:     0,
                    didSnap:         false,
                    state:           latest.state || "unknown",
                    speedKmh:        0,
                });
            }
        }
        return;
    }

    var span = snapB.t - snapA.t;
    var t    = span > 0 ? (renderTime - snapA.t) / span : 0;
    t = Math.max(0, Math.min(1, t));

    var pos     = vec3.interpolate(snapA.pos, snapB.pos, t);
    var heading = lerpAngle(snapA.heading, snapB.heading, t);

    var isVehicle = (typeof entityId === "string"
        && entityId.indexOf("v_") === 0);

    var diagData = {
        bufferDepth:     bufferDepth,
        snapshotAge:     snapshotAge,
        isExtrapolating: false,
        state:           snapB.state || "unknown",
        speedKmh:        0,
        posErrorMag:     0,
        didSnap:         false,
        vehicleMass:     0,
    };

    if (isVehicle) {
        applyToVehicle(entityId, pos, heading, snapA, snapB, t, diagData);
    } else {
        applyToPed(entityId, pos, heading, snapB, diagData);
    }

    // Report to logger
    if (typeof reportRemoteDiag === "function") {
        reportRemoteDiag(entityId, diagData);
    }

    buf.lastPlayed = renderTime;
    while (buf.snapshots.length > 1
        && buf.snapshots[1].t <= renderTime) {
        buf.snapshots.shift();
    }
}

// ---------------------------------------------------------
// Apply to ped.
// Health/armour set via natives.setCharHealth/setCharArmour
// since they are readonly on the Ped property.
// ---------------------------------------------------------
function applyToPed(entityId, pos, heading, snap, diagData) {
    var element = resolveElement(entityId, snap);
    if (!element) return;

    element.position = pos;
    element.heading  = heading;

    // Apply health via native — not via property (readonly)
    if (typeof snap.health === "number" && natives.setCharHealth) {
        natives.setCharHealth(element, snap.health);
    }
    if (typeof snap.armour === "number" && natives.addArmourToChar) {
        // No setCharArmour native found — addArmourToChar is the closest.
        // We can only add, not set. Track this as a known limitation.
        // TODO: find setCharArmour equivalent in natives
    }

    diagData.state = snap.state || "onFoot";
}

// ---------------------------------------------------------
// Apply to vehicle — velocity-driven correction.
// Fills diagData with real measurement for the logger.
// ---------------------------------------------------------
function applyToVehicle(entityId, targetPos, targetHeading, snapA, snapB, t, diagData) {
    var vehicleId = entityId.substring(2);
    var vehicle   = getElementFromId(vehicleId);
    if (!vehicle) return;

    var currentPos = vehicle.position;
    if (!currentPos) return;

    // Interpolate velocity and turnVelocity
    var targetVel = vec3.interpolate(snapA.vel, snapB.vel, t);
    var targetTV  = vec3.interpolate(
        snapA.turnVelocity || { x:0, y:0, z:0 },
        snapB.turnVelocity || { x:0, y:0, z:0 },
        t
    );

    // Measure real position error
    var errorX   = targetPos.x - currentPos.x;
    var errorY   = targetPos.y - currentPos.y;
    var errorZ   = targetPos.z - currentPos.z;
    var errorMag = Math.sqrt(errorX*errorX + errorY*errorY + errorZ*errorZ);

    // Real speed via native
    var speedMs  = natives.getCarSpeed ? natives.getCarSpeed(vehicle) : 0;
    var speedKmh = speedMs * 3.6;

    // Vehicle mass for correlation
    var mass = natives.getCarMass ? natives.getCarMass(vehicle) : 0;

    // Fill diag data with real measurements
    diagData.posErrorMag  = errorMag;
    diagData.speedKmh     = speedKmh;
    diagData.vehicleMass  = mass;
    diagData.state        = snapB.state || "inVehicle";

    // Snap if error too large
    if (errorMag > CONFIG.VEHICLE_SNAP_THRESHOLD) {
        vehicle.position     = targetPos;
        vehicle.heading      = targetHeading;
        vehicle.velocity     = targetVel;
        vehicle.turnVelocity = targetTV;
        diagData.didSnap = true;
        return;
    }

    diagData.didSnap = false;

    // Velocity-driven correction
    var factor = CONFIG.VEHICLE_CORRECTION_FACTOR;

    vehicle.velocity = {
        x: targetVel.x + errorX * factor,
        y: targetVel.y + errorY * factor,
        z: targetVel.z + errorZ * factor,
    };

    vehicle.turnVelocity = targetTV;

    // Heading correction
    var headingError = targetHeading - vehicle.heading;
    while (headingError >  180) headingError -= 360;
    while (headingError < -180) headingError += 360;

    if (Math.abs(headingError) > CONFIG.VEHICLE_HEADING_SNAP_THRESHOLD) {
        vehicle.heading = targetHeading;
    }
}

function resolveElement(entityId, snap) {
    if (typeof entityId === "string" && entityId.indexOf("v_") === 0) {
        return getElementFromId(entityId.substring(2));
    }
    var clients     = getClients();
    var clientIndex = parseInt(entityId);
    if (clients[clientIndex]) return clients[clientIndex].player;
    return null;
}

function clearBuffer(entityId) {
    delete buffers[entityId];
}

function lerpAngle(a, b, t) {
    var diff = b - a;
    while (diff >  180) diff -= 360;
    while (diff < -180) diff += 360;
    var result = a + diff * t;
    while (result <   0) result += 360;
    while (result >= 360) result -= 360;
    return result;
}
