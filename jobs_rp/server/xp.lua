-- XP System Module
-- Handles all XP calculations, level progression, and client updates

local XP = {}

-- Get XP required for a specific level (additive progression)
function XP.getXPForLevel(level)
    -- Use civilian additive thresholds from config if available, otherwise default
    local cfg = JobsRP and JobsRP.Config or {}
    local thresholds = cfg.civilian_xp_thresholds or {100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000}
    
    if level >= 1 and level <= #thresholds then
        return thresholds[level]
    else
        -- Fallback to additive formula: 100 * level
        return 100 * level
    end
end

-- Add XP to player with per-level progression system
function XP.addXP(playerId, jobType, xpGain, reason)
    if not xpGain or xpGain <= 0 then
        return false
    end
    
    -- Get player profile
    local profile = JobsRP.Store.getProfileById(playerId)
    if not profile then
        profile = JobsRP.Store.loadProfileById(playerId)
    end
    if not profile then
        print("[XP] ERROR: No profile found for " .. playerId)
        return false
    end
    
    -- Get job state
    local jobState = profile.jobs and profile.jobs[jobType]
    if not jobState then
        jobState = {
            experience = 0,
            xp = 0,
            level = 1,
            grade = 0,
            completedRuns = 0,
            totalEarned = 0
        }
        profile.jobs = profile.jobs or {}
        profile.jobs[jobType] = jobState
    end
    
    -- Handle per-level XP system
    local currentLevelXP = math.floor(JobsRP.toNumber(jobState.experience, 0) or 0)
    local currentLevel = JobsRP.toNumber(jobState.level, 1) or 1
    local requiredXP = XP.getXPForLevel(currentLevel)
    
    -- Add XP to current level
    local newLevelXP = currentLevelXP + xpGain
    local newLevel = currentLevel
    local didLevelUp = false
    
    -- Check for level up and handle multiple level ups
    while newLevelXP >= requiredXP do
        newLevelXP = newLevelXP - requiredXP
        newLevel = newLevel + 1
        didLevelUp = true
        requiredXP = XP.getXPForLevel(newLevel)
    end
    
    -- Update job state with new per-level values
    jobState.experience = newLevelXP
    jobState.xp = newLevelXP
    jobState.level = newLevel
    jobState.grade = 0 -- Could be calculated based on job type if needed
    
    -- Mark profile as dirty for persistence
    JobsRP.Store.markDirty(playerId)
    
    -- Send XP update event to client
    XP.sendXPUpdate(playerId, jobType, xpGain, newLevelXP, requiredXP, newLevel, didLevelUp)
    
    -- Check for achievements
    if JobsRP.Achievements then
        JobsRP.Achievements.checkXPAchievements(playerId, jobType, xpGain, newLevel, didLevelUp)
    end
    
    print("[XP] " .. playerId .. " gained " .. xpGain .. " XP in " .. jobType .. " (Level " .. newLevel .. ", " .. newLevelXP .. "/" .. requiredXP .. " XP)")
    
    return {
        xpGained = xpGain,
        currentLevelXP = newLevelXP,
        requiredXP = requiredXP,
        currentLevel = newLevel,
        didLevelUp = didLevelUp
    }
end

-- Send XP update event to client
function XP.sendXPUpdate(playerId, jobType, xpGained, currentLevelXP, requiredXP, currentLevel, didLevelUp)
    -- Find client for this player
    local client = nil
    if findClientByAccountId then
        client = findClientByAccountId(playerId)
    end
    
    if client and pushClientEvent then
        local ok, err = pcall(function()
            pushClientEvent(client, "jobStats_xpUpdate", {
                jobType = jobType,
                xpGained = xpGained,
                currentLevelXP = currentLevelXP,
                requiredXP = requiredXP,
                currentLevel = currentLevel,
                didLevelUp = didLevelUp
            })
        end)
        if ok then
            print("[XP] Sent XP update to client: " .. playerId .. " gained " .. xpGained .. " XP")
        else
            print("[XP] ERROR: pushClientEvent failed: " .. tostring(err))
        end
    elseif not client then
        print("[XP] Could not find client for accountId: " .. tostring(playerId))
    else
        print("[XP] ERROR: pushClientEvent not available!")
    end
end

-- Get player's current XP and level
function XP.getPlayerXP(playerId, jobType)
    local profile = JobsRP.Store.getProfileById(playerId)
    if not profile then
        profile = JobsRP.Store.loadProfileById(playerId)
    end
    if not profile or not profile.jobs or not profile.jobs[jobType] then
        return { xp = 0, level = 1, requiredXP = 100 }
    end
    
    local jobState = profile.jobs[jobType]
    local level = JobsRP.toNumber(jobState.level, 1) or 1
    local xp = math.floor(JobsRP.toNumber(jobState.experience, 0) or 0)
    local requiredXP = XP.getXPForLevel(level)
    
    return {
        xp = xp,
        level = level,
        requiredXP = requiredXP,
        percent = requiredXP > 0 and (xp / requiredXP) or 0
    }
end

-- Assign to global JobsRP.XP for use by other modules
JobsRP = JobsRP or {}
JobsRP.XP = XP

return XP
