-- XP Commands Module
-- Commands related to XP testing and management

local XPCommands = {}

-- Authentication helper for XP commands
local function requireAuthenticatedAccountId(player)
    -- Use the same method as JobStats - Auth.getAccountId which has multiple fallback methods
    local playerId = nil
    
    print("[XPCommands] DEBUG: requireAuthenticatedAccountId called")
    print("[XPCommands] DEBUG: player type: " .. type(player))
    
    if JobsRP and JobsRP.Auth and JobsRP.Auth.getAccountId then
        print("[XPCommands] DEBUG: Calling Auth.getAccountId")
        playerId = JobsRP.Auth.getAccountId(player)
        print("[XPCommands] DEBUG: Auth.getAccountId returned: " .. tostring(playerId))
    end
    
    print("[XPCommands] DEBUG: Returning playerId: " .. tostring(playerId))
    return playerId
end

-- Test XP command
XPCommands.registerTestXP = function()
    addCommandHandler("testxp", function(...)
        local player = Core.extractClientAndParams("testxp", ...)
        
        if not player then
            print("[XPCommands] /testxp: Could not resolve player")
            return
        end
        
        local playerId = requireAuthenticatedAccountId(player)
        if not playerId then
            return
        end
        
        local profile = JobsRP.Store.getProfileByPlayer(player)
        if not profile then
            return
        end
        
        -- Add test XP
        local testAmount = 50
        if JobsRP.Economy then
            JobsRP.Economy.applyJobReward(playerId, profile.currentJobId or "civilian", 0, testAmount, "test_command")
        end
        
        Jobs.prompt(player, "Test XP added: +" .. testAmount .. " XP", "success")
    end)
end

-- Fill XP command
XPCommands.registerFillXP = function()
    addCommandHandler("fillxp", function(...)
        local player = Core.extractClientAndParams("fillxp", ...)
        
        if not player then
            print("[XPCommands] /fillxp: Could not resolve player")
            return
        end
        
        local playerId = requireAuthenticatedAccountId(player)
        if not playerId then
            return
        end
        
        local profile = JobsRP.Store.getProfileByPlayer(player)
        if not profile then
            return
        end
        
        local currentJob = profile.currentJobId or "civilian"
        
        -- Add enough XP to reach next level threshold
        local cfg = JobsRP.Config or {}
        local thresholds = currentJob == "civilian" and cfg.civilian_xp_thresholds or {100, 200, 400} or cfg.grade_thresholds or {100, 250, 500}
        
        local currentXP = 0
        if profile.jobs and profile.jobs[currentJob] then
            currentXP = profile.jobs[currentJob].experience or 0
        end
        
        local currentLevel = 1
        if profile.jobs and profile.jobs[currentJob] then
            currentLevel = profile.jobs[currentJob].level or 1
        end
        
        -- Find next threshold
        local nextThreshold = thresholds[currentLevel] or (thresholds[#thresholds] or 1000)
        local xpNeeded = nextThreshold - currentXP
        
        if xpNeeded > 0 then
            if JobsRP.Economy then
                JobsRP.Economy.applyJobReward(playerId, currentJob, 0, xpNeeded, "fill_command")
            end
            Jobs.prompt(player, "XP bar filled: +" .. xpNeeded .. " XP (Level " .. (currentLevel + 1) .. ")", "success")
        else
            Jobs.prompt(player, "Already at max level or next threshold unknown", "info")
        end
    end)
end

-- Initialize all XP commands
XPCommands.init = function()
    if not addCommandHandler then
        print("[XPCommands] Command system not available")
        return
    end
    
    XPCommands.registerTestXP()
    XPCommands.registerFillXP()
    
    print("[XPCommands] XP commands registered: /testxp, /fillxp")
end

return XPCommands
