// Server-side doesn't use the "gta." prefix for these functions
addCommandHandler("spawnf1", function(command, params, client) {
    
    // Player needs to be spawned first
    let player = client.player;
    
    if (!player) {
        message("Spawning you first...", COLOUR_YELLOW);
        
        // Spawn player at default location
        spawnPlayer(client, [-800, 1000, 20]);
        
        // Wait for spawn to complete, then spawn vehicle
        setTimeout(() => {
            try {
                let spawnedPlayer = client.player;
                if (spawnedPlayer && spawnedPlayer.position) {
                    let pos = spawnedPlayer.position;
                    console.log("Player position:", pos);
                    console.log("Spawn coords:", pos.x + 3, pos.y, pos.z);
                    let veh = gta.createVehicle(0x12345678, new Vec3(pos.x + 3, pos.y, pos.z));
                    console.log("Vehicle created:", veh);
                    if (veh) {
                        // Set vehicle color to avoid randomization error
                        try {
                            gta.setVehicleColour(veh, 1, 1); // Use primary/secondary color 1
                        } catch (e) {
                            console.log("Color set error:", e.message);
                        }
                        message("F1 spawned successfully!", COLOUR_WHITE);
                    } else {
                        message("Failed to spawn F1. Check model.", COLOUR_RED);
                    }
                } else {
                    message("Spawn failed. Try again.", COLOUR_RED);
                }
            } catch (e) {
                message("Error spawning vehicle.", COLOUR_RED);
                console.log("Vehicle spawn error:", e.message);
                console.log("Vehicle spawn error stack:", e.stack);
            }
        }, 3000);
        return;
    }
    
    let pos = player.position;

    // Create the vehicle. Try different hash approaches for addon F1
    let f1Hash = 0x12345678; // Common addon vehicle hash placeholder
    console.log("Trying F1 hash:", f1Hash.toString(16));
    let veh = gta.createVehicle(f1Hash, new Vec3(pos.x + 3, pos.y, pos.z));

    if (veh) {
        // Set vehicle color to avoid randomization error
        try {
            gta.setVehicleColour(veh, 1, 1); // Use primary/secondary color 1
        } catch (e) {
            console.log("Color set error:", e.message);
        }
        message("F1 spawned successfully!", COLOUR_WHITE);
    } else {
        message("Failed to spawn F1. Check if the model is loaded.", COLOUR_RED);
    }
});
