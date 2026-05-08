-- Time Statistics Module
-- Handles time-based statistics tracking for players

local TimeStats = {}

-- Update time-based stats (call this periodically)
function TimeStats.updateTimeStats()
    local now = JobsRP.nowSeconds()
    
    for accountId, playerData in pairs(JobsRP.JobStats.playerStats) do
        for jobType, jobData in pairs(playerData) do
            -- Update time in service / time played
            local timeDiff = now - jobData.lastUpdated
            if timeDiff > 0 and timeDiff < 300 then -- Only count if reasonably recent (5 minutes)
                if jobType == "civilian" then
                    JobsRP.JobStats.updateStat(accountId, jobType, "time_played", timeDiff / 3600, "add") -- Convert to hours
                else
                    JobsRP.JobStats.updateStat(accountId, jobType, "time_in_service", timeDiff / 3600, "add")
                end
            end
            jobData.lastUpdated = now
        end
    end
end

-- Get time statistics for a player
function TimeStats.getTimeStats(accountId, jobType)
    local playerData = JobsRP.JobStats.playerStats[accountId]
    if not playerData then
        return nil
    end
    
    local jobData = playerData[jobType]
    if not jobData then
        return nil
    end
    
    return {
        time_played = jobData.stats.time_played or 0,
        time_in_service = jobData.stats.time_in_service or 0,
        last_updated = jobData.lastUpdated
    }
end

-- Get leaderboard data for job type
function TimeStats.getLeaderboard(jobType, limit)
    limit = limit or 10
    local leaderboard = {}
    
    for accountId, playerData in pairs(JobsRP.JobStats.playerStats) do
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
        results[i] = leaderboard[i]
    end
    
    return results
end

-- Initialize time stats system
TimeStats.init = function()
    -- Set up periodic update timer (every minute)
    setInterval(function()
        TimeStats.updateTimeStats()
    end, 60 * 1000)
    
    print("[TimeStats] Time statistics system initialized")
end

return TimeStats
