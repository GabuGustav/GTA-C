// =============================================================
// sync_manager/client/extrapolator.js
// Dead reckoning when interpolation buffer runs dry.
// Uses native vec3.extrapolate for position prediction.
// Vehicles use velocity application, not position teleport.
// =============================================================

function extrapolateEntity(entityId, lastSnap, renderTime) {
    var elapsed = renderTime - lastSnap.t;

    // Past the cap — freeze in last known state.
    if (elapsed > CONFIG.EXTRAPOLATION_CAP_MS) {
        applyFrozen(entityId, lastSnap);
        return;
    }

    var dt  = elapsed / 1000;
    var vel = lastSnap.vel || { x: 0, y: 0, z: 0 };

    // vec3.extrapolate(pos, vel, dt) = pos + vel * dt
    var predictedPos = vec3.extrapolate(lastSnap.pos, vel, dt);

    var isVehicle = (typeof entityId === "string"
        && entityId.indexOf("v_") === 0);

    if (isVehicle) {
        var vehicleId = entityId.substring(2);
        var vehicle   = getElementFromId(vehicleId);
        if (!vehicle) return;

        var currentPos = vehicle.position;
        if (!currentPos) return;

        var errorX = predictedPos.x - currentPos.x;
        var errorY = predictedPos.y - currentPos.y;
        var errorZ = predictedPos.z - currentPos.z;
        var errorMag = Math.sqrt(errorX*errorX + errorY*errorY + errorZ*errorZ);

        if (errorMag > CONFIG.VEHICLE_SNAP_THRESHOLD) {
            vehicle.position = predictedPos;
            vehicle.velocity = vel;
            return;
        }

        // Velocity nudge correction — same as interpolator
        var factor = CONFIG.VEHICLE_CORRECTION_FACTOR;
        vehicle.velocity = {
            x: vel.x + errorX * factor,
            y: vel.y + errorY * factor,
            z: vel.z + errorZ * factor,
        };

        if (lastSnap.turnVelocity) {
            vehicle.turnVelocity = lastSnap.turnVelocity;
        }

    } else {
        // Ped — position only
        var clients     = getClients();
        var clientIndex = parseInt(entityId);
        if (!clients[clientIndex]) return;
        var ped = clients[clientIndex].player;
        if (!ped) return;

        ped.position = predictedPos;
        ped.heading  = lastSnap.heading;
    }
}

// Freeze entity at last known state — used when past extrap cap.
function applyFrozen(entityId, lastSnap) {
    var isVehicle = (typeof entityId === "string"
        && entityId.indexOf("v_") === 0);

    if (isVehicle) {
        var vehicle = getElementFromId(entityId.substring(2));
        if (!vehicle) return;
        // Zero out velocity so it doesn't keep drifting
        vehicle.velocity     = { x: 0, y: 0, z: 0 };
        vehicle.turnVelocity = { x: 0, y: 0, z: 0 };
    } else {
        var clients = getClients();
        var ped     = clients[parseInt(entityId)];
        if (!ped || !ped.player) return;
        ped.player.position = lastSnap.pos;
        ped.player.heading  = lastSnap.heading;
    }
}
