// Client-side F1 vehicle spawner
addEventHandler("OnResourceStart", (event, resource) => {
    if (resource === thisResource) {
        console.log("F1 client script loaded");
    }
});

// Function to display on-screen message (from mexui)
function showMessage(text) {
    try {
        natives.printStringWithLiteralStringNow('STRING', text, 3000, true);
    } catch (e) {
        console.log("Message display error:", e.message);
    }
}

addCommandHandler("spawnf1", function(command, params) {
    // Client-side: use localPlayer instead of client.player
    if (!localPlayer) {
        showMessage("Local player not available", 255, 100, 100);
        return;
    }

    let pos = localPlayer.position;
    
    // We spawn the Emperor ID, but the 'replace' tag above turns it into an F1
    let veh = natives.createCar(-685276541, new Vec3(pos.x + 3, pos.y, pos.z), true);

    if (veh) {
        natives.warpCharIntoCar(localPlayer, veh);
        showMessage("F1 Streamed Successfully!", 200, 255, 200);
    } else {
        showMessage("F1 spawn failed", 255, 100, 100);
    }
});
