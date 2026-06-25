// =============================================================
// sync_manager/server/ownership.js
// Manages who owns each networked entity.
// Fixes:
//   - Sliding/oscillating car at stop (ownership conflict)
//   - Boat launch on vehicle entry (bad migration)
//   - Cops appearing out of nowhere (AI ownership gaps)
// =============================================================

// vehicleOwners[vehicleId] = {
//     ownerIndex:   int,
//     assignedAt:   timestamp,
//     handingOff:   bool,
//     pendingOwner: int | null,
//     lastPos:      vec3 | null
// }
var vehicleOwners = {};

// ---------------------------------------------------------
// Client requesting ownership of a vehicle.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.REQUEST_OWNERSHIP, function(client, data) {
    var vehicleId = data.vehicleId;
    var existing  = vehicleOwners[vehicleId];

    if (!existing) {
        assignOwnership(vehicleId, client.index);
        return;
    }

    if (existing.ownerIndex === client.index) {
        confirmOwnership(vehicleId, client.index);
        return;
    }

    if (!existing.handingOff) {
        // Deny — current owner keeps authority.
        var clients = getClients();
        if (clients[client.index]) {
            triggerNetworkEvent(
                CONFIG.EVENTS.REVOKE_OWNERSHIP,
                clients[client.index],
                { vehicleId: vehicleId }
            );
        }
        return;
    }

    if (existing.handingOff && existing.pendingOwner === client.index) {
        completeHandoff(vehicleId, client.index);
        return;
    }
});

// ---------------------------------------------------------
// Client releasing ownership.
// ---------------------------------------------------------
addNetworkHandler(CONFIG.EVENTS.RELEASE_OWNERSHIP, function(client, data) {
    var vehicleId = data.vehicleId;
    var existing  = vehicleOwners[vehicleId];

    if (!existing) return;
    if (existing.ownerIndex !== client.index) return;

    var newOwnerIndex = findBestNewOwner(vehicleId, data.pos, client.index);

    if (newOwnerIndex === null) {
        delete vehicleOwners[vehicleId];
        return;
    }

    beginHandoff(vehicleId, client.index, newOwnerIndex);
});

// ---------------------------------------------------------
// Called directly from server/main.js OnPlayerQuit handler.
// No custom event needed — direct function call is cleaner.
// ---------------------------------------------------------
function onPlayerLeft(client) {
    for (var vehicleId in vehicleOwners) {
        if (vehicleOwners[vehicleId].ownerIndex === client.index) {
            var lastPos      = vehicleOwners[vehicleId].lastPos || null;
            var newOwnerIndex = findBestNewOwner(vehicleId, lastPos, client.index);

            if (newOwnerIndex === null) {
                delete vehicleOwners[vehicleId];
            } else {
                // Force immediate assign — old owner is gone, no overlap needed.
                assignOwnership(vehicleId, newOwnerIndex);
            }
        }
    }
}

// ---------------------------------------------------------
// INTERNAL: Assign ownership cleanly.
// ---------------------------------------------------------
function assignOwnership(vehicleId, ownerIndex) {
    vehicleOwners[vehicleId] = {
        ownerIndex:   ownerIndex,
        assignedAt:   Date.now(),
        handingOff:   false,
        pendingOwner: null,
        lastPos:      null,
    };

    confirmOwnership(vehicleId, ownerIndex);

    console.log("[ownership] Vehicle " + vehicleId
        + " assigned to client " + ownerIndex);
}

// ---------------------------------------------------------
// INTERNAL: Send ownership confirmation to a client.
// ---------------------------------------------------------
function confirmOwnership(vehicleId, ownerIndex) {
    var clients = getClients();
    if (!clients[ownerIndex]) return;

    triggerNetworkEvent(
        CONFIG.EVENTS.ASSIGN_OWNERSHIP,
        clients[ownerIndex],
        { vehicleId: vehicleId }
    );
}

// ---------------------------------------------------------
// INTERNAL: Begin handoff with overlap window.
// Prevents the boat launch / physics explosion on entry.
// ---------------------------------------------------------
function beginHandoff(vehicleId, oldOwnerIndex, newOwnerIndex) {
    vehicleOwners[vehicleId].handingOff   = true;
    vehicleOwners[vehicleId].pendingOwner = newOwnerIndex;

    var clients = getClients();

    // Tell new owner to prepare.
    if (clients[newOwnerIndex]) {
        triggerNetworkEvent(
            CONFIG.EVENTS.ASSIGN_OWNERSHIP,
            clients[newOwnerIndex],
            { vehicleId: vehicleId, preparing: true }
        );
    }

    // Safety timeout — force complete if new owner never confirms.
    setTimeout(function() {
        var record = vehicleOwners[vehicleId];
        if (record && record.handingOff
            && record.pendingOwner === newOwnerIndex) {
            completeHandoff(vehicleId, newOwnerIndex);
        }
    }, CONFIG.OWNERSHIP_HANDOFF_TIMEOUT_MS);
}

// ---------------------------------------------------------
// INTERNAL: Complete handoff — new owner is now active.
// ---------------------------------------------------------
function completeHandoff(vehicleId, newOwnerIndex) {
    var record = vehicleOwners[vehicleId];
    if (!record) return;

    var oldOwnerIndex = record.ownerIndex;
    var clients       = getClients();

    // Tell old owner to stop sending after overlap window.
    if (clients[oldOwnerIndex]) {
        setTimeout(function() {
            triggerNetworkEvent(
                CONFIG.EVENTS.REVOKE_OWNERSHIP,
                clients[oldOwnerIndex],
                { vehicleId: vehicleId }
            );
        }, CONFIG.OWNERSHIP_OVERLAP_MS);
    }

    vehicleOwners[vehicleId].ownerIndex   = newOwnerIndex;
    vehicleOwners[vehicleId].handingOff   = false;
    vehicleOwners[vehicleId].pendingOwner = null;
    vehicleOwners[vehicleId].assignedAt   = Date.now();

    confirmOwnership(vehicleId, newOwnerIndex);

    console.log("[ownership] Vehicle " + vehicleId
        + " handed off: " + oldOwnerIndex + " → " + newOwnerIndex);
}

// ---------------------------------------------------------
// INTERNAL: Find nearest client to a position.
// Uses vec3.distance — native GTAC math, no manual sqrt needed.
// ---------------------------------------------------------
function findBestNewOwner(vehicleId, vehiclePos, excludeIndex) {
    var players      = getPlayers();
    var bestIndex    = null;
    var bestDistance = Infinity;

    for (var idx in players) {
        if (parseInt(idx) === excludeIndex) continue;

        var p = players[idx];
        if (!p || !p.lastSnapshot || !p.lastSnapshot.pos) continue;

        // Use native vec3.distance instead of manual sqrt
        var dist = vec3.distance(p.lastSnapshot.pos, vehiclePos);

        if (dist < bestDistance) {
            bestDistance = dist;
            bestIndex    = parseInt(idx);
        }
    }

    return bestIndex;
}

// ---------------------------------------------------------
// Expose for other server scripts.
// ---------------------------------------------------------
function getVehicleOwner(vehicleId) {
    return vehicleOwners[vehicleId] || null;
}

exportFunction("getVehicleOwner", getVehicleOwner);
exportFunction("onPlayerLeft",    onPlayerLeft);
