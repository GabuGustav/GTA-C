JobsRP = JobsRP or {}

-- Hub proximity validation for proximity-based job actions
local function validateHubProximity(client, jobId)
    if not jobId or not client then
        return false
    end
    
    local jobDef = JobsRP.JobDefs and JobsRP.JobDefs.get(jobId)
    if not jobDef or not jobDef.hub then
        return false
    end
    
    -- Get player position using same method as jobs.lua
    local playerPos = nil
    if client.getPosition then
        local pos = client:getPosition()
        if pos and type(pos) == "table" and #pos >= 3 then
            playerPos = { x = pos[1], y = pos[2], z = pos[3] }
        elseif type(pos) == "number" then
            local x, y, z = client:getPosition()
            if x and y and z then
                playerPos = { x = x, y = y, z = z }
            end
        end
    end
    
    if not playerPos then
        -- Fallback: allow request if position can't be determined
        return true
    end
    
    -- Calculate distance to hub
    local hub = jobDef.hub
    local dx = playerPos.x - hub[1]
    local dy = playerPos.y - hub[2]
    local dz = playerPos.z - hub[3]
    local distance = math.sqrt(dx*dx + dy*dy + dz*dz)
    
    -- Check if within hub interaction distance (configurable, default 50 units)
    local maxDistance = (JobsRP.Config and JobsRP.Config.hub_interact_distance) or 50
    
    return distance <= maxDistance
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

local function describeArgs(...)
    local parts = {}
    for i = 1, select("#", ...) do
        local value = select(i, ...)
        parts[#parts + 1] = string.format("%d:%s=%s", i, type(value), tostring(value))
    end
    return table.concat(parts, " | ")
end
local function extractClientAndArgs(...)
    local args = { ... }
    local client = nil
    local clientArgIndex = nil

    for i, value in ipairs(args) do
        local resolved = resolveClient(value)
        if resolved then
            client = resolved
            clientArgIndex = i
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
        print("[jobs_rp] [Network] client not resolved | args=" .. describeArgs(...))
        return nil, nil, nil
    end

    if clientArgIndex then
        return client, args[clientArgIndex + 1], args[clientArgIndex + 2]
    end

    local payloadA = nil
    local payloadB = nil
    for _, value in ipairs(args) do
        if not resolveClient(value) then
            if payloadA == nil then
                payloadA = value
            elseif payloadB == nil then
                payloadB = value
                break
            end
        end
    end

    return client, payloadA, payloadB
end

local function ensureAuth(client)
    if not client then
        return false
    end

    if JobsRP.Config.auth_required and (not JobsRP.Auth or not JobsRP.Auth.isAuthenticated(client)) then
        if JobsRP.Jobs and JobsRP.Jobs.prompt then
            JobsRP.Jobs.prompt(client, "Use /jobauth register or /jobauth login before using jobs.", "warn")
        end
        if JobsRP.Auth and JobsRP.Auth.sendState then
            JobsRP.Auth.sendState(client)
        end
        return false
    end

    return true
end

local clientDiagStateById = {}

local function nowMs()
    if JobsRP and JobsRP.nowMilliseconds then
        return JobsRP.nowMilliseconds()
    end
    local clock = 0
    if os and os.clock then
        clock = os.clock()
    end
    return math.floor(clock * 1000)
end

local function getClientIndex(client)
    local idx = nil
    local ok = pcall(function()
        idx = client.index
    end)
    if ok and idx ~= nil then
        return tostring(idx)
    end
    return "?"
end

local function getClientName(client)
    local name = nil
    local ok = pcall(function()
        name = client.name
    end)
    if ok and name ~= nil and tostring(name) ~= "" then
        return tostring(name)
    end
    return "unknown"
end

local function normalizeDiagText(raw, maxLen)
    local text = tostring(raw or "")
    text = string.gsub(text, "[\r\n\t]", " ")
    text = string.gsub(text, "%s%s+", " ")
    text = string.gsub(text, "^%s+", "")
    text = string.gsub(text, "%s+$", "")
    if maxLen and #text > maxLen then
        text = string.sub(text, 1, maxLen)
    end
    return text
end

local function shouldLogDiag(client, channel, message)
    local key = getClientIndex(client)
    local line = tostring(channel or "") .. "|" .. tostring(message or "")
    local stamp = nowMs()

    local state = clientDiagStateById[key]
    if not state then
        state = {
            lastAt = 0,
            lastLine = "",
            lastLineAt = 0
        }
        clientDiagStateById[key] = state
    end

    if (stamp - state.lastAt) < 250 then
        return false
    end

    if line == state.lastLine and (stamp - state.lastLineAt) < 10000 then
        return false
    end

    state.lastAt = stamp
    state.lastLine = line
    state.lastLineAt = stamp
    return true
end

addNetworkHandler("jobs.clientDiag", function(...)
    local client, channel, message = extractClientAndArgs(...)
    if not client then
        return
    end

    local diagChannel = normalizeDiagText(channel or "misc", 64)
    if diagChannel == "" then
        diagChannel = "misc"
    end

    local diagMessage = normalizeDiagText(message or "", 320)
    if diagMessage == "" then
        return
    end

    if not shouldLogDiag(client, diagChannel, diagMessage) then
        return
    end

    local name = getClientName(client)
    local index = getClientIndex(client)
    print(string.format("[jobs_rp] [ClientDiag] [%s#%s] [%s] %s", name, index, diagChannel, diagMessage))
end)

addNetworkHandler("jobs.requestList", function(...)
    local client = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    JobsRP.Jobs.requestList(client)
end)

addNetworkHandler("jobs.requestJoin", function(...)
    local client, jobId = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    
    -- Validate hub proximity for join requests
    if not validateHubProximity(client, jobId) then
        chat(client, "[Jobs] You must be near the job hub to join.", 255, 120, 120)
        return
    end
    
    JobsRP.Jobs.joinJob(client, jobId)
end)

addNetworkHandler("jobs.requestLeave", function(...)
    local client = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    JobsRP.Jobs.leaveJob(client)
end)

addNetworkHandler("jobs.requestStart", function(...)
    local client = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    
    -- Validate hub proximity for start requests
    local playerId = JobsRP.Store.getPlayerId(client)
    local profile = playerId and JobsRP.Store.loadProfileById(playerId)
    if profile and profile.currentJobId then
        if not validateHubProximity(client, profile.currentJobId) then
            chat(client, "[Jobs] You must be near the job hub to start.", 255, 120, 120)
            return
        end
    end
    
    JobsRP.Jobs.startJob(client)
end)

addNetworkHandler("jobs.requestStop", function(...)
    local client = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    JobsRP.Jobs.stopJob(client, "Run stopped.")
end)

addNetworkHandler("jobs.requestStatus", function(...)
    local client = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    JobsRP.Jobs.requestStatus(client)
end)

addNetworkHandler("jobs.requestAction", function(...)
    local client, actionId, payload = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end
    JobsRP.Jobs.requestAction(client, actionId, payload)
end)

addNetworkHandler("jobs.authRequestState", function(...)
    local client = extractClientAndArgs(...)
    if not client then
        return
    end
    if JobsRP.Auth and JobsRP.Auth.sendState then
        JobsRP.Auth.sendState(client)
    end
end)

addNetworkHandler("jobs.authRegister", function(...)
    local client, accountId, password = extractClientAndArgs(...)
    if not client then
        return
    end

    if JobsRP.Auth then
        JobsRP.Auth.register(client, accountId, password)
    end
end)

addNetworkHandler("jobs.authLogin", function(...)
    local client, accountId, password = extractClientAndArgs(...)
    if not client then
        return
    end

    if JobsRP.Auth then
        JobsRP.Auth.login(client, accountId, password)
    end
end)

<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/network.lua
addNetworkHandler("jobs.authWithTokens", function(...)
    local client, sessionToken, refreshToken = extractClientAndArgs(...)
    if not client then
        return
    end

    if JobsRP.Auth and JobsRP.Auth.loginWithTokens then
        JobsRP.Auth.loginWithTokens(client, sessionToken, refreshToken)
    else
        pushClientEvent(client, "jobs.authResult", false, "auto_login", "Token auth is not available on this server.")
        if JobsRP.Auth and JobsRP.Auth.sendState then
            JobsRP.Auth.sendState(client)
        end
    end
end)

=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/network.lua
addNetworkHandler("jobs.authLogout", function(...)
    local client = extractClientAndArgs(...)
    if not client then
        return
    end

    if JobsRP.Auth then
        JobsRP.Auth.logout(client, false)
    end
end)

addNetworkHandler("jobs.police.selectDuty", function(...)
    local client, dutyId = extractClientAndArgs(...)
    if not ensureAuth(client) then
        return
    end

    local playerId = JobsRP.Store.getPlayerId(client)
    if not playerId then
        return
    end

    local profile = JobsRP.Store.getProfileByPlayer(client)
    if not profile or profile.currentJobId ~= "police" then
        pushClientEvent(client, "jobs.police.dutyResult", false, "You must be in the police job to select duties.", dutyId)
        return
    end

    -- Handle duty selection
    local success, message = JobsRP.Jobs.selectPoliceDuty(client, dutyId)
    pushClientEvent(client, "jobs.police.dutyResult", success, message, dutyId)
end)

addNetworkHandler("jobs.requestHubElements", function(...)
    local client = extractClientAndArgs(...)
    if not client then
        print("[jobs_rp] No client in requestHubElements")
        return
    end

    print("[jobs_rp] Client requested hub elements")
    
    -- Send hub elements data to client
    local hubElements = JobsRP.Jobs.getHubElements()
    local count = 0
    for _ in pairs(hubElements or {}) do
        count = count + 1
    end
    print("[jobs_rp] Sending hub elements to client, count: " .. count)
    
    pushClientEvent(client, "jobs.syncHubElements", hubElements)
    print("[jobs_rp] Hub elements sent to client")
end)







<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/network.lua
=======

>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/network.lua
