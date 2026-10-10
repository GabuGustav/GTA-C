// =============================================================
// sync_manager/client/extrapolator.js
// Dead reckoning when interpolation buffer runs dry.
// Uses native vec3.extrapolate for position prediction.
// Vehicles use velocity application, not position teleport.
// =============================================================

function extrapolateEntity(entityId, lastSnap, renderTime, frameDt) {
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

        var speedMs  = natives.getCarSpeed ? natives.getCarSpeed(vehicle) : 0;
        var speedKmh = speedMs * 3.6;

        // Shared buffer state — same object interpolator.js reads/
        // writes. Without sharing this, a single-frame buffer
        // underrun (very common — it's just one late packet) drops
        // into this file's OWN independent snap decision, which
        // disagreed with interpolator.js's and fought it.
        var buf        = buffers[entityId];
        var wasSnapped = buf ? buf.vehicleSnapped : false;

        var effectiveSnapThreshold = Math.min(
            CONFIG.VEHICLE_SNAP_THRESHOLD + speedKmh * CONFIG.VEHICLE_SNAP_THRESHOLD_PER_KMH,
            CONFIG.VEHICLE_SNAP_THRESHOLD_MAX
        );
        var effectiveResumeThreshold = effectiveSnapThreshold * CONFIG.VEHICLE_CORRECTION_RESUME_RATIO;

        if (errorMag > effectiveSnapThreshold
            || (wasSnapped && errorMag > effectiveResumeThreshold)) {
            vehicle.position = predictedPos;
            vehicle.velocity = vel;
            if (buf) buf.vehicleSnapped = true;
            return;
        }

        if (buf) buf.vehicleSnapped = false;

        if (errorMag < CONFIG.VEHICLE_POSITION_DEADZONE) {
            // Close enough — don't fight native physics settling.
            vehicle.velocity = vel;
        } else {
            var factor = CONFIG.VEHICLE_CORRECTION_FACTOR;
            var fdt    = (typeof frameDt === "number") ? frameDt : dt;
            vehicle.velocity = {
                x: vel.x + errorX * factor * fdt,
                y: vel.y + errorY * factor * fdt,
                z: vel.z + errorZ * factor * fdt,
            };
        }

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