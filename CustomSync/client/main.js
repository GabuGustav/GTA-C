// =============================================================
// sync_manager/client/main.js
// Entry point for all client-side sync logic.
// Starts loops and hooks render/process events.
// =============================================================

// ---------------------------------------------------------
// Resource ready — start everything.
// ---------------------------------------------------------
addEventHandler("OnResourceStart", function() {
    console.log("[sync_manager] Client starting...");

    // Start snapshot sender loop (snapshot.js)
    startSnapshotLoop();

    // Start traffic loop (traffic.js)
    startTrafficLoop();

    console.log("[sync_manager] Client ready.");
});

// ---------------------------------------------------------
// OnProcess fires every game frame.
// This is our interpolation tick — must run every frame
// for smooth movement, not on a timer.
// ---------------------------------------------------------
addEventHandler("OnProcess", function() {
    processInterpolation(); // interpolator.js
});

// ---------------------------------------------------------
// Clean up when resource stops.
// ---------------------------------------------------------
addEventHandler("OnResourceStop", function() {
    console.log("[sync_manager] Client stopped.");
});
