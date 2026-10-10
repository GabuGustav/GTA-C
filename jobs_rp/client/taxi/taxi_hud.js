"use strict";

// Taxi HUD - separate from phone UI
// Shows taxi status top-left when a taxi is active
// Reads from Phone.taxiState which is set by phone.js

var TaxiHud = {
    window: null,
    statusText: null,
    distanceText: null,
    updateInterval: null
};

function buildTaxiHud() {
    if (TaxiHud.window) return;

    var ui = typeof mexui !== "undefined" ? mexui : null;
    if (!ui) {
        console.log("[TaxiHud] UI framework not available");
        return;
    }

    TaxiHud.window = ui.window(20, 20, 220, 85, "TaxiHUD", {
        main: {
            backgroundColour: toColour(0, 0, 0, 180),
            borderColour: toColour(255, 200, 0, 255),
            borderSize: 2,
        }
    });
    TaxiHud.window.titleBarShown = false;
    TaxiHud.window.shown = false;

    TaxiHud.statusText = TaxiHud.window.text(10, 10, 200, 24, "Taxi On The Way", {
        main: {
            textColour: toColour(255, 200, 0, 255),
            textSize: 14,
            textIndent: 0
        }
    });

    TaxiHud.distanceText = TaxiHud.window.text(10, 40, 200, 24, "Distance: --", {
        main: {
            textColour: toColour(255, 255, 255, 255),
            textSize: 12,
            textIndent: 0
        }
    });

    console.log("[TaxiHud] Built successfully");
}

function showTaxiHud() {
    buildTaxiHud();
    if (!TaxiHud.window) return;

    TaxiHud.window.shown = true;

    if (TaxiHud.updateInterval) {
        clearInterval(TaxiHud.updateInterval);
    }

    TaxiHud.updateInterval = setInterval(function() {
        // Read state from phone.js via shared JobsClient.Phone object
        var taxiState = typeof JobsClient !== "undefined" &&
                        JobsClient.Phone &&
                        JobsClient.Phone.taxiState;

        if (!taxiState || !taxiState.activeTaxi) {
            return;
        }

        var taxiPos = natives.getCarCoordinates(taxiState.activeTaxi);
        if (!taxiPos) return;

        var playerPos = localPlayer.position;
        var dx = taxiPos.x - playerPos.x;
        var dy = taxiPos.y - playerPos.y;
        var dist = Math.floor(Math.sqrt(dx * dx + dy * dy));

        if (taxiState.status === "dispatched") {
            TaxiHud.statusText.text = "Taxi On The Way";
            TaxiHud.distanceText.text = "Distance: " + dist + "m";
        } else if (taxiState.status === "arriving") {
            TaxiHud.statusText.text = "Taxi Arrived!";
            TaxiHud.distanceText.text = "Enter the taxi";
        } else if (taxiState.status === "boarded") {
            hideTaxiHud();
        } else if (taxiState.status === "done") {
            hideTaxiHud();
        }
    }, 500);
}

function hideTaxiHud() {
    if (TaxiHud.updateInterval) {
        clearInterval(TaxiHud.updateInterval);
        TaxiHud.updateInterval = null;
    }
    if (TaxiHud.window) {
        TaxiHud.window.shown = false;
    }
}

// Listen for taxi spawn event to show HUD
if (typeof addNetworkHandler === "function") {
    addNetworkHandler("taxi.hudShow", function() {
        console.log("[TaxiHud] Showing HUD");
        showTaxiHud();
    });
}

console.log("[TaxiHud] Loaded");

// Expose for phone.js to call
var TaxiHudAPI = {
    show: showTaxiHud,
    hide: hideTaxiHud
};