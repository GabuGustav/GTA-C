-- Achievement System Module
-- Handles all achievement checking and unlocking logic

local Achievement = {}

-- Achievement definitions
local achievementDefinitions = {
    -- Police achievements
    police = {
        first_arrest = {
            id = "first_arrest",
            name = "First Arrest",
            description = "Make your first arrest as a police officer",
            condition = function(stats) return stats.arrests_made >= 1 end
        },
        veteran_officer = {
            id = "veteran_officer",
            name = "Veteran Officer",
            description = "Make 50 arrests",
            condition = function(stats) return stats.arrests_made >= 50 end
        },
        pursuit_master = {
            id = "pursuit_master",
            name = "Pursuit Master",
            description = "Complete 10 vehicle pursuits",
            condition = function(stats) return stats.pursuits_completed >= 10 end
        }
    },
    
    -- Medic achievements
    medic = {
        first_save = {
            id = "first_save",
            name = "First Save",
            description = "Save your first life as a medic",
            condition = function(stats) return stats.lives_saved >= 1 end
        },
        lifesaver = {
            id = "lifesaver",
            name = "Lifesaver",
            description = "Save 25 lives",
            condition = function(stats) return stats.lives_saved >= 25 end
        }
    },
    
    -- Mechanic achievements
    mechanic = {
        first_repair = {
            id = "first_repair",
            name = "First Repair",
            description = "Repair your first vehicle",
            condition = function(stats) return stats.vehicles_repaired >= 1 end
        },
        master_mechanic = {
            id = "master_mechanic",
            name = "Master Mechanic",
            description = "Repair 100 vehicles",
            condition = function(stats) return stats.vehicles_repaired >= 100 end
        }
    },
    
    -- Civilian achievements
    civilian = {
        first_mission = {
            id = "first_mission",
            name = "First Mission",
            description = "Complete your first civilian mission",
            condition = function(stats) return stats.missions_completed >= 1 end
        },
        property_owner = {
            id = "property_owner",
            name = "Property Owner",
            description = "Own your first property",
            condition = function(stats) return stats.properties_owned >= 1 end
        }
    }
}

-- Global level achievements (apply to all jobs)
local levelAchievements = {
    {
        id = "experienced",
        name = "Experienced Worker",
        description = "Reach level 5 in any job",
        condition = function(level) return level >= 5 end
    },
    {
        id = "master",
        name = "Master Worker",
        description = "Reach maximum level in any job",
        condition = function(level) return level >= 10 end
    }
}

-- Check XP-related achievements
function Achievement.checkXPAchievements(playerId, jobType, xpGained, newLevel, didLevelUp)
    if not didLevelUp then
        return {}
    end
    
    local achievements = {}
    
    -- Check level achievements
    for _, achievement in ipairs(levelAchievements) do
        if achievement.condition(newLevel) then
            table.insert(achievements, {
                id = achievement.id .. "_" .. jobType,
                name = achievement.name,
                description = achievement.description,
                jobType = jobType
            })
        end
    end
    
    -- Send achievements to client and web if any were earned
    if #achievements > 0 then
        Achievement.sendAchievements(playerId, achievements)
    end
    
    return achievements
end

-- Check job-specific achievements based on stats
function Achievement.checkJobAchievements(playerId, jobType, stats)
    local jobAchievements = achievementDefinitions[jobType]
    if not jobAchievements then
        return {}
    end
    
    local achievements = {}
    
    -- Check each achievement for this job
    for _, achievement in pairs(jobAchievements) do
        if achievement.condition(stats) then
            table.insert(achievements, {
                id = achievement.id,
                name = achievement.name,
                description = achievement.description,
                jobType = jobType
            })
        end
    end
    
    -- Send achievements to client and web if any were earned
    if #achievements > 0 then
        Achievement.sendAchievements(playerId, achievements)
    end
    
    return achievements
end

-- Send achievements to client and web integration
function Achievement.sendAchievements(playerId, achievements)
    if #achievements == 0 then
        return
    end
    
    -- Send to client for display
    local client = findClientByAccountId(playerId)
    if client and pushClientEvent then
        local ok, err = pcall(function()
            pushClientEvent(client, "jobStats_achievementUnlocked", {
                achievements = achievements
            })
        end)
        if ok then
            print("[Achievement] Sent " .. #achievements .. " achievements to client for " .. playerId)
        else
            print("[Achievement] ERROR: Failed to send achievements: " .. tostring(err))
        end
    end
    
    -- Send to website if integration is enabled
    if JobsRP.Config.web_integration_enabled and JobsRP.HttpClient then
        JobsRP.HttpClient.updateAchievements(playerId, achievements, function(success, response)
            if success then
                print("[Achievement] Updated achievements for " .. playerId .. ": " .. #achievements .. " new achievements")
            else
                print("[Achievement] Failed to update achievements for " .. playerId .. ": " .. tostring(response))
            end
        end)
    end
end

-- Get all achievements for a job type
function Achievement.getAchievementDefinitions(jobType)
    return achievementDefinitions[jobType] or {}
end

-- Get level achievements
function Achievement.getLevelAchievements()
    return levelAchievements
end

return Achievement
