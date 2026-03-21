JobsRP = JobsRP or {}
JobsRP.JobAdmin = JobsRP.JobAdmin or {}

local JobAdmin = JobsRP.JobAdmin
local Store = JobsRP.Store

JobAdmin.config = JobAdmin.config or nil
JobAdmin.logFile = "jobadmin_log.json"
JobAdmin.configFile = "jobadmin_config.json"
JobAdmin.commandRoot = "jobadmin"

local function nowIso()
    if os and os.date then
        return os.date("!%Y-%m-%dT%H:%M:%SZ")
    end
    return tostring(JobsRP.nowSeconds and JobsRP.nowSeconds() or 0)
end

local function loadText(path)
    if loadTextFile then
        local ok, result = pcall(loadTextFile, path)
        if ok then
            return result
        end
    end
    if io and io.open then
        local file = io.open(path, "r")
        if file then
            local content = file:read("*a")
            file:close()
            return content
        end
    end
    return nil
end

local function saveText(path, content)
    if saveTextFile then
        local ok, result = pcall(saveTextFile, path, content)
        if ok then
            return result ~= false
        end
    end
    if io and io.open then
        local file = io.open(path, "w")
        if file then
            file:write(content)
            file:close()
            return true
        end
    end
    return false
end

local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
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

local function trimText(value)
    if JobsRP and JobsRP.trim then
        return JobsRP.trim(value)
    end
    return tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function stripLeadingToken(text, token)
    local raw = trimText(text)
    if raw == "" then
        return ""
    end

    local compare = raw
    if string.sub(compare, 1, 1) == "/" then
        compare = string.sub(compare, 2)
    end

    local lower = string.lower(compare)
    local t = string.lower(token or "")
    if t ~= "" and string.sub(lower, 1, #t) == t then
        return trimText(string.sub(compare, #t + 1))
    end

    return raw
end

local function parseNameAndRest(text)
    local raw = trimText(text)
    if raw == "" then
        return nil, ""
    end

    local first = string.sub(raw, 1, 1)
    if first == "\"" then
        local close = string.find(raw, "\"", 2, true)
        if close then
            local name = string.sub(raw, 2, close - 1)
            local rest = trimText(string.sub(raw, close + 1))
            return name, rest
        end
    elseif first == "<" then
        local close = string.find(raw, ">", 2, true)
        if close then
            local name = string.sub(raw, 2, close - 1)
            local rest = trimText(string.sub(raw, close + 1))
            return name, rest
        end
    end

    local token = string.match(raw, "^(%S+)")
    if not token then
        return nil, ""
    end
    local rest = trimText(string.sub(raw, #token + 1))
    return token, rest
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

local function chat(player, text, r, g, b)
    local messageText = tostring(text or "")
    if messageText == "" then
        return
    end

    if messageClient and player then
        local ok, result = pcall(function()
            return messageClient(messageText, player)
        end)
        if ok and result ~= false then
            return
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
                return
            end
        end
    end

    print("[jobs_rp] " .. messageText)
end

local function defaultConfig()
    return {
        commandLevels = {
            help = 0,
            whoami = 0,
            save = 1,
            reload = 1,
            dbstatus = 1,
            authreset = 1,
            authinfo = 1,
            setcash = 1,
            setxp = 1,
            reset = 1,
            security = 1,
            vehicles = 1,
            economy = 1
        }
    }
end

function JobAdmin.loadConfig()
    local raw = loadText(JobAdmin.configFile)
    if raw and raw ~= "" then
        local ok, decoded = pcall(JobsRP.Json.decode, raw)
        if ok and type(decoded) == "table" then
            JobAdmin.config = decoded
            return JobAdmin.config
        end
    end

    JobAdmin.config = defaultConfig()
    local encoded = JobsRP.Json.encode(JobAdmin.config)
    saveText(JobAdmin.configFile, encoded)
    return JobAdmin.config
end

local function ensureLogFile()
    local raw = loadText(JobAdmin.logFile)
    if not raw or raw == "" then
        local entry = { timestamp = nowIso(), actor = "System", action = "server", details = "JobAdmin started" }
        saveText(JobAdmin.logFile, JobsRP.Json.encode({ entry }))
        return
    end

    local ok, decoded = pcall(JobsRP.Json.decode, raw)
    if not ok or type(decoded) ~= "table" then
        local entry = { timestamp = nowIso(), actor = "System", action = "server", details = "JobAdmin started" }
        saveText(JobAdmin.logFile, JobsRP.Json.encode({ entry }))
    end
end

local function logAdminAction(client, action, params, details)
    local raw = loadText(JobAdmin.logFile)
    local logArray = {}
    if raw and raw ~= "" then
        local ok, decoded = pcall(JobsRP.Json.decode, raw)
        if ok and type(decoded) == "table" then
            logArray = decoded
        end
    end

    local actorName = "System"
    if client and client.name then
        actorName = tostring(client.name)
    end

    logArray[#logArray + 1] = {
        timestamp = nowIso(),
        actor = actorName,
        action = tostring(action or ""),
        context = tostring(params or ""),
        details = tostring(details or "")
    }

    saveText(JobAdmin.logFile, JobsRP.Json.encode(logArray))
end

local function getLevelForCommand(command)
    if not JobAdmin.config then
        JobAdmin.loadConfig()
    end
    local levels = JobAdmin.config.commandLevels or {}
    local level = levels[tostring(command or ""):lower()]
    if level == nil then
        return 1
    end
    return level
end

local function getPlayerAdminLevel(client)
    if client and client.console == true then
        return 99999999
    end

    if JobsRP.Auth and JobsRP.Auth.isAdmin then
        if JobsRP.Auth.isAdmin(client) then
            return 1
        end
    end

    return 0
end

local function showHelp(player)
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

local function showWhoAmI(player)
    local session = JobsRP.Auth and JobsRP.Auth.getSession and JobsRP.Auth.getSession(player) or nil
    local accountId = JobsRP.Auth and JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(player) or nil

    chat(player, "[JobsAdmin] accountId=" .. tostring(accountId or "none"), 255, 220, 120)
    chat(player, "[JobsAdmin] isAdmin=" .. tostring(getPlayerAdminLevel(player) > 0), 255, 220, 120)

    if session then
        chat(player, "[JobsAdmin] name=" .. tostring(session.lastSeenName or ""), 255, 220, 120)
    end
end

local function requireAuth(player)
    if JobsRP.Auth and JobsRP.Auth.requireAuthenticated then
        return JobsRP.Auth.requireAuthenticated(player)
    end
    chat(player, "[Jobs] Auth system unavailable.", 255, 120, 120)
    return false
end

function JobAdmin.handleCommand(client, parameters)
    if not isClientObject(client) then
        return
    end

    if not requireAuth(client) then
        return
    end

    local words = toWords(parameters)
    if words[1] and normalizeToken(words[1]) == JobAdmin.commandRoot then
        table.remove(words, 1)
    end

    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showHelp(client)
        return
    end

    if sub == "whoami" then
        showWhoAmI(client)
        return
    end

    if getPlayerAdminLevel(client) < getLevelForCommand(sub) then
        chat(client, "[JobsAdmin] Permission denied.", 255, 120, 120)
        return
    end

    if sub == "save" then
        local saved, total = JobsRP.Store.saveAll(true)
        chat(client, string.format("[JobsAdmin] Saved records: %d/%d", saved, total), 140, 255, 140)
        logAdminAction(client, "save", parameters, "Saved store records")
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
        chat(client, "[JobsAdmin] Reloaded authenticated online profiles from disk.", 140, 255, 140)
        logAdminAction(client, "reload", parameters, "Reloaded online profiles")
        return
    end

    if sub == "dbstatus" then
        if not JobsRP.Store or not JobsRP.Store.getBackendInfo then
            chat(client, "[JobsAdmin] Storage backend info unavailable.", 255, 120, 120)
            return
        end

        local info = JobsRP.Store.getBackendInfo()
        chat(client, "[JobsAdmin] storage requested=" .. tostring(info.requested) .. " active=" .. tostring(info.active), 140, 255, 140)
        chat(client, "[JobsAdmin] dbReady=" .. tostring(info.dbReady), 140, 255, 140)

        local reason = tostring(info.fallbackReason or "")
        if reason ~= "" then
            chat(client, "[JobsAdmin] fallbackReason=" .. reason, 255, 180, 120)
        end

        local dbErr = tostring(info.dbError or "")
        if dbErr ~= "" then
            chat(client, "[JobsAdmin] dbError=" .. dbErr, 255, 180, 120)
        end
        logAdminAction(client, "dbstatus", parameters, "Requested db status")
        return
    end

    if sub == "authreset" then
        local accountId = words[2]
        if not accountId then
            chat(client, "[JobsAdmin] Usage: /jobadmin authreset <accountId>", 255, 180, 120)
            return
        end

        local ok, err, token = JobsRP.Auth.adminResetToken(accountId)
        if not ok then
            chat(client, "[JobsAdmin] " .. tostring(err), 255, 120, 120)
            return
        end

        chat(client, "[JobsAdmin] Token reset for " .. tostring(JobsRP.normalizeName(accountId)) .. ".", 140, 255, 140)
        chat(client, "[JobsAdmin] New token: " .. tostring(token), 140, 255, 140)
        logAdminAction(client, "authreset", parameters, "Reset token for " .. tostring(accountId))
        return
    end

    if sub == "authinfo" then
        local accountId = words[2]
        if not accountId then
            chat(client, "[JobsAdmin] Usage: /jobadmin authinfo <accountId>", 255, 180, 120)
            return
        end

        local ok, err, info = JobsRP.Auth.getAccountInfo(accountId)
        if not ok then
            chat(client, "[JobsAdmin] " .. tostring(err), 255, 120, 120)
            return
        end

        chat(client, "[JobsAdmin] accountId=" .. tostring(info.accountId), 140, 255, 140)
        chat(client, "[JobsAdmin] createdAt=" .. tostring(info.createdAt), 140, 255, 140)
        chat(client, "[JobsAdmin] lastLoginAt=" .. tostring(info.lastLoginAt), 140, 255, 140)
        chat(client, "[JobsAdmin] lastSeenName=" .. tostring(info.lastSeenName), 140, 255, 140)
        chat(client, "[JobsAdmin] knownIps=" .. tostring(#(info.knownIps or {})), 140, 255, 140)
        logAdminAction(client, "authinfo", parameters, "Fetched auth info for " .. tostring(accountId))
        return
    end

    if sub == "setcash" then
        local rawArgs = stripLeadingToken(stripLeadingToken(parameters, JobAdmin.commandRoot), sub)
        local targetName, rest = parseNameAndRest(rawArgs)
        if not targetName or rest == "" then
            chat(client, "[JobsAdmin] Usage: /jobadmin setcash \"Player Name\" <amount>", 255, 180, 120)
            return
        end

        local restWords = toWords(rest)
        local amount = JobsRP.toNumber(restWords[1], nil)
        local target = findPlayerByName(targetName)
        if not target then
            chat(client, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end
        if amount == nil then
            chat(client, "[JobsAdmin] Invalid cash amount.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(client, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
            return
        end

        amount = math.max(0, JobsRP.round(amount))

        local profile = JobsRP.Store.getProfileByPlayer(target)
        profile.cash = amount
        JobsRP.Store.markDirty(targetId)
        JobsRP.Jobs.syncProfile(target)

        if triggerNetworkEvent then
            pcall(function()
                triggerNetworkEvent("jobs.walletUpdate", target, amount, 0, "admin_setcash")
            end)
        end

        chat(client, "[JobsAdmin] Cash updated for " .. tostring(target.name) .. ".", 140, 255, 140)
        logAdminAction(client, "setcash", parameters, "Updated cash for " .. tostring(target.name))
        return
    end

    if sub == "setxp" then
        local rawArgs = stripLeadingToken(stripLeadingToken(parameters, JobAdmin.commandRoot), sub)
        local targetName, rest = parseNameAndRest(rawArgs)
        local restWords = toWords(rest)
        if not targetName or not restWords[1] or not restWords[2] then
            chat(client, "[JobsAdmin] Usage: /jobadmin setxp \"Player Name\" <jobId> <amount>", 255, 180, 120)
            return
        end

        local target = findPlayerByName(targetName)
        local jobId = JobsRP.normalizeName(restWords[1])
        local xpValue = JobsRP.toNumber(restWords[2], nil)

        if not target then
            chat(client, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end
        if not JobsRP.JobDefs.get(jobId) then
            chat(client, "[JobsAdmin] Invalid job id.", 255, 120, 120)
            return
        end
        if xpValue == nil then
            chat(client, "[JobsAdmin] Invalid XP amount.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(client, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
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

        chat(client, "[JobsAdmin] XP updated for " .. tostring(target.name) .. " (" .. jobId .. ").", 140, 255, 140)
        logAdminAction(client, "setxp", parameters, "Updated XP for " .. tostring(target.name))
        return
    end

    if sub == "reset" then
        local rawArgs = stripLeadingToken(stripLeadingToken(parameters, JobAdmin.commandRoot), sub)
        local targetName = parseNameAndRest(rawArgs)
        if not targetName then
            chat(client, "[JobsAdmin] Usage: /jobadmin reset \"Player Name\"", 255, 180, 120)
            return
        end

        local target = findPlayerByName(targetName)
        if not target then
            chat(client, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        local targetId = JobsRP.Store.getPlayerId(target)
        if not targetId then
            chat(client, "[JobsAdmin] Target is not authenticated.", 255, 120, 120)
            return
        end

        local profile = JobsRP.Store.newProfile(targetId)
        JobsRP.Store.replaceProfileById(targetId, profile)
        JobsRP.Jobs.stopJob(target, "Profile reset by admin.")
        JobsRP.Jobs.syncProfile(target)

        if triggerNetworkEvent then
            pcall(function()
                triggerNetworkEvent("jobs.walletUpdate", target, profile.cash, 0, "admin_reset")
            end)
        end

        chat(client, "[JobsAdmin] Profile reset for " .. tostring(target.name) .. ".", 140, 255, 140)
        logAdminAction(client, "reset", parameters, "Reset profile for " .. tostring(target.name))
        return
    end

    if sub == "security" then
        local rawArgs = stripLeadingToken(stripLeadingToken(parameters, JobAdmin.commandRoot), sub)
        local targetName = parseNameAndRest(rawArgs)
        if not targetName then
            chat(client, "[JobsAdmin] Usage: /jobadmin security \"Player Name\"", 255, 180, 120)
            return
        end

        local target = findPlayerByName(targetName)
        if not target then
            chat(client, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        if JobsRP.Security then
            local info = JobsRP.Security.getPlayerSecurityInfo(target)
            chat(client, "[JobsAdmin] Security info for " .. tostring(target.name) .. ":", 255, 220, 120)
            chat(client, "[JobsAdmin] Actions: " .. table.concat(info.actionCounts, ", "), 255, 220, 120)
            chat(client, "[JobsAdmin] Suspicious count: " .. info.suspiciousCount, 255, 220, 120)
            if info.lastSuspicious > 0 then
                chat(client, "[JobsAdmin] Last suspicious: " .. os.date("%Y-%m-%d %H:%M:%S", info.lastSuspicious), 255, 220, 120)
            end
        else
            chat(client, "[JobsAdmin] Security module not loaded.", 255, 120, 120)
        end
        logAdminAction(client, "security", parameters, "Checked security for " .. tostring(target.name))
        return
    end

    if sub == "vehicles" then
        local rawArgs = stripLeadingToken(stripLeadingToken(parameters, JobAdmin.commandRoot), sub)
        local targetName = parseNameAndRest(rawArgs)
        if not targetName then
            chat(client, "[JobsAdmin] Usage: /jobadmin vehicles \"Player Name\"", 255, 180, 120)
            return
        end

        local target = findPlayerByName(targetName)
        if not target then
            chat(client, "[JobsAdmin] Target player not found.", 255, 120, 120)
            return
        end

        if JobsRP.Vehicles then
            local vehicles = JobsRP.Vehicles.getPlayerVehicles(target)
            chat(client, "[JobsAdmin] Vehicles for " .. tostring(target.name) .. " (" .. #vehicles .. "):", 255, 220, 120)
            for _, vehicleData in ipairs(vehicles) do
                chat(client, "[JobsAdmin] " .. vehicleData.model .. " (" .. vehicleData.vehicleId .. ") Fuel: " .. vehicleData.fuel .. "%", 255, 220, 120)
            end
        else
            chat(client, "[JobsAdmin] Vehicle module not loaded.", 255, 120, 120)
        end
        logAdminAction(client, "vehicles", parameters, "Checked vehicles for " .. tostring(target.name))
        return
    end

    if sub == "economy" then
        if JobsRP.Economy then
            local totalCash = 0
            local totalXP = 0
            local playerCount = 0

            if JobsRP.Store and JobsRP.Store.profilesById then
                for _, profile in pairs(JobsRP.Store.profilesById) do
                    if type(profile) == "table" then
                        totalCash = totalCash + (profile.cash or 0)
                        totalXP = totalXP + (profile.xp or 0)
                        playerCount = playerCount + 1
                    end
                end
            end

            chat(client, "[JobsAdmin] Economy Statistics:", 255, 220, 120)
            chat(client, "[JobsAdmin] Players: " .. playerCount, 255, 220, 120)
            chat(client, "[JobsAdmin] Total Cash: $" .. totalCash, 255, 220, 120)
            chat(client, "[JobsAdmin] Total XP: " .. totalXP, 255, 220, 120)
            if playerCount > 0 then
                chat(client, "[JobsAdmin] Avg Cash: $" .. math.floor(totalCash / playerCount), 255, 220, 120)
                chat(client, "[JobsAdmin] Avg XP: " .. math.floor(totalXP / playerCount), 255, 220, 120)
            end
        else
            chat(client, "[JobsAdmin] Economy module not loaded.", 255, 120, 120)
        end
        logAdminAction(client, "economy", parameters, "Checked economy stats")
        return
    end

    chat(client, "[JobsAdmin] Unknown subcommand. Use /jobadmin help.", 255, 120, 120)
end

local function handleCommand(command, params, client)
    if not isClientObject(client) then
        return
    end
    JobAdmin.handleCommand(client, params)
end

addEventHandler("onResourceStart", function(ev, res)
    if thisResource and res ~= thisResource then
        return
    end
    JobAdmin.loadConfig()
    ensureLogFile()
end)

addEventHandler("onResourceStop", function(ev, res)
    if thisResource and res ~= thisResource then
        return
    end
    logAdminAction(nil, "server", "", "JobAdmin stopped")
end)

if addCommandHandler then
    addCommandHandler("jobadmin", function(...)
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
        if not client then
            print("[jobs_rp] [JobAdmin] /jobadmin ignored: client not resolved")
            return
        end

        local fragments = {}
        for _, value in ipairs(args) do
            if isClientObject(value) then
            elseif type(value) == "string" then
                local candidate = JobsRP.trim(value)
                if candidate ~= "" and normalizeToken(candidate) ~= JobAdmin.commandRoot then
                    if string.find(candidate, "%s") then
                        JobAdmin.handleCommand(client, candidate)
                        return
                    end
                    fragments[#fragments + 1] = candidate
                end
            elseif type(value) == "table" then
                local words = {}
                for _, item in ipairs(value) do
                    words[#words + 1] = tostring(item)
                end
                local candidate = JobsRP.trim(table.concat(words, " "))
                if candidate ~= "" and normalizeToken(candidate) ~= JobAdmin.commandRoot then
                    JobAdmin.handleCommand(client, candidate)
                    return
                end
                fragments[#fragments + 1] = candidate
            end
        end

        JobAdmin.handleCommand(client, table.concat(fragments, " "))
    end)

    local function makeJobAdminCommand(command, params, client)
        local isConsole = (client and client.console == true)
        if not isConsole then
            chat(client, "[JobsAdmin] Console-only command.", 255, 120, 120)
            return false
        end

        local accountId = JobsRP.normalizeName(params or "")
        if accountId == "" then
            print("[jobs_rp] [JobAdmin] Usage: /" .. tostring(command) .. " <accountId>")
            return false
        end

        if JobsRP.Auth and JobsRP.Auth.validateAccountId then
            local ok, normalized = JobsRP.Auth.validateAccountId(accountId)
            if not ok then
                print("[jobs_rp] [JobAdmin] " .. tostring(normalized))
                return false
            end
            accountId = normalized
        end

        if not Store or not Store.loadAccountById then
            print("[jobs_rp] [JobAdmin] Account store unavailable.")
            return false
        end

        local account = Store.loadAccountById(accountId)
        if not account then
            print("[jobs_rp] [JobAdmin] Account not found: " .. tostring(accountId))
            return false
        end

        account.role = "admin"
        Store.markAccountDirty(accountId)
        Store.saveAccountById(accountId, true)
        logAdminAction(client, "makejobadmin", accountId, "Set role admin")

        print("[jobs_rp] [JobAdmin] " .. tostring(accountId) .. " set to admin.")
        return true
    end

    addCommandHandler("makejobadmin", makeJobAdminCommand)
    addCommandHandler("makejobaadmin", makeJobAdminCommand)

    local function demoteJobAdminCommand(command, params, client)
        local isConsole = (client and client.console == true)
        if not isConsole then
            chat(client, "[JobsAdmin] Console-only command.", 255, 120, 120)
            return false
        end

        local accountId = JobsRP.normalizeName(params or "")
        if accountId == "" then
            print("[jobs_rp] [JobAdmin] Usage: /" .. tostring(command) .. " <accountId>")
            return false
        end

        if JobsRP.Auth and JobsRP.Auth.validateAccountId then
            local ok, normalized = JobsRP.Auth.validateAccountId(accountId)
            if not ok then
                print("[jobs_rp] [JobAdmin] " .. tostring(normalized))
                return false
            end
            accountId = normalized
        end

        if not Store or not Store.loadAccountById then
            print("[jobs_rp] [JobAdmin] Account store unavailable.")
            return false
        end

        local account = Store.loadAccountById(accountId)
        if not account then
            print("[jobs_rp] [JobAdmin] Account not found: " .. tostring(accountId))
            return false
        end

        account.role = "player"
        Store.markAccountDirty(accountId)
        Store.saveAccountById(accountId, true)
        logAdminAction(client, "demotejobadmin", accountId, "Set role player")

        print("[jobs_rp] [JobAdmin] " .. tostring(accountId) .. " demoted to player.")
        return true
    end

    addCommandHandler("demotejobadmin", demoteJobAdminCommand)
end
