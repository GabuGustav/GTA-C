-- JobDiag Commands Module
-- Handles /jobdiag diagnostic commands

local JobDiagCommands = {}

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

local function showJobDiagHelp(player)
    chat(player, "[JobsDiag] Diagnostic Commands:", 180, 220, 255)
    chat(player, "[JobsDiag] /jobdiag help - Show this help", 180, 220, 255)
    chat(player, "[JobsDiag] /jobdiag status - Show system status", 180, 220, 255)
    chat(player, "[JobsDiag] /jobdiag auth - Show authentication status", 180, 220, 255)
    chat(player, "[JobsDiag] /jobdiag profile - Show profile info", 180, 220, 255)
    chat(player, "[JobsDiag] /jobdiag session - Show session info", 180, 220, 255)
end

-- Handle /jobdiag command
function JobDiagCommands.handle(player, words)
    local sub = normalizeToken(words[1] or "help")
    
    if sub == "help" then
        showJobDiagHelp(player)
        return
    end
    
    if sub == "status" then
        chat(player, "[JobsDiag] === System Status ===", 180, 220, 255)
        chat(player, "[JobsDiag] JobsRP.Auth: " .. (JobsRP.Auth and "loaded" or "NOT loaded"), 180, 220, 255)
        chat(player, "[JobsDiag] JobsRP.Jobs: " .. (JobsRP.Jobs and "loaded" or "NOT loaded"), 180, 220, 255)
        chat(player, "[JobsDiag] JobsRP.Store: " .. (JobsRP.Store and "loaded" or "NOT loaded"), 180, 220, 255)
        chat(player, "[JobsDiag] JobsRP.Economy: " .. (JobsRP.Economy and "loaded" or "NOT loaded"), 180, 220, 255)
        return
    end
    
    if sub == "auth" then
        chat(player, "[JobsDiag] === Authentication Status ===", 180, 220, 255)
        
        local isAuth = JobsRP.Auth and JobsRP.Auth.isAuthenticated and JobsRP.Auth.isAuthenticated(player)
        chat(player, "[JobsDiag] Authenticated: " .. (isAuth and "Yes" or "No"), isAuth and 120 or 255, 255, isAuth and 120 or 120)
        
        if isAuth then
            local accountId = JobsRP.Auth.getAccountId(player)
            chat(player, "[JobsDiag] Account ID: " .. tostring(accountId), 180, 220, 255)
        end
        return
    end
    
    if sub == "profile" then
        chat(player, "[JobsDiag] === Profile Info ===", 180, 220, 255)
        
        if JobsRP.Store and JobsRP.Store.getProfileByPlayer then
            local profile = JobsRP.Store.getProfileByPlayer(player)
            if profile then
                chat(player, "[JobsDiag] Profile loaded: Yes", 120, 255, 120)
                chat(player, "[JobsDiag] Account ID: " .. tostring(profile.accountId), 180, 220, 255)
                chat(player, "[JobsDiag] Current Job: " .. tostring(profile.currentJobId or "none"), 180, 220, 255)
            else
                chat(player, "[JobsDiag] Profile loaded: No", 255, 120, 120)
            end
        else
            chat(player, "[JobsDiag] Store not available", 255, 120, 120)
        end
        return
    end
    
    if sub == "session" then
        chat(player, "[JobsDiag] === Session Info ===", 180, 220, 255)
        
        if JobsRP.Jobs and JobsRP.Jobs.getSessionByPlayer then
            local session = JobsRP.Jobs.getSessionByPlayer(player)
            if session then
                chat(player, "[JobsDiag] Active session: Yes", 120, 255, 120)
                chat(player, "[JobsDiag] Job ID: " .. tostring(session.jobId or "none"), 180, 220, 255)
                chat(player, "[JobsDiag] Run ID: " .. tostring(session.runId or "none"), 180, 220, 255)
            else
                chat(player, "[JobsDiag] Active session: No", 255, 180, 120)
            end
        else
            chat(player, "[JobsDiag] Jobs system not available", 255, 120, 120)
        end
        return
    end
    
    chat(player, "[JobsDiag] Unknown subcommand. Use /jobdiag help.", 255, 120, 120)
end

-- Track if already registered
local _jobdiagRegistered = false

-- Register jobdiag command
JobDiagCommands.register = function()
    if not addCommandHandler then
        print("[JobDiagCommands] Command system not available")
        return
    end
    
    if _jobdiagRegistered then
        print("[JobDiagCommands] /jobdiag already registered, skipping")
        return
    end
    
    _jobdiagRegistered = true
    
    addCommandHandler("jobdiag", function(...)
        local client, parameters = Core.extractClientAndParams("jobdiag", ...)
        if not client then
            print("[JobDiagCommands] /jobdiag ignored: client not resolved")
            return
        end
        
        -- Convert parameters string to words (like original)
        local words = Core.toWords(parameters)
        
        -- Remove first word if it equals the command name
        if words[1] and Core.normalizeToken(words[1]) == "jobdiag" then
            table.remove(words, 1)
        end
        
        JobDiagCommands.handle(client, words)
    end)
    
    print("[JobDiagCommands] /jobdiag command registered")
end

return JobDiagCommands
