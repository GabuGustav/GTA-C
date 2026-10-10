// =============================================================
// sync_manager/diagnostics/diag_hud.js
// Live in-game overlay showing sync metrics per client.
// Runs every frame via OnProcess.
// Only renders when DEBUG_HUD is true in config.
// =============================================================

// HUD position — top left, out of the way
var HUD_X = 0.01;
var HUD_Y = 0.01;
var HUD_LINE_HEIGHT = 0.022;
var HUD_FONT   = 4;    // monospace-ish font
var HUD_SCALE  = 0.28;

// Colour codes
var COL_WHITE  = { r:255, g:255, b:255, a:255 };
var COL_GREEN  = { r:100, g:255, b:100, a:255 };
var COL_YELLOW = { r:255, g:220, b:50,  a:255 };
var COL_RED    = { r:255, g:80,  b:80,  a:255 };
var COL_CYAN   = { r:80,  g:220, b:255, a:255 };
var COL_GRAY   = { r:160, g:160, b:160, a:255 };

// Threshold colours for speed
function speedColour(speedKmh) {
    if (speedKmh < 20)  return COL_GREEN;
    if (speedKmh < 60)  return COL_YELLOW;
    return COL_RED;
}

// Threshold colours for ping
function pingColour(ping) {
    if (ping < 60)  return COL_GREEN;
    if (ping < 150) return COL_YELLOW;
    return COL_RED;
}

// Threshold colours for buffer depth
function bufferColour(depth) {
    if (depth >= CONFIG.INTERPOLATION_BUFFER_DEPTH) return COL_GREEN;
    if (depth >= 1) return COL_YELLOW;
    return COL_RED; // empty buffer = extrapolating
}

// ---------------------------------------------------------
// Draw a single line of text on the HUD.
// ---------------------------------------------------------
var _lineIndex = 0;

function hudLine(label, value, colour) {
    var y = HUD_Y + (_lineIndex * HUD_LINE_HEIGHT);
    var text = label + ": " + value;
    try {
        if (natives.setTextScale) {
            natives.setTextScale(HUD_SCALE, HUD_SCALE);
        }
        if (natives.setTextFont) {
            natives.setTextFont(HUD_FONT);
        }
        if (natives.setTextColour) {
            natives.setTextColour(colour.r, colour.g, colour.b, colour.a);
        }
        if (natives.setTextCentre) {
            natives.setTextCentre(false);
        }
        if (natives.setTextProportional) {
            natives.setTextProportional(true);
        }
    } catch (e) {
    }

    try {
        natives.displayTextWithLiteralString(new Vec2(HUD_X, y), "STRING", text);
    } catch (eVec2) {
        try {
            natives.displayTextWithLiteralString(HUD_X, y, "STRING", text);
        } catch (eNum) {
        }
    }
    _lineIndex++;
}

function hudSeparator() {
    hudLine("----------------", "", COL_GRAY);
}

// ---------------------------------------------------------
// Main HUD render — called from OnProcess every frame.
// Only renders when vehicle is involved or debug forced.
// ---------------------------------------------------------
function renderDiagHud() {
    if (!CONFIG.DEBUG_HUD) return;

    var player = localPlayer;
    if (!player) return;

    _lineIndex = 0;

    var pos     = player.position;
    var inVeh   = player.isInVehicle;
    var vehicle = inVeh ? player.vehicle : null;

    // --- LOCAL CLIENT ---
    hudLine("== LOCAL CLIENT ==", "", COL_CYAN);

    // Ping comes from server-synced client data, like v-scoreboard.
    var ping = -1;
    try {
        if (typeof localClient !== "undefined" && localClient && typeof localClient.getData === "function") {
            var cachedPing = localClient.getData("CustomSync.ping");
            if (typeof cachedPing !== "undefined" && cachedPing !== null) {
                ping = cachedPing;
            }
        }
    } catch (ePing) {
        ping = -1;
    }
    hudLine("Ping", ping + "ms", pingColour(ping));

    // State
    hudLine("State", player.isInVehicle
        ? "inVehicle" : "onFoot", COL_WHITE);

    if (vehicle) {
        // Speed via native (returns m/s, convert to km/h)
        var speedMs  = natives.getCarSpeed
            ? natives.getCarSpeed(vehicle)
            : 0;
        var speedKmh = (speedMs * 3.6).toFixed(1);
        hudLine("Speed", speedKmh + " km/h", speedColour(parseFloat(speedKmh)));

        // Gear
        var gear = natives.getVehicleGear
            ? natives.getVehicleGear(vehicle)
            : "?";
        hudLine("Gear", gear, COL_WHITE);

        // Engine revs (0.0-1.0 scale)
        var revs = natives.getVehicleEngineRevs
            ? natives.getVehicleEngineRevs(vehicle).toFixed(2)
            : "?";
        hudLine("Revs", revs, COL_WHITE);

        // Roll and pitch — physics stress indicators
        var roll = natives.getCarRoll
            ? natives.getCarRoll(vehicle).toFixed(1) + "°"
            : "?";
        var pitch = natives.getCarPitch
            ? natives.getCarPitch(vehicle).toFixed(1) + "°"
            : "?";
        hudLine("Roll/Pitch", roll + " / " + pitch, COL_WHITE);

        // Physics stability flags
        var onWheels  = natives.isVehicleOnAllWheels
            ? (natives.isVehicleOnAllWheels(vehicle) ? "YES" : "NO")
            : "?";
        var inAir     = natives.isCarInAirProper
            ? (natives.isCarInAirProper(vehicle) ? "YES" : "NO")
            : "?";
        hudLine("OnWheels", onWheels,
            onWheels === "YES" ? COL_GREEN : COL_RED);
        hudLine("InAir",    inAir,
            inAir === "NO" ? COL_GREEN : COL_YELLOW);

        // Vehicle mass — heavier needs higher correction factor
        var mass = natives.getCarMass
            ? natives.getCarMass(vehicle).toFixed(0)
            : "?";
        hudLine("Mass", mass + " kg", COL_GRAY);

        // Engine health
        var engHealth = natives.getEngineHealth
            ? natives.getEngineHealth(vehicle).toFixed(0)
            : "?";
        hudLine("EngHealth", engHealth, COL_WHITE);

        // Upright value (1.0 = fully upright, 0.0 = flipped)
        var upright = natives.getCarUprightValue
            ? natives.getCarUprightValue(vehicle).toFixed(2)
            : "?";
        hudLine("Upright", upright,
            parseFloat(upright) > 0.8 ? COL_GREEN : COL_RED);
    }

    // Position
    if (pos) {
        hudLine("Pos", pos.x.toFixed(1) + " "
            + pos.y.toFixed(1) + " "
            + pos.z.toFixed(1), COL_GRAY);
    }

    hudSeparator();

    // --- REMOTE CLIENTS ---
    hudLine("== REMOTE CLIENTS ==", "", COL_CYAN);

    var diagData = getRemoteDiagData(); // from diag_logger.js
    if (!diagData || Object.keys(diagData).length === 0) {
        hudLine("(none connected)", "", COL_GRAY);
        return;
    }

    for (var clientIdx in diagData) {
        var d = diagData[clientIdx];

        hudLine("-- Client " + clientIdx + " --", "", COL_WHITE);
        hudLine("Speed",    (d.speedKmh || 0).toFixed(1) + " km/h",
            speedColour(d.speedKmh || 0));
        hudLine("Buffer",   (d.bufferDepth || 0) + " snaps",
            bufferColour(d.bufferDepth || 0));
        hudLine("SnapAge",  (d.snapshotAge || 0) + "ms",
            (d.snapshotAge || 0) < 150 ? COL_GREEN : COL_RED);
        hudLine("Err",      (d.posErrorMag || 0).toFixed(2) + " u",
            (d.posErrorMag || 0) < 1.0 ? COL_GREEN :
            (d.posErrorMag || 0) < 5.0 ? COL_YELLOW : COL_RED);
        hudLine("Snapped",  d.didSnap ? "YES" : "no",
            d.didSnap ? COL_RED : COL_GREEN);
        hudLine("Extrap",   d.isExtrapolating ? "YES" : "no",
            d.isExtrapolating ? COL_YELLOW : COL_GREEN);
        hudLine("State",    d.state || "?", COL_WHITE);
    }
}

addEventHandler("OnProcess", function() {
    renderDiagHud();
});
