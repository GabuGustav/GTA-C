-- Security module for jobs_rp
-- Provides anti-exploit, rate limiting, and validation functions

JobsRP = JobsRP or {}
JobsRP.Security = JobsRP.Security or {}

local Security = JobsRP.Security

-- Rate limiting data
Security.actionTracker = Security.actionTracker or {}
Security.failedLogins = Security.failedLogins or {}
Security.suspiciousPlayers = Security.suspiciousPlayers or {}

-- Configuration
Security.maxActionsPerSecond = 10
Security.maxFailedLogins = 5
Security.loginLockDuration = 300 -- 5 minutes
Security.suspiciousThreshold = 20

local function nowSeconds()
    return os.time()
end

local function getPlayerIdentifier(player)
    local playerId = JobsRP.Store and JobsRP.Store.getPlayerId(player)
    return playerId or tostring(player)
end

-- Rate limiting
function Security.checkActionRate(player, actionType)
    local identifier = getPlayerIdentifier(player)
    local now = nowSeconds()
    
    if not Security.actionTracker[identifier] then
        Security.actionTracker[identifier] = {}
    end
    
    local playerActions = Security.actionTracker[identifier]
    if not playerActions[actionType] then
        playerActions[actionType] = {}
    end
    
    local actionTimes = playerActions[actionType]
    
    -- Remove old entries (older than 1 second)
    local cutoff = now - 1
    for i = #actionTimes, 1, -1 do
        if actionTimes[i] < cutoff then
            table.remove(actionTimes, i)
        end
    end
    
    -- Check rate limit
    if #actionTimes >= Security.maxActionsPerSecond then
        return false, "Rate limit exceeded"
    end
    
    -- Add current action
    table.insert(actionTimes, now)
    return true, nil
end

-- Login security
function Security.recordFailedLogin(accountId, player)
    local identifier = getPlayerIdentifier(player)
    local now = nowSeconds()
    
    if not Security.failedLogins[accountId] then
        Security.failedLogins[accountId] = {}
    end
    
    local accountData = Security.failedLogins[accountId]
    table.insert(accountData, {
        timestamp = now,
        identifier = identifier,
        ip = player.ip or "unknown"
    })
    
    -- Clean old entries
    local cutoff = now - Security.loginLockDuration
    for i = #accountData, 1, -1 do
        if accountData[i].timestamp < cutoff then
            table.remove(accountData, i)
        end
    end
    
    -- Check if account should be locked
    if #accountData >= Security.maxFailedLogins then
        return false, "Account locked due to too many failed attempts"
    end
    
    return true, nil
end

function Security.clearFailedLogins(accountId)
    Security.failedLogins[accountId] = nil
end

-- Suspicious activity detection
function Security.recordSuspiciousActivity(player, reason, severity)
    local identifier = getPlayerIdentifier(player)
    local now = nowSeconds()
    
    if not Security.suspiciousPlayers[identifier] then
        Security.suspiciousPlayers[identifier] = {
            count = 0,
            lastActivity = 0,
            reasons = {}
        }
    end
    
    local data = Security.suspiciousPlayers[identifier]
    data.count = data.count + 1
    data.lastActivity = now
    table.insert(data.reasons, {
        reason = reason,
        severity = severity or 1,
        timestamp = now
    })
    
    -- Clean old reasons
    local cutoff = now - 3600 -- 1 hour
    for i = #data.reasons, 1, -1 do
        if data.reasons[i].timestamp < cutoff then
            table.remove(data.reasons, i)
        end
    end
    
    -- Check threshold
    if data.count >= Security.suspiciousThreshold then
        return true, "Suspicious activity threshold exceeded"
    end
    
    return false, nil
end

-- Position validation (anti-teleport)
function Security.validatePosition(player, oldPos, newPos)
    if not oldPos or not newPos then
        return true
    end
    
    local distance = math.sqrt(
        (newPos.x - oldPos.x)^2 + 
        (newPos.y - oldPos.y)^2 + 
        (newPos.z - oldPos.z)^2
    )
    
    -- Max reasonable movement per frame (adjust based on vehicle)
    local maxDistance = 50 -- meters per frame
    
    if distance > maxDistance then
        Security.recordSuspiciousActivity(player, "Invalid position change", 2)
        return false
    end
    
    return true
end

-- Data validation
function Security.validateJobData(jobId, action, data)
    if not jobId or type(jobId) ~= "string" then
        return false, "Invalid job ID"
    end
    
    if not action or type(action) ~= "string" then
        return false, "Invalid action"
    end
    
    -- Validate coordinates if present
    if data and data.x and data.y and data.z then
        if type(data.x) ~= "number" or type(data.y) ~= "number" or type(data.z) ~= "number" then
            return false, "Invalid coordinates"
        end
        
        -- Check for unreasonable coordinates
        if math.abs(data.x) > 10000 or math.abs(data.y) > 10000 or data.z < -1000 or data.z > 10000 then
            return false, "Coordinates out of bounds"
        end
    end
    
    return true, nil
end

-- Cleanup old data (call periodically)
function Security.cleanup()
    local now = nowSeconds()
    local cutoff = now - 3600 -- 1 hour
    
    -- Clean action tracker
    for identifier, playerData in pairs(Security.actionTracker) do
        for actionType, times in pairs(playerData) do
            for i = #times, 1, -1 do
                if times[i] < cutoff then
                    table.remove(times, i)
                end
            end
            if #times == 0 then
                playerData[actionType] = nil
            end
        end
        if next(playerData) == nil then
            Security.actionTracker[identifier] = nil
        end
    end
    
    -- Clean suspicious players
    for identifier, data in pairs(Security.suspiciousPlayers) do
        if data.lastActivity < cutoff then
            Security.suspiciousPlayers[identifier] = nil
        end
    end
end

-- Get security status for admin commands
function Security.getPlayerSecurityInfo(player)
    local identifier = getPlayerIdentifier(player)
    local info = {
        identifier = identifier,
        actionCounts = {},
        suspiciousCount = 0,
        lastSuspicious = nil
    }
    
    -- Action counts
    if Security.actionTracker[identifier] then
        for actionType, times in pairs(Security.actionTracker[identifier]) do
            info.actionCounts[actionType] = #times
        end
    end
    
    -- Suspicious activity
    if Security.suspiciousPlayers[identifier] then
        local data = Security.suspiciousPlayers[identifier]
        info.suspiciousCount = data.count
        info.lastSuspicious = data.lastActivity
    end
    
    return info
end

-- Initialize cleanup timer
if JobsRP and JobsRP.Config then
    -- Schedule cleanup every 5 minutes
    if setTimer then
        setTimer(Security.cleanup, 300000, 0)
    end
end

return Security
