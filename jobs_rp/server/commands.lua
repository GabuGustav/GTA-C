JobsRP = JobsRP or {}

local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

local function resolveClient(actor)
    if not actor then
        return nil
    end

    local t = type(actor)

    if t == "number" then
        if getClients then
            local okClients, clients = pcall(getClients)
            if okClients and type(clients) == "table" then
                for _, client in ipairs(clients) do
                    local okIdx, idx = pcall(function()
                        return client.index
                    end)
                    if okIdx and idx == actor then
                        return client
                    end
                end
            end
        end
        return nil
    end

    if t ~= "userdata" and t ~= "table" then
        return nil
    end

    local hasLinkedPlayer = false
    local okLinked = pcall(function()
        hasLinkedPlayer = actor.player ~= nil
    end)
    if okLinked and hasLinkedPlayer then
        return actor
    end

    if getClientFromPlayerElement then
        local okClient, client = pcall(function()
            return getClientFromPlayerElement(actor)
        end)
        if okClient and client then
            return client
        end
    end

    local hasClientIdentity = false
    local okIdentity = pcall(function()
        hasClientIdentity = (actor.index ~= nil and actor.name ~= nil) or (actor.ip ~= nil and actor.name ~= nil)
    end)
    if okIdentity and hasClientIdentity then
        return actor
    end

    local isLikelyPlayer = false
    local okPlayer = pcall(function()
        isLikelyPlayer = actor.getPosition ~= nil or actor.getVariable ~= nil or actor.setVariable ~= nil
    end)
    if okPlayer and isLikelyPlayer then
        return actor
    end

    return nil
end

local function isClientObject(value)
    return resolveClient(value) ~= nil
end

local function toWords(parameters)
    local out = {}

    if type(parameters) == "table" then
        for _, item in ipairs(parameters) do
            out[#out + 1] = tostring(item)
        end
        return out
    end

    local raw = tostring(parameters or "")
    for token in string.gmatch(raw, "%S+") do
        out[#out + 1] = token
    end
    return out
end

local function outputChat(player, text, r, g, b)
    local messageText = tostring(text or "")
    if messageText == "" then
        return false
    end

    if messageClient and player then
        local ok, result = pcall(function()
            return messageClient(messageText, player)
        end)
        if ok and result ~= false then
            return true
        end
    end

    if outputChatBox then
        local variants = {
            function() return outputChatBox(messageText, player, r or 255, g or 255, b or 255) end,
            function() return outputChatBox(player, messageText, r or 255, g or 255, b or 255) end,
            function() return outputChatBox(messageText, player) end,
            function() return outputChatBox(messageText) end
        }

        for _, writer in ipairs(variants) do
            local ok, result = pcall(writer)
            if ok and result ~= false then
                return true
            end
        end
    end

    return false
end

local function unpackTable(values, index)
    local i = index or 1
    if type(values) ~= "table" then
        return
    end
    if values[i] == nil then
        return
    end
    return values[i], unpackTable(values, i + 1)
end

local function pushClientEvent(player, eventName, ...)
    if not player or not eventName then
        return false
    end

    local args = { ... }

    if triggerNetworkEvent then
        local ok, result = pcall(function()
            return triggerNetworkEvent(eventName, player, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    if triggerClientEvent then
        local ok, result = pcall(function()
            return triggerClientEvent(player, eventName, player, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    return false
end

local function chat(player, text, r, g, b)
    local messageText = tostring(text or "")
    if messageText == "" then
        return
    end

    if outputChat(player, messageText, r, g, b) then
        return
    end

    print("[jobs_rp] " .. messageText)
end

local function getOnlineClients()
    if getClients then
        local ok, clients = pcall(getClients)
        if ok and type(clients) == "table" then
            return clients
        end
    end

    local out = {}
    if getPlayers then
        for _, player in ipairs(getPlayers()) do
            local client = resolveClient(player)
            if client then
                out[#out + 1] = client
            end
        end
    end

    return out
end

local function findPlayerByName(query)
    local needle = JobsRP.normalizeName(query)
    if needle == "" then
        return nil
    end

    local matched = nil
    for _, client in ipairs(getOnlineClients()) do
        local playerName = JobsRP.normalizeName(client.name or "")
        if playerName == needle then
            return client
        end
        if string.find(playerName, needle, 1, true) then
            matched = matched or client
        end
    end

    return matched
end

local function requireAuth(player)
    if JobsRP.Auth and JobsRP.Auth.requireAuthenticated then
        return JobsRP.Auth.requireAuthenticated(player)
    end

    chat(player, "[Jobs] Auth system unavailable.", 255, 120, 120)
    return false
end

local function isAdmin(player)
    if not JobsRP.Auth or not JobsRP.Auth.isAdmin then
        return false
    end
    return JobsRP.Auth.isAdmin(player)
end

local function showJobHelp(player)
    local lines = {
        "/job list",
        "/job join <taxi|robbery|police>",
        "/job leave",
        "/job start",
        "/job stop",
        "/job status",
        "/job paycheck"
    }

    if JobsRP.Config.debug_quick_test == true then
        lines[#lines + 1] = "/job next (debug: force one objective)"
        lines[#lines + 1] = "/job finish (debug: force complete run)"
    end

    for _, line in ipairs(lines) do
        chat(player, "[Jobs] " .. line, 170, 230, 255)
    end
end

local function showJobAuthHelp(player)
    local lines = {
        "/jobauth help",
        "/jobauth register <accountId> <password>",
        "/jobauth login <accountId> <password>",
        "/jobauth logout",
        "/jobauth status",
        "/jobauth whoami",
        "/jobauth sync",
        "/jobauth force",
        "/jobauth debugui <on|off>",
        "/jobauth proximity",
        "/jobauth admincheck",
        "/jobauth forcesync <accountId>"
    }

    for _, line in ipairs(lines) do
        chat(player, "[JobsAuth] " .. line, 180, 220, 255)
    end
end

local function showJobAdminHelp(player)
    local lines = {
        "/jobadmin help",
        "/jobadmin whoami",
        "/jobadmin save",
        "/jobadmin reload",
        "/jobadmin dbstatus",
        "/jobadmin authreset <accountId>",
        "/jobadmin authinfo <accountId>",
        "/jobadmin setcash <playerName> <amount>",
        "/jobadmin setxp <playerName> <jobId> <amount>",
        "/jobadmin reset <playerName>",
        "/jobadmin security <playerName>",
        "/jobadmin vehicles <playerName>",
        "/jobadmin economy"
    }

    for _, line in ipairs(lines) do
        chat(player, "[JobsAdmin] " .. line, 255, 220, 120)
    end
end

local function showAdminWhoAmI(player)
    local session = JobsRP.Auth and JobsRP.Auth.getSession and JobsRP.Auth.getSession(player) or nil
    local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player) or nil

    chat(player, "[JobsAdmin] accountId=" .. tostring(accountId or "none"), 255, 220, 120)
    chat(player, "[JobsAdmin] isAdmin=" .. tostring(isAdmin(player)), 255, 220, 120)

    if session then
        chat(player, "[JobsAdmin] name=" .. tostring(session.lastSeenName or ""), 255, 220, 120)
    end
end

local function debugAdvance(player, completeAll)
    if JobsRP.Config.debug_quick_test ~= true then
        chat(player, "[Jobs] Debug quick test is disabled in config.", 255, 180, 120)
        return
    end

    if not JobsRP.Jobs.getSessionByPlayer(player) then
        chat(player, "[Jobs] No active run. Use /job start first.", 255, 180, 120)
        return
    end

    if not completeAll then
        JobsRP.Jobs.requestAction(player, "progress", { __force = true })
        return
    end

    local safety = 32
    while safety > 0 do
        local session = JobsRP.Jobs.getSessionByPlayer(player)
        if not session then
            return
        end

        local ok = JobsRP.Jobs.requestAction(player, "progress", { __force = true })
        if not ok then
            return
        end

        safety = safety - 1
    end

    chat(player, "[Jobs] Debug finish stopped by safety guard.", 255, 180, 120)
end

local function handleJobAuth(player, words)
    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showJobAuthHelp(player)
        return
    end

    if not JobsRP.Auth then
        chat(player, "[JobsAuth] Auth module unavailable.", 255, 120, 120)
        return
    end

    if sub == "register" then
        local accountId = words[2]
        local password = words[3]
        if not accountId or not password then
            chat(player, "[JobsAuth] Usage: /jobauth register <accountId> <password>", 255, 180, 120)
            return
        end
        JobsRP.Auth.register(player, accountId, password)
        return
    end

    if sub == "login" then
        local accountId = words[2]
        local password = words[3]
        if not accountId or not password then
            chat(player, "[JobsAuth] Usage: /jobauth login <accountId> <password>", 255, 180, 120)
            return
        end
        JobsRP.Auth.login(player, accountId, password)
        return
    end

    if sub == "setpass" or sub == "passwd" then
        local password = words[2]
        if not password then
            chat(player, "[JobsAuth] Usage: /jobauth setpass <newPassword>", 255, 180, 120)
            return
        end
        JobsRP.Auth.setPassword(player, password)
        return
    end

    if sub == "logout" then
        JobsRP.Auth.logout(player, false)
        return
    end

    if sub == "whoami" then
        JobsRP.Auth.whoami(player)
        return
    end

    if sub == "sync" then
        if JobsRP.Auth and JobsRP.Auth.sendState then
            JobsRP.Auth.sendState(player)
            chat(player, "[JobsAuth] Authentication state synchronized.", 100, 255, 100)
            
            -- Force multiple sync attempts
            if setTimeout then
                setTimeout(function()
                    JobsRP.Auth.sendState(player)
                end, 500)
                setTimeout(function()
                    JobsRP.Auth.sendState(player)
                end, 1000)
            end
        else
            chat(player, "[JobsAuth] Auth module unavailable.", 255, 120, 120)
        end
        return
    end

    if sub == "force" then
        if JobsRP.Auth and JobsRP.Auth.sendState then
            -- Force re-check of auth module state
            local mod = getAuthModule()
            if mod and mod.isAuthenticated and mod.getAccountId then
                local okAuth, authResult = callAuthModule("isAuthenticated", player)
                local okId, accountId = callAuthModule("getAccountId", player)
                
                chat(player, "[JobsAuth] Auth module check:", 180, 220, 255)
                chat(player, "[JobsAuth] Authenticated: " .. tostring(okAuth and authResult == true), 180, 220, 255)
                chat(player, "[JobsAuth] Account ID: " .. tostring(okId and accountId or "none"), 180, 220, 255)
                
                if okAuth and authResult == true and okId and accountId and accountId ~= "" then
                    chat(player, "[JobsAuth] Forcing session bind...", 255, 200, 100)
                    local client = resolveClient(player)
                    if client then
                        bindAuthenticatedSession(client, accountId)
                        JobsRP.Auth.sendState(client)
                        chat(player, "[JobsAuth] Session bound and synced!", 100, 255, 100)
                    end
                else
                    chat(player, "[JobsAuth] Not authenticated in auth module.", 255, 120, 120)
                end
            else
                chat(player, "[JobsAuth] Auth module methods unavailable.", 255, 120, 120)
            end
        else
            chat(player, "[JobsAuth] Auth module unavailable.", 255, 120, 120)
        end
        return
    end

    if sub == "debugui" then
        local forceShow = (words[2] == "on" or words[2] == "true")
        local client = resolveClient(player)
        if client then
            sendClientEvent(client, "jobs.authDebugUI", forceShow)
            chat(player, "[JobsAuth] Debug UI " .. (forceShow and "enabled" or "disabled"), 255, 200, 100)
        end
        return
    end

    if sub == "proximity" then
        local client = resolveClient(player)
        if client then
            local playerId = JobsRP.Store.getPlayerId(player)
            local profile = playerId and JobsRP.Store.loadProfileById(playerId)
            
            if profile and profile.currentJobId then
                local jobDef = JobsRP.JobDefs.get(profile.currentJobId)
                if jobDef and jobDef.hub then
                    local pos = client:getPosition()
                    if pos and #pos >= 3 then
                        local hub = jobDef.hub
                        local dx = pos[1] - hub[1]
                        local dy = pos[2] - hub[2]
                        local dz = pos[3] - hub[3]
                        local distance = math.sqrt(dx*dx + dy*dy + dz*dz)
                        
                        chat(player, "[Jobs] Current job: " .. profile.currentJobId, 180, 220, 255)
                        chat(player, "[Jobs] Hub location: " .. table.concat(hub, ", "), 180, 220, 255)
                        chat(player, "[Jobs] Your position: " .. string.format("%.1f, %.1f, %.1f", pos[1], pos[2], pos[3]), 180, 220, 255)
                        chat(player, "[Jobs] Distance to hub: " .. string.format("%.1f units", distance), 180, 220, 255)
                        
                        local maxDistance = (JobsRP.Config and JobsRP.Config.hub_interact_distance) or 50
                        local inRange = distance <= maxDistance
                        chat(player, "[Jobs] In range: " .. (inRange and "Yes" or "No") .. " (max: " .. maxDistance .. ")", inRange and 100 or 255, inRange and 255 or 120, 120)
                    end
                end
            end
        else
            chat(player, "[Jobs] Client not resolved.", 255, 120, 120)
        end
        return
    end

    if sub == "admincheck" then
        local client = resolveClient(player)
        if client then
            local playerId = JobsRP.Store.getPlayerId(player)
            local accountId = playerId and JobsRP.Store.getAccountId and JobsRP.Store.getAccountId(playerId)
            
            chat(player, "[Jobs] Admin Status Check:", 180, 220, 255)
            chat(player, "[Jobs] Player ID: " .. tostring(playerId), 180, 220, 255)
            chat(player, "[Jobs] Account ID: " .. tostring(accountId), 180, 220, 255)
            
            -- Check admin status through multiple methods
            local isAdminViaAuth = false
            if JobsRP.Auth and JobsRP.Auth.isAdmin then
                isAdminViaAuth = JobsRP.Auth.isAdmin(player)
            end
            
            local isAdminViaModule = false
            if JobsRP.AuthModule and JobsRP.AuthModule.isAdmin then
                isAdminViaModule = JobsRP.AuthModule.isAdmin(player)
            end
            
            local isAdminViaCommand = isAdmin(player)
            
            chat(player, "[Jobs] Auth.isAdmin(): " .. tostring(isAdminViaAuth), 180, 220, 255)
            chat(player, "[Jobs] AuthModule.isAdmin(): " .. tostring(isAdminViaModule), 180, 220, 255)
            chat(player, "[Jobs] commands.lua isAdmin(): " .. tostring(isAdminViaCommand), 180, 220, 255)
            
            if isAdminViaAuth or isAdminViaModule or isAdminViaCommand then
                chat(player, "[Jobs] Admin access confirmed", 100, 255, 100)
            else
                chat(player, "[Jobs] Admin access denied", 255, 120, 120)
            end
        else
            chat(player, "[Jobs] Client not resolved.", 255, 120, 120)
        end
        return
    end

    if sub == "forcesync" then
        -- Force sync auth module with JSON database
        local accountId = words[2]
        if not accountId then
            chat(player, "[Jobs] Usage: /jobauth forcesync <accountId>", 255, 120, 120)
            return
        end
        
        chat(player, "[Jobs] Forcing auth sync for account: " .. accountId, 180, 220, 255)
        
        -- Try to reload auth module data
        local mod = JobsRP.AuthModule and JobsRP.AuthModule.getModule and JobsRP.AuthModule.getModule()
        if mod then
            -- Check if module has reload function
            if mod.reload then
                local ok, result = pcall(mod.reload)
                if ok then
                    chat(player, "[Jobs] Auth module reloaded", 100, 255, 100)
                else
                    chat(player, "[Jobs] Failed to reload auth module: " .. tostring(result), 255, 120, 120)
                end
            end
            
            -- Force role check after sync
            local ok, hasAdminRole = pcall(mod.hasRole, accountId, "admin")
            if ok then
                chat(player, "[Jobs] Admin role after sync: " .. tostring(hasAdminRole), 180, 220, 255)
            else
                chat(player, "[Jobs] Role check failed: " .. tostring(hasAdminRole), 255, 120, 120)
            end
            
            -- Try to force admin role if needed
            if mod.setRole and ok and not hasAdminRole then
                local setOk, setResult = pcall(mod.setRole, accountId, "admin")
                if setOk then
                    chat(player, "[Jobs] Forced admin role for: " .. accountId, 100, 255, 100)
                else
                    chat(player, "[Jobs] Failed to force admin role: " .. tostring(setResult), 255, 120, 120)
                end
            end
        else
            chat(player, "[Jobs] Auth module not available", 255, 120, 120)
        end
        return
    end

    chat(player, "[JobsAuth] Unknown subcommand. Use /jobauth help.", 255, 120, 120)
end

local function handleJob(player, words)
    if not requireAuth(player) then
        return
    end

    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showJobHelp(player)
        return
    end

    if sub == "list" then
        JobsRP.Jobs.requestList(player)
        return
    end

    if sub == "join" then
        if not words[2] then
            chat(player, "[Jobs] Usage: /job join <taxi|robbery|police>", 255, 180, 120)
            return
        end
        JobsRP.Jobs.joinJob(player, words[2])
        return
    end

    if sub == "leave" then
        JobsRP.Jobs.leaveJob(player)
        return
    end

    if sub == "start" then
        JobsRP.Jobs.startJob(player)
        return
    end

    if sub == "stop" then
        JobsRP.Jobs.stopJob(player, "Run stopped.")
        return
    end

    if sub == "status" then
        JobsRP.Jobs.requestStatus(player)
        return
    end

    if sub == "paycheck" then
        local profile = JobsRP.Store.getProfileByPlayer(player)
        if not profile then
            chat(player, "[Jobs] No authenticated profile loaded.", 255, 120, 120)
            return
        end
        chat(player, "[Jobs] Wallet balance: $" .. tostring(profile.cash or 0), 140, 255, 140)
        return
    end

    if sub == "next" then
        debugAdvance(player, false)
        return
    end

    if sub == "finish" then
        debugAdvance(player, true)
        return
    end

    chat(player, "[Jobs] Unknown subcommand. Use /job help.", 255, 120, 120)
end

local function handleAdmin(player, words)
    if not requireAuth(player) then
        return
    end

    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showJobAdminHelp(player)
        return
    end

    if sub == "whoami" then
        showAdminWhoAmI(player)
        return
    end

    if not isAdmin(player) then
        chat(player, "[JobsAdmin] Permission denied.", 255, 120, 120)
        return
    end

    if sub == "save" then
        local saved, total = JobsRP.Store.saveAll(true)
        chat(player, string.format("[JobsAdmin] Saved records: %d/%d", saved, total), 140, 255, 140)
        return
    end

    if sub == "reload" then
        for _, target in ipairs(getPlayers()) do
            local accountId = JobsRP.Store.getPlayerId(target)
            if accountId then
                JobsRP.Store.reloadProfileById(accountId)
                JobsRP.Jobs.syncProfile(target)
                JobsRP.Jobs.syncSession(target)
            end
        end
        chat(player, "[JobsAdmin] Reloaded authenticated online profiles from disk.", 140, 255, 140)
        return
    end

    if sub == "dbstatus" then
        if not JobsRP.Store or not JobsRP.Store.getBackendInfo then
            chat(player, "[JobsAdmin] Storage backend info unavailable.", 255, 120, 120)
            return
        end

        local info = JobsRP.Store.getBackendInfo()
        chat(player, "[JobsAdmin] storage requested=" .. tostring(info.requested) .. " active=" .. tostring(info.active), 140, 255, 140)
        chat(player, "[JobsAdmin] dbReady=" .. tostring(info.dbReady), 140, 255, 140)

        local reason = tostring(info.fallbackReason or "")
        if reason ~= "" then
            chat(player, "[JobsAdmin] fallbackReason=" .. reason, 255, 180, 120)
        end

        local dbErr = tostring(info.dbError or "")
        if dbErr ~= "" then
            chat(player, "[JobsAdmin] dbError=" .. dbErr, 255, 180, 120)
        end
        return
    end

    if sub == "authreset" then
        local accountId = words[2]
        if not accountId then
            chat(player, "[JobsAdmin] Usage: /jobadmin authreset <accountId>", 255, 180, 120)
            return
        end

        local ok, err, token = JobsRP.Auth.adminResetToken(accountId)
        if not ok then
            chat(player, "[JobsAdmin] " .. tostring(err), 255, 120, 120)
            return
        end

        chat(player, "[JobsAdmin] Token reset for " .. tostring(JobsRP.normalizeName(accountId)) .. ".", 140, 255, 140)
        chat(player, "[JobsAdmin] New token: " .. tostring(token), 140, 255, 140)
        return
    end

    if sub == "authinfo" then
        local accountId = words[2]
        if not accountId then
            chat(player, "[JobsAdmin] Usage: /jobadmin authinfo <accountId>", 255, 180, 120)
            return
        end

        local ok, err, info = JobsRP.Auth.getAccountInfo(accountId)
        if not ok then
            chat(player, "[JobsAdmin] " .. tostring(err), 255, 120, 120)
            return
        end

        chat(player, "[JobsAdmin] accountId=" .. tostring(info.accountId), 140, 255, 140)
        chat(player, "[JobsAdmin] createdAt=" .. tostring(info.createdAt), 140, 255, 140)
        chat(player, "[JobsAdmin] lastLoginAt=" .. tostring(info.lastLoginAt), 140, 255, 140)
        chat(player, "[JobsAdmin] lastSeenName=" .. tostring(info.lastSeenName), 140, 255, 140)
        chat(player, "[JobsAdmin] knownIps=" .. tostring(#(info.knownIps or {})), 140, 255, 140)
        return
    end

    if sub == "setcash" then
        if not words[2] or not words[3] then
            chat(player, "[JobsAdmin] Usage: /jobadmin setcash <playerName> <amount>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(words[2])
        local amount = JobsRP.toNumber(words[3], nil)
        if not target then
            chat(player, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end
        if amount == nil then
            chat(player, "[JobsAdmin] Invalid cash amount.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(player, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
            return
        end

        amount = math.max(0, JobsRP.round(amount))

        local profile = JobsRP.Store.getProfileByPlayer(target)
        profile.cash = amount
        JobsRP.Store.markDirty(targetId)
        JobsRP.Jobs.syncProfile(target)

        pushClientEvent(target, "jobs.walletUpdate", amount, 0, "admin_setcash")

        chat(player, "[JobsAdmin] Cash updated for " .. tostring(target.name) .. ".", 140, 255, 140)
        return
    end

    if sub == "setxp" then
        if not words[2] or not words[3] or not words[4] then
            chat(player, "[JobsAdmin] Usage: /jobadmin setxp <playerName> <jobId> <amount>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(words[2])
        local jobId = JobsRP.normalizeName(words[3])
        local xpValue = JobsRP.toNumber(words[4], nil)

        if not target then
            chat(player, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end
        if not JobsRP.JobDefs.get(jobId) then
            chat(player, "[JobsAdmin] Invalid job id.", 255, 120, 120)
            return
        end
        if xpValue == nil then
            chat(player, "[JobsAdmin] Invalid XP amount.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(player, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
            return
        end

        xpValue = math.max(0, JobsRP.round(xpValue))

        local profile = JobsRP.Store.getProfileByPlayer(target)
        profile.jobs = profile.jobs or {}
        profile.jobs[jobId] = profile.jobs[jobId] or {
            xp = 0,
            grade = 0,
            completedRuns = 0,
            totalEarned = 0
        }
        profile.jobs[jobId].xp = xpValue
        profile.jobs[jobId].grade = JobsRP.Economy.computeGrade(xpValue)
        JobsRP.Store.markDirty(targetId)
        JobsRP.Jobs.syncProfile(target)

        chat(player, "[JobsAdmin] XP updated for " .. tostring(target.name) .. " (" .. jobId .. ").", 140, 255, 140)
        return
    end

    if sub == "reset" then
        if not words[2] then
            chat(player, "[JobsAdmin] Usage: /jobadmin reset <playerName>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(words[2])
        if not target then
            chat(player, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(player, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
            return
        end

        local profile = JobsRP.Store.newProfile(targetId)
        JobsRP.Store.replaceProfileById(targetId, profile)
        JobsRP.Jobs.stopJob(target, "Profile reset by admin.")
        JobsRP.Jobs.syncProfile(target)

        pushClientEvent(target, "jobs.walletUpdate", profile.cash, 0, "admin_reset")

        chat(player, "[JobsAdmin] Profile reset for " .. tostring(target.name) .. ".", 140, 255, 140)
        return
    end

    if sub == "security" then
        if not words[2] then
            chat(player, "[JobsAdmin] Usage: /jobadmin security <playerName>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(words[2])
        if not target then
            chat(player, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        if JobsRP.Security then
            local info = JobsRP.Security.getPlayerSecurityInfo(target)
            chat(player, "[JobsAdmin] Security info for " .. tostring(target.name) .. ":", 255, 220, 120)
            chat(player, "[JobsAdmin] Actions: " .. table.concat(info.actionCounts, ", "), 255, 220, 120)
            chat(player, "[JobsAdmin] Suspicious count: " .. info.suspiciousCount, 255, 220, 120)
            if info.lastSuspicious > 0 then
                chat(player, "[JobsAdmin] Last suspicious: " .. os.date("%Y-%m-%d %H:%M:%S", info.lastSuspicious), 255, 220, 120)
            end
        else
            chat(player, "[JobsAdmin] Security module not loaded.", 255, 120, 120)
        end
        return
    end

    if sub == "vehicles" then
        if not words[2] then
            chat(player, "[JobsAdmin] Usage: /jobadmin vehicles <playerName>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(words[2])
        if not target then
            chat(player, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        if JobsRP.Vehicles then
            local vehicles = JobsRP.Vehicles.getPlayerVehicles(target)
            chat(player, "[JobsAdmin] Vehicles for " .. tostring(target.name) .. " (" .. #vehicles .. "):", 255, 220, 120)
            for _, vehicleData in ipairs(vehicles) do
                chat(player, "[JobsAdmin] " .. vehicleData.model .. " (" .. vehicleData.vehicleId .. ") Fuel: " .. vehicleData.fuel .. "%", 255, 220, 120)
            end
        else
            chat(player, "[JobsAdmin] Vehicle module not loaded.", 255, 120, 120)
        end
        return
    end

    if sub == "economy" then
        if JobsRP.Economy then
            local totalCash = 0
            local totalXP = 0
            local playerCount = 0
            
            if JobsRP.Store and JobsRP.Store.getAllProfiles then
                local profiles = JobsRP.Store.getAllProfiles()
                for _, profile in pairs(profiles) do
                    totalCash = totalCash + (profile.cash or 0)
                    totalXP = totalXP + (profile.xp or 0)
                    playerCount = playerCount + 1
                end
            end
            
            chat(player, "[JobsAdmin] Economy Statistics:", 255, 220, 120)
            chat(player, "[JobsAdmin] Players: " .. playerCount, 255, 220, 120)
            chat(player, "[JobsAdmin] Total Cash: $" .. totalCash, 255, 220, 120)
            chat(player, "[JobsAdmin] Total XP: " .. totalXP, 255, 220, 120)
            if playerCount > 0 then
                chat(player, "[JobsAdmin] Avg Cash: $" .. math.floor(totalCash / playerCount), 255, 220, 120)
                chat(player, "[JobsAdmin] Avg XP: " .. math.floor(totalXP / playerCount), 255, 220, 120)
            end
        else
            chat(player, "[JobsAdmin] Economy module not loaded.", 255, 120, 120)
        end
        return
    end

    chat(player, "[JobsAdmin] Unknown subcommand. Use /jobadmin help.", 255, 120, 120)
end

local function handleCommand(root, parameters, client)
    if not isClientObject(client) then
        return
    end

    local words = toWords(parameters)
    if words[1] and normalizeToken(words[1]) == root then
        table.remove(words, 1)
    end

    if root == "job" then
        handleJob(client, words)
        return
    end

    if root == "jobauth" then
        handleJobAuth(client, words)
        return
    end

    if root == "jobadmin" then
        handleAdmin(client, words)
        return
    end
end

local function isCommandNameToken(token, root)
    local normalized = normalizeToken(token or "")
    return normalized == root
end

local function describeArgs(...)
    local parts = {}
    for i = 1, select("#", ...) do
        local value = select(i, ...)
        parts[#parts + 1] = string.format("%d:%s=%s", i, type(value), tostring(value))
    end
    return table.concat(parts, " | ")
end
local function extractClientAndParams(root, ...)
    local args = { ... }
    local client = nil

    for i = #args, 1, -1 do
        local resolved = resolveClient(args[i])
        if resolved then
            client = resolved
            break
        end
    end

    if not client then
        client = resolveClient(_G and _G.client or nil)
            or resolveClient(_G and _G.source or nil)
            or resolveClient(_G and _G.this or nil)
    end

    if (not client) and getClients then
        local okClients, clients = pcall(getClients)
        if okClients and type(clients) == "table" and #clients == 1 then
            client = resolveClient(clients[1])
        end
    end

    if (not client) and getPlayers then
        local okPlayers, players = pcall(getPlayers)
        if okPlayers and type(players) == "table" and #players == 1 then
            client = resolveClient(players[1])
        end
    end

    if not client then
        return nil, ""
    end

    local fragments = {}

    for _, value in ipairs(args) do
        if isClientObject(value) then
            -- skip client/player objects
        elseif type(value) == "string" then
            local candidate = JobsRP.trim(value)
            if candidate ~= "" and (not isCommandNameToken(candidate, root)) then
                if string.find(candidate, "%s") then
                    return client, candidate
                end
                fragments[#fragments + 1] = candidate
            end
        elseif type(value) == "table" then
            local words = {}
            for _, item in ipairs(value) do
                words[#words + 1] = tostring(item)
            end

            local candidate = table.concat(words, " ")
            candidate = JobsRP.trim(candidate)
            if candidate ~= "" and (not isCommandNameToken(candidate, root)) then
                if string.find(candidate, "%s") then
                    return client, candidate
                end
                fragments[#fragments + 1] = candidate
            end
        end
    end

    if #fragments > 0 then
        return client, table.concat(fragments, " ")
    end

    return client, ""
end

if addCommandHandler then
    addCommandHandler("job", function(...)
        local client, parameters = extractClientAndParams("job", ...)
        if not client then
            print("[jobs_rp] [Commands] /job ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("job", parameters, client)
    end)

    addCommandHandler("jobauth", function(...)
        local client, parameters = extractClientAndParams("jobauth", ...)
        if not client then
            print("[jobs_rp] [Commands] /jobauth ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("jobauth", parameters, client)
    end)

    addCommandHandler("jobadmin", function(...)
        local client, parameters = extractClientAndParams("jobadmin", ...)
        if not client then
            print("[jobs_rp] [Commands] /jobadmin ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("jobadmin", parameters, client)
    end)

    addCommandHandler("jobdiag", function(...)
        local client, parameters = extractClientAndParams("jobdiag", ...)
        if not client then
            print("[jobs_rp] [Commands] /jobdiag ignored: client not resolved | args=" .. describeArgs(...))
            return
        end

        if triggerNetworkEvent then
            pcall(function()
                triggerNetworkEvent("jobs.diagRequest", client)
            end)
        elseif triggerClientEvent then
            pcall(function()
                triggerClientEvent(client, "jobs.diagRequest", client)
            end)
        end

        chat(client, "[Jobs] Diagnostic request sent to client.", 180, 220, 255)
    end)
end
