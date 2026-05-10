-- Admin Commands Module
-- Administrative and debugging commands

local Admin = {}

-- Authentication helper for admin commands
local function requireAuthenticatedAccountId(player)
    -- Use the same method as JobStats - Auth.getAccountId which has multiple fallback methods
    local playerId = nil
    
    print("[Admin] DEBUG: requireAuthenticatedAccountId called")
    print("[Admin] DEBUG: player type: " .. type(player))
    
    if JobsRP and JobsRP.Auth and JobsRP.Auth.getAccountId then
        print("[Admin] DEBUG: Calling Auth.getAccountId")
        playerId = JobsRP.Auth.getAccountId(player)
        print("[Admin] DEBUG: Auth.getAccountId returned: " .. tostring(playerId))
    end
    
    print("[Admin] DEBUG: Returning playerId: " .. tostring(playerId))
    return playerId
end

-- Record coordinates command
Admin.registerRecordCoord = function()
    addCommandHandler("recordcoord", function(...)
        local client, parameters = Core.extractClientAndParams("recordcoord", ...)
        if not client then
            print("[Admin] /recordcoord ignored: client not resolved")
            return
        end
        
        local playerId = requireAuthenticatedAccountId(client)
        if not playerId then
            return
        end
        
        -- Call handleCommand with parameters string (like original)
        if handleCommand then
            handleCommand("recordcoord", parameters, client)
        end
    end)
end

-- Phone command
Admin.registerPhone = function()
    addCommandHandler("phone", function(...)
        local client, parameters = Core.extractClientAndParams("phone", ...)
        if not client then
            print("[Admin] /phone ignored: client not resolved")
            return
        end
        
        -- Call handleCommand with parameters string (like original)
        if handleCommand then
            handleCommand("phone", parameters, client)
        end
    end)
end

-- Character management commands
Admin.registerCharacter = function()
    addCommandHandler("character", function(...)
        local client, parameters = Core.extractClientAndParams("character", ...)
        if not client then
            print("[Admin] /character ignored: client not resolved")
            return
        end
        
        -- Call handleCommand with parameters string (like original)
        if handleCommand then
            handleCommand("character", parameters, client)
        end
    end)
    
    -- Short form command
    addCommandHandler("char", function(...)
        local client, parameters = Core.extractClientAndParams("char", ...)
        if not client then
            print("[Admin] /char ignored: client not resolved")
            return
        end
        
        -- Call handleCommand with parameters string (like original)
        if handleCommand then
            handleCommand("character", parameters, client)
        end
    end)
end

-- Initialize all admin commands
Admin.init = function()
    if not addCommandHandler then
        print("[Admin] Command system not available")
        return
    end
    
    Admin.registerRecordCoord()
    Admin.registerPhone()
    Admin.registerCharacter()
    
    print("[Admin] Admin commands registered: /recordcoord, /phone, /character, /char")
end

return Admin
