// =============================================================
// sync_manager/shared/config.js
// Shared between server and client.
// All tunable sync parameters live here.
// Change a value here and it affects the entire system.
// =============================================================

var CONFIG = {

    // ---------------------------------------------------------
    // SNAPSHOT
    // How often the owning client sends state updates.
    // 50ms = 20 snapshots per second.
    // Lower = smoother but more bandwidth.
    // Higher = less bandwidth but more jitter.
    // ---------------------------------------------------------
    SNAPSHOT_RATE_MS: 50,

    // ---------------------------------------------------------
    // INTERPOLATION
    // How many snapshots we buffer before we start playing them back.
    // 2-3 is the sweet spot:
    //   Too low  → jitter when a packet is late
    //   Too high → movement feels delayed/laggy
    // ---------------------------------------------------------
    INTERPOLATION_BUFFER_DEPTH: 3,

    // How far back in time we render remote entities.
    // This is SNAPSHOT_RATE_MS * INTERPOLATION_BUFFER_DEPTH.
    // Calculated here so nothing has to compute it at runtime.
    INTERPOLATION_DELAY_MS: 150, // 50 * 3

    // ---------------------------------------------------------
    // EXTRAPOLATION (Dead Reckoning)
    // When the buffer runs dry (packet loss, lag spike),
    // we predict forward using last known velocity.
    // We stop predicting after this many ms to avoid
    // entities drifting too far from reality.
    // ---------------------------------------------------------
    EXTRAPOLATION_CAP_MS: 500,

    // ---------------------------------------------------------
    // INTEREST MANAGEMENT
    // Only players within this radius (in GTA units, approx metres)
    // receive another player's snapshot updates.
    // Keeps bandwidth under control on larger servers.
    // ---------------------------------------------------------
    INTEREST_RADIUS: 150,

    // Radius within which we track and sync AI traffic.
    // Smaller than player radius because traffic is higher volume.
    TRAFFIC_INTEREST_RADIUS: 80,

    // ---------------------------------------------------------
    // OWNERSHIP
    // Max time we wait for a new owner to confirm they have
    // taken control before we force-assign ownership.
    // Prevents the sliding/oscillation bug during handoff.
    // ---------------------------------------------------------
    OWNERSHIP_HANDOFF_TIMEOUT_MS: 200,

    // During a handoff, the old owner keeps sending for this
    // long to cover the gap. Prevents the boat-launch bug.
    OWNERSHIP_OVERLAP_MS: 100,

    // ---------------------------------------------------------
    // TRAFFIC (AI Vehicles)
    // Max number of AI vehicles one client can own at once.
    // Prevents one client from being overloaded with
    // broadcasting duties for too many vehicles.
    // ---------------------------------------------------------
    MAX_TRAFFIC_OWNED: 10,

    // How often traffic snapshots are sent.
    // Slightly slower than player snapshots — traffic is
    // less critical and higher volume.
    TRAFFIC_SNAPSHOT_RATE_MS: 100, // 10 per second

    // ---------------------------------------------------------
    // VALIDATION
    // Server-side sanity checks on incoming snapshots.
    // If a player moves faster than this (GTA units/sec),
    // the snapshot is flagged as suspicious.
    // Normal sprint ~5, vehicle ~50, rocket ~80
    // We set high to not false-positive on vehicles.
    // ---------------------------------------------------------
    MAX_SPEED_THRESHOLD: 120,

    // Max health value in GTA IV (1000 = full health ped)
    MAX_HEALTH: 1000,

    // Max armour value
    MAX_ARMOUR: 100,

    // ---------------------------------------------------------
    // VEHICLE CORRECTION
    // Controls how the receiver corrects vehicle position
    // without triggering physics explosions.
    //
    // CORRECTION_FACTOR: how aggressively we nudge velocity
    // toward the correct position each frame.
    //   Too high → jitter/oscillation
    //   Too low  → vehicle drifts from true position
    //   Start at 5.0 and tune based on testing.
    // ---------------------------------------------------------
    VEHICLE_CORRECTION_FACTOR: 5.0,

    // If positional error exceeds this (GTA units), snap
    // directly instead of nudging. Handles teleports/spawns.
    VEHICLE_SNAP_THRESHOLD: 10.0,

    // If heading error exceeds this (degrees), snap heading
    // directly instead of waiting for turnVelocity to fix it.
    VEHICLE_HEADING_SNAP_THRESHOLD: 45.0,

    // ---------------------------------------------------------
    // NETWORK EVENT NAMES
    // Centralised here so a typo in one file doesn't cause
    // a silent failure because the event name doesn't match.
    // ---------------------------------------------------------
    EVENTS: {
        // Client → Server
        PLAYER_SNAPSHOT:      "sm_playerSnapshot",
        TRAFFIC_SNAPSHOT:     "sm_trafficSnapshot",
        VEHICLE_SNAPSHOT:     "sm_vehicleSnapshot",
        REQUEST_OWNERSHIP:    "sm_requestOwnership",
        RELEASE_OWNERSHIP:    "sm_releaseOwnership",

        // Server → Client
        RELAY_PLAYER:         "sm_relayPlayer",
        RELAY_TRAFFIC:        "sm_relayTraffic",
        RELAY_VEHICLE:        "sm_relayVehicle",
        ASSIGN_OWNERSHIP:     "sm_assignOwnership",
        REVOKE_OWNERSHIP:     "sm_revokeOwnership",
        OWNERSHIP_CONFLICT:   "sm_ownershipConflict",
    },

    // ---------------------------------------------------------
    // ENTITY STATES
    // Possible states a player entity can be in.
    // Used in snapshots so the receiver knows how to
    // interpret the data.
    // ---------------------------------------------------------
    STATES: {
        ON_FOOT:    "onFoot",
        IN_VEHICLE: "inVehicle",
        DEAD:       "dead",
        ENTERING:   "entering",   // mid-animation getting into vehicle
        EXITING:    "exiting",    // mid-animation getting out of vehicle
    },

    // ---------------------------------------------------------
    // DIAGNOSTICS
    // Set DEBUG_HUD to true to show live sync overlay in-game.
    // Press F7 to write a full diagnostic report to file.
    // Set to false in production.
    // ---------------------------------------------------------
    DEBUG_HUD: true,

};

// Freeze the config so nothing accidentally mutates it at runtime.
// If JS environment supports Object.freeze — use it.
if (typeof Object.freeze === "function") {
    Object.freeze(CONFIG.EVENTS);
    Object.freeze(CONFIG.STATES);
    Object.freeze(CONFIG);
}
