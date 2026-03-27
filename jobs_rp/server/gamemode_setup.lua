-- Gamemode setup script for LCPDFR roleplay
-- This script sets up the custom gamemode when using custom sync

print("[Gamemode] Initializing LCPDFR roleplay gamemode...");

-- Set up basic roleplay environment
addEventHandler("onResourceStart", function()
    print("[Gamemode] Resource started - setting up roleplay environment");
    
    -- Initialize basic roleplay settings
    if (gta ~= nil) then
        local success, err = pcall(function()
            -- Enable traffic and civilians if not already enabled
            if (gta.setTrafficEnabled ~= nil) then
                gta.setTrafficEnabled(true);
                print("[Gamemode] Traffic enabled");
            end
            
            if (gta.setCiviliansEnabled ~= nil) then
                gta.setCiviliansEnabled(true);
                print("[Gamemode] Civilians enabled");
            end
        end);
        
        if (not success) then
            print("[Gamemode] Error setting up traffic/civilians: " .. tostring(err));
        end
    end
    
    print("[Gamemode] LCPDFR roleplay environment ready");
end);

-- Handle player joining
addEventHandler("onPlayerJoin", function(player)
    print("[Gamemode] Player joined: " .. (player.name or "Unknown"));
    
    -- Basic player initialization
    setTimeout(function()
        local success, err = pcall(function()
            if (player ~= nil and player.spawn ~= nil) then
                player.spawn();
                print("[Gamemode] Player spawned: " .. (player.name or "Unknown"));
            end
        end);
        
        if (not success) then
            print("[Gamemode] Error spawning player: " .. tostring(err));
        end
    end, 2000);
end);

print("[Gamemode] LCPDFR gamemode script loaded");
