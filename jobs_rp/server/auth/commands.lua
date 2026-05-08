-- Authentication Commands Module
-- Commands related to authentication and session management

local AuthCommands = {}

-- Register command
AuthCommands.registerRegister = function()
    addCommandHandler("jobauth", function(...)
        local args = {...}
        local subcommand = args[1]
        
        if subcommand == "register" then
            -- Handle registration logic
            local player = args[2]
            if not player then
                print("[Auth] /jobauth register: Player not specified")
                return
            end
            
            -- Extract username and password from remaining args
            local username = args[3]
            local password = args[4]
            
            if not username or not password then
                print("[Auth] /jobauth register: Usage: /jobauth register <player> <username> <password>")
                return
            end
            
            -- Registration logic would go here
            print("[Auth] Registration request: " .. username .. " for player " .. tostring(player))
            
        elseif subcommand == "login" then
            -- Handle login logic
            local player = args[2]
            if not player then
                print("[Auth] /jobauth login: Player not specified")
                return
            end
            
            local username = args[3]
            local password = args[4]
            
            if not username or not password then
                print("[Auth] /jobauth login: Usage: /jobauth login <player> <username> <password>")
                return
            end
            
            -- Login logic would go here
            print("[Auth] Login request: " .. username .. " for player " .. tostring(player))
            
        else
            print("[Auth] /jobauth: Unknown subcommand '" .. tostring(subcommand) .. "'")
            print("[Auth] Available subcommands: register, login")
        end
    end)
end

-- Logout command
AuthCommands.registerLogout = function()
    addCommandHandler("logout", function(...)
        local player = args[1] or _G.client
        
        if not player then
            print("[Auth] /logout: Could not resolve player")
            return
        end
        
        local session = JobsRP.Auth.SessionManager and JobsRP.Auth.SessionManager.getSession(player)
        if session then
            JobsRP.Auth.SessionManager.removeSession(player)
            print("[Auth] " .. session.accountId .. " logged out")
        else
            print("[Auth] No active session found for logout")
        end
    end)
end

-- Session status command
AuthCommands.registerSessionStatus = function()
    addCommandHandler("session", function(...)
        local player = args[1] or _G.client
        
        if not player then
            print("[Auth] /session: Could not resolve player")
            return
        end
        
        local session = JobsRP.Auth.SessionManager and JobsRP.Auth.SessionManager.getSession(player)
        if session then
            print("[Auth] Active session: " .. session.accountId)
            print("[Auth] Created: " .. os.date("%Y-%m-%d %H:%M:%S", session.createdAt))
            print("[Auth] Last activity: " .. os.date("%Y-%m-%d %H:%M:%S", session.lastActivity))
        else
            print("[Auth] No active session found")
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
