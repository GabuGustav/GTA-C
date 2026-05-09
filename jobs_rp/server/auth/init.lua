-- Authentication Module Initialization
-- Loads all authentication sub-modules

local AuthInit = {}

local function safeRequire(moduleName)
    if type(require) == "function" then
        local ok, mod = pcall(require, moduleName)
        if ok then
            return mod
        end
        print("[Auth] require failed for " .. tostring(moduleName) .. ": " .. tostring(mod))
    end

    local loader = loadstring or load
    if type(loader) ~= "function" or type(loadTextFile) ~= "function" then
        return nil
    end

    local modulePath = tostring(moduleName or ""):gsub("%.", "/")
    local candidatePaths = {
        moduleName .. ".lua",
        modulePath .. ".lua",
        "server/" .. modulePath .. ".lua",
        "resources/jobs_rp/server/" .. modulePath .. ".lua"
    }

    for _, path in ipairs(candidatePaths) do
        local okRead, source = pcall(loadTextFile, path)
        if okRead and type(source) == "string" and source ~= "" then
            local chunk = loader(source, "@" .. path)
            if chunk then
                local okExec, result = pcall(chunk)
                if okExec then
                    return result
                end
                print("[Auth] module execution failed for " .. path .. ": " .. tostring(result))
            end
        end
    end

    return nil
end

-- Initialize all auth modules
AuthInit.init = function()
    -- Load core authentication
    local AuthCore = safeRequire("auth.core")
    if AuthCore then
        JobsRP.Auth = JobsRP.Auth or {}
        JobsRP.Auth.generateToken = AuthCore.generateToken
        JobsRP.Auth.hashPassword = AuthCore.hashPassword
        JobsRP.Auth.verifyPassword = AuthCore.verifyPassword
        JobsRP.Auth.resolveClient = AuthCore.resolveClient
        JobsRP.Auth.getAccountId = AuthCore.getAccountId
        JobsRP.Auth.isAuthenticated = AuthCore.isAuthenticated
        JobsRP.Auth.sendState = AuthCore.sendState
        JobsRP.Auth.register = AuthCore.register
        JobsRP.Auth.login = AuthCore.login
        JobsRP.Auth.handlePlayerQuit = AuthCore.handlePlayerQuit
        print("[Auth] Core authentication loaded")
    else
        print("[Auth] Failed to load core authentication")
    end
    
    -- Load session manager
    local SessionManager = safeRequire("auth.session_manager")
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
    local AuthCommands = safeRequire("auth.commands")
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
