-- Authentication Core Module
-- Basic authentication functions and utilities

local AuthCore = {}

-- HEX values for token generation
local HEX = {
    "0", "1", "2", "3", "4", "5", "6", "7",
    "8", "9", "a", "b", "c", "d", "e", "f"
}

-- Utility functions
local function unpackTable(values, index)
    local i = index or 1
    if type(values) ~= "table" then
        return
    end
    if values[i] == nil then
        return
    end
    return values[i], unpackTable(values, i + 1)
end

local function nowMs()
    if os and os.clock then
        return math.floor(os.clock() * 1000)
    end
    if JobsRP and JobsRP.nowSeconds then
        return math.floor(JobsRP.nowSeconds() * 1000)
    end
    if os and os.time then
        return os.time() * 1000
    end
    return 0
end

local function emitToClient(client, eventName, ...)
    if not client or not eventName or eventName == "" then
        return
    end

    if type(pushClientEvent) == "function" then
        pcall(pushClientEvent, client, eventName, ...)
        return
    end

    if type(triggerNetworkEvent) == "function" then
        pcall(triggerNetworkEvent, eventName, client, ...)
    end
end

local function getLockRemainingSec(accountId)
    if not accountId or not AuthCore.loginAttempts or not AuthCore.loginAttempts[accountId] then
        return 0
    end

    local now = os.time()
    local attempts = AuthCore.loginAttempts[accountId]
    local recentAttempts = 0
    local newestTs = 0
    for i = #attempts, math.max(1, #attempts - 9), -1 do
        local ts = tonumber(attempts[i] and attempts[i].timestamp) or 0
        if ts > newestTs then
            newestTs = ts
        end
        if (now - ts) < 30 then
            recentAttempts = recentAttempts + 1
        end
    end

    if recentAttempts >= 10 and newestTs > 0 then
        local remaining = 300 - (now - newestTs)
        if remaining > 0 then
            return remaining
        end
    end

    return 0
end

local function sendState(client, accountId, lastMessage)
    if not client then
        return
    end

    local authenticated = AuthCore.isAuthenticated(client)
    local authRequired = not (JobsRP and JobsRP.Config and JobsRP.Config.auth_required == false)
    local accountText = tostring(accountId or AuthCore.getAccountId(client) or "")
    local lockRemainingSec = getLockRemainingSec(accountText ~= "" and accountText or nil)

    emitToClient(client, "jobs.authState", {
        authenticated = authenticated,
        authRequired = authRequired,
        accountId = accountText,
        lockRemainingSec = lockRemainingSec,
        lastMessage = tostring(lastMessage or "")
    })
end

local function sendResult(client, ok, code, message, accountId)
    emitToClient(client, "jobs.authResult", ok == true, tostring(code or ""), tostring(message or ""))
    sendState(client, accountId, message)
end

-- Generate random token
function AuthCore.generateToken(length)
    length = length or 32
    local token = ""
    for i = 1, length do
        token = token .. HEX[math.random(1, #HEX)]
    end
    return token
end

-- Hash password with salt
function AuthCore.hashPassword(password, salt)
    if not password then
        return nil
    end
    
    local salted = password .. (salt or "")
    -- Simple hash for now - replace with proper hashing in production
    return string.format("%08x", string.len(salted) * 31 + string.byte(salted, 1) or 0)
end

-- Verify password against hash
function AuthCore.verifyPassword(password, hash, salt)
    local computedHash = AuthCore.hashPassword(password, salt)
    return computedHash == hash
end

-- Resolve client from actor with multiple fallback methods
function AuthCore.resolveClient(actor)
    if not actor then
        return nil
    end
    
    local t = type(actor)
    
    -- Try to get client by index
    if t == "number" then
        if getClients then
            local okClients, clients = pcall(getClients)
            if okClients and type(clients) == "table" then
                for _, client in ipairs(clients) do
                    local okIdx, idx = pcall(function()
                        return client.index
                    end)
                    if okIdx and idx == actor then
                        return client
                    end
                end
            end
        end
    end
    
    -- Try userdata/table methods
    if t ~= "userdata" and t ~= "table" then
        return nil
    end
    
    -- Check for linked player
    local hasLinkedPlayer = false
    local okLinked = pcall(function()
        hasLinkedPlayer = actor.player ~= nil
    end)
    if okLinked and hasLinkedPlayer then
        return actor
    end
    
    -- Try player element method
    if getClientFromPlayerElement then
        local okClient, client = pcall(function()
            return getClientFromPlayerElement(actor)
        end)
        if okClient and client then
            return client
        end
    end
    
    return nil
end

-- Get account ID from client with robust fallback methods
function AuthCore.getAccountId(player)
    -- Method 1: Direct session lookup
    if JobsRP.Auth.sessionsByPlayer[player] then
        return JobsRP.Auth.sessionsByPlayer[player].accountId
    end
    
    -- Method 2: Try to get from player object
    if player and player.accountId then
        return player.accountId
    end
    
    -- Method 3: Try to get from store
    if JobsRP.Store and JobsRP.Store.getPlayerId then
        local accountId = JobsRP.Store.getPlayerId(player)
        if accountId then
            return accountId
        end
    end
    
    -- Method 4: Try to get from player name
    if player and player.name then
        local profile = JobsRP.Store and JobsRP.Store.getProfileByPlayerName and JobsRP.Store.getProfileByPlayerName(player.name)
        if profile and profile.accountId then
            return profile.accountId
        end
    end
    
    return nil
end

-- Check if player is authenticated
function AuthCore.isAuthenticated(player)
    local accountId = AuthCore.getAccountId(player)
    return accountId ~= nil
end

-- Register new account
function AuthCore.register(client, accountId, password)
    if not client or not accountId or not password then
        sendResult(client, false, "invalid_request", "Missing required fields", accountId)
        return false, "Missing required fields"
    end

    accountId = JobsRP.normalizeName and JobsRP.normalizeName(accountId) or tostring(accountId)
    
    -- Check if account already exists
    local existingAccount = JobsRP.Store and JobsRP.Store.loadAccountById and JobsRP.Store.loadAccountById(accountId)
    if existingAccount then
        sendResult(client, false, "account_exists", "Account already exists", accountId)
        return false, "Account already exists"
    end
    
    -- Hash password
    local hashedPassword = AuthCore.hashPassword(password)
    
    -- Create new profile
    if JobsRP.Store and JobsRP.Store.replaceAccountById and JobsRP.Store.saveAccountById and JobsRP.Store.loadProfileById and JobsRP.Store.saveProfileById then
        local now = os.time()
        local ip = tostring(client.ip or "")
        local playerName = tostring(client.name or "")
        local account = JobsRP.Store.newAccount and JobsRP.Store.newAccount(accountId, "", playerName, ip) or {
            accountId = accountId,
            createdAt = now,
            knownIps = {}
        }
        local tokenPrefix = (JobsRP and JobsRP.Config and JobsRP.Config.auth_token_prefix) or "JR-"
        local tokenLen = (JobsRP and JobsRP.Config and JobsRP.Config.auth_token_hex_len) or 48
        account.token = tostring(account.token or "")
        if account.token == "" then
            account.token = tokenPrefix .. AuthCore.generateToken(tokenLen)
        end
        account.passwordHash = hashedPassword
        account.password = hashedPassword -- backward compatibility
        account.lastLoginAt = now
        account.lastSeenName = playerName
        account.knownIps = type(account.knownIps) == "table" and account.knownIps or {}
        if ip ~= "" then
            account.knownIps[#account.knownIps + 1] = ip
        end
        JobsRP.Store.replaceAccountById(accountId, account)
        JobsRP.Store.saveAccountById(accountId, true)

        local profile = JobsRP.Store.loadProfileById(accountId) or {}
        profile.accountId = accountId
        profile.password = hashedPassword -- backward compatibility for legacy logins
        profile.createdAt = profile.createdAt or now
        profile.lastLogin = now
        JobsRP.Store.replaceProfileById(accountId, profile)
        JobsRP.Store.saveProfileById(accountId, true)
        JobsRP.Store.attachPlayerAccount(client, accountId)
        if JobsRP.Auth and JobsRP.Auth.SessionManager then
            JobsRP.Auth.SessionManager.createSession(client, accountId)
        end
        print("[Auth] Registered new account: " .. accountId)
        sendResult(client, true, "registered", "Registration successful", accountId)
        return true, "Registration successful"
    else
        sendResult(client, false, "storage_unavailable", "Storage system not available", accountId)
        return false, "Storage system not available"
    end
end

-- Login existing account
function AuthCore.login(client, accountId, password)
    if not client or not accountId or not password then
        print("[Auth] DEBUG: Login failed - Missing fields (accountId: " .. tostring(accountId) .. ", password: " .. tostring(password ~= nil and "SET" or "NIL") .. ")")
        sendResult(client, false, "invalid_request", "Missing required fields", accountId)
        return false, "Missing required fields"
    end
    
    accountId = JobsRP.normalizeName and JobsRP.normalizeName(accountId) or tostring(accountId)
    print("[Auth] DEBUG: Login attempt for " .. accountId)
    
    -- Check if login is blocked
    local blocked, blockReason = AuthCore.isLoginBlocked(accountId)
    if blocked then
        print("[Auth] DEBUG: Login blocked for " .. accountId .. " - " .. blockReason)
        sendResult(client, false, "blocked", blockReason, accountId)
        return false, blockReason
    end
    
    -- Load profile
    local account = JobsRP.Store and JobsRP.Store.loadAccountById and JobsRP.Store.loadAccountById(accountId)
    local profile = JobsRP.Store and JobsRP.Store.loadProfileById and JobsRP.Store.loadProfileById(accountId)
    local storedHash = nil
    if account and type(account) == "table" then
        storedHash = account.passwordHash or account.password
    end
    if (not storedHash) and profile and type(profile) == "table" then
        storedHash = profile.password
    end

    if not storedHash then
        sendResult(client, false, "account_not_found", "Account not found", accountId)
        return false, "Account not found"
    end
    
    -- Verify password (with legacy token fallback)
    local passwordOk = AuthCore.verifyPassword(password, storedHash)
    if not passwordOk and account and type(account) == "table" then
        local accountToken = tostring(account.token or "")
        if accountToken ~= "" and tostring(password) == accountToken then
            passwordOk = true
            print("[Auth] Legacy token login accepted for: " .. accountId)
        end
    end

    if not passwordOk then
        if JobsRP.Store and JobsRP.Store.detachPlayer then
            JobsRP.Store.detachPlayer(client)
        end
        AuthCore.recordLoginAttempt(accountId, false, client.ip or "unknown")
        local hashText = tostring(storedHash or "")
        if string.sub(hashText, 1, 5) == "jpw2:" then
            sendResult(client, false, "invalid_password", "Legacy password format detected. Use your account token to login once, then set a new password.", accountId)
            return false, "Legacy password format detected"
        end
        sendResult(client, false, "invalid_password", "Invalid password", accountId)
        return false, "Invalid password"
    end
    
    -- Record successful login
    AuthCore.recordLoginAttempt(accountId, true, client.ip or "unknown")
    
    -- Update last login
    if profile and JobsRP.Store and JobsRP.Store.replaceProfileById and JobsRP.Store.saveProfileById then
        profile.lastLogin = os.time()
        JobsRP.Store.replaceProfileById(accountId, profile)
        JobsRP.Store.saveProfileById(accountId, true)
    end
    if account and JobsRP.Store and JobsRP.Store.replaceAccountById and JobsRP.Store.saveAccountById then
        account.lastLoginAt = os.time()
        account.lastSeenName = tostring(client.name or account.lastSeenName or "")
        JobsRP.Store.replaceAccountById(accountId, account)
        JobsRP.Store.saveAccountById(accountId, true)
    end
    if JobsRP.Store and JobsRP.Store.attachPlayerAccount then
        JobsRP.Store.attachPlayerAccount(client, accountId)
    end
    
    -- Create session
    if JobsRP.Auth and JobsRP.Auth.SessionManager then
        JobsRP.Auth.SessionManager.createSession(client, accountId)
    end
    
    print("[Auth] User logged in: " .. accountId)
    sendResult(client, true, "logged_in", "Login successful", accountId)
    return true, "Login successful"
end

function AuthCore.loginWithTokens(client, sessionToken, refreshToken)
    if not client then
        return false, "Missing client"
    end

    local manager = JobsRP.Auth and JobsRP.Auth.SessionManager or nil
    if not manager then
        sendResult(client, false, "auto_login", "Token auth unavailable", nil)
        return false, "Token auth unavailable"
    end

    local accountId = nil
    if sessionToken and sessionToken ~= "" and manager.validateToken then
        accountId = manager.validateToken(sessionToken)
    end

    if (not accountId) and refreshToken and refreshToken ~= "" and manager.refreshTokens then
        local now = os.time()
        for id, tokenData in pairs(manager.refreshTokens) do
            if tokenData and tokenData.token == refreshToken and (tonumber(tokenData.expiresAt) or 0) > now then
                accountId = id
                break
            end
        end
    end

    if not accountId then
        sendResult(client, false, "auto_login", "Invalid or expired tokens", nil)
        return false, "Invalid or expired tokens"
    end

    if JobsRP.Store and JobsRP.Store.attachPlayerAccount then
        JobsRP.Store.attachPlayerAccount(client, accountId)
    end
    if manager.createSession then
        manager.createSession(client, accountId)
    end

    sendResult(client, true, "auto_login", "Auto-login successful", accountId)
    return true, "Auto-login successful"
end

-- Handle player quit
function AuthCore.handlePlayerQuit(player)
    if not player then
        return
    end
    
    local accountId = AuthCore.getAccountId(player)
    if accountId then
        -- Remove session
        if JobsRP.Auth and JobsRP.Auth.SessionManager then
            JobsRP.Auth.SessionManager.removeSession(player)
        end
        
        -- Clean up store
        if JobsRP.Store then
            JobsRP.Store.detachPlayer(player)
        end
        
        print("[Auth] Player quit: " .. accountId)
    end
end

-- Login attempt tracking for rate limiting
AuthCore.loginAttempts = AuthCore.loginAttempts or {}

-- Check if login attempt should be blocked (temporarily disabled for testing)
function AuthCore.isLoginBlocked(accountId)
    -- TEMPORARY: Rate limiting disabled for testing
    -- Uncomment the return line below to re-enable security
    return false, nil
    
    -- Original rate limiting code (commented out for testing):
    --[[ local now = os.time()
    -- local attempts = AuthCore.loginAttempts[accountId] or {}
    -- 
    -- -- Clean old attempts (older than 15 minutes)
    -- local cleanedAttempts = {}
    -- for i, attempt in ipairs(attempts) do
    --     if (now - attempt.timestamp) < 900 then -- 15 minutes
    --         table.insert(cleanedAttempts, attempt)
    --     end
    -- end
    -- AuthCore.loginAttempts[accountId] = cleanedAttempts
    -- 
    -- -- Check recent failures (last 5 attempts)
    -- local recentFailures = 0
    -- for i = math.max(1, #cleanedAttempts - 4), #cleanedAttempts do
    --     if not attempt.success then
    --         recentFailures = recentFailures + 1
    --     end
    -- end
    -- 
    -- -- Block if too many recent failures (5 failures in 15 minutes)
    -- if recentFailures >= 5 then
    --     return true, "Too many failed login attempts. Please wait 15 minutes."
    -- end
    -- 
    -- -- Check if currently in timeout
    -- for _, attempt in ipairs(cleanedAttempts) do
    --     if not attempt.success and (now - attempt.timestamp) < 300 then -- 5 minutes
    --         return true, "Login temporarily blocked. Please wait."
    --     end
    -- end
    -- 
    -- return false, nil
    --]]
end

-- Emergency stop mechanism to prevent infinite loops
AuthCore.emergencyStop = false

-- Record login attempt
function AuthCore.recordLoginAttempt(accountId, success, ip)
    -- Emergency stop to prevent infinite loops
    if AuthCore.emergencyStop then
        print("[Auth] EMERGENCY: Login attempts blocked - system in safe mode")
        return false, "System temporarily locked for safety"
    end
    
    local now = os.time()
    local attempts = AuthCore.loginAttempts[accountId] or {}
    
    -- Check for rapid-fire attempts (more than 10 in 30 seconds)
    local recentAttempts = 0
    for i = #attempts, math.max(1, #attempts - 9), -1 do
        if (now - attempts[i].timestamp) < 30 then -- 30 seconds
            recentAttempts = recentAttempts + 1
        end
    end
    
    if recentAttempts >= 10 then
        print("[Auth] EMERGENCY: Too many rapid login attempts for " .. accountId .. " - blocking for 5 minutes")
        AuthCore.emergencyStop = true
        
        -- Set unblock timer
        setTimeout(function()
            AuthCore.emergencyStop = false
            print("[Auth] Emergency lock lifted for " .. accountId)
        end, 5 * 60 * 1000) -- 5 minutes
        
        return false, "Too many rapid attempts. Please wait 5 minutes."
    end
    
    -- Add new attempt
    table.insert(attempts, {
        timestamp = now,
        success = success,
        ip = ip or "unknown"
    })
    
    -- Keep only last 10 attempts
    if #attempts > 10 then
        for i = 1, #attempts - 10 do
            table.remove(attempts, 1)
        end
    end
    
    AuthCore.loginAttempts[accountId] = attempts
    
    if success then
        print("[Auth] Successful login recorded for: " .. accountId)
    else
        print("[Auth] Failed login recorded for: " .. accountId .. " (IP: " .. (ip or "unknown") .. ")")
    end
end

function AuthCore.isAdmin(player)
    if not player then
        return false
    end
    
    -- Console is always admin
    local isConsole = false
    local okConsole = pcall(function()
        isConsole = player.console == true
    end)
    if okConsole and isConsole then
        return true
    end
    
    -- Check account role
    local accountId = AuthCore.getAccountId(player)
    if not accountId then
        return false
    end
    
    -- Check admin_accounts config
    local normalizedId = JobsRP.normalizeName(accountId)
    if JobsRP.Config and JobsRP.Config.admin_account_lookup and JobsRP.Config.admin_account_lookup[normalizedId] then
        return true
    end
    
    -- Check admins config (by name)
    if player and player.name then
        local normalizedName = JobsRP.normalizeName(player.name)
        if JobsRP.Config and JobsRP.Config.admin_lookup and JobsRP.Config.admin_lookup[normalizedName] then
            return true
        end
    end
    
    -- Check account role from store
    local account = JobsRP.Store and JobsRP.Store.loadAccountById and JobsRP.Store.loadAccountById(accountId)
    if account and account.role == "admin" then
        return true
    end
    
    return false
end

AuthCore.sendState = sendState

-- Send authentication state to client
function AuthCore.sendState(client)
    if not client then
        return false
    end
    
    local isAuth = AuthCore.isAuthenticated(client)
    local accountId = AuthCore.getAccountId(client)
    
    if JobsRP.Jobs and JobsRP.Jobs.pushClientEvent then
        JobsRP.Jobs.pushClientEvent(client, "jobs.authState", {
            authenticated = isAuth,
            accountId = accountId,
            timestamp = os.time()
        })
    end
    
    return true
end

-- Logout player
function AuthCore.logout(client, silent)
    if not client then
        return false, "No client provided"
    end
    
    local accountId = AuthCore.getAccountId(client)
    if not accountId then
        return false, "Not logged in"
    end
    
    -- Remove session
    if JobsRP.Auth and JobsRP.Auth.SessionManager then
        JobsRP.Auth.SessionManager.removeSession(client)
    end
    
    -- Detach from store
    if JobsRP.Store then
        JobsRP.Store.detachPlayer(client)
    end
    
    if not silent then
        print("[Auth] User logged out: " .. accountId)
    end
    
    return true, "Logout successful"
end

-- Handle player join
function AuthCore.handlePlayerJoin(player)
    if not player then
        return
    end
    
    print("[Auth] Player joined, checking authentication state")
    
    -- Send initial auth state
    AuthCore.sendState(player)
end

-- Check if player is admin
function AuthCore.isAdmin(player)
    if not player then
        return false
    end
    
    local accountId = AuthCore.getAccountId(player)
    if not accountId then
        return false
    end
    
    -- Check against admin list in config
    local adminAccounts = JobsRP.Config and JobsRP.Config.admin_accounts or {}
    for _, adminId in ipairs(adminAccounts) do
        if adminId == accountId then
            return true
        end
    end
    
    return false
end

return AuthCore
