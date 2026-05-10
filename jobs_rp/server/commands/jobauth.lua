-- JobAuth Commands Module
-- Handles /jobauth command and authentication subcommands

local JobAuthCommands = {}

-- Utility functions
local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

local function chat(player, message, r, g, b)
    -- Always try outputChatBox first for player-facing messages
    if outputChatBox then
        outputChatBox(message, player, r or 180, g or 220, b or 255)
        return
    end
    -- Fallback to JobsRP.Jobs.chat if available
    if JobsRP.Jobs and JobsRP.Jobs.chat then
        JobsRP.Jobs.chat(player, message, r, g, b)
    end
end

local function showJobAuthHelp(player)
    chat(player, "[JobsAuth] Commands:", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth help - Show this help", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth register <accountId> <password> - Register new account", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth login <accountId> <password> - Login to account", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth logout - Logout from account", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth setpass <newPassword> - Set new password", 180, 220, 255)
    chat(player, "[JobsAuth] /jobauth whoami - Show current account info", 180, 220, 255)
end

-- Handle /jobauth command
function JobAuthCommands.handle(player, words)
    local sub = normalizeToken(words[1] or "help")
    
    if sub == "help" then
        showJobAuthHelp(player)
        return
    end
    
    if sub == "register" then
        if not words[2] or not words[3] then
            chat(player, "[JobsAuth] Usage: /jobauth register <accountId> <password>", 255, 120, 120)
            return
        end
        
        if JobsRP.Auth and JobsRP.Auth.register then
            local accountId = words[2]
            local password = words[3]
            local success, message = JobsRP.Auth.register(player, accountId, password)
            if success then
                chat(player, "[JobsAuth] " .. message, 120, 255, 120)
            else
                chat(player, "[JobsAuth] " .. message, 255, 120, 120)
            end
        else
            chat(player, "[JobsAuth] Registration system not available.", 255, 120, 120)
        end
        return
    end
    
    if sub == "login" then
        if not words[2] or not words[3] then
            chat(player, "[JobsAuth] Usage: /jobauth login <accountId> <password>", 255, 120, 120)
            return
        end
        
        if JobsRP.Auth and JobsRP.Auth.login then
            local accountId = words[2]
            local password = words[3]
            local success, message = JobsRP.Auth.login(player, accountId, password)
            if success then
                chat(player, "[JobsAuth] " .. message, 120, 255, 120)
            else
                chat(player, "[JobsAuth] " .. message, 255, 120, 120)
            end
        else
            chat(player, "[JobsAuth] Login system not available.", 255, 120, 120)
        end
        return
    end
    
    if sub == "logout" then
        if JobsRP.Auth and JobsRP.Auth.logout then
            local success, message = JobsRP.Auth.logout(player)
            if success then
                chat(player, "[JobsAuth] " .. message, 120, 255, 120)
            else
                chat(player, "[JobsAuth] " .. message, 255, 120, 120)
            end
        else
            chat(player, "[JobsAuth] Logout system not available.", 255, 120, 120)
        end
        return
    end
    
    if sub == "setpass" then
        if not words[2] then
            chat(player, "[JobsAuth] Usage: /jobauth setpass <newPassword>", 255, 120, 120)
            return
        end
        
        local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player)
        if not accountId then
            chat(player, "[JobsAuth] You must be logged in to change password.", 255, 120, 120)
            return
        end
        
        -- Password change logic would go here
        chat(player, "[JobsAuth] Password change not implemented yet.", 255, 180, 120)
        return
    end
    
    if sub == "whoami" then
        local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player)
        if accountId then
            chat(player, "[JobsAuth] Logged in as: " .. accountId, 120, 255, 120)
        else
            chat(player, "[JobsAuth] Not logged in.", 255, 180, 120)
        end
        return
    end
    
    chat(player, "[JobsAuth] Unknown subcommand. Use /jobauth help.", 255, 120, 120)
end

-- Track if already registered
local _jobauthRegistered = false

-- Register jobauth command
JobAuthCommands.register = function()
    if not addCommandHandler then
        print("[JobAuthCommands] Command system not available")
        return
    end
    
    if _jobauthRegistered then
        print("[JobAuthCommands] /jobauth already registered, skipping")
        return
    end
    
    _jobauthRegistered = true
    
    addCommandHandler("jobauth", function(...)
        local client, parameters = Core.extractClientAndParams("jobauth", ...)
        if not client then
            print("[JobAuthCommands] /jobauth ignored: client not resolved")
            return
        end
        
        -- Convert parameters string to words (like original)
        local words = Core.toWords(parameters)
        
        -- Remove first word if it equals the command name
        if words[1] and Core.normalizeToken(words[1]) == "jobauth" then
            table.remove(words, 1)
        end
        
        JobAuthCommands.handle(client, words)
    end)
    
    print("[JobAuthCommands] /jobauth command registered")
end

return JobAuthCommands
