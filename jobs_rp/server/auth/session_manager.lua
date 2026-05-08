-- Session Manager Module
-- Handles player sessions and token management

local SessionManager = {}

-- Initialize session storage
SessionManager.sessionsByPlayer = {}
SessionManager.lastResultByPlayer = {}
SessionManager.lastActionByPlayer = {}
SessionManager.sessionTokens = {}
SessionManager.refreshTokens = {}
SessionManager.serverToken = nil
SessionManager.tokenRefreshRateLimit = {}

-- Create new session for player
function SessionManager.createSession(player, accountId)
    if not player or not accountId then
        return nil
    end
    
    local session = {
        player = player,
        accountId = accountId,
        createdAt = os.time(),
        lastActivity = os.time(),
        isAuthenticated = true
    }
    
    SessionManager.sessionsByPlayer[player] = session
    return session
end

-- Get session for player
function SessionManager.getSession(player)
    return SessionManager.sessionsByPlayer[player]
end

-- Update session activity
function SessionManager.updateActivity(player)
    local session = SessionManager.sessionsByPlayer[player]
    if session then
        session.lastActivity = os.time()
    end
end

-- Remove session for player
function SessionManager.removeSession(player)
    local session = SessionManager.sessionsByPlayer[player]
    if session then
        SessionManager.sessionsByPlayer[player] = nil
        SessionManager.lastResultByPlayer[player] = nil
        SessionManager.lastActionByPlayer[player] = nil
        return session
    end
    return nil
end

-- Create session token
function SessionManager.createSessionToken(accountId, ip, deviceFingerprint)
    local token = JobsRP.Auth and JobsRP.Auth.generateToken and JobsRP.Auth.generateToken(32) or math.random(100000, 999999)
    local expiresAt = os.time() + (24 * 60 * 60) -- 24 hours
    
    SessionManager.sessionTokens[accountId] = {
        token = token,
        expiresAt = expiresAt,
        ip = ip,
        deviceFingerprint = deviceFingerprint
    }
    
    return token
end

-- Validate session token
function SessionManager.validateToken(token)
    if not token then
        return nil
    end
    
    for accountId, tokenData in pairs(SessionManager.sessionTokens) do
        if tokenData.token == token and tokenData.expiresAt > os.time() then
            return accountId
        end
    end
    
    return nil
end

-- Refresh session token
function SessionManager.refreshToken(accountId, deviceFingerprint)
    local ip = "unknown" -- Would get from player connection
    
    -- Check rate limiting
    local rateLimit = SessionManager.tokenRefreshRateLimit[ip] or {count = 0, windowStart = os.time()}
    local now = os.time()
    
    if now - rateLimit.windowStart < 60 then -- 1 minute window
        if rateLimit.count >= 5 then -- Max 5 refreshes per minute
            return nil, "Rate limit exceeded"
        end
        rateLimit.count = rateLimit.count + 1
    else
        rateLimit = {count = 1, windowStart = now}
    end
    
    SessionManager.tokenRefreshRateLimit[ip] = rateLimit
    
    -- Create new token
    local newToken = SessionManager.createSessionToken(accountId, ip, deviceFingerprint)
    
    SessionManager.refreshTokens[accountId] = {
        token = newToken,
        expiresAt = os.time() + (7 * 24 * 60 * 60), -- 7 days
        deviceFingerprint = deviceFingerprint,
        lastUsed = now
    }
    
    return newToken
end

-- Clean up expired sessions and tokens
function SessionManager.cleanupExpired()
    local now = os.time()
    local cleanedCount = 0
    
    -- Clean expired tokens
    for accountId, tokenData in pairs(SessionManager.sessionTokens) do
        if tokenData.expiresAt < now then
            SessionManager.sessionTokens[accountId] = nil
            cleanedCount = cleanedCount + 1
        end
    end
    
    -- Clean expired refresh tokens
    for accountId, refreshData in pairs(SessionManager.refreshTokens) do
        if refreshData.expiresAt < now then
            SessionManager.refreshTokens[accountId] = nil
            cleanedCount = cleanedCount + 1
        end
    end
    
    -- Clean inactive sessions (older than 1 hour)
    for player, session in pairs(SessionManager.sessionsByPlayer) do
        if session.lastActivity < (now - 3600) then
            SessionManager.removeSession(player)
            cleanedCount = cleanedCount + 1
        end
    end
    
    if cleanedCount > 0 then
        print("[SessionManager] Cleaned up " .. cleanedCount .. " expired sessions/tokens")
    end
end

-- Get session statistics
function SessionManager.getStats()
    local activeSessions = 0
    local activeTokens = 0
    local activeRefreshTokens = 0
    
    for _ in pairs(SessionManager.sessionsByPlayer) do
        activeSessions = activeSessions + 1
    end
    
    for _ in pairs(SessionManager.sessionTokens) do
        activeTokens = activeTokens + 1
    end
    
    for _ in pairs(SessionManager.refreshTokens) do
        activeRefreshTokens = activeRefreshTokens + 1
    end
    
    return {
        activeSessions = activeSessions,
        activeTokens = activeTokens,
        activeRefreshTokens = activeRefreshTokens
    }
end

return SessionManager
