local spawn_pos = {39.59, 128.88, 15.63}; -- This is somewhere, go guess where

function respawnPlayer(client)
    print("Respawning player " .. (client.name or "Unknown"));
    spawnPlayer(client, spawn_pos);
    print("Player " .. (client.name or "Unknown") .. " respawned.");
end

-- Handle player joining (following GTAC minimal skeleton)
addEventHandler("OnPlayerJoin", function(event, client)
    print("Player " .. (client.name or "Unknown") .. " joined the server.");

    if (client.player) then
        destroyElement(client.player);
        print("Destroyed player element for " .. (client.name or "Unknown"));
    end

    respawnPlayer(client);
    fadeCamera(client, true);
end);

print("Server spawn system loaded");
