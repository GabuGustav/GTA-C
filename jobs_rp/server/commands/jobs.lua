-- Job Commands Module
-- Handles /job command and subcommands

local JobCommands = {}

-- Utility functions
local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

local function chat(player, message, r, g, b)
    -- Always try outputChatBox first for player-facing messages
    if outputChatBox then
        outputChatBox(message, player, r or 180, g or 220, b or 255)
        return
    end
    -- Fallback to JobsRP.Jobs.chat if available
    if JobsRP.Jobs and JobsRP.Jobs.chat then
        JobsRP.Jobs.chat(player, message, r, g, b)
    end
end

local function showJobHelp(player)
    chat(player, "[Jobs] Commands:", 180, 220, 255)
    chat(player, "[Jobs] /job help - Show this help", 180, 220, 255)
    chat(player, "[Jobs] /job list - List available jobs", 180, 220, 255)
    chat(player, "[Jobs] /job join <taxi|robbery|police> - Join a job", 180, 220, 255)
    chat(player, "[Jobs] /job leave - Leave current job", 180, 220, 255)
    chat(player, "[Jobs] /job start - Start job run", 180, 220, 255)
    chat(player, "[Jobs] /job stop - Stop job run", 180, 220, 255)
    chat(player, "[Jobs] /job status - Check job status", 180, 220, 255)
    chat(player, "[Jobs] /job paycheck - Collect paycheck", 180, 220, 255)
end

local function requireAuth(player)
    if not JobsRP.Config.auth_required then
        return true
    end
    if JobsRP.Auth and JobsRP.Auth.isAuthenticated and JobsRP.Auth.isAuthenticated(player) then
        return true
    end
    chat(player, "[Jobs] Use /jobauth register or /jobauth login before using jobs.", 255, 120, 120)
    return false
end

-- Handle /job command
function JobCommands.handle(player, words)
    print("[JobCommands] handle() called")
    print("[JobCommands] words[1] = " .. tostring(words[1]))
    print("[JobCommands] words count = " .. #words)
    
    if not requireAuth(player) then
        print("[JobCommands] Auth check failed")
        return
    end
    
    local sub = normalizeToken(words[1] or "help")
    print("[JobCommands] subcommand = '" .. sub .. "'")
    
    if sub == "help" then
        showJobHelp(player)
        return
    end
    
    if sub == "list" then
        if JobsRP.Jobs and JobsRP.Jobs.requestList then
            JobsRP.Jobs.requestList(player)
        end
        return
    end
    
    if sub == "join" then
        if not words[2] then
            chat(player, "[Jobs] Usage: /job join <taxi|robbery|police>", 255, 180, 120)
            return
        end
        if JobsRP.Jobs and JobsRP.Jobs.joinJob then
            JobsRP.Jobs.joinJob(player, words[2])
        end
        return
    end
    
    if sub == "leave" then
        if JobsRP.Jobs and JobsRP.Jobs.leaveJob then
            JobsRP.Jobs.leaveJob(player)
        end
        return
    end
    
    if sub == "start" then
        if JobsRP.Jobs and JobsRP.Jobs.startJob then
            JobsRP.Jobs.startJob(player)
        end
        return
    end
    
    if sub == "stop" then
        if JobsRP.Jobs and JobsRP.Jobs.stopJob then
            JobsRP.Jobs.stopJob(player, "Run stopped.")
        end
        return
    end
    
    if sub == "status" then
        if JobsRP.Jobs and JobsRP.Jobs.requestStatus then
            JobsRP.Jobs.requestStatus(player)
        end
        return
    end
    
    if sub == "paycheck" then
        local profile = JobsRP.Store and JobsRP.Store.getProfileByPlayer and JobsRP.Store.getProfileByPlayer(player)
        if not profile then
            chat(player, "[Jobs] No authenticated profile loaded.", 255, 120, 120)
            return
        end
        if JobsRP.Jobs and JobsRP.Jobs.requestPaycheck then
            JobsRP.Jobs.requestPaycheck(player)
        end
        return
    end
    
    -- Debug commands
    if sub == "next" then
        if JobsRP.Jobs and JobsRP.Jobs.debugNext then
            JobsRP.Jobs.debugNext(player)
        end
        return
    end
    
    if sub == "finish" then
        if JobsRP.Jobs and JobsRP.Jobs.debugFinish then
            JobsRP.Jobs.debugFinish(player)
        end
        return
    end
    
    chat(player, "[Jobs] Unknown subcommand. Use /job help.", 255, 120, 120)
end

-- Track if already registered
local _jobRegistered = false

-- Register job command
JobCommands.register = function()
    if not addCommandHandler then
        print("[JobCommands] Command system not available")
        return
    end
    
    if _jobRegistered then
        print("[JobCommands] /job already registered, skipping")
        return
    end
    
    _jobRegistered = true
    
    addCommandHandler("job", function(...)
        print("[JobCommands] /job handler triggered")
        
        -- Check if Core is available
        if not Core then
            print("[JobCommands] ERROR: Core is nil!")
            return
        end
        
        if not Core.extractClientAndParams then
            print("[JobCommands] ERROR: Core.extractClientAndParams is nil!")
            return
        end
        
        local client, parameters = Core.extractClientAndParams("job", ...)
        print("[JobCommands] client resolved: " .. tostring(client and client.name or "nil"))
        print("[JobCommands] parameters: '" .. tostring(parameters) .. "'")
        
        if not client then
            print("[JobCommands] /job ignored: client not resolved")
            return
        end
        
        -- Convert parameters string to words (like original)
        local words = Core.toWords(parameters)
        print("[JobCommands] words count: " .. #words)
        for i, w in ipairs(words) do
            print("[JobCommands] words[" .. i .. "] = '" .. tostring(w) .. "'")
        end
        
        -- Remove first word if it equals the command name (handles "/job job join")
        if words[1] and Core.normalizeToken(words[1]) == "job" then
            table.remove(words, 1)
            print("[JobCommands] removed duplicate 'job' from words")
        end
        
        JobCommands.handle(client, words)
    end)
    
    print("[JobCommands] /job command registered")
end

return JobCommands
