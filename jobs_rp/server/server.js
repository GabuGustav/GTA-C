let spawn_pos = [39.59, 128.88, 15.63]; // This is somewhere, go guess where

function respawnPlayer(client) {
    // Spawn aft 5 secs
    setTimeout(function() {
        console.log(`Respawning player ${client.name}`);
         spawnPlayer(client, spawn_pos);
        console.log(`Player ${client.name} respawned.`);
    }, 5000);
    setTimeout(function(){
        fadeCamera(client, true);
    },5500)
}

addEventHandler("OnPlayerJoined", (event, client) => {
    console.log(`Player ${client.name} joined the server.`);

    if (client.player) {
        destroyElement(client.player);
        console.log(`Destroyed player element for ${client.name}`);
    }

    spawnPlayer(client, spawn_pos)
    fadeCamera(client, true);
});

// Register custom network event
addEvent("requestRespawn");

// Handle client respawn requests
addNetworkHandler("requestRespawn", function(client, args) {
    console.log(`[Server] Received respawn request from ${client.name}`);
    
    respawnPlayer(client);
});

// Add server respawn command for testing
if (typeof addCommandHandler === "function") {
    addCommandHandler("respawnplayer", function(client) {
        console.log(`[Server] Admin respawn command for ${client.name}`);
        respawnPlayer(client);
    });
}