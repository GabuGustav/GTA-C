-- Job Statistics Tracking System
-- Tracks player performance metrics for ranking and achievement systems

JobsRP = JobsRP or {}
JobsRP.JobStats = JobsRP.JobStats or {}

local JobStats = JobsRP.JobStats

-- Load time statistics module
local TimeStats = require("server.time_stats")
if TimeStats then
    JobsRP.TimeStats = TimeStats
    print("[JobStats] Time statistics module loaded")
else
    print("[JobStats] Failed to load time statistics module")
end

local function getConnectedClients()
    local clients = {}
    if getOnlineClients then
        local ok, result = pcall(getOnlineClients)
        if ok and type(result) == "table" then
            clients = result
        end
    end
    if #clients == 0 and getClients then
        local ok2, result2 = pcall(getClients)
        if ok2 and type(result2) == "table" then
            clients = result2
        end
    end
    return clients
end

-- Resolve connected client by authenticated account id with safe fallbacks.
local function findClientByAccountId(accountId)
    if not accountId or accountId == "" then
        return nil
    end

    local target = tostring(accountId)
    local targetNorm = JobsRP.normalizeName(target)
    local matchedByName = nil
    local clients = getConnectedClients()

    for _, client in ipairs(clients) do
        local resolved = nil

        if JobsRP and JobsRP.Auth and JobsRP.Auth.getAccountId then
            local okAuth, account = pcall(JobsRP.Auth.getAccountId, client)
            if okAuth and account then
                resolved = tostring(account)
            end
        end

        if not resolved and JobsRP and JobsRP.Store and JobsRP.Store.getPlayerId then
            local okStore, account2 = pcall(JobsRP.Store.getPlayerId, client)
            if okStore and account2 then
                resolved = tostring(account2)
            end
        end

        if resolved == target then
            return client
        end

        local playerNameNorm = JobsRP.normalizeName(client.name or "")
        if targetNorm ~= "" and playerNameNorm == targetNorm then
            return client
        end
        if targetNorm ~= "" and playerNameNorm ~= "" and string.find(playerNameNorm, targetNorm, 1, true) then
            matchedByName = matchedByName or client
        end
    end

    return matchedByName
end

-- Player statistics storage
JobStats.playerStats = JobStats.playerStats or {}

-- Job types and their stat categories
JobStats.jobTypes = {
    police = {
        arrests_made = 0,
        tickets_issued = 0,
        pursuits_completed = 0,
        time_in_service = 0,
        response_time_avg = 0,
        success_rate = 0,
        civilians_saved = 0,
        vehicles_impounded = 0
    },
    medic = {
        patients_treated = 0,
        lives_saved = 0,
        response_time_avg = 0,
        time_in_service = 0,
        success_rate = 0,
        medical_supplies_used = 0,
        specialized_treatments = 0,
        patient_satisfaction = 0
    },
    mechanic = {
        vehicles_repaired = 0,
        custom_jobs = 0,
        avg_repair_time = 0,
        time_in_service = 0,
        repair_quality = 0,
        parts_used = 0,
        customer_satisfaction = 0,
        emergency_repairs = 0
    },
    civilian = {
        missions_completed = 0,
        properties_owned = 0,
        wealth_earned = 0,
        time_played = 0,
        businesses_created = 0,
        social_interactions = 0,
        community_service = 0,
        legal_status = "clean"
    }
}

-- Experience requirements per level (infinite levels with doubling requirements)
-- Level 1: 100XP, Level 2: 200XP, Level 3: 400XP, etc.
JobStats.experienceRequirements = {
    [1] = 100,  -- Starting level requires 100XP
    [2] = 200,  -- Double previous level
    [3] = 400,  -- Double previous level
    [4] = 800,  -- Double previous level
    [5] = 1600, -- Double previous level
    [6] = 3200, -- Double previous level
    [7] = 6400, -- Double previous level
    [8] = 12800, -- Double previous level
    [9] = 25600, -- Double previous level
    [10] = 51200 -- Double previous level
}

-- Playtime tracking for XP rewards
JobStats.playtimeRewards = {
    firstJoinXP = 15,      -- XP granted on first join
    tenMinuteXP = 10,      -- XP per 10 minutes (first hour)
    doubledXP = 20,        -- XP per 10 minutes (after 1 hour)
    rewardInterval = 600,  -- 10 minutes in seconds
    doubleThreshold = 3600 -- 1 hour in seconds
}

-- Player playtime session tracking
JobStats.playerSessions = JobStats.playerSessions or {}

-- Initialize player statistics
function JobStats.initPlayerStats(accountId, jobType)
    if not JobStats.playerStats[accountId] then
        JobStats.playerStats[accountId] = {}
    end
    
    if not JobStats.playerStats[accountId][jobType] then
        JobStats.playerStats[accountId][jobType] = {
            stats = {},
            experience = 0,
            level = 1,
            lastUpdated = JobsRP.nowSeconds(),
            sessionStart = JobsRP.nowSeconds()
        }
        
        -- Initialize all stats for this job type
        for statName, defaultValue in pairs(JobStats.jobTypes[jobType]) do
            JobStats.playerStats[accountId][jobType].stats[statName] = defaultValue
        end
    end
    
    return JobStats.playerStats[accountId][jobType]
end

-- Update player statistic
function JobStats.updateStat(accountId, jobType, statName, value, operation)
    local playerJobStats = JobStats.initPlayerStats(accountId, jobType)
    
    if not playerJobStats.stats[statName] then
        print("[JobStats] Unknown stat: " .. statName .. " for job: " .. jobType)
        return false
    end
    
    local oldValue = playerJobStats.stats[statName]
    
    if operation == "add" then
        playerJobStats.stats[statName] = oldValue + value
    elseif operation == "set" then
        playerJobStats.stats[statName] = value
    elseif operation == "multiply" then
        playerJobStats.stats[statName] = oldValue * value
    else
        playerJobStats.stats[statName] = value
    end
    
    playerJobStats.lastUpdated = JobsRP.nowSeconds()
    
    -- Calculate experience gain for this stat update
    local experienceGained = JobStats.calculateExperienceGain(jobType, statName, value, operation)
    if experienceGained > 0 then
        JobStats.addExperience(accountId, jobType, experienceGained)
    end
    
    print("[JobStats] Updated " .. accountId .. " " .. jobType .. "." .. statName .. ": " .. oldValue .. " -> " .. playerJobStats.stats[statName])
    
    return true
end

-- Calculate experience gain for stat updates
function JobStats.calculateExperienceGain(jobType, statName, value, operation)
    local baseXP = 0
    
    -- Base experience values for different stat types
    local statXPValues = {
        police = {
            arrests_made = 10,
            tickets_issued = 5,
            pursuits_completed = 15,
            civilians_saved = 20,
            vehicles_impounded = 8
        },
        medic = {
            patients_treated = 8,
            lives_saved = 25,
            specialized_treatments = 12,
            patient_satisfaction = 3
        },
        mechanic = {
            vehicles_repaired = 6,
            custom_jobs = 12,
            emergency_repairs = 15,
            customer_satisfaction = 4
        },
        civilian = {
            missions_completed = 10,
            properties_owned = 50,
            wealth_earned = 1, -- 1 XP per $1000 earned
            businesses_created = 30,
            community_service = 8
        }
    }
    
    local jobXPValues = statXPValues[jobType]
    if jobXPValues and jobXPValues[statName] then
        baseXP = jobXPValues[statName]
    end
    
    -- Apply operation modifier
    if operation == "add" then
        -- For civilian playtime XP, return the XP amount directly
        if jobType == "civilian" then
            return value
        else
            return baseXP * value
        end
    elseif operation == "set" then
        -- For set operations, calculate difference
        return baseXP
    else
        return baseXP
    end
end

-- XP system moved to Economy module - this function now redirects to Economy
function JobStats.addExperience(accountId, jobType, experience)
    if JobsRP.Economy and JobsRP.Economy.applyJobReward then
        JobsRP.Economy.applyJobReward(accountId, jobType, 0, experience, "jobstats_legacy")
    else
        print("[JobStats] ERROR: Economy module not available for XP handling")
    end
    return false
end

-- Get XP required for a specific level (additive progression)
function JobStats.getXPForLevel(level)
    -- Use civilian additive thresholds from config if available, otherwise default
    local cfg = JobsRP and JobsRP.Config or {}
    local thresholds = cfg.civilian_xp_thresholds or {100, 200, 300, 400, 500, 600, 700, 800, 900, 1000}
    
    if level >= 1 and level <= #thresholds then
        return thresholds[level]
    else
        -- Fallback to additive formula: 100 * level
        return 100 * level
    end
end

-- Get player statistics
function JobStats.getPlayerStats(accountId, jobType)
    if not JobStats.playerStats[accountId] then
        return nil
    end
    
    if jobType then
        return JobStats.playerStats[accountId][jobType]
    else
        return JobStats.playerStats[accountId]
    end
end

-- Get all players' stats for syncing
function JobStats.getAllPlayerStats()
    local allStats = {}
    
    for accountId, playerData in pairs(JobStats.playerStats) do
        for jobType, jobData in pairs(playerData) do
            table.insert(allStats, {
                username = accountId,
                jobType = jobType,
                stats = jobData.stats,
                experience = jobData.experience,
                newLevel = jobData.level
            })
        end
    end
    
    return allStats
end

-- Redirect to Achievement module
function JobStats.checkAchievements(accountId, jobType)
    if JobsRP.Achievements then
        return JobsRP.Achievements.checkJobAchievements(accountId, jobType, JobStats.getPlayerStats(accountId, jobType).stats or {})
    else
        print("[JobStats] ERROR: Achievement module not available")
        return {}
    end
end

-- Playtime tracking functions for XP rewards

-- Initialize player session for playtime tracking
function JobStats.initPlayerSession(accountId)
    print("[JobStats] DEBUG: initPlayerSession called for " .. accountId)
    
    if not JobStats.playerSessions[accountId] then
        -- Check if player already has XP (prevent duplicate first join XP)
        -- Check both in-memory stats AND persisted profile
        local existingXP = 0
        
        -- Check in-memory stats
        if JobStats.playerStats[accountId] and JobStats.playerStats[accountId]["civilian"] then
            existingXP = JobStats.playerStats[accountId]["civilian"].experience or 0
        end
        
        -- Check persisted profile (more reliable for reconnections)
        if existingXP == 0 and JobsRP.Store then
            local profile = JobsRP.Store.getProfileById(accountId)
            if not profile then
                profile = JobsRP.Store.loadProfileById(accountId)
            end
            if profile and profile.jobs and profile.jobs["civilian"] then
                existingXP = math.floor(profile.jobs["civilian"].experience or profile.jobs["civilian"].xp or 0)
            end
        end
        
        JobStats.playerSessions[accountId] = {
            sessionStart = JobsRP.nowSeconds(),
            lastRewardTime = JobsRP.nowSeconds(),
            totalPlaytime = 0,
            isFirstJoin = true,
            sessionPlaytime = 0
        }
        print("[JobStats] Initialized playtime session for " .. accountId)
        
        -- Only grant first join XP if player doesn't already have XP
        if existingXP == 0 then
            JobStats.addExperience(accountId, "civilian", JobStats.playtimeRewards.firstJoinXP)
            print("[JobStats] Granted " .. JobStats.playtimeRewards.firstJoinXP .. " XP to " .. accountId .. " for first join")
        else
            print("[JobStats] Skipped first join XP for " .. accountId .. " - already has " .. existingXP .. " XP")
        end
        
        -- Load XP from profile if exists
        if existingXP > 0 then
            local playerJobStats = JobStats.playerStats[accountId]
            if playerJobStats and playerJobStats["civilian"] then
                playerJobStats["civilian"].experience = existingXP
                playerJobStats["civilian"].level = JobStats.calculateLevel(existingXP)
                print("[JobStats] Loaded XP from profile for " .. accountId .. ": " .. existingXP .. " XP, Level " .. playerJobStats["civilian"].level .. " (recalculated)")
            end
        end
    end
    
    -- Debug: Verify session was created
    local session = JobStats.playerSessions[accountId]
    if session then
        print("[JobStats] DEBUG: Session verified for " .. accountId .. " - Start: " .. session.sessionStart .. ", LastReward: " .. session.lastRewardTime)
    else
        print("[JobStats] ERROR: Failed to create session for " .. accountId)
    end
end

-- Update player playtime and grant XP rewards
function JobStats.updatePlaytimeRewards(accountId)
    local session = JobStats.playerSessions[accountId]
    if not session then
        print("[JobStats] DEBUG: No session found for " .. accountId)
        return
    end
    
    local currentTime = JobsRP.nowSeconds()
    local sessionDuration = currentTime - session.sessionStart
    local totalDuration = session.totalPlaytime + sessionDuration
    local timeSinceLastReward = currentTime - session.lastRewardTime
    
    print("[JobStats] DEBUG: " .. accountId .. " - Session: " .. sessionDuration .. "s, Total: " .. totalDuration .. "s, Since last reward: " .. timeSinceLastReward .. "s")
    
    -- Check if it's time for a reward (every 10 minutes)
    if timeSinceLastReward >= JobStats.playtimeRewards.rewardInterval then
        local xpReward = JobStats.playtimeRewards.tenMinuteXP
        
        -- Double XP after 1 hour of continuous playtime
        if sessionDuration >= JobStats.playtimeRewards.doubleThreshold then
            xpReward = JobStats.playtimeRewards.doubledXP
            print("[JobStats] DEBUG: " .. accountId .. " - Double XP active (session: " .. sessionDuration .. "s >= " .. JobStats.playtimeRewards.doubleThreshold .. "s)")
        end
        
        -- Grant XP reward through Economy system
        if JobsRP.Economy then
            JobsRP.Economy.applyJobReward(accountId, "civilian", 0, xpReward, "passive_playtime")
        end
        
        -- Update playtime stats using time stats module
        if JobsRP.TimeStats then
            JobsRP.TimeStats.updateTimeStats()
        end
        
        -- Reset reward timer
        session.lastRewardTime = currentTime
        session.totalPlaytime = totalDuration
        
        print("[JobStats] Granted " .. xpReward .. " XP to " .. accountId .. " for playtime (total: " .. totalDuration .. "s)")
    else
        print("[JobStats] DEBUG: " .. accountId .. " - Not time for reward yet (need " .. (JobStats.playtimeRewards.rewardInterval - timeSinceLastReward) .. "s more)")
    end
end

-- Clean up player session on disconnect
function JobStats.cleanupPlayerSession(accountId)
    local session = JobStats.playerSessions[accountId]
    if session then
        local currentTime = JobsRP.nowSeconds()
        local sessionDuration = currentTime - session.sessionStart
        session.totalPlaytime = session.totalPlaytime + sessionDuration
        
        -- Update final playtime stat
        JobStats.updateStat(accountId, "civilian", "time_played", sessionDuration, "add")
        
        print("[JobStats] Cleaned up session for " .. accountId .. " (total playtime: " .. session.totalPlaytime .. "s)")
    end
end

-- Reset all player statistics and accounts
function JobStats.resetAllAccounts()
    print("[JobStats] RESETTING ALL PLAYER ACCOUNTS AND STATISTICS...")
    
    -- Clear all player statistics
    JobStats.playerStats = {}
    print("[JobStats] Cleared all player statistics")
    
    -- Clear all playtime sessions
    JobStats.playerSessions = {}
    print("[JobStats] Cleared all playtime sessions")
    
    -- Clear web sync queue and status files
    local queueFile = "data/web_api_queue.json"
    local statusFile = "data/web_sync_status.json"
    
    if saveTextFile then
        saveTextFile(queueFile, "[]")
        saveTextFile(statusFile, "{}")
        print("[JobStats] Cleared web sync files")
    end
    
    print("[JobStats] ACCOUNT RESET COMPLETE - All players start fresh with new playtime XP system")
end

-- Initialize the job stats system
function JobStats.init()
    print("[JobStats] Initializing job statistics system")
    
    -- Set up periodic time updates (every 5 minutes)
    if setInterval then
        setInterval(JobStats.updateTimeStats, 5 * 60 * 1000)
    end
    
    -- Set up playtime reward checks (every 1 minute)
    if setInterval then
        setInterval(function()
            print("[JobStats] DEBUG: Checking playtime rewards for all players...")
            -- Check all connected players for playtime rewards
            local okClients, clients = pcall(getClients)
            if okClients and type(clients) == "table" then
                print("[JobStats] DEBUG: Found " .. #clients .. " connected players")
                for _, client in ipairs(clients) do
                    -- Get accountId from Auth system or fallback to Store system
                    local accountId = nil
                    
                    -- Try Auth system first
                    if JobsRP and JobsRP.Auth and JobsRP.Auth.getAccountId then
                        accountId = JobsRP.Auth.getAccountId(client)
                        print("[JobStats] DEBUG: Auth.getAccountId returned: " .. tostring(accountId))
                    end
                    
                    -- Fallback: Try Store system if Auth fails
                    if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
                        accountId = JobsRP.Store.getPlayerId(client)
                        print("[JobStats] DEBUG: Store.getPlayerId returned: " .. tostring(accountId))
                    end
                    
                    -- Final fallback: Use player name as accountId if still no accountId
                    if not accountId and client.name then
                        accountId = JobsRP.normalizeName(client.name)
                        print("[JobStats] DEBUG: Using player name as accountId: " .. accountId)
                        
                        -- Attach to Store system if not already attached
                        if JobsRP.Store and JobsRP.Store.attachPlayerAccount then
                            JobsRP.Store.attachPlayerAccount(client, accountId)
                            print("[JobStats] DEBUG: Attached player to Store with accountId: " .. accountId)
                        end
                    end
                    
                    -- Additional debugging
                    local session = JobsRP.Auth and JobsRP.Auth.getSession and JobsRP.Auth.getSession(client)
                    if session then
                        print("[JobStats] DEBUG: Session exists - authenticated: " .. tostring(session.authenticated) .. ", accountId: " .. tostring(session.accountId))
                    else
                        print("[JobStats] DEBUG: No session found for player")
                    end
                    
                    if accountId then
                        print("[JobStats] DEBUG: Checking player " .. (client.name or "Unknown") .. " (ID: " .. accountId .. ")")
                        
                        -- Check if session exists, create if missing
                        local session = JobStats.playerSessions[accountId]
                        if not session then
                            print("[JobStats] DEBUG: Creating missing session for " .. accountId)
                            JobStats.initPlayerSession(accountId)
                        end
                        
                        JobStats.updatePlaytimeRewards(accountId)
                    else
                        print("[JobStats] DEBUG: Player " .. (client.name or "Unknown") .. " has no accountId - using name fallback")
                    end
                end
            else
                print("[JobStats] DEBUG: Failed to get clients list")
            end
        end, 60 * 1000) -- Check every minute
    else
        print("[JobStats] ERROR: setInterval not available - playtime rewards disabled")
    end
    
    print("[JobStats] Job statistics system loaded with playtime rewards")
end

-- Initialize on load
JobStats.init()

-- Auto-reset all accounts for new playtime XP system
print("[JobStats] AUTO-RESETTING ACCOUNTS FOR NEW PLAYTIME XP SYSTEM...")
JobStats.resetAllAccounts()

print("[JobStats] Job stats module loaded")
