-- Authentication Module Initialization
-- Loads all authentication sub-modules

local AuthInit = {}

-- Initialize all auth modules
AuthInit.init = function()
    -- Load core authentication
    local AuthCore = require("server.auth.core")
    if AuthCore then
        JobsRP.Auth = JobsRP.Auth or {}
        JobsRP.Auth.generateToken = AuthCore.generateToken
        JobsRP.Auth.hashPassword = AuthCore.hashPassword
        JobsRP.Auth.verifyPassword = AuthCore.verifyPassword
        JobsRP.Auth.resolveClient = AuthCore.resolveClient
        JobsRP.Auth.getAccountId = AuthCore.getAccountId
        JobsRP.Auth.isAuthenticated = AuthCore.isAuthenticated
        print("[Auth] Core authentication loaded")
    else
        print("[Auth] Failed to load core authentication")
    end
    
    -- Load session manager
    local SessionManager = require("server.auth.session_manager")
    if SessionManager then
        JobsRP.Auth.SessionManager = SessionManager
        JobsRP.Auth.sessionsByPlayer = SessionManager.sessionsByPlayer
        JobsRP.Auth.lastResultByPlayer = SessionManager.lastResultByPlayer
        JobsRP.Auth.lastActionByPlayer = SessionManager.lastActionByPlayer
        JobsRP.Auth.sessionTokens = SessionManager.sessionTokens
        JobsRP.Auth.refreshTokens = SessionManager.refreshTokens
        JobsRP.Auth.serverToken = SessionManager.serverToken
        JobsRP.Auth.tokenRefreshRateLimit = SessionManager.tokenRefreshRateLimit
        print("[Auth] Session manager loaded")
    else
        print("[Auth] Failed to load session manager")
    end
    
    -- Load auth commands
    local AuthCommands = require("server.auth.commands")
    if AuthCommands then
        AuthCommands.init()
        print("[Auth] Authentication commands loaded")
    else
        print("[Auth] Failed to load authentication commands")
    end
    
    -- Set up cleanup timer
    if SessionManager then
        setInterval(function()
            SessionManager.cleanupExpired()
        end, 5 * 60 * 1000) -- Every 5 minutes
        print("[Auth] Session cleanup timer started")
    end
    
    print("[Auth] All authentication modules initialized successfully")
end

return AuthInit
