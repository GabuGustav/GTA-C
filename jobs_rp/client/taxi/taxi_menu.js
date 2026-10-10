"use strict";

var TaxiMenu = {
    window: null,
    visible: false
};

function buildTaxiMenu() {
    if (TaxiMenu.window) return;

    var ui = typeof mexui !== "undefined" ? mexui : null;
    if (!ui) {
        console.log("[TaxiMenu] UI framework not available");
        return;
    }

    TaxiMenu.window = ui.window(20, 20, 240, 280, "TaxiMenu", {
        main: {
            backgroundColour: toColour(0, 0, 0, 190),
            borderColour: toColour(255, 200, 0, 255),
            borderSize: 2,
        }
    });
    TaxiMenu.window.titleBarShown = false;
    TaxiMenu.window.shown = false;

    // Title
    TaxiMenu.window.text(10, 10, 220, 24, "TAXI MENU", {
        main: {
            textColour: toColour(255, 200, 0, 255),
            textSize: 14,
            textIndent: 0
        }
    });

    // Divider
    TaxiMenu.window.rectangle(10, 35, 220, 1, {
        main: {
            backgroundColour: toColour(255, 200, 0, 150)
        }
    });

    var btnStyle = {
        main: {
            backgroundColour: toColour(30, 30, 30, 220),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(80, 80, 80, 255),
            borderSize: 1,
        },
        hover: {
            backgroundColour: toColour(60, 60, 60, 240),
            textColour: toColour(255, 200, 0, 255),
            borderColour: toColour(255, 200, 0, 255),
        }
    };

    var btnW = 220;
    var btnH = 44;
    var btnX = 10;
    var gap = 8;
    var startY = 45;



    // 1. Drive to waypoint
TaxiMenu.window.button(btnX, startY, btnW, btnH, "Drive to Waypoint", btnStyle, function() {
    var waypointBlip = natives.getFirstBlipInfoId(7);
    if (!waypointBlip) {
        console.log("[TaxiMenu] No waypoint set");
        return;
    }

var dest = natives.getBlipCoords(waypointBlip);
if (!dest) {
    console.log("[TaxiMenu] Could not get waypoint coords");
    return;
}

    var roadResult = natives.getClosestRoad(dest, 1.0, 1);
    var driveTo = (roadResult && roadResult[0]) ? roadResult[1] : dest;

    var taxiState = JobsClient.Phone.taxiState;
    var driver = natives.getDriverOfCar(taxiState.activeTaxi);
    if (!driver) {
        console.log("[TaxiMenu] No driver found");
        return;
    }

    natives.taskCarMissionCoorsTargetNotAgainstTraffic(
        driver,
        taxiState.activeTaxi,
        driveTo,
        4,
        20.0,
        1,
        0,
        5
    );

    console.log("[TaxiMenu] Driving to waypoint");
    hideTaxiMenu();
});

    // 2. Preset locations (stubbed)
    TaxiMenu.window.button(btnX, startY + (btnH + gap), btnW, btnH, "Preset Locations (Coming Soon)", {
        main: {
            backgroundColour: toColour(20, 20, 20, 180),
            textColour: toColour(100, 100, 100, 255),
            borderColour: toColour(50, 50, 50, 255),
            borderSize: 1,
        }
    }, function() {
        console.log("[TaxiMenu] Preset locations not yet implemented");
    });

    // 3. Stop here
    TaxiMenu.window.button(btnX, startY + (btnH + gap) * 2, btnW, btnH, "Stop Here", btnStyle, function() {
        var taxiState = JobsClient.Phone.taxiState;
        var driver = natives.getDriverOfCar(taxiState.activeTaxi);
        if (!driver) return;

        natives.taskStandStill(driver, 99999);
        console.log("[TaxiMenu] Driver told to stop");
        hideTaxiMenu();
    });

    // 4. Speed - two buttons side by side
    var halfW = 105;
    TaxiMenu.window.button(btnX, startY + (btnH + gap) * 3, halfW, btnH, "Faster", btnStyle, function() {
        var taxiState = JobsClient.Phone.taxiState;
        var driver = natives.getDriverOfCar(taxiState.activeTaxi);
        if (!driver) return;

        natives.setDriveTaskCruiseSpeed(driver, 30.0);
        console.log("[TaxiMenu] Speed increased");
    });

    TaxiMenu.window.button(btnX + halfW + 10, startY + (btnH + gap) * 3, halfW, btnH, "Slower", btnStyle, function() {
        var taxiState = JobsClient.Phone.taxiState;
        var driver = natives.getDriverOfCar(taxiState.activeTaxi);
        if (!driver) return;

        natives.setDriveTaskCruiseSpeed(driver, 8.0);
        console.log("[TaxiMenu] Speed decreased");
    });

    // 5. Cancel taxi
    TaxiMenu.window.button(btnX, startY + (btnH + gap) * 4, btnW, btnH, "Cancel Taxi", {
        main: {
            backgroundColour: toColour(120, 20, 20, 220),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(180, 40, 40, 255),
            borderSize: 1,
        },
        hover: {
            backgroundColour: toColour(180, 30, 30, 240),
            textColour: toColour(255, 255, 255, 255),
            borderColour: toColour(255, 60, 60, 255),
        }
    }, function() {
        var taxiState = JobsClient.Phone.taxiState;

        // Remove driver
        var driver = natives.getDriverOfCar(taxiState.activeTaxi);
        if (driver) {
            natives.taskStandStill(driver, 1);
        }

        // Reset state
        taxiState.activeTaxi = null;
        taxiState.activeDriver = null;
        taxiState.status = "done";

        if (typeof TaxiHudAPI !== "undefined") {
            TaxiHudAPI.hide();
        }

        hideTaxiMenu();
        console.log("[TaxiMenu] Taxi cancelled");
    });

    console.log("[TaxiMenu] Built successfully");
}

function showTaxiMenu() {
    var taxiState = JobsClient &&
                    JobsClient.Phone &&
                    JobsClient.Phone.taxiState;

    if (!taxiState || taxiState.status !== "boarded") {
        console.log("[TaxiMenu] Not in taxi, cannot show menu");
        return;
    }

    buildTaxiMenu();
    if (TaxiMenu.window) {
        TaxiMenu.window.shown = true;
        TaxiMenu.visible = true;

        // Bring to top so it receives clicks
        if (TaxiMenu.window.setTop) {
            TaxiMenu.window.setTop();
        }
    }

var ui = typeof mexui !== "undefined" ? mexui : null;
setTimeout(function() {
    if (ui && ui.setInput) {
        ui.setInput(true);
        console.log("[TaxiMenu] Cursor enabled");
    }
}, 50);
}

function hideTaxiMenu() {
    if (TaxiMenu.window) {
        TaxiMenu.window.shown = false;
        TaxiMenu.visible = false;

        // Disable cursor if phone also not open
        if (!JobsClient.Phone.active) {
            var ui = typeof mexui !== "undefined" ? mexui : null;
            if (ui && ui.setInput) ui.setInput(false);
        }
    }
}

function toggleTaxiMenu() {
    if (TaxiMenu.visible) {
        hideTaxiMenu();
    } else {
        showTaxiMenu();
    }
}

// Bind Shift + N
if (typeof bindKey === "function") {
    try {
        if (typeof SDLK_n !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
            bindKey(SDLK_n, KEYSTATE_DOWN, function() {
                // Check shift is held
                if (typeof isKeyDown === "function" &&
                    typeof SDLK_LSHIFT !== "undefined" &&
                    isKeyDown(SDLK_LSHIFT)) {
                    toggleTaxiMenu();
                }
            });
        } else {
            bindKey("n", "down", function() {
                if (typeof isKeyDown === "function" && isKeyDown("lshift")) {
                    toggleTaxiMenu();
                }
            });
        }
        console.log("[TaxiMenu] Shift+N bound");
    } catch(e) {
        console.log("[TaxiMenu] Failed to bind Shift+N: " + String(e));
    }
}

// Expose API
var TaxiMenuAPI = {
    show: showTaxiMenu,
    hide: hideTaxiMenu,
    toggle: toggleTaxiMenu
};

console.log("[TaxiMenu] Loaded");