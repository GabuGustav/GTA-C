-- Authentication Commands Module
-- Commands related to authentication and session management

local AuthCommands = {}

-- Helper to resolve client from command args
local function resolveClientForCommand(args)
    for _, value in ipairs(args) do
        if type(value) == "userdata" or type(value) == "table" then
            local resolved = nil
            local okLinked = pcall(function()
                if value.player ~= nil then
                    resolved = value
                end
            end)
            if okLinked and resolved then
                return resolved
            end
            
            local okClient = pcall(function()
                if value.index ~= nil and value.name ~= nil then
                    resolved = value
                end
            end)
            if okClient and resolved then
                return resolved
            end
        end
    end
    
    if _G and _G.client then return _G.client end
    if _G and _G.source then return _G.source end
    return nil
end

-- Send private chat message to player
local function chat(player, message, r, g, b)
    local text = tostring(message or "")
    if text == "" then return end
    
    local variants = {
        function() return outputChatBox(text, player, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(player, text, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(text, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(text, player) end,
        function() return outputChatBox(text) end
    }
    for _, writer in ipairs(variants) do
        local ok = pcall(writer)
        if ok then return true end
    end
    return false
end

-- Register command
AuthCommands.registerRegister = function()
    addCommandHandler("jobauth", function(...)
        local args = {...}
        local player = resolveClientForCommand(args)
        if not player then
            print("[Auth] /jobauth: Could not resolve player")
            return
        end
        
        -- Extract non-client arguments as text parameters
        local params = {}
        for _, value in ipairs(args) do
            if type(value) == "string" then
                params[#params + 1] = value
            end
        end
        
        local subcommand = params[1] and params[1]:lower() or "help"
        
        if subcommand == "register" then
            local accountId = params[2]
            local password = params[3]
            
            if not accountId or not password then
                chat(player, "[JobsAuth] Usage: /jobauth register <accountId> <password>", 255, 200, 100)
                return
            end
            
            if JobsRP.Auth and JobsRP.Auth.register then
                JobsRP.Auth.register(player, accountId, password)
            else
                chat(player, "[JobsAuth] Authentication system unavailable.", 255, 100, 100)
            end
            
        elseif subcommand == "login" then
            local accountId = params[2]
            local password = params[3]
            
            if not accountId or not password then
                chat(player, "[JobsAuth] Usage: /jobauth login <accountId> <password>", 255, 200, 100)
                return
            end
            
            if JobsRP.Auth and JobsRP.Auth.login then
                JobsRP.Auth.login(player, accountId, password)
            else
                chat(player, "[JobsAuth] Authentication system unavailable.", 255, 100, 100)
            end
            
        elseif subcommand == "setpass" then
            local newPassword = params[2]
            if not newPassword then
                chat(player, "[JobsAuth] Usage: /jobauth setpass <newPassword>", 255, 200, 100)
                return
            end
            
            local accountId = nil
            if JobsRP.Auth and JobsRP.Auth.getAccountId then
                accountId = JobsRP.Auth.getAccountId(player)
            end
            if not accountId then
                chat(player, "[JobsAuth] You must be logged in to set a password.", 255, 100, 100)
                return
            end
            
            local account = JobsRP.Store and JobsRP.Store.loadAccountById and JobsRP.Store.loadAccountById(accountId)
            if account then
                local hashed = JobsRP.Auth.hashPassword(newPassword)
                account.passwordHash = hashed
                account.password = hashed
                if JobsRP.Store and JobsRP.Store.replaceAccountById then
                    JobsRP.Store.replaceAccountById(accountId, account)
                    JobsRP.Store.saveAccountById(accountId, true)
                end
                chat(player, "[JobsAuth] Password updated successfully.", 120, 255, 120)
            else
                chat(player, "[JobsAuth] Account not found.", 255, 100, 100)
            end
            
        elseif subcommand == "logout" then
            if JobsRP.Auth and JobsRP.Auth.SessionManager then
                JobsRP.Auth.SessionManager.removeSession(player)
                if JobsRP.Store then
                    JobsRP.Store.detachPlayer(player)
                end
            end
            if JobsRP.Auth and JobsRP.Auth.sendState then
                JobsRP.Auth.sendState(player)
            end
            chat(player, "[JobsAuth] Logged out.", 255, 200, 100)
            
        elseif subcommand == "whoami" then
            local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player) or nil
            if accountId then
                chat(player, "[JobsAuth] Logged in as: " .. tostring(accountId), 180, 220, 255)
            else
                chat(player, "[JobsAuth] Not authenticated.", 255, 200, 100)
            end
            
        else
            chat(player, "[JobsAuth] Available commands:", 255, 220, 120)
            chat(player, "[JobsAuth]   /jobauth register <accountId> <password>", 255, 220, 120)
            chat(player, "[JobsAuth]   /jobauth login <accountId> <password>", 255, 220, 120)
            chat(player, "[JobsAuth]   /jobauth setpass <newPassword>", 255, 220, 120)
            chat(player, "[JobsAuth]   /jobauth logout", 255, 220, 120)
            chat(player, "[JobsAuth]   /jobauth whoami", 255, 220, 120)
        end
    end)
end

-- Logout command
AuthCommands.registerLogout = function()
    addCommandHandler("logout", function(...)
        local args = {...}
        local player = resolveClientForCommand(args)
        if not player then
            print("[Auth] /logout: Could not resolve player")
            return
        end
        
        local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player) or nil
        if accountId then
            if JobsRP.Auth and JobsRP.Auth.SessionManager then
                JobsRP.Auth.SessionManager.removeSession(player)
            end
            if JobsRP.Store then
                JobsRP.Store.detachPlayer(player)
            end
            if JobsRP.Auth and JobsRP.Auth.sendState then
                JobsRP.Auth.sendState(player)
            end
            chat(player, "[JobsAuth] Logged out: " .. tostring(accountId), 255, 200, 100)
        else
            chat(player, "[JobsAuth] No active session.", 255, 200, 100)
        end
    end)
end

-- Session status command
AuthCommands.registerSessionStatus = function()
    addCommandHandler("session", function(...)
        local args = {...}
        local player = resolveClientForCommand(args)
        if not player then
            print("[Auth] /session: Could not resolve player")
            return
        end
        
        local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player) or nil
        if accountId then
            chat(player, "[JobsAuth] Active session: " .. tostring(accountId), 180, 220, 255)
        else
            chat(player, "[JobsAuth] No active session.", 255, 200, 100)
        end
    end)
end

-- Initialize all auth commands
AuthCommands.init = function()
    if not addCommandHandler then
        print("[AuthCommands] Command system not available")
        return
    end
    
    AuthCommands.registerRegister()
    AuthCommands.registerLogout()
    AuthCommands.registerSessionStatus()
    
    print("[AuthCommands] Auth commands registered: /jobauth, /logout, /session")
end

return AuthCommands
