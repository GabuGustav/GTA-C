JobsRP = JobsRP or {}
JobsRP.Jobs = JobsRP.Jobs or {}

local Jobs = JobsRP.Jobs

Jobs.sessionsById = Jobs.sessionsById or {}
Jobs.actionRateMsById = Jobs.actionRateMsById or {}
Jobs.groupsById = Jobs.groupsById or {}
Jobs.groupByPlayerId = Jobs.groupByPlayerId or {}
Jobs.groupCounter = Jobs.groupCounter or 0
Jobs.hubElements = Jobs.hubElements or {}


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

local function resolveControlledPlayer(actor)
    local client = resolveClient(actor)
    if client then
        local okPlayer, player = pcall(function()
            return client.player
        end)
        if okPlayer and player then
            return player
        end
    end
    return actor
end


pushClientEvent = function(player, eventName, ...)
    local client = resolveClient(player)
    if not client or not eventName then
        return false
    end

    local args = { ... }

    if triggerNetworkEvent then
        local ok, result = pcall(function()
            return triggerNetworkEvent(eventName, client, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    if triggerClientEvent then
        local ok, result = pcall(function()
            return triggerClientEvent(client, eventName, client, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    return false
end

local function outputChat(player, text, r, g, b)
    if not outputChatBox then
        return false
    end

    local variants = {
        function() return outputChatBox(text, player, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(player, text, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(text, r or 255, g or 255, b or 255) end,
        function() return outputChatBox(text, player) end,
        function() return outputChatBox(text) end
    }

    for _, writer in ipairs(variants) do
        local ok = pcall(writer)
        if ok then
            return true
        end
    end

    return false
end

local function chat(player, message, r, g, b)
    local text = tostring(message or "")
    if text == "" then
        return
    end

    if outputChat(player, text, r, g, b) then
        return
    end

    print("[jobs_rp] " .. text)
end

function Jobs.prompt(player, message, level)
    pushClientEvent(player, "jobs.showPrompt", message, level or "info")

    local color = {
        info = { 120, 180, 255 },
        warn = { 255, 200, 80 },
        error = { 255, 100, 100 },
        success = { 120, 255, 120 }
    }
    local rgb = color[level or "info"] or color.info
    chat(player, "[Jobs] " .. tostring(message), rgb[1], rgb[2], rgb[3])
end

local function requireAuthenticatedAccountId(player, silentPrompt)
    -- Use the same method as JobStats - Auth.getAccountId which has multiple fallback methods
    local playerId = nil
    
    print("[Jobs] DEBUG: requireAuthenticatedAccountId called")
    print("[Jobs] DEBUG: player type: " .. type(player))
    
    if JobsRP.Auth and JobsRP.Auth.getAccountId then
        print("[Jobs] DEBUG: Calling Auth.getAccountId")
        playerId = JobsRP.Auth.getAccountId(player)
        print("[Jobs] DEBUG: Auth.getAccountId returned: " .. tostring(playerId))
    else
        print("[Jobs] DEBUG: Auth.getAccountId not available")
    end
    
    -- Fallback to Store if Auth doesn't have accountId
    if not playerId and JobsRP.Store then
        print("[Jobs] DEBUG: Falling back to Store.getPlayerId")
        playerId = JobsRP.Store.getPlayerId(player)
        print("[Jobs] DEBUG: Store.getPlayerId returned: " .. tostring(playerId))
    end
    
    if not playerId then
        print("[Jobs] DEBUG: No playerId found, returning nil")
        if not silentPrompt then
            Jobs.prompt(player, "Use /jobauth register or /jobauth login before using jobs.", "warn")
        end
        return nil
    end

    print("[Jobs] DEBUG: Returning playerId: " .. tostring(playerId))
    return playerId
end

local function getPlayerPos(player)
    local controlledPlayer = resolveControlledPlayer(player)
    if controlledPlayer and controlledPlayer.getPosition then
        local x, y, z = controlledPlayer:getPosition()
        return x, y, z
    end
    if getElementPosition then
        return getElementPosition(controlledPlayer)
    end
    return nil, nil, nil
end

local function getDistanceToCoords(player, coords)
    local px, py, pz = getPlayerPos(player)
    if not px or not py or not pz then
        return math.huge
    end
    if not coords then
        return math.huge
    end
    return getDistanceBetweenPoints3D(px, py, pz, coords[1], coords[2], coords[3])
end

local function makeRng(seed)
    local state = seed % 2147483647
    if state <= 0 then
        state = state + 2147483646
    end
    return function(minValue, maxValue)
        state = (state * 48271) % 2147483647
        if not minValue then
            return state
        end
        local minNum = minValue
        local maxNum = maxValue
        if not maxNum then
            minNum = 1
            maxNum = minValue
        end
        if maxNum <= minNum then
            return minNum
        end
        return minNum + (state % (maxNum - minNum + 1))
    end
end

local function makeRunSeed(playerId)
    local now = JobsRP.nowSeconds() * 1000 + JobsRP.nowMilliseconds()
    local accum = now
    for i = 1, #playerId do
        accum = accum + (string.byte(playerId, i) * i)
    end
    return accum % 2147483647
end

local function chooseUnique(rng, source, count)
    local out = {}
    if type(source) ~= "table" or #source == 0 or count <= 0 then
        return out
    end
    local maxCount = math.min(count, #source)
    local used = {}
    while #out < maxCount do
        local idx = rng(1, #source)
        if not used[idx] then
            used[idx] = true
            out[#out + 1] = source[idx]
        end
    end
    return out
end

local function buildSteps(jobDef, seed)
    local steps = {}
    local rng = makeRng(seed)
    local maxDistance = JobsRP.Config.action_distance

    if jobDef.id == "taxi" then
        local pickups = jobDef.pools.pickups or {}
        local dropoffs = jobDef.pools.dropoffs or {}
        local pickup = pickups[rng(1, #pickups)]
        local dropoff = dropoffs[rng(1, #dropoffs)]

        steps[#steps + 1] = {
            id = "pickup",
            action = "pickup",
            label = "Pickup passenger",
            coords = JobsRP.deepCopy(pickup),
            distance = maxDistance
        }
        steps[#steps + 1] = {
            id = "dropoff",
            action = "dropoff",
            label = "Drop off passenger",
            coords = JobsRP.deepCopy(dropoff),
            distance = maxDistance
        }
    elseif jobDef.id == "police" then
        local patrolPool = jobDef.pools.patrol or {}
        local incidentsPool = jobDef.pools.incidents or patrolPool
        local patrol = nil
        local incident = nil
        if #patrolPool > 0 then
            patrol = patrolPool[rng(1, #patrolPool)]
        end
        if #incidentsPool > 0 then
            incident = incidentsPool[rng(1, #incidentsPool)]
        end

        if patrol then
            steps[#steps + 1] = {
                id = "patrol",
                action = "patrol",
                label = "Patrol checkpoint",
                coords = JobsRP.deepCopy(patrol),
                distance = maxDistance
            }
        end
        if incident then
            steps[#steps + 1] = {
                id = "incident",
                action = "incident",
                label = "Respond to incident",
                coords = JobsRP.deepCopy(incident),
                distance = maxDistance
            }
        end
    end

    return steps
end

local function nextGroupId()
    Jobs.groupCounter = (Jobs.groupCounter or 0) + 1
    return tostring(JobsRP.nowSeconds()) .. "-" .. tostring(Jobs.groupCounter)
end

local function getMinPlayers(jobDef)
    if not jobDef or type(jobDef.constraints) ~= "table" then
        return 1
    end
    local minPlayers = JobsRP.toNumber(jobDef.constraints.minPlayers, 1) or 1
    if minPlayers < 1 then
        minPlayers = 1
    end
    return minPlayers
end

local function findOpenRobberyGroup(jobDef)
    local window = JobsRP.toNumber(JobsRP.Config.robbery_group_window_sec, 30) or 30
    local now = JobsRP.nowSeconds()
    for _, group in pairs(Jobs.groupsById) do
        if group.jobId == jobDef.id and group.started ~= true and (now - group.createdAt) <= window then
            return group
        end
    end
    return nil
end

local function createRobberyGroup(jobDef)
    local groupId = nextGroupId()
    local group = {
        id = groupId,
        jobId = jobDef.id,
        createdAt = JobsRP.nowSeconds(),
        started = false,
        stageIndex = 1,
        stageTarget = nil,
        stageLabel = nil,
        stageType = nil,
        stageDistance = nil,
        stageDurationMs = nil,
        crackReadyAt = nil,
        stageReadyById = {},
        bagsById = {},
        escapeById = {},
        members = {},
        memberIds = {},
        rng = makeRng(makeRunSeed(groupId))
    }
    Jobs.groupsById[groupId] = group
    return group
end

local function groupMemberCount(group)
    if not group or type(group.memberIds) ~= "table" then
        return 0
    end
    return #group.memberIds
end

local function addPlayerToGroup(group, playerId, player)
    if not group.members[playerId] then
        group.memberIds[#group.memberIds + 1] = playerId
    end
    group.members[playerId] = player
    Jobs.groupByPlayerId[playerId] = group.id
end

local function removePlayerFromGroup(playerId)
    local groupId = Jobs.groupByPlayerId[playerId]
    if not groupId then
        return nil
    end

    local group = Jobs.groupsById[groupId]
    Jobs.groupByPlayerId[playerId] = nil
    if not group then
        return nil
    end

    group.members[playerId] = nil
    group.stageReadyById[playerId] = nil
    group.bagsById[playerId] = nil
    group.escapeById[playerId] = nil

    local nextIds = {}
    for _, id in ipairs(group.memberIds) do
        if id ~= playerId then
            nextIds[#nextIds + 1] = id
        end
    end
    group.memberIds = nextIds

    if #group.memberIds == 0 then
        Jobs.groupsById[groupId] = nil
    end

    return group
end

local function pickFromPool(rng, pool)
    if type(pool) ~= "table" or #pool == 0 then
        return nil
    end
    return pool[rng(1, #pool)]
end

local function setGroupStage(group, jobDef, stageIndex)
    if not group or not jobDef or type(jobDef.stages) ~= "table" then
        return false
    end
    local stageDef = jobDef.stages[stageIndex]
    if not stageDef then
        return false
    end

    group.stageIndex = stageIndex
    group.stageLabel = stageDef.label
    group.stageType = stageDef.type
    group.stageDistance = JobsRP.toNumber(stageDef.distance, JobsRP.Config.action_distance) or JobsRP.Config.action_distance
    group.stageDurationMs = JobsRP.toNumber(stageDef.durationMs, 0) or 0
    group.crackReadyAt = nil
    group.stageReadyById = {}
    group.bagsById = {}
    group.escapeById = {}

    if stageDef.usePreviousTarget and group.stageTarget then
        return true
    end

    local poolName = stageDef.pool
    if poolName and jobDef.pools and jobDef.pools[poolName] then
        local picked = pickFromPool(group.rng, jobDef.pools[poolName])
        if picked then
            group.stageTarget = JobsRP.deepCopy(picked)
            return true
        end
    end

    return group.stageTarget ~= nil
end

local routePointsForSession
local completeRun

local function broadcastGroup(group, message, level)
    if not group or not message then
        return
    end
    for _, memberId in ipairs(group.memberIds) do
        local player = group.members[memberId]
        if player then
            Jobs.prompt(player, message, level)
        end
    end
end

local function syncGroupSessions(group, jobDef)
    if not group then
        return
    end
    for _, memberId in ipairs(group.memberIds) do
        local player = group.members[memberId]
        local session = Jobs.sessionsById[memberId]
        if player and session then
            session.stepIndex = group.stageIndex
            Jobs.syncSession(player)
            pushClientEvent(player, "jobs.showRoute", jobDef.id, routePointsForSession(session))
        end
    end
end

local function startRobberyGroup(group, jobDef)
    if not group or group.started then
        return false
    end
    if not setGroupStage(group, jobDef, 1) then
        return false
    end

    group.started = true
    local now = JobsRP.nowSeconds()
    for _, memberId in ipairs(group.memberIds) do
        local player = group.members[memberId]
        if player then
            Jobs.sessionsById[memberId] = {
                active = true,
                jobId = jobDef.id,
                stepIndex = 1,
                startedAt = now,
                expiresAt = now + JobsRP.Config.run_timeout_sec,
                runSeed = makeRunSeed(memberId),
                vehicleNetId = nil,
                steps = {},
                repairReadyAt = nil,
                groupId = group.id
            }
        end
    end

    broadcastGroup(group, "Robbery started. Head to the crew target.", "success")
    syncGroupSessions(group, jobDef)
    return true
end

local function allGroupMembersMarked(group, map)
    if not group then
        return false
    end
    for _, memberId in ipairs(group.memberIds) do
        if not map[memberId] then
            return false
        end
    end
    return true
end

local function completeRobberyGroup(group, jobDef)
    if not group then
        return
    end
    for _, memberId in ipairs(group.memberIds) do
        local player = group.members[memberId]
        local session = Jobs.sessionsById[memberId]
        if player and session then
            completeRun(player, memberId, session)
        end
        Jobs.groupByPlayerId[memberId] = nil
    end
    Jobs.groupsById[group.id] = nil
end

local function handleRobberyAction(player, playerId, session, jobDef, payload, forced)
    local group = session.groupId and Jobs.groupsById[session.groupId] or nil
    if not group or not group.stageTarget then
        Jobs.prompt(player, "Robbery group not ready.", "warn")
        return false
    end

    local stageDef = jobDef.stages and jobDef.stages[group.stageIndex] or nil
    if not stageDef then
        Jobs.prompt(player, "Robbery stage missing.", "error")
        return false
    end

    local maxDistance = JobsRP.toNumber(stageDef.distance, JobsRP.Config.action_distance) or JobsRP.Config.action_distance
    local distance = getDistanceToCoords(player, group.stageTarget)
    if (not forced) and distance > maxDistance then
        Jobs.prompt(player, string.format("Too far from objective (%.1fm > %.1fm).", distance, maxDistance), "warn")
        return false
    end

    if stageDef.type == "gather" then
        group.stageReadyById[playerId] = true
        if allGroupMembersMarked(group, group.stageReadyById) then
            setGroupStage(group, jobDef, group.stageIndex + 1)
            broadcastGroup(group, "Objective updated: " .. tostring(group.stageLabel), "info")
            syncGroupSessions(group, jobDef)
        else
            Jobs.prompt(player, "Waiting for crew to arrive.", "info")
        end
        return true
    end

    if stageDef.type == "crack" then
        local nowMs = JobsRP.nowMilliseconds()
        local durationMs = JobsRP.toNumber(stageDef.durationMs, 0) or 0
        if durationMs <= 0 then
            setGroupStage(group, jobDef, group.stageIndex + 1)
            broadcastGroup(group, "Objective updated: " .. tostring(group.stageLabel), "info")
            syncGroupSessions(group, jobDef)
            return true
        end
        if not group.crackReadyAt then
            group.crackReadyAt = nowMs + durationMs
            Jobs.prompt(player, "Cracking safe... stay nearby.", "info")
            return true
        end
        if nowMs < group.crackReadyAt then
            local remain = math.ceil((group.crackReadyAt - nowMs) / 1000)
            Jobs.prompt(player, "Cracking in progress: " .. tostring(remain) .. "s", "info")
            return false
        end
        group.crackReadyAt = nil
        setGroupStage(group, jobDef, group.stageIndex + 1)
        broadcastGroup(group, "Objective updated: " .. tostring(group.stageLabel), "info")
        syncGroupSessions(group, jobDef)
        return true
    end

    if stageDef.type == "bags" then
        group.bagsById[playerId] = true
        if allGroupMembersMarked(group, group.bagsById) then
            setGroupStage(group, jobDef, group.stageIndex + 1)
            broadcastGroup(group, "Objective updated: " .. tostring(group.stageLabel), "info")
            syncGroupSessions(group, jobDef)
        else
            Jobs.prompt(player, "Bag secured. Wait for the crew.", "info")
        end
        return true
    end

    if stageDef.type == "escape" then
        group.escapeById[playerId] = true
        if allGroupMembersMarked(group, group.escapeById) then
            completeRobberyGroup(group, jobDef)
        else
            Jobs.prompt(player, "Escape complete. Waiting for crew.", "info")
        end
        return true
    end

    Jobs.prompt(player, "Unsupported robbery stage.", "warn")
    return false
end

-- Civilian job action handler (passive XP system)
handleCivilianAction = function(player, playerId, session, jobDef, payload, forced)
    -- Civilian job is passive - no active actions needed
    Jobs.prompt(player, "Civilian life is passive. You gain XP automatically over time.", "info")
    return true
end

-- Taxi job action handler
handleTaxiAction = function(player, playerId, session, jobDef, payload, forced)
    local step = sessionTarget(session)
    if not step then
        Jobs.stopJob(player, "Taxi route missing.")
        return false
    end

    -- Security check
    if JobsRP.Security and JobsRP.Config.auth_required then
        local allowed, reason = JobsRP.Security.checkActionRate(player, "taxi_action")
        if not allowed then
            Jobs.prompt(player, reason, "warn")
            return false
        end
    end

    if step.action == "pickup" then
        -- Generate passenger and fare
        if not session.passengerId then
            session.passengerId = "passenger_" .. tostring(playerId) .. "_" .. tostring(JobsRP.nowSeconds())
            session.fareBase = math.random(50, 200) -- Base fare $50-200
            session.distanceBonus = 0
            session.timeBonus = 0
            session.pickupTime = JobsRP.nowSeconds()
            
            Jobs.prompt(player, "Passenger picked up! Take them to the drop-off location.", "success")
            
            -- Update session to drop-off step
            session.stepIndex = session.stepIndex + 1
            Jobs.syncSession(player)
            pushClientEvent(player, "jobs.showRoute", session.jobId, routePointsForSession(session))
            
            -- Send fare info to client
            pushClientEvent(player, "jobs.taxiFareUpdate", {
                baseFare = session.fareBase,
                distanceBonus = session.distanceBonus,
                timeBonus = session.timeBonus,
                total = session.fareBase + session.distanceBonus + session.timeBonus
            })
        else
            Jobs.prompt(player, "Already have a passenger. Complete current fare first.", "warn")
        end
        return true
    end

    if step.action == "dropoff" then
        if not session.passengerId then
            Jobs.stopJob(player, "No passenger to drop off. Start with pickup first.")
            return false
        end
        
        -- Calculate final fare
        local pickupPos = session.steps[session.stepIndex - 1].coords
        local dropoffPos = step.coords
        local distance = math.sqrt(
            (dropoffPos[1] - pickupPos[1])^2 + 
            (dropoffPos[2] - pickupPos[2])^2 + 
            (dropoffPos[3] - pickupPos[3])^2
        )
        
        -- Distance bonus: $1 per 100 meters
        session.distanceBonus = math.floor(distance / 100)
        
        -- Time bonus: $1 per minute (max $50)
        local timeElapsed = JobsRP.nowSeconds() - session.pickupTime
        session.timeBonus = math.min(math.floor(timeElapsed / 60), 50)
        
        local totalFare = session.fareBase + session.distanceBonus + session.timeBonus
        
        -- Complete the fare
        Jobs.prompt(player, string.format("Fare completed! Earned $%d (Base: $%d, Distance: $%d, Time: $%d)", 
            totalFare, session.fareBase, session.distanceBonus, session.timeBonus), "success")
        
        -- Apply reward
        local reward = JobsRP.Economy.applyJobReward(
            playerId,
            session.jobId,
            totalFare,
            jobDef.xp,
            "taxi_fare"
        )
        
        -- Reset passenger data for next fare
        session.passengerId = nil
        session.fareBase = nil
        session.distanceBonus = nil
        session.timeBonus = nil
        session.pickupTime = nil
        
        -- Move to next step or complete if no more steps
        session.stepIndex = session.stepIndex + 1
        if session.stepIndex > #session.steps then
            completeRun(player, playerId, session)
        else
            Jobs.syncSession(player)
            pushClientEvent(player, "jobs.showRoute", session.jobId, routePointsForSession(session))
            Jobs.prompt(player, "Ready for next passenger. Head to the pickup location.", "info")
        end
        return true
    end

    Jobs.prompt(player, "Unknown taxi action.", "warn")
    return false
end

-- Police job action handler
handlePoliceAction = function(player, playerId, session, jobDef, payload, forced)
    local step = sessionTarget(session)
    if not step then
        Jobs.stopJob(player, "Police route missing.")
        return false
    end

    -- Security check
    if JobsRP.Security and JobsRP.Config.auth_required then
        local allowed, reason = JobsRP.Security.checkActionRate(player, "police_action")
        if not allowed then
            Jobs.prompt(player, reason, "warn")
            return false
        end
    end

    if step.action == "patrol" then
        Jobs.prompt(player, "Patrol point reached. Continue to next location.", "success")
        
        -- Move to next step
        session.stepIndex = session.stepIndex + 1
        Jobs.syncSession(player)
        pushClientEvent(player, "jobs.showRoute", session.jobId, routePointsForSession(session))
        
        -- Small patrol reward
        local patrolReward = math.random(10, 30)
        if JobsRP.Economy then
            JobsRP.Economy.applyJobReward(playerId, session.jobId, patrolReward, 5, "police_patrol")
        end
        Jobs.prompt(player, string.format("Patrol bonus: $%d", patrolReward), "info")
        return true
    end

    if step.action == "incident" then
        -- Check if incident needs time to complete
        if step.durationMs and step.durationMs > 0 and (not forced) then
            local nowMs = JobsRP.nowMilliseconds()
            if not session.incidentReadyAt then
                session.incidentReadyAt = nowMs + step.durationMs
                Jobs.prompt(player, "Responding to incident. Hold position.", "info")
                Jobs.syncSession(player)
                return true
            end
            
            if nowMs < session.incidentReadyAt then
                local remainSec = math.ceil((session.incidentReadyAt - nowMs) / 1000)
                Jobs.prompt(player, "Incident response in progress: " .. tostring(remainSec) .. "s", "info")
                return false
            end
            
            session.incidentReadyAt = nil
        end
        
        -- Complete incident
        local incidentReward = math.random(40, 80)
        if JobsRP.Economy then
            JobsRP.Economy.applyJobReward(playerId, session.jobId, incidentReward, 15, "police_incident")
        end
        Jobs.prompt(player, string.format("Incident resolved! Reward: $%d", incidentReward), "success")
        
        -- Move to next step
        session.stepIndex = session.stepIndex + 1
        if session.stepIndex > #session.steps then
            completeRun(player, playerId, session)
        else
            Jobs.syncSession(player)
            pushClientEvent(player, "jobs.showRoute", session.jobId, routePointsForSession(session))
            Jobs.prompt(player, "Ready for next assignment.", "info")
        end
        return true
    end

    Jobs.prompt(player, "Unknown police action.", "warn")
    return false
end

local function sessionTarget(session)
    if not session then
        return nil
    end

    if session.groupId then
        local group = Jobs.groupsById[session.groupId]
        if group and group.stageTarget then
            local jobDef = JobsRP.JobDefs.get(session.jobId)
            local stageDef = jobDef and jobDef.stages and jobDef.stages[group.stageIndex] or nil
            if stageDef then
                return {
                    id = stageDef.id,
                    action = stageDef.type,
                    label = stageDef.label,
                    coords = group.stageTarget,
                    distance = JobsRP.toNumber(stageDef.distance, JobsRP.Config.action_distance) or JobsRP.Config.action_distance,
                    durationMs = JobsRP.toNumber(stageDef.durationMs, 0) or 0,
                    stageType = stageDef.type
                }
            end
        end
    end

    return session.steps[session.stepIndex]
end

routePointsForSession = function(session)
    local route = {}
    if not session then
        return route
    end
    if session.groupId then
        local target = sessionTarget(session)
        if target then
            route[#route + 1] = {
                stepIndex = session.stepIndex or 1,
                x = target.coords[1],
                y = target.coords[2],
                z = target.coords[3],
                label = target.label,
                action = target.action,
                stageType = target.stageType
            }
        end
        return route
    end
    if type(session.steps) ~= "table" then
        return route
    end

    for idx = session.stepIndex, #session.steps do
        local step = session.steps[idx]
        route[#route + 1] = {
            stepIndex = idx,
            x = step.coords[1],
            y = step.coords[2],
            z = step.coords[3],
            label = step.label,
            action = step.action
        }
    end

    return route
end

local function publicSession(session)
    if not session then
        return nil
    end

    local target = sessionTarget(session)
    local targetPublic = nil
    if target then
        targetPublic = {
            stepIndex = session.stepIndex,
            id = target.id,
            action = target.action,
            label = target.label,
            x = target.coords[1],
            y = target.coords[2],
            z = target.coords[3],
            distance = target.distance,
            durationMs = target.durationMs,
            stageType = target.stageType
        }
    end

    return {
        active = true,
        jobId = session.jobId,
        stepIndex = session.stepIndex,
        startedAt = session.startedAt,
        expiresAt = session.expiresAt,
        runSeed = session.runSeed,
        vehicleNetId = session.vehicleNetId,
        totalSteps = #session.steps,
        target = targetPublic
    }
end

function Jobs.getSessionByPlayer(player)
    local playerId = JobsRP.Store.getPlayerId(player)
    if not playerId then
        return nil
    end
    return Jobs.sessionsById[playerId]
end

function Jobs.syncProfile(player)
    local playerId = JobsRP.Store.getPlayerId(player)
    if not playerId then
        pushClientEvent(player, "jobs.syncProfile", nil)
        return
    end

    local profile = JobsRP.Store.getProfileByPlayer(player)
    pushClientEvent(player, "jobs.syncProfile", JobsRP.Store.publicProfile(profile))
end

function Jobs.syncSession(player)
    local session = Jobs.getSessionByPlayer(player)
    pushClientEvent(player, "jobs.syncSession", publicSession(session))
end

function Jobs.requestList(player)
    local playerId = requireAuthenticatedAccountId(player)
    if not playerId then
        return false
    end

    local names = {}
    for _, def in ipairs(JobsRP.JobDefs.list or {}) do
        names[#names + 1] = string.format("%s (%s)", def.label, def.id)
    end
    Jobs.prompt(player, "Jobs available: " .. table.concat(names, ", "), "info")
    Jobs.syncProfile(player)
    return true
end

local function getSwitchCooldownRemaining(profile)
    local now = JobsRP.nowSeconds()
    local untilTs = JobsRP.toNumber(profile.switchCooldownUntil, 0) or 0
    local remain = untilTs - now
    if remain < 0 then
        remain = 0
    end
    return remain
end

function Jobs.joinJob(player, jobId)
    local playerId = requireAuthenticatedAccountId(player)
    if not playerId then
        return false
    end

    local normalizedJobId = JobsRP.normalizeName(jobId or "")
    local jobDef = JobsRP.JobDefs.get(normalizedJobId)
    if not jobDef then
        Jobs.prompt(player, "Unknown job id. Use /job list.", "error")
        return false
    end

    local profile = JobsRP.Store.getProfileByPlayer(player)
    local activeSession = Jobs.sessionsById[playerId]
    if activeSession then
        Jobs.prompt(player, "Stop your active run before switching jobs.", "warn")
        return false
    end

    removePlayerFromGroup(playerId)

    if profile.currentJobId == normalizedJobId then
        Jobs.prompt(player, "You already have this job selected. Press E at its hub or /job start.", "info")
        return true
    end

    if profile.currentJobId ~= nil and profile.currentJobId ~= normalizedJobId then
        local remain = getSwitchCooldownRemaining(profile)
        if remain > 0 then
            Jobs.prompt(player, string.format("You can switch jobs in %ds.", remain), "warn")
            return false
        end
        profile.switchCooldownUntil = JobsRP.nowSeconds() + JobsRP.Config.switch_cooldown_sec
    end

    profile.currentJobId = normalizedJobId
    profile.version = JobsRP.Config.version
    JobsRP.Store.markDirty(playerId)

    -- Validate character for job requirements
    if JobsRP.Config.character_enabled and JobsRP.CharacterManager then
        local client = resolveClient(player)
        if client then
            local valid, message = JobsRP.CharacterManager.validateForJob(client, normalizedJobId)
            if not valid then
                Jobs.prompt(player, "Character requirement: " .. message, "warn")
                -- Open character selector with job context
                local success, selectorMessage = JobsRP.CharacterManager.openSelector(client, "jobs")
                if success then
                    Jobs.prompt(player, selectorMessage, "info")
                end
            else
                Jobs.prompt(player, "Character valid for " .. jobDef.label, "success")
            end
        end
    end

    Jobs.syncProfile(player)
    Jobs.prompt(player, "Joined job: " .. jobDef.label .. ". Use /job start or press E at the hub.", "success")
    return true
end

function Jobs.leaveJob(player)
    local playerId = requireAuthenticatedAccountId(player)
    if not playerId then
        return false
    end

    local profile = JobsRP.Store.getProfileByPlayer(player)
    if not profile.currentJobId or profile.currentJobId == "civilian" then
        Jobs.prompt(player, "You're already in civilian life.", "info")
        return false
    end

    removePlayerFromGroup(playerId)
    Jobs.stopJob(player, "Job stopped.")
    profile.currentJobId = "civilian" -- Return to civilian job by default
    profile.switchCooldownUntil = JobsRP.nowSeconds() + JobsRP.Config.switch_cooldown_sec
    JobsRP.Store.markDirty(playerId)
    Jobs.syncProfile(player)
    Jobs.prompt(player, "You left your current job. Returned to civilian life. Cooldown started.", "info")
    return true
end

function Jobs.startRobbery(player, playerId, jobDef)
    if type(jobDef.stages) ~= "table" or #jobDef.stages == 0 then
        Jobs.prompt(player, "Robbery stages are not configured.", "error")
        return false
    end

    local existingGroupId = Jobs.groupByPlayerId[playerId]
    local existingGroup = existingGroupId and Jobs.groupsById[existingGroupId] or nil
    if existingGroup and existingGroup.started then
        Jobs.prompt(player, "Robbery already in progress for your crew.", "info")
        return false
    end

    local group = existingGroup
    if not group then
        group = findOpenRobberyGroup(jobDef)
        if not group then
            group = createRobberyGroup(jobDef)
        end
    end

    addPlayerToGroup(group, playerId, player)
    local minPlayers = getMinPlayers(jobDef)
    local count = groupMemberCount(group)

    if count < minPlayers then
        Jobs.prompt(player, string.format("Waiting for crew (%d/%d).", count, minPlayers), "info")
        return true
    end

    if not group.started then
        if not startRobberyGroup(group, jobDef) then
            Jobs.prompt(player, "Failed to start robbery run.", "error")
            return false
        end
    end

    return true
end

function Jobs.startJob(player, jobId)
    local playerId = requireAuthenticatedAccountId(player, true)
    if not playerId then
        return false
    end

    -- Get jobId from profile if not provided
    if not jobId then
        local profile = JobsRP.Store.getProfile(playerId)
        if not profile or not profile.currentJobId then
            Jobs.prompt(player, "No job selected. Use /job join <job> first.", "warn")
            return false
        end
        jobId = profile.currentJobId
    end

    local normalizedJobId = JobsRP.normalizeName(jobId or "")
    local jobDef = JobsRP.JobDefs.get(normalizedJobId)
    if not jobDef then
        Jobs.prompt(player, "Job not found: " .. tostring(normalizedJobId), "warn")
        return false
    end

    -- Check job constraints
    if jobDef.constraints then
        if jobDef.constraints.role then
            local profile = JobsRP.Store.getProfile(playerId)
            if not profile or profile.role ~= jobDef.constraints.role then
                Jobs.prompt(player, "This job requires role: " .. jobDef.constraints.role, "warn")
                return false
            end
        end

        if jobDef.constraints.minPlayers then
            -- For group jobs like robbery
            if normalizedJobId == "robbery" then
                local activePlayers = getActivePlayerCount()
                if activePlayers < jobDef.constraints.minPlayers then
                    Jobs.prompt(player, string.format("Need %d players for this job (have %d)", 
                        jobDef.constraints.minPlayers, activePlayers), "warn")
                    return false
                end
            end
        end
    end

    -- Stop existing job
    Jobs.stopJob(player, "Switching jobs")

    -- Spawn job vehicle if applicable
    local vehicle = nil
    if normalizedJobId == "taxi" or normalizedJobId == "police" then
        if JobsRP.Vehicles then
            local hubPos = jobDef.hub
            local heading = math.random(0, 360)
            vehicle, vehicleData = JobsRP.Vehicles.spawnJobVehicle(player, normalizedJobId, hubPos, heading)
            
            if vehicle then
                Jobs.prompt(player, "Job vehicle spawned at hub.", "success")
            else
                Jobs.prompt(player, "Failed to spawn job vehicle.", "warn")
            end
        end
    end

    removePlayerFromGroup(playerId)

    local runSeed = makeRunSeed(playerId)
    local steps = buildSteps(jobDef, runSeed)
    if #steps == 0 then
        Jobs.prompt(player, "Failed to build job route.", "error")
        return false
    end

    Jobs.sessionsById[playerId] = {
        active = true,
        jobId = normalizedJobId,
        stepIndex = 1,
        startedAt = JobsRP.nowSeconds(),
        expiresAt = JobsRP.nowSeconds() + JobsRP.Config.run_timeout_sec,
        runSeed = runSeed,
        vehicleNetId = vehicle and vehicle.netId or nil,
        steps = steps,
        repairReadyAt = nil
    }

    Jobs.syncSession(player)
    pushClientEvent(player, "jobs.showRoute", normalizedJobId, routePointsForSession(Jobs.sessionsById[playerId]))
    Jobs.prompt(player, "Run started: " .. jobDef.label, "success")
    return true
end

function Jobs.stopJob(player, reason)
    local playerId = JobsRP.Store.getPlayerId(player)
    if not playerId then
        return false
    end

    local session = Jobs.sessionsById[playerId]
    if not session then
        return false
    end

    if session.groupId then
        removePlayerFromGroup(playerId)
    end

    -- Despawn job vehicles
    if JobsRP.Vehicles then
        JobsRP.Vehicles.despawnAllPlayerVehicles(player)
    end

    Jobs.sessionsById[playerId] = nil
    pushClientEvent(player, "jobs.clearRoute")
    Jobs.syncSession(player)

    if reason and reason ~= "" then
        Jobs.prompt(player, reason, "warn")
    end

    return true
end

completeRun = function(player, playerId, session)
    local jobDef = JobsRP.JobDefs.get(session.jobId)
    if not jobDef then
        Jobs.stopJob(player, "Job definition missing; run canceled.")
        return
    end

    local reward = JobsRP.Economy.applyJobReward(
        playerId,
        session.jobId,
        jobDef.payout,
        jobDef.xp,
        "job:" .. session.jobId
    )

    Jobs.sessionsById[playerId] = nil
    pushClientEvent(player, "jobs.clearRoute")
    Jobs.syncSession(player)
    Jobs.syncProfile(player)

    if not reward then
        Jobs.prompt(player, "Run completed, but reward failed to process.", "error")
        return
    end

    pushClientEvent(
        player,
        "jobs.jobReward",
        session.jobId,
        reward.xpGranted or 0,
        reward.xpTotal or 0,
        reward.gradeBefore or 0,
        reward.gradeAfter or 0,
        reward.payoutGranted or 0
    )

    if reward.payoutGranted > 0 then
        pushClientEvent(player, "jobs.walletUpdate", reward.cashAfter, reward.payoutGranted, "run_complete")
    else
        pushClientEvent(player, "jobs.walletUpdate", reward.cashAfter, 0, "payout_cap")
    end

    local summary = string.format(
        "Run complete. +%d XP, +$%d cash%s",
        reward.xpGranted,
        reward.payoutGranted,
        reward.payoutBlockedByCap and " (cap reached)" or ""
    )
    Jobs.prompt(player, summary, "success")
end

local function rateLimitPassed(playerId)
    local nowMs = JobsRP.nowMilliseconds()
    local last = Jobs.actionRateMsById[playerId] or 0
    if nowMs - last < JobsRP.Config.action_rate_limit_ms then
        return false
    end
    Jobs.actionRateMsById[playerId] = nowMs
    return true
end

function Jobs.requestAction(player, actionType, payload, forced)
    local playerId = requireAuthenticatedAccountId(player, true)
    if not playerId then
        return false
    end

    -- Security validation
    if JobsRP.Security and JobsRP.Config.auth_required and (not forced) then
        local allowed, reason = JobsRP.Security.checkActionRate(player, "job_action")
        if not allowed then
            Jobs.prompt(player, reason, "warn")
            return false
        end
        
        -- Validate job data
        if payload and payload.x and payload.y and payload.z then
            local valid, error = JobsRP.Security.validateJobData(
                Jobs.sessionsById[playerId] and Jobs.sessionsById[playerId].jobId,
                actionType,
                payload
            )
            if not valid then
                Jobs.prompt(player, error, "warn")
                return false
            end
        end
    end

    local session = Jobs.sessionsById[playerId]
    if not session then
        Jobs.prompt(player, "No active run.", "warn")
        return false
    end

    local forced = false
    if type(payload) == "table" and payload.__force == true and JobsRP.Config.debug_quick_test == true then
        if JobsRP.Auth and JobsRP.Auth.isAdmin and JobsRP.Auth.isAdmin(player) then
            forced = true
        else
            Jobs.prompt(player, "Force actions are admin-only.", "warn")
        end
    end

    if actionType ~= "progress" then
        Jobs.prompt(player, "Unsupported action.", "error")
        return false
    end

    if (not forced) and (not rateLimitPassed(playerId)) then
        Jobs.prompt(player, "Action rate-limited.", "warn")
        return false
    end

    if (not forced) and JobsRP.nowSeconds() > session.expiresAt then
        Jobs.stopJob(player, "Run expired. Start again.")
        return false
    end

    local jobDef = JobsRP.JobDefs.get(session.jobId)
    if session.jobId == "robbery" and jobDef then
        return handleRobberyAction(player, playerId, session, jobDef, payload, forced)
    end

    if session.jobId == "civilian" and jobDef then
        return handleCivilianAction(player, playerId, session, jobDef, payload, forced)
    end

    if session.jobId == "taxi" and jobDef then
        return handleTaxiAction(player, playerId, session, jobDef, payload, forced)
    end

    if session.jobId == "police" and jobDef then
        return handlePoliceAction(player, playerId, session, jobDef, payload, forced)
    end

    local step = sessionTarget(session)
    if not step then
        Jobs.stopJob(player, "Session target missing.")
        return false
    end

    local maxDistance = JobsRP.toNumber(step.distance, JobsRP.Config.action_distance) or JobsRP.Config.action_distance
    local distance = getDistanceToCoords(player, step.coords)
    if (not forced) and distance > maxDistance then
        Jobs.prompt(player, string.format("Too far from objective (%.1fm > %.1fm).", distance, maxDistance), "warn")
        return false
    end

    if step.durationMs and step.durationMs > 0 and (not forced) then
        local nowMs = JobsRP.nowMilliseconds()
        if not session.repairReadyAt then
            session.repairReadyAt = nowMs + step.durationMs
            Jobs.syncSession(player)
            Jobs.prompt(player, "Repair started. Interact again when timer finishes.", "info")
            return true
        end
        if nowMs < session.repairReadyAt then
            local remainSec = math.ceil((session.repairReadyAt - nowMs) / 1000)
            Jobs.prompt(player, "Repair in progress: " .. tostring(remainSec) .. "s", "info")
            return false
        end
        session.repairReadyAt = nil
    end

    if forced then
        session.repairReadyAt = nil
    end

    session.stepIndex = session.stepIndex + 1
    if session.stepIndex > #session.steps then
        completeRun(player, playerId, session)
        return true
    end

    Jobs.syncSession(player)
    pushClientEvent(player, "jobs.showRoute", session.jobId, routePointsForSession(session))
    local nextStep = sessionTarget(session)
    Jobs.prompt(player, "Objective updated: " .. tostring(nextStep.label), "info")
    return true
end

function Jobs.requestStatus(player)
    local playerId = requireAuthenticatedAccountId(player)
    if not playerId then
        return false
    end

    local profile = JobsRP.Store.getProfileByPlayer(player)
    local session = Jobs.getSessionByPlayer(player)
    Jobs.syncProfile(player)
    Jobs.syncSession(player)

    local lines = {}
    lines[#lines + 1] = "Cash: $" .. tostring(profile.cash or 0)
    lines[#lines + 1] = "Job: " .. tostring(profile.currentJobId or "none")
    local remain = getSwitchCooldownRemaining(profile)
    lines[#lines + 1] = "Switch cooldown: " .. tostring(remain) .. "s"
    if session then
        lines[#lines + 1] = "Run: active (" .. tostring(session.jobId) .. "), step " .. tostring(session.stepIndex) .. "/" .. tostring(#session.steps)
    else
        lines[#lines + 1] = "Run: idle"
    end

    for _, line in ipairs(lines) do
        chat(player, "[Jobs] " .. line, 180, 220, 255)
    end

    return true
end

function Jobs.onAuthLogin(player)
    local playerId = requireAuthenticatedAccountId(player, true)
    if not playerId then
        return false
    end

    Jobs.syncProfile(player)
    Jobs.syncSession(player)
    return true
end

function Jobs.onAuthLogout(player, reason)
    local playerId = JobsRP.Store.getPlayerId(player)
    if playerId then
        Jobs.sessionsById[playerId] = nil
        Jobs.actionRateMsById[playerId] = nil
        removePlayerFromGroup(playerId)
    end

    pushClientEvent(player, "jobs.clearRoute")
    pushClientEvent(player, "jobs.syncSession", nil)
    pushClientEvent(player, "jobs.syncProfile", nil)

    if reason and reason ~= "" then
        Jobs.prompt(player, reason, "warn")
    end

    return true
end

function Jobs.handlePlayerJoin(player)
    if JobsRP.Auth then
        JobsRP.Auth.handlePlayerJoin(player)
    end

    pushClientEvent(player, "jobs.syncProfile", nil)
    pushClientEvent(player, "jobs.syncSession", nil)
end

function Jobs.selectPoliceDuty(player, dutyId)
    local playerId = JobsRP.Store.getPlayerId(player)
    if not playerId then
        return false, "Player not found"
    end

    local profile = JobsRP.Store.getProfileByPlayer(player)
    if not profile or profile.currentJobId ~= "police" then
        return false, "You must be in the police job to select duties"
    end

    -- Validate duty ID
    local validDuties = {
        patrol = true,
        traffic = true,
        response = true,
        investigation = true
    }

    if not validDuties[dutyId] then
        return false, "Invalid duty type"
    end

    -- Store current duty in profile
    profile.currentPoliceDuty = dutyId
    JobsRP.Store.markDirty(playerId)
    JobsRP.Store.saveProfileById(playerId, true)

    -- Update session if active
    local session = Jobs.sessionsById[playerId]
    if session then
        session.currentDuty = dutyId
        Jobs.syncSession(player)
    end

    local dutyNames = {
        patrol = "Patrol Duty",
        traffic = "Traffic Control", 
        response = "Emergency Response",
        investigation = "Investigation"
    }

    return true, "Duty selected: " .. (dutyNames[dutyId] or dutyId)
end

function Jobs.handlePlayerQuit(player)
    local playerId = JobsRP.Store.getPlayerId(player)

    if JobsRP.Auth then
        JobsRP.Auth.handlePlayerQuit(player)
    else
        JobsRP.Store.detachPlayer(player)
    end

    if playerId then
        Jobs.sessionsById[playerId] = nil
        Jobs.actionRateMsById[playerId] = nil
        removePlayerFromGroup(playerId)
    end
end

local function extractEventClient(a, b)
    return resolveClient(b) or resolveClient(a)
end

addEventHandler("onPlayerJoined", function(a, b)
    local client = extractEventClient(a, b)
    if not client then
        return
    end
    Jobs.handlePlayerJoin(client)
end)

addEventHandler("onPlayerQuit", function(a, b)
    local client = extractEventClient(a, b)
    if not client then
        return
    end
    Jobs.handlePlayerQuit(client)
end)

-- Hub element management system using available APIs
local function createHubElements()
    -- Clear existing hub elements
    Jobs.clearHubElements()

    for _, jobDef in ipairs(JobsRP.JobDefs.list or {}) do
        if jobDef.hub then
            local hubEntry = {
                coords = jobDef.hub,
                color = {255, 220, 0, 200}, -- Yellow color for hubs
                radius = JobsRP.Config.hub_interact_distance or 50,
                zOffset = 0.8
            }

            -- Create hub using available APIs
            local hubData = {
                type = 1, -- 1 = hub checkpoint type
                colour = toColour(
                    hubEntry.color[1], 
                    hubEntry.color[2], 
                    hubEntry.color[3], 
                    hubEntry.color[4]
                ),
                radius = hubEntry.radius,
                jobId = jobDef.id,
                label = jobDef.label,
                coords = {
                    x = hubEntry.coords[1],
                    y = hubEntry.coords[2], 
                    z = hubEntry.coords[3] + (hubEntry.zOffset or 0)
                }
            }

            -- Store hub data for client-side processing
            Jobs.hubElements[jobDef.id] = hubData
            print("[jobs_rp] Created hub data for " .. jobDef.id .. " at " .. table.concat(hubEntry.coords, ", "))
            
            -- Create patrol points for police job
            if jobDef.id == "police" then
                Jobs.createPolicePatrolPoints(hubEntry.coords)
            end
        end
    end
end

function Jobs.clearHubElements()
    Jobs.hubElements = {}
end

-- Create police patrol points using dummy elements
function Jobs.createPolicePatrolPoints(hubCoords)
    if not hubCoords then
        print("[jobs_rp] No hub coords for patrol points")
        return
    end

    local createdCount = 0
    local warnedMissingDummy = false
    
    -- Define patrol points around the police station
    local patrolPoints = {
        {offset = {0, 5, 0}, radius = 3, label = "Main Entrance"},
        {offset = {10, 10, 0}, radius = 3, label = "Parking Area"},
        {offset = {-10, 10, 0}, radius = 3, label = "Briefing Room"},
        {offset = {0, -10, 0}, radius = 3, label = "Vehicle Garage"},
        {offset = {15, 0, 0}, radius = 3, label = "Helipad"}
    }
    
    for i, point in ipairs(patrolPoints) do
        local patrolPos = {
            hubCoords[1] + point.offset[1],
            hubCoords[2] + point.offset[2], 
            hubCoords[3] + point.offset[3]
        }
        
        -- Create dummy element for patrol point
        if createDummyElement then
            local patrolElement = createDummyElement(patrolPos[1], patrolPos[2], patrolPos[3])
            if patrolElement then
                patrolElement.setData("type", 1, true) -- Patrol point type
                patrolElement.setData("radius", point.radius, true)
                patrolElement.setData("label", point.label, true)
                patrolElement.setData("colour", toColour(0, 150, 255, 200), true) -- Blue color
                
                print("[jobs_rp] Created patrol point: " .. point.label .. " at " .. table.concat(patrolPos, ", "))
                createdCount = createdCount + 1
            else
                print("[jobs_rp] Failed to create patrol point: " .. point.label)
            end
        else
            if not warnedMissingDummy then
                print("[jobs_rp] createDummyElement not available")
                warnedMissingDummy = true
            end
        end
    end
    
    if createdCount > 0 then
        print("[jobs_rp] Created " .. createdCount .. " police patrol points")
    else
        print("[jobs_rp] Created 0 police patrol points")
    end
end

function Jobs.getHubElements()
    local count = 0
    for _ in pairs(Jobs.hubElements) do
        count = count + 1
    end
    print("[jobs_rp] getHubElements() called, returning " .. count .. " hub elements")
    for jobId, hubData in pairs(Jobs.hubElements) do
        print("[jobs_rp] Hub element: " .. jobId .. " -> " .. (hubData.label or "no label"))
    end
    return Jobs.hubElements
end

addEventHandler("onResourceStart", function(event, resource)
    math.randomseed(JobsRP.nowSeconds())
    JobsRP.Store.startAutosave()

    -- Initialize authentication system
    local AuthInit = require("server.auth.init")
    if AuthInit then
        AuthInit.init()
    else
        print("[Jobs] Failed to load authentication system")
    end

    -- Create hub elements
    createHubElements()

    if getClients then
        for _, client in ipairs(getClients()) do
            local resolved = resolveClient(client)
            -- Load command system
            if addEventHandler then
                addEventHandler("OnResourceStart", function(res)
                    if res and res ~= thisResource then
                        return
                    end
                    
                    -- Initialize command modules
                    local CommandsInit = require("server.commands.init")
                    if CommandsInit then
                        CommandsInit.init()
                    else
                        print("[Jobs] Failed to load command modules")
                    end
                    
                    -- Load recorded coordinates for broadcasting
                    local list = loadRecordedCoords()
                    broadcastRecordedCoords(list)
                end)
            end
            if resolved then
                Jobs.handlePlayerJoin(resolved)
            end
        end
    elseif getPlayers then
        for _, player in ipairs(getPlayers()) do
            local resolved = resolveClient(player)
            if resolved then
                Jobs.handlePlayerJoin(resolved)
            end
        end
    end
end)

addEventHandler("onResourceStop", function(event, resource)
    Jobs.clearHubElements()
    JobsRP.Store.stopAutosave()
    JobsRP.Store.saveAll(true)
end)

    
    -- Process all players
    if getPlayers then
        for _, player in ipairs(getPlayers()) do
            local playerId = JobsRP.Store.getPlayerId(player)
            if not playerId then
                goto continue
            end
            
            local profile = JobsRP.Store.getProfileByPlayer(player)
            if not profile or profile.currentJobId ~= "civilian" then
                goto continue
            end
            
            -- Initialize or update civilian stats
            if not Jobs.civilianStats[playerId] then
                Jobs.civilianStats[playerId] = {
                    sessionStart = JobsRP.nowMilliseconds(),
                    lastXPGrant = JobsRP.nowMilliseconds(),
                    totalSessionTime = 0
                }
            end
            
            local stats = Jobs.civilianStats[playerId]
            local now = JobsRP.nowMilliseconds()
            local sessionTime = now - stats.sessionStart
            
            -- Check if it's time to grant XP
            if (now - stats.lastXPGrant) >= xpInterval then
                -- Calculate XP amount (doubles after 1 hour)
                local xpAmount = baseXP
                if sessionTime >= doubleAfterHours then
                    xpAmount = baseXP * 2
                end
                
                -- Apply XP gain
                if JobsRP.Economy then
                    JobsRP.Economy.applyJobReward(playerId, "civilian", 0, xpAmount, "passive_time")
                end
                
                -- Send notification to player
                local timeStr = sessionTime >= doubleAfterHours and "doubled" or "base"
                Jobs.prompt(player, string.format("Passive XP gained: +%d (%s rate)", xpAmount, timeStr), "info")
                
                -- Update last grant time
                stats.lastXPGrant = now
                
                -- Send XP update to client for bar visualization
                pushClientEvent(player, "jobs.passiveXPUpdate", {
                    xpAmount = xpAmount,
                    sessionTime = sessionTime,
                    isDoubled = sessionTime >= doubleAfterHours
                })
            end
            
            ::continue::
        end
end

function Jobs.handlePlayerJoin(player)
    -- Initialize civilian stats for joining players
    local playerId = JobsRP.Store.getPlayerId(player)
    if playerId then
        Jobs.civilianStats[playerId] = {
            sessionStart = JobsRP.nowMilliseconds(),
            lastXPGrant = JobsRP.nowMilliseconds(),
            totalSessionTime = 0
        }
    end
end


function Jobs.handlePlayerLeave(player)
    -- Clean up civilian stats for leaving players
    local playerId = JobsRP.Store.getPlayerId(player)
    if playerId and Jobs.civilianStats[playerId] then
        Jobs.civilianStats[playerId] = nil
    end
end

end
