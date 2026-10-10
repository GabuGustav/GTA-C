// =============================================================
// sync_manager/client/interpolator.js
// Smooth movement between received snapshots.
// Reports real-time diagnostic data to diag_logger.js.
// Health/armour now applied via natives (not readonly props).
// =============================================================

var buffers = {};

// Frame delta time — used to make vehicle correction gain
// frame-rate independent instead of a flat per-frame add.
var _lastProcessTime = Date.now();

addNetworkHandler(CONFIG.EVENTS.RELAY_PLAYER, function (snapshot) {
  pushToBuffer(snapshot.senderIndex, snapshot);
});

addNetworkHandler(CONFIG.EVENTS.RELAY_VEHICLE, function (snapshot) {
  pushToBuffer("v_" + snapshot.vehicleId, snapshot);
});

function pushToBuffer(entityId, snapshot) {
  if (!buffers[entityId]) {
    buffers[entityId] = {
      snapshots: [],
      lastPlayed: 0,
      // Shared with extrapolator.js (same global scope).
      // True right after a hard snap, cleared once error
      // drops below VEHICLE_CORRECTION_RESUME_THRESHOLD.
      // This is what stops interpolation and extrapolation
      // from independently re-triggering snaps against
      // each other every time the buffer underruns for
      // a single frame.
      vehicleSnapped: false,
    };
  }

  var buf = buffers[entityId];
  if (snapshot.t <= buf.lastPlayed) return;

  buf.snapshots.push(snapshot);
  buf.snapshots.sort(function (a, b) {
    return a.t - b.t;
  });

  if (buf.snapshots.length > 10) {
    buf.snapshots.splice(0, buf.snapshots.length - 10);
  }
}

function processInterpolation() {
  var now = Date.now();
  var dt = (now - _lastProcessTime) / 1000;
  _lastProcessTime = now;

  // Clamp dt — guards against huge jumps after a hitch/loading
  // stall producing a single massive correction.
  dt = Math.max(0, Math.min(dt, 0.1));

  var renderTime = now - CONFIG.INTERPOLATION_DELAY_MS;

  for (var entityId in buffers) {
    interpolateEntity(entityId, renderTime, dt);
  }
}

function interpolateEntity(entityId, renderTime, dt) {
  var buf = buffers[entityId];
  if (!buf || buf.snapshots.length === 0) return;

  // Snapshot age — how long since we last received data
  var latest = buf.snapshots[buf.snapshots.length - 1];
  var snapshotAge = Date.now() - latest.t;
  var bufferDepth = buf.snapshots.length;

  var snapA = null;
  var snapB = null;

  for (var i = 0; i < buf.snapshots.length - 1; i++) {
    if (
      buf.snapshots[i].t <= renderTime &&
      buf.snapshots[i + 1].t >= renderTime
    ) {
      snapA = buf.snapshots[i];
      snapB = buf.snapshots[i + 1];
      break;
    }
  }

  if (!snapA || !snapB) {
    if (latest && renderTime > latest.t) {
      extrapolateEntity(entityId, latest, renderTime, dt);
      // Report extrapolation to logger
      if (typeof reportRemoteDiag === "function") {
        reportRemoteDiag(entityId, {
          bufferDepth: bufferDepth,
          snapshotAge: snapshotAge,
          isExtrapolating: true,
          posErrorMag: 0,
          didSnap: false,
          state: latest.state || "unknown",
          speedKmh: 0,
        });
      }
    }
    return;
  }

  var span = snapB.t - snapA.t;
  var t = span > 0 ? (renderTime - snapA.t) / span : 0;
  t = Math.max(0, Math.min(1, t));

  var pos = vec3.interpolate(snapA.pos, snapB.pos, t);
  var heading = lerpAngle(snapA.heading, snapB.heading, t);

  var isVehicle = typeof entityId === "string" && entityId.indexOf("v_") === 0;

  var diagData = {
    bufferDepth: bufferDepth,
    snapshotAge: snapshotAge,
    isExtrapolating: false,
    state: snapB.state || "unknown",
    speedKmh: 0,
    posErrorMag: 0,
    didSnap: false,
    vehicleMass: 0,
  };

  if (isVehicle) {
    applyToVehicle(entityId, pos, heading, snapA, snapB, t, diagData, dt);
  } else {
    applyToPed(entityId, pos, heading, snapB, diagData);
  }

  // Report to logger
  if (typeof reportRemoteDiag === "function") {
    reportRemoteDiag(entityId, diagData);
  }

  buf.lastPlayed = renderTime;
  while (buf.snapshots.length > 1 && buf.snapshots[1].t <= renderTime) {
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
  element.heading = heading;

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
function applyToVehicle(
  entityId,
  targetPos,
  targetHeading,
  snapA,
  snapB,
  t,
  diagData,
  dt,
) {
  var vehicleId = entityId.substring(2);
  var vehicle = getElementFromId(vehicleId);
  if (!vehicle) return;

  var currentPos = vehicle.position;
  if (!currentPos) return;

  var buf = buffers[entityId];

  // Interpolate velocity and turnVelocity
  var targetVel = vec3.interpolate(snapA.vel, snapB.vel, t);
  var targetTV = vec3.interpolate(
    snapA.turnVelocity || { x: 0, y: 0, z: 0 },
    snapB.turnVelocity || { x: 0, y: 0, z: 0 },
    t,
  );

  // Measure real position error
  var errorX = targetPos.x - currentPos.x;
  var errorY = targetPos.y - currentPos.y;
  var errorZ = targetPos.z - currentPos.z;
  var errorMag = Math.sqrt(errorX * errorX + errorY * errorY + errorZ * errorZ);

  // Real speed via native
  var speedMs = natives.getCarSpeed ? natives.getCarSpeed(vehicle) : 0;
  var speedKmh = speedMs * 3.6;

  // Vehicle mass for correlation
  var mass = natives.getCarMass ? natives.getCarMass(vehicle) : 0;

  // Fill diag data with real measurements
  diagData.posErrorMag = errorMag;
  diagData.speedKmh = speedKmh;
  diagData.vehicleMass = mass;
  diagData.state = snapB.state || "inVehicle";

  // Hysteresis: once we've hard-snapped, stay in "just snapped"
  // mode until error falls well below the snap threshold — not
  // just under it. Without this, error hovering right at the
  // threshold flips between snap and nudge every single frame,
  // which looks exactly like "jumps, then jitters back and forth".
  //
  // Both thresholds scale with current speed — the true distance
  // between two snapshots naturally grows at speed (boost, nitro),
  // so a flat threshold misreads fast-but-correct movement as
  // desync and snaps constantly.
  var effectiveSnapThreshold = Math.min(
    CONFIG.VEHICLE_SNAP_THRESHOLD +
      speedKmh * CONFIG.VEHICLE_SNAP_THRESHOLD_PER_KMH,
    CONFIG.VEHICLE_SNAP_THRESHOLD_MAX,
  );
  var effectiveResumeThreshold =
    effectiveSnapThreshold * CONFIG.VEHICLE_CORRECTION_RESUME_RATIO;

  var wasSnapped = buf ? buf.vehicleSnapped : false;

  if (
    errorMag > effectiveSnapThreshold ||
    (wasSnapped && errorMag > effectiveResumeThreshold)
  ) {
    vehicle.position = targetPos;
    vehicle.heading = targetHeading;
    vehicle.velocity = targetVel;
    vehicle.turnVelocity = targetTV;
    diagData.didSnap = true;
    if (buf) buf.vehicleSnapped = true;
    return;
  }

  if (buf) buf.vehicleSnapped = false;
  diagData.didSnap = false;

  if (errorMag < CONFIG.VEHICLE_POSITION_DEADZONE) {
    // Close enough — stop injecting correction velocity and
    // let native physics (suspension, friction, ground
    // contact) own the vehicle. This is the actual fix for
    // the standing-still jitter: a P-only correction that
    // never stops correcting is reading its own output (the
    // engine's tiny per-tick settling movement) as new error
    // and re-correcting against it forever, with no damping.
    vehicle.velocity = targetVel;
    vehicle.turnVelocity = targetTV;
  } else {
    // Velocity-driven correction, now scaled by dt so the
    // effective correction strength doesn't change with
    // framerate (previously a flat "error * 5.0" was set
    // every render frame regardless of how much time that
    // frame actually covered).
    var factor = CONFIG.VEHICLE_CORRECTION_FACTOR;
    vehicle.velocity = {
      x: targetVel.x + errorX * factor * dt,
      y: targetVel.y + errorY * factor * dt,
      z: targetVel.z + errorZ * factor * dt,
    };
    vehicle.turnVelocity = targetTV;
  }

  // Heading correction
  var headingError = targetHeading - vehicle.heading;
  while (headingError > 180) headingError -= 360;
  while (headingError < -180) headingError += 360;

  if (Math.abs(headingError) > CONFIG.VEHICLE_HEADING_SNAP_THRESHOLD) {
    vehicle.heading = targetHeading;
  }
}

function resolveElement(entityId, snap) {
  if (typeof entityId === "string" && entityId.indexOf("v_") === 0) {
    return getElementFromId(entityId.substring(2));
  }
  var clients = getClients();
  var clientIndex = parseInt(entityId);
  if (clients[clientIndex]) return clients[clientIndex].player;
  return null;
}

function clearBuffer(entityId) {
  delete buffers[entityId];
}

function lerpAngle(a, b, t) {
  var diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  var result = a + diff * t;
  while (result < 0) result += 360;
  while (result >= 360) result -= 360;
  return result;
}
