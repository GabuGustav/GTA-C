-- Job Statistics Tracking System
-- Tracks player performance metrics for ranking and achievement systems

JobsRP = JobsRP or {}
JobsRP.JobStats = JobsRP.JobStats or {}

local JobStats = JobsRP.JobStats

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

-- Experience requirements per level
JobStats.experienceRequirements = {
    [1] = 0,
    [2] = 100,
    [3] = 250,
    [4] = 500,
    [5] = 1000,
    [6] = 1750,
    [7] = 3000,
    [8] = 5000,
    [9] = 8000,
    [10] = 12000
}

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
        return baseXP * value
    elseif operation == "set" then
        -- For set operations, calculate difference
        return baseXP
    else
        return baseXP
    end
end

-- Add experience to player
function JobStats.addExperience(accountId, jobType, experience)
    local playerJobStats = JobStats.initPlayerStats(accountId, jobType)
    
    local oldLevel = playerJobStats.level
    playerJobStats.experience = playerJobStats.experience + experience
    
    -- Check for level up
    local newLevel = JobStats.calculateLevel(playerJobStats.experience)
    if newLevel > oldLevel then
        playerJobStats.level = newLevel
        print("[JobStats] " .. accountId .. " leveled up to " .. newLevel .. " in " .. jobType)
        
        -- Trigger level up event
        if triggerNetworkEvent then
            local client = getClientFromName(accountId)
            if client then
                triggerNetworkEvent("jobStats_levelUp", client, {
                    jobType = jobType,
                    newLevel = newLevel,
                    experience = playerJobStats.experience
                })
            end
        end
        
        -- Check for achievements
        JobStats.checkAchievements(accountId, jobType)
    end
    
    return newLevel > oldLevel
end

-- Calculate level based on experience
function JobStats.calculateLevel(experience)
    for level, reqXP in pairs(JobStats.experienceRequirements) do
        if experience < reqXP then
            return math.max(1, level - 1)
        end
    end
    return 10 -- Max level
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

-- Check and unlock achievements
function JobStats.checkAchievements(accountId, jobType)
    local playerJobStats = JobStats.getPlayerStats(accountId, jobType)
    if not playerJobStats then
        return
    end
    
    local achievements = {}
    
    -- Check for various achievement conditions
    if jobType == "police" then
        if playerJobStats.stats.arrests_made >= 1 then
            table.insert(achievements, {
                id = "first_arrest",
                name = "First Arrest",
                description = "Make your first arrest as a police officer",
                job_type = "police"
            })
        end
        
        if playerJobStats.stats.arrests_made >= 50 then
            table.insert(achievements, {
                id = "veteran_officer",
                name = "Veteran Officer",
                description = "Make 50 arrests",
                job_type = "police"
            })
        end
        
        if playerJobStats.stats.pursuits_completed >= 10 then
            table.insert(achievements, {
                id = "pursuit_master",
                name = "Pursuit Master",
                description = "Complete 10 vehicle pursuits",
                job_type = "police"
            })
        end
    elseif jobType == "medic" then
        if playerJobStats.stats.lives_saved >= 1 then
            table.insert(achievements, {
                id = "first_save",
                name = "First Save",
                description = "Save your first life as a medic",
                job_type = "medic"
            })
        end
        
        if playerJobStats.stats.lives_saved >= 25 then
            table.insert(achievements, {
                id = "lifesaver",
                name = "Lifesaver",
                description = "Save 25 lives",
                job_type = "medic"
            })
        end
    elseif jobType == "mechanic" then
        if playerJobStats.stats.vehicles_repaired >= 1 then
            table.insert(achievements, {
                id = "first_repair",
                name = "First Repair",
                description = "Repair your first vehicle",
                job_type = "mechanic"
            })
        end
        
        if playerJobStats.stats.vehicles_repaired >= 100 then
            table.insert(achievements, {
                id = "master_mechanic",
                name = "Master Mechanic",
                description = "Repair 100 vehicles",
                job_type = "mechanic"
            })
        end
    elseif jobType == "civilian" then
        if playerJobStats.stats.missions_completed >= 1 then
            table.insert(achievements, {
                id = "first_mission",
                name = "First Mission",
                description = "Complete your first civilian mission",
                job_type = "civilian"
            })
        end
        
        if playerJobStats.stats.properties_owned >= 1 then
            table.insert(achievements, {
                id = "property_owner",
                name = "Property Owner",
                description = "Own your first property",
                job_type = "civilian"
            })
        end
    end
    
    -- Level achievements
    if playerJobStats.level >= 5 then
        table.insert(achievements, {
            id = "experienced_" .. jobType,
            name = "Experienced " .. string.upper(string.sub(jobType, 1, 1)) .. string.sub(jobType, 2),
            description = "Reach level 5 in " .. jobType,
            job_type = jobType
        })
    end
    
    if playerJobStats.level >= 10 then
        table.insert(achievements, {
            id = "master_" .. jobType,
            name = "Master " .. string.upper(string.sub(jobType, 1, 1)) .. string.sub(jobType, 2),
            description = "Reach maximum level in " .. jobType,
            job_type = jobType
        })
    end
    
    -- Send achievements to website if integration is enabled
    if #achievements > 0 and JobsRP.Config.web_integration_enabled and JobsRP.HttpClient then
        JobsRP.HttpClient.updateAchievements(accountId, achievements, function(success, response)
            if success then
                print("[JobStats] Updated achievements for " .. accountId .. ": " .. #achievements .. " new achievements")
            else
                print("[JobStats] Failed to update achievements for " .. accountId .. ": " .. tostring(response))
            end
        end)
    end
    
    return achievements
end

-- Update time-based stats (call this periodically)
function JobStats.updateTimeStats()
    local now = JobsRP.nowSeconds()
    
    for accountId, playerData in pairs(JobStats.playerStats) do
        for jobType, jobData in pairs(playerData) do
            -- Update time in service / time played
            local timeDiff = now - jobData.lastUpdated
            if timeDiff > 0 and timeDiff < 300 then -- Only count if reasonably recent (5 minutes)
                if jobType == "civilian" then
                    JobStats.updateStat(accountId, jobType, "time_played", timeDiff / 3600, "add") -- Convert to hours
                else
                    JobStats.updateStat(accountId, jobType, "time_in_service", timeDiff / 3600, "add")
                end
            end
            jobData.lastUpdated = now
        end
    end
end

-- Get leaderboard data for job type
function JobStats.getLeaderboard(jobType, limit)
    limit = limit or 10
    local leaderboard = {}
    
    for accountId, playerData in pairs(JobStats.playerStats) do
        local jobData = playerData[jobType]
        if jobData then
            table.insert(leaderboard, {
                username = accountId,
                level = jobData.level,
                experience = jobData.experience,
                stats = jobData.stats
            })
        end
    end
    
    -- Sort by experience, then by level
    table.sort(leaderboard, function(a, b)
        if a.experience ~= b.experience then
            return a.experience > b.experience
        end
        return a.level > b.level
    end)
    
    -- Return top results
    local results = {}
    for i = 1, math.min(limit, #leaderboard) do
        table.insert(results, leaderboard[i])
    end
    
    return results
end

-- Initialize the job stats system
function JobStats.init()
    print("[JobStats] Initializing job statistics system")
    
    -- Set up periodic time updates (every 5 minutes)
    if setInterval then
        setInterval(JobStats.updateTimeStats, 5 * 60 * 1000)
    end
    
    print("[JobStats] Job statistics system loaded")
end

-- Initialize on load
JobStats.init()

print("[JobStats] Job stats module loaded")
