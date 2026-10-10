// =============================================================
// sync_manager/diagnostics/diag_logger.js
// Collects empirical sync data and writes a structured report.
//
// What we're measuring and WHY:
//
// SPEED vs ERROR MAGNITUDE
//   We don't know what CORRECTION_FACTOR should be.
//   By logging (speed → posError) pairs we build a map
//   of how bad desync gets at each speed range.
//   This replaces our guessed value with a data-driven one.
//
// BUFFER DEPTH OVER TIME
//   If buffer frequently hits 0 = extrapolating too much.
//   Means either: snapshot rate too low, or network too lossy.
//   Tells us whether 20/sec is actually enough.
//
// SNAP EVENTS
//   Every time we snap (teleport) instead of nudge,
//   the physics engine fights back.
//   Frequency of snaps tells us if SNAP_THRESHOLD is tuned right.
//
// OWNERSHIP HANDOFF TIMING
//   We have OWNERSHIP_HANDOFF_TIMEOUT_MS = 200ms.
//   Is that enough? Logging actual handoff duration tells us.
//
// PING vs ERROR CORRELATION
//   Does higher ping = worse posError?
//   Obvious in theory but quantifying it tells us whether
//   we need dynamic interpolation delay based on ping.
//
// VEHICLE MASS vs CORRECTION FACTOR
//   Heavier vehicles (truck vs moped) may need different
//   correction factors. Logging mass vs error reveals this.
//
// FRAME RATE
//   GTA IV physics is frame-dependent.
//   If client A runs at 30fps and client B at 60fps,
//   physics ticks differ. This could explain inconsistent
//   correction results we'd otherwise never find.
// =============================================================

// ---------------------------------------------------------
// Remote client diagnostic data — written by interpolator,
// read by HUD and logger.
//
// remoteDiag[clientIndex] = {
//     speedKmh:       float,
//     bufferDepth:    int,
//     snapshotAge:    ms since last snapshot received,
//     posErrorMag:    float — distance between target and actual,
//     didSnap:        bool — did we teleport this frame?,
//     isExtrapolating: bool — buffer empty, predicting?,
//     state:          string,
//     lastUpdate:     timestamp
// }
// ---------------------------------------------------------
var remoteDiag = {};

// ---------------------------------------------------------
// Local diagnostic sample — one entry every SAMPLE_RATE_MS.
// ---------------------------------------------------------
var localSamples = [];
var SAMPLE_RATE_MS = 500; // sample twice per second
var lastSampleTime = 0;

function getCachedPing() {
    try {
        if (typeof localClient !== "undefined" && localClient && typeof localClient.getData === "function") {
            var ping = localClient.getData("CustomSync.ping");
            if (typeof ping !== "undefined" && ping !== null) {
                return ping;
            }
        }
    } catch (e) {
    }
    return -1;
}

// Session log — events that happen at specific moments.
var sessionLog = [];

// ---------------------------------------------------------
// Called by interpolator.js every time it processes
// a remote client's buffer. This is how we get real numbers.
// ---------------------------------------------------------
function reportRemoteDiag(clientIndex, data) {
    remoteDiag[clientIndex] = {
        speedKmh:        data.speedKmh       || 0,
        bufferDepth:     data.bufferDepth     || 0,
        snapshotAge:     data.snapshotAge     || 0,
        posErrorMag:     data.posErrorMag     || 0,
        didSnap:         data.didSnap         || false,
        isExtrapolating: data.isExtrapolating || false,
        state:           data.state           || "unknown",
        vehicleMass:     data.vehicleMass     || 0,
        lastUpdate:      Date.now(),
    };

    // Log snap events immediately — they're important
    if (data.didSnap) {
        logEvent("SNAP", {
            clientIndex:  clientIndex,
            speed:        data.speedKmh,
            errorMag:     data.posErrorMag,
            vehicleMass:  data.vehicleMass,
            state:        data.state,
        });
    }

    // Log extrapolation start
    if (data.isExtrapolating && !(remoteDiag[clientIndex] && remoteDiag[clientIndex].wasExtrapolating)) {
        logEvent("EXTRAP_START", {
            clientIndex: clientIndex,
            bufferDepth: data.bufferDepth,
            snapshotAge: data.snapshotAge,
        });
    }
    if (remoteDiag[clientIndex]) {
        remoteDiag[clientIndex].wasExtrapolating = data.isExtrapolating;
    }
}

// ---------------------------------------------------------
// Called by ownership.js when handoff begins/ends.
// ---------------------------------------------------------
function reportHandoff(event, vehicleId, fromIdx, toIdx, durationMs) {
    logEvent("OWNERSHIP_" + event, {
        vehicleId:   vehicleId,
        from:        fromIdx,
        to:          toIdx,
        durationMs:  durationMs || null,
    });
}

// ---------------------------------------------------------
// Log a session event with timestamp.
// ---------------------------------------------------------
function logEvent(type, data) {
    sessionLog.push({
        t:    Date.now(),
        type: type,
        data: data,
    });
}

// ---------------------------------------------------------
// Collect local sample every SAMPLE_RATE_MS.
// Called from OnProcess via throttle check.
// ---------------------------------------------------------
function collectLocalSample() {
    var now = Date.now();
    if (now - lastSampleTime < SAMPLE_RATE_MS) return;
    lastSampleTime = now;

    var player  = localPlayer;
    if (!player) return;

    var inVeh   = player.isInVehicle;
    var vehicle = inVeh ? player.vehicle : null;

    var sample = {
        t:        now,
        state:    inVeh ? "inVehicle" : "onFoot",
        ping:     getCachedPing(),
        fps:      getFPS(),
    };

    if (vehicle) {
        sample.speedKmh    = natives.getCarSpeed
            ? (natives.getCarSpeed(vehicle) * 3.6)
            : 0;
        sample.gear        = natives.getVehicleGear
            ? natives.getVehicleGear(vehicle)
            : -1;
        sample.revs        = natives.getVehicleEngineRevs
            ? natives.getVehicleEngineRevs(vehicle)
            : -1;
        sample.roll        = natives.getCarRoll
            ? natives.getCarRoll(vehicle)
            : 0;
        sample.pitch       = natives.getCarPitch
            ? natives.getCarPitch(vehicle)
            : 0;
        sample.uprightVal  = natives.getCarUprightValue
            ? natives.getCarUprightValue(vehicle)
            : 1;
        sample.onWheels    = natives.isVehicleOnAllWheels
            ? natives.isVehicleOnAllWheels(vehicle)
            : true;
        sample.inAir       = natives.isCarInAirProper
            ? natives.isCarInAirProper(vehicle)
            : false;
        sample.mass        = natives.getCarMass
            ? natives.getCarMass(vehicle)
            : 0;
        sample.engineHealth = natives.getEngineHealth
            ? natives.getEngineHealth(vehicle)
            : 1000;

        // Attach remote diag at this moment for correlation
        sample.remoteDiag = JSON.parse(JSON.stringify(remoteDiag));
    } else {
        sample.speedKmh = 0;
        sample.remoteDiag = {};
    }

    localSamples.push(sample);
}

// ---------------------------------------------------------
// FPS estimation — delta between frames.
// ---------------------------------------------------------
var _lastFrameTime = Date.now();
var _currentFPS    = 60;

function updateFPS() {
    var now   = Date.now();
    var delta = now - _lastFrameTime;
    _lastFrameTime = now;
    if (delta > 0) {
        _currentFPS = Math.round(1000 / delta);
    }
}

function getFPS() {
    return _currentFPS;
}

// ---------------------------------------------------------
// Write the full diagnostic report to file.
// Called manually via a key press (F7) or on resource stop.
// ---------------------------------------------------------
function writeReport() {
    var report = {
        meta: {
            generatedAt:    new Date().toISOString(),
            sessionDuration: Date.now() - _sessionStart,
            totalSamples:    localSamples.length,
            totalEvents:     sessionLog.length,
            configSnapshot:  {
                SNAPSHOT_RATE_MS:          CONFIG.SNAPSHOT_RATE_MS,
                INTERPOLATION_BUFFER_DEPTH: CONFIG.INTERPOLATION_BUFFER_DEPTH,
                INTERPOLATION_DELAY_MS:    CONFIG.INTERPOLATION_DELAY_MS,
                EXTRAPOLATION_CAP_MS:      CONFIG.EXTRAPOLATION_CAP_MS,
                VEHICLE_CORRECTION_FACTOR: CONFIG.VEHICLE_CORRECTION_FACTOR,
                VEHICLE_SNAP_THRESHOLD:    CONFIG.VEHICLE_SNAP_THRESHOLD,
            },
        },

        // Summary statistics — computed from raw samples
        summary: computeSummary(),

        // Raw time-series samples
        samples: localSamples,

        // Discrete events (snaps, handoffs, extrapolation)
        events: sessionLog,
    };

    var json = JSON.stringify(report, null, 2);
    saveTextFile("diagnostics/report_" + Date.now() + ".json", json);

    console.log("[diag] Report written. Samples: " + localSamples.length
        + " Events: " + sessionLog.length);

    // Reset for next session
    localSamples = [];
    sessionLog   = [];
    _sessionStart = Date.now();
}

// ---------------------------------------------------------
// Compute summary statistics from raw samples.
// This is what tells us which values to tune.
// ---------------------------------------------------------
function computeSummary() {
    if (localSamples.length === 0) return {};

    // Speed buckets — how does error behave at each speed range?
    var speedBuckets = {
        "0-20":   { samples: 0, totalError: 0, snaps: 0 },
        "20-60":  { samples: 0, totalError: 0, snaps: 0 },
        "60-100": { samples: 0, totalError: 0, snaps: 0 },
        "100+":   { samples: 0, totalError: 0, snaps: 0 },
    };

    var totalPing    = 0;
    var pingSamples  = 0;
    var totalFPS     = 0;
    var fpsSamples   = 0;
    var snapCount    = 0;
    var extrapCount  = 0;

    for (var i = 0; i < localSamples.length; i++) {
        var s   = localSamples[i];
        var spd = s.speedKmh || 0;

        // FPS
        if (s.fps > 0) {
            totalFPS += s.fps;
            fpsSamples++;
        }

        // Ping
        if (s.ping > 0) {
            totalPing += s.ping;
            pingSamples++;
        }

        // Remote client errors at this speed
        for (var idx in s.remoteDiag) {
            var rd  = s.remoteDiag[idx];
            var err = rd.posErrorMag || 0;

            var bucket;
            if      (spd < 20)  bucket = "0-20";
            else if (spd < 60)  bucket = "20-60";
            else if (spd < 100) bucket = "60-100";
            else                bucket = "100+";

            speedBuckets[bucket].samples++;
            speedBuckets[bucket].totalError += err;
            if (rd.didSnap) {
                speedBuckets[bucket].snaps++;
                snapCount++;
            }
            if (rd.isExtrapolating) extrapCount++;
        }
    }

    // Compute averages per bucket
    var bucketSummary = {};
    for (var b in speedBuckets) {
        var bk = speedBuckets[b];
        bucketSummary[b] = {
            samples:    bk.samples,
            avgError:   bk.samples > 0
                ? (bk.totalError / bk.samples).toFixed(3)
                : 0,
            snapCount:  bk.snaps,
            snapRate:   bk.samples > 0
                ? ((bk.snaps / bk.samples) * 100).toFixed(1) + "%"
                : "0%",
        };
    }

    return {
        avgPingMs:       pingSamples > 0
            ? (totalPing / pingSamples).toFixed(1)
            : "N/A",
        avgFPS:          fpsSamples > 0
            ? (totalFPS / fpsSamples).toFixed(1)
            : "N/A",
        totalSnaps:      snapCount,
        totalExtrap:     extrapCount,
        errorBySpeed:    bucketSummary,

        // Ownership events summary
        handoffs:        sessionLog.filter(function(e) {
            return e.type === "OWNERSHIP_COMPLETE";
        }).length,
        conflicts:       sessionLog.filter(function(e) {
            return e.type === "OWNERSHIP_CONFLICT";
        }).length,

        // Recommendation hints — what the data suggests
        hints: computeHints(bucketSummary),
    };
}

// ---------------------------------------------------------
// Generate tuning hints from the summary data.
// These are data-driven suggestions, not guesses.
// ---------------------------------------------------------
function computeHints(bucketSummary) {
    var hints = [];

    // Check if high speed error is significantly worse
    var lowErr  = parseFloat(bucketSummary["0-20"].avgError)  || 0;
    var highErr = parseFloat(bucketSummary["100+"].avgError)  || 0;

    if (highErr > lowErr * 3) {
        hints.push(
            "High speed error is " + (highErr / Math.max(lowErr, 0.001)).toFixed(1)
            + "x worse than low speed. "
            + "Consider increasing VEHICLE_CORRECTION_FACTOR "
            + "or implementing speed-scaled correction."
        );
    }

    if (parseFloat(bucketSummary["100+"].snapRate) > 20) {
        hints.push(
            "Snap rate above 100km/h is "
            + bucketSummary["100+"].snapRate
            + ". VEHICLE_SNAP_THRESHOLD may be too low for this speed."
        );
    }

    if (parseFloat(bucketSummary["0-20"].snapRate) > 5) {
        hints.push(
            "Snapping even at low speeds ("
            + bucketSummary["0-20"].snapRate
            + " snap rate). VEHICLE_SNAP_THRESHOLD may be too aggressive."
        );
    }

    return hints;
}

// ---------------------------------------------------------
// Expose remote diag data for HUD
// ---------------------------------------------------------
function getRemoteDiagData() {
    return remoteDiag;
}

// ---------------------------------------------------------
// Key binding — F7 writes report manually during a session.
// ---------------------------------------------------------
addEventHandler("OnKeyDown", function(key) {
    if (key === 0x76) { // F7
        writeReport();
        // Show notification
        natives.printStringWithLiteralString
            ? natives.printStringWithLiteralString("~g~Diag report saved!", 2500)
            : console.log("[diag] Report saved.");
    }
});

// Write report on resource stop too
addEventHandler("OnResourceStop", function() {
    if (localSamples.length > 0) {
        writeReport();
    }
});

var _sessionStart = Date.now();

// ---------------------------------------------------------
// OnProcess — collect samples and update FPS every frame.
// ---------------------------------------------------------
addEventHandler("OnProcess", function() {
    updateFPS();
    collectLocalSample();
});

exportFunction("reportRemoteDiag", reportRemoteDiag);
exportFunction("reportHandoff",    reportHandoff);
exportFunction("getRemoteDiagData", getRemoteDiagData);
