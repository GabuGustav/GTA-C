let spawn_pos = [39.59, 128.88, 15.63]; // This is somewhere, go guess where
const respawnCooldownMs = 5000;
const lastRespawnById = new Map();

function respawnPlayer(client) {
    // Spawn after 5 secs using GTAC timer
    if (typeof setTimer === "function") {
        setTimer(function() {
            console.log(`Respawning player ${client.name}`);
            spawnPlayer(client, spawn_pos);
            console.log(`Player ${client.name} respawned.`);
        }, 5000, false); // false = one-time
        
        setTimer(function(){
            fadeCamera(client, true);
        }, 5500, false); // false = one-time
    } else if (typeof setTimeout === "function") {
        // Fallback to setTimeout
        setTimeout(function() {
            console.log(`Respawning player ${client.name}`);
            spawnPlayer(client, spawn_pos);
            console.log(`Player ${client.name} respawned.`);
        }, 5000);
        setTimeout(function(){
            fadeCamera(client, true);
        }, 5500);
    } else {
        console.log("[Server] Warning: No timer function available for respawn");
    }
}

addEventHandler("OnPlayerJoined", (event, client) => {
    console.log(`Player ${client.name} joined the server.`);

    if (client.player) {
        destroyElement(client.player);
        console.log(`Destroyed player element for ${client.name}`);
    }

    // Check if character system is enabled and auth is required
    if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.character_enabled === true) {
        if (JobsRP.Config.auth_required === true) {
            // Don't spawn yet - wait for authentication and character selection
            console.log(`[Server] Spawn delayed for ${client.name} - waiting for auth and character selection`);
            // Despawn any existing player element
            if (client.player) {
                destroyElement(client.player);
            }
            fadeCamera(client, false); // Keep camera faded until character is selected
            return;
        }
    }

    // Spawn immediately if character system is disabled or auth is not required
    spawnPlayer(client, spawn_pos);
    fadeCamera(client, true);
    console.log(`Player ${client.name} spawned immediately (no character selection required)`);
});

// Register custom network event
addEvent("requestRespawn");

// Handle client respawn requests
addNetworkHandler("requestRespawn", function(client, args) {
    console.log(`[Server] Received respawn request from ${client.name}`);

    // Require authentication when auth is enabled
    if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.auth_required === true) {
        if (!JobsRP.Auth || typeof JobsRP.Auth.isAuthenticated !== "function" || !JobsRP.Auth.isAuthenticated(client)) {
            console.log(`[Server] Respawn denied (unauthenticated): ${client.name}`);
            return;
        }
    }

    // Simple cooldown per client
    let idKey = null;
    if (client) {
        if (client.id !== undefined && client.id !== null) {
            idKey = client.id;
        } else if (client.name !== undefined && client.name !== null) {
            idKey = client.name;
        }
    }
    const now = Date.now();
    if (idKey != null) {
        const last = lastRespawnById.get(idKey) || 0;
        if (now - last < respawnCooldownMs) {
            console.log(`[Server] Respawn throttled for ${client.name}`);
            return;
        }
        lastRespawnById.set(idKey, now);
    }

    respawnPlayer(client);
});

// Function to spawn player after character selection
function spawnPlayerAfterCharacterSelection(client) {
    console.log(`[Server] Spawning player ${client.name} after character selection`);
    
    // Destroy any existing player element to ensure clean spawn
    if (client.player) {
        console.log(`[Server] Destroying existing player element for ${client.name}`);
        destroyElement(client.player);
        client.player = null;
    }
    
    // Small delay to ensure destruction is complete
    if (typeof setTimer === "function") {
        setTimer(function() {
            // Spawn the player with new character model
            spawnPlayer(client, spawn_pos);
            console.log(`[Server] Player ${client.name} spawned with new character model`);
            
            // Fade in camera after spawn
            setTimer(function(){
                fadeCamera(client, true);
                console.log(`[Server] Camera faded in for ${client.name}`);
            }, 500, false);
        }, 200, false);
    } else if (typeof setTimeout === "function") {
        setTimeout(function() {
            // Spawn the player with new character model
            spawnPlayer(client, spawn_pos);
            console.log(`[Server] Player ${client.name} spawned with new character model`);
            
            // Fade in camera after spawn
            setTimeout(function(){
                fadeCamera(client, true);
                console.log(`[Server] Camera faded in for ${client.name}`);
            }, 500);
        }, 200);
    } else {
        // Fallback - spawn immediately
        spawnPlayer(client, spawn_pos);
        fadeCamera(client, true);
        console.log(`[Server] Player ${client.name} spawned immediately (no timer available)`);
    }
}

// Function to handle character model changes
function changeCharacterModel(client, modelHash, modelName) {
    console.log(`[Server] Changing character model for ${client.name} to ${modelName} (hash: ${modelHash})`);
    
    // Destroy any existing player element
    if (client.player) {
        console.log(`[Server] Destroying existing character for ${client.name}`);
        destroyElement(client.player);
        client.player = null;
    }
    
    // Small delay to ensure destruction is complete
    if (typeof setTimer === "function") {
        setTimer(function() {
            // Spawn the player with new character model
            spawnPlayer(client, spawn_pos);
            console.log(`[Server] Character model changed for ${client.name} - now using ${modelName}`);
            
            // Fade in camera after spawn
            setTimer(function(){
                fadeCamera(client, true);
            }, 500, false);
        }, 200, false);
    } else if (typeof setTimeout === "function") {
        setTimeout(function() {
            // Spawn the player with new character model
            spawnPlayer(client, spawn_pos);
            console.log(`[Server] Character model changed for ${client.name} - now using ${modelName}`);
            
            // Fade in camera after spawn
            setTimeout(function(){
                fadeCamera(client, true);
            }, 500);
        }, 200);
    } else {
        // Fallback - spawn immediately
        spawnPlayer(client, spawn_pos);
        fadeCamera(client, true);
        console.log(`[Server] Character model changed immediately for ${client.name} - now using ${modelName}`);
    }
}

// Make function globally available
if (typeof global !== "undefined") {
    global.changeCharacterModel = changeCharacterModel;
}

// Make function globally available
if (typeof global !== "undefined") {
    global.spawnPlayerAfterCharacterSelection = spawnPlayerAfterCharacterSelection;
}

// Add server respawn command for testing
if (typeof addCommandHandler === "function") {
    addCommandHandler("respawnplayer", function(client) {
        console.log(`[Server] Admin respawn command for ${client.name}`);
        respawnPlayer(client);
    });
}
