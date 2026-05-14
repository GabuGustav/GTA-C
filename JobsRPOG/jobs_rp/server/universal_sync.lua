<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/universal_sync.lua
-- universal_sync.lua - Deterministic snapshot sync (smoothness-first)

UniversalSync = UniversalSync or {}

UniversalSync.playerStates = UniversalSync.playerStates or {}
UniversalSync.serverTick = UniversalSync.serverTick or 0
UniversalSync.globalSeq = UniversalSync.globalSeq or 0
UniversalSync.mainLoopTimer = UniversalSync.mainLoopTimer or nil

UniversalSync.config = {
    rate_ms = 50,                 -- 20Hz snapshots
    stream_distance_players = 350,
    stream_distance_vehicles = 220,
    stream_distance_peds = 160,
    stale_player_timeout_ms = 3000,
    max_entities_per_snapshot = 96,
    include_player_velocity = true
}

UniversalSync.stats = {
    snapshotsSent = 0,
    entitiesSent = 0,
    bytesEstimate = 0,
    droppedInvalidUpdates = 0,
    lastLoopAt = 0
}

local function nowMs()
    return (platform and platform.ticks) or 0
end

local function safeGetClients()
    local clients = {}
    if type(getClients) == "function" then
        local ok, result = pcall(getClients)
        if ok and type(result) == "table" then
            clients = result
        end
    end
    return clients
end

local function isClientValid(client)
    if not client then
        return false
    end
    if type(isElement) == "function" then
        local ok, valid = pcall(isElement, client)
        if ok then
            return valid == true
        end
    end
    return true
end

local function readVec3(value)
    if type(value) == "table" then
        return {
            x = tonumber(value.x) or tonumber(value[1]) or 0,
            y = tonumber(value.y) or tonumber(value[2]) or 0,
            z = tonumber(value.z) or tonumber(value[3]) or 0
        }
    end
    return { x = 0, y = 0, z = 0 }
end

local function getClientPos(client)
    if type(getElementPosition) ~= "function" then
        return nil
    end
    local ok, pos = pcall(getElementPosition, client)
    if ok and type(pos) == "table" then
        return readVec3(pos)
    end
    return nil
end

local function getClientVel(client)
    if type(getElementVelocity) ~= "function" then
        return { x = 0, y = 0, z = 0 }
    end
    local ok, vel = pcall(getElementVelocity, client)
    if ok and type(vel) == "table" then
        return readVec3(vel)
    end
    return { x = 0, y = 0, z = 0 }
end

local function getClientRot(client)
    if type(getElementRotation) ~= "function" then
        return { x = 0, y = 0, z = 0 }
    end
    local ok, rot = pcall(getElementRotation, client)
    if ok and type(rot) == "table" then
        return readVec3(rot)
    end
    return { x = 0, y = 0, z = 0 }
end

local function distance(a, b)
    local dx = (a.x or 0) - (b.x or 0)
    local dy = (a.y or 0) - (b.y or 0)
    local dz = (a.z or 0) - (b.z or 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

local function startRepeating(task, intervalMs)
    if type(setInterval) == "function" then
        return setInterval(task, intervalMs)
    end
    if type(setTimeout) == "function" then
        local alive = true
        local function tick()
            if not alive then
                return
            end
            pcall(task)
            setTimeout(tick, intervalMs)
        end
        setTimeout(tick, intervalMs)
        return { stop = function() alive = false end }
    end
    return nil
end

local function stopRepeating(timer)
    if not timer then
        return
    end
    if type(clearInterval) == "function" then
        pcall(clearInterval, timer)
        return
    end
    if type(timer) == "table" and type(timer.stop) == "function" then
        timer.stop()
    end
end

local function estimatePayloadSize(entityCount)
    return 80 + (entityCount * 96)
end

function UniversalSync.onPlayerJoin(client)
    UniversalSync.playerStates[client] = {
        lastUpdateAt = nowMs(),
        ping = tonumber(client.ping) or 100,
        position = getClientPos(client) or { x = 0, y = 0, z = 0 },
        rotation = getClientRot(client) or { x = 0, y = 0, z = 0 },
        velocity = getClientVel(client) or { x = 0, y = 0, z = 0 },
        playtimeInitialized = false
    }

    print("[UniversalSync] Player joined: " .. tostring(client.name or "Unknown"))

    if JobsRP and JobsRP.JobStats and type(setTimeout) == "function" then
        setTimeout(function()
            if not UniversalSync.playerStates[client] then
                return
            end
            local accountId = nil
            if JobsRP.Auth and JobsRP.Auth.getAccountId then
                accountId = JobsRP.Auth.getAccountId(client)
            end
            if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
                accountId = JobsRP.Store.getPlayerId(client)
            end
            if accountId then
                JobsRP.JobStats.initPlayerSession(accountId)
                JobsRP.JobStats.initPlayerStats(accountId, "civilian")
                UniversalSync.playerStates[client].playtimeInitialized = true
            end
        end, 5000)
    end

    UniversalSync.sendSnapshotToClient(client)
end

function UniversalSync.onPlayerQuit(client)
    if JobsRP and JobsRP.JobStats then
        local accountId = nil
        if JobsRP.Auth and JobsRP.Auth.getAccountId then
            accountId = JobsRP.Auth.getAccountId(client)
        end
        if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
            accountId = JobsRP.Store.getPlayerId(client)
        end
=======

-- universal_sync.lua - Authoritative server with delay compensation
-- Universal sync system for mixed ping players

UniversalSync = {}

-- Global sync state
UniversalSync.playerStates = {}
UniversalSync.entityStates = {}
UniversalSync.serverTick = 0
UniversalSync.baseDelay = 100 -- Base compensation delay in ms

function UniversalSync.init()
    print("[UniversalSync] Initializing universal sync system")
    
    -- Register event handlers
    addEventHandler("OnPlayerJoined", UniversalSync.onPlayerJoin)
    addEventHandler("OnPlayerQuit", UniversalSync.onPlayerQuit)
    
    -- Register network handlers with correct GTAC syntax
    addNetworkHandler("sync_playerUpdate", function(client, data)
        UniversalSync.onPlayerUpdate(client, data)
    end)
    addNetworkHandler("sync_requestState", function(client, data)
        UniversalSync.onStateRequest(client, data)
    end)
    print("[UniversalSync] Network handlers registered")
    
    print("[UniversalSync] Universal sync initialized")
end

function UniversalSync.onPlayerJoin(client)
    -- Initialize player state
    UniversalSync.playerStates[client] = {
        ping = client.ping or 100,
        compensatedDelay = UniversalSync.baseDelay + (client.ping or 100),
        lastUpdate = platform.ticks,
        position = {x=0, y=0, z=0},
        velocity = {x=0, y=0, z=0},
        interpolationBuffer = {},
        playtimeInitialized = false
    }
    
    print("[UniversalSync] Player joined: " .. (client.name or "Unknown") .. " with ping: " .. (client.ping or 100))
    
    -- Delay playtime tracking initialization to wait for authentication
    if JobsRP and JobsRP.JobStats then
        print("[UniversalSync] DEBUG: Scheduling delayed playtime tracking initialization...")
        
        -- Schedule delayed initialization (5 seconds after join)
        if setTimeout then
            setTimeout(function()
                UniversalSync.initializePlaytimeTrackingDelayed(client)
            end, 5000)
        else
            print("[UniversalSync] ERROR: setTimeout not available - using immediate fallback")
            UniversalSync.initializePlaytimeTrackingImmediate(client)
        end
    else
        print("[UniversalSync] DEBUG: JobsRP.JobStats not available")
    end
    
    -- Send current server state immediately
    UniversalSync.sendFullState(client)
end

-- Delayed initialization function
function UniversalSync.initializePlaytimeTrackingDelayed(client)
    if not client or not UniversalSync.playerStates[client] then
        print("[UniversalSync] DEBUG: Client no longer valid for delayed initialization")
        return
    end
    
    print("[UniversalSync] DEBUG: Running delayed playtime tracking initialization...")
    
    -- Get accountId from Auth system or fallback to Store system
    local accountId = nil
    
    -- Try Auth system first
    if JobsRP.Auth and JobsRP.Auth.getAccountId then
        accountId = JobsRP.Auth.getAccountId(client)
        print("[UniversalSync] DEBUG: Auth.getAccountId returned: " .. tostring(accountId))
    end
    
    -- Fallback: Try Store system if Auth fails
    if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
        accountId = JobsRP.Store.getPlayerId(client)
        print("[UniversalSync] DEBUG: Store.getPlayerId returned: " .. tostring(accountId))
    end
    
    -- Final fallback: Use player name as accountId if still no accountId
    if not accountId and client.name then
        accountId = JobsRP.normalizeName(client.name)
        print("[UniversalSync] DEBUG: Using player name as accountId: " .. accountId)
        
        -- Attach to Store system if not already attached
        if JobsRP.Store and JobsRP.Store.attachPlayerAccount then
            JobsRP.Store.attachPlayerAccount(client, accountId)
            print("[UniversalSync] DEBUG: Attached player to Store with accountId: " .. accountId)
        end
    end
    
    if accountId then
        print("[UniversalSync] DEBUG: Player " .. (client.name or "Unknown") .. " has accountId: " .. accountId)
        JobsRP.JobStats.initPlayerSession(accountId)
        JobsRP.JobStats.initPlayerStats(accountId, "civilian")
        UniversalSync.playerStates[client].playtimeInitialized = true
        print("[UniversalSync] DEBUG: Playtime tracking initialized successfully for " .. accountId)
    else
        print("[UniversalSync] DEBUG: Player " .. (client.name or "Unknown") .. " has no accountId - giving up after retries")
        -- Stop retrying to prevent infinite loop
        UniversalSync.playerStates[client].playtimeInitialized = false
    end
end

-- Immediate initialization fallback
function UniversalSync.initializePlaytimeTrackingImmediate(client)
    print("[UniversalSync] DEBUG: Running immediate playtime tracking initialization...")
    
    -- Get accountId from Auth system or fallback to Store system
    local accountId = nil
    
    -- Try Auth system first
    if JobsRP.Auth and JobsRP.Auth.getAccountId then
        accountId = JobsRP.Auth.getAccountId(client)
        print("[UniversalSync] DEBUG: Auth.getAccountId returned: " .. tostring(accountId))
    end
    
    -- Fallback: Try Store system if Auth fails
    if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
        accountId = JobsRP.Store.getPlayerId(client)
        print("[UniversalSync] DEBUG: Store.getPlayerId returned: " .. tostring(accountId))
    end
    
    if accountId then
        print("[UniversalSync] DEBUG: Player " .. (client.name or "Unknown") .. " has accountId: " .. accountId)
        JobsRP.JobStats.initPlayerSession(accountId)
        JobsRP.JobStats.initPlayerStats(accountId, "civilian")
        UniversalSync.playerStates[client].playtimeInitialized = true
    else
        print("[UniversalSync] DEBUG: Player " .. (client.name or "Unknown") .. " has no accountId, skipping playtime tracking")
    end
end

function UniversalSync.onPlayerQuit(client)
    -- Clean up playtime tracking
    if JobsRP and JobsRP.JobStats then
        -- Get accountId from Auth system or fallback to Store system
        local accountId = nil
        
        -- Try Auth system first
        if JobsRP.Auth and JobsRP.Auth.getAccountId then
            accountId = JobsRP.Auth.getAccountId(client)
        end
        
        -- Fallback: Try Store system if Auth fails
        if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
            accountId = JobsRP.Store.getPlayerId(client)
        end
        
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/universal_sync.lua
        if accountId then
            JobsRP.JobStats.cleanupPlayerSession(accountId)
        end
    end
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/universal_sync.lua

    UniversalSync.playerStates[client] = nil
=======
    
    UniversalSync.playerStates[client] = nil
    print("[UniversalSync] Player quit: " .. (client.name or "Unknown"))
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/universal_sync.lua
end

function UniversalSync.onPlayerUpdate(client, data)
    local state = UniversalSync.playerStates[client]
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/universal_sync.lua
    if not state then
        return
    end
    if type(data) ~= "table" then
        UniversalSync.stats.droppedInvalidUpdates = UniversalSync.stats.droppedInvalidUpdates + 1
        return
    end

    state.ping = tonumber(client.ping) or state.ping or 100
    state.lastUpdateAt = nowMs()

    if data.position then
        state.position = readVec3(data.position)
    else
        local livePos = getClientPos(client)
        if livePos then
            state.position = livePos
        end
    end

    if data.rotation then
        state.rotation = readVec3(data.rotation)
    else
        state.rotation = getClientRot(client)
    end

    if data.velocity then
        state.velocity = readVec3(data.velocity)
    else
        state.velocity = getClientVel(client)
    end
end

local function appendRelevantPlayers(targetClient, entities, targetPos)
    for otherClient, otherState in pairs(UniversalSync.playerStates) do
        if otherClient ~= targetClient and isClientValid(otherClient) and otherState then
            local pos = otherState.position or getClientPos(otherClient)
            if pos and distance(targetPos, pos) <= UniversalSync.config.stream_distance_players then
                local numericId = tonumber(otherClient.id)
                entities[#entities + 1] = {
                    id = tostring(otherClient.id or ""),
                    playerNumericId = numericId,
                    playerName = tostring(otherClient.name or ""),
                    type = "player",
                    pos = pos,
                    rot = otherState.rotation or getClientRot(otherClient),
                    vel = UniversalSync.config.include_player_velocity and (otherState.velocity or getClientVel(otherClient)) or nil,
                    ping = otherState.ping or 0
                }
                if #entities >= UniversalSync.config.max_entities_per_snapshot then
                    return
                end
            end
        end
    end
end

local function appendRelevantElements(targetPos, entities, elementType, maxDistance, includeVelocity)
    if type(getElementsByType) ~= "function" then
        return
    end
    local okList, list = pcall(getElementsByType, elementType)
    if not okList or type(list) ~= "table" then
        return
    end

    for _, element in pairs(list) do
        if isClientValid(element) and type(getElementPosition) == "function" then
            local okPos, posRaw = pcall(getElementPosition, element)
            if okPos and type(posRaw) == "table" then
                local pos = readVec3(posRaw)
                if distance(targetPos, pos) <= maxDistance then
                    local rot = nil
                    local vel = nil
                    if type(getElementRotation) == "function" then
                        local okRot, rotRaw = pcall(getElementRotation, element)
                        if okRot and type(rotRaw) == "table" then
                            rot = readVec3(rotRaw)
                        end
                    end
                    if includeVelocity and type(getElementVelocity) == "function" then
                        local okVel, velRaw = pcall(getElementVelocity, element)
                        if okVel and type(velRaw) == "table" then
                            vel = readVec3(velRaw)
                        end
                    end

                    local elementId = (type(getElementID) == "function" and getElementID(element)) or nil
                    if elementId and tostring(elementId) ~= "" then
                        entities[#entities + 1] = {
                            id = tostring(elementId),
                            type = elementType,
                            pos = pos,
                            rot = rot,
                            vel = vel
                        }
                    end
                    if #entities >= UniversalSync.config.max_entities_per_snapshot then
                        return
                    end
                end
            end
        end
    end
end

function UniversalSync.buildSnapshotForClient(targetClient)
    local targetPos = getClientPos(targetClient)
    if not targetPos then
        local state = UniversalSync.playerStates[targetClient]
        targetPos = state and state.position or { x = 0, y = 0, z = 0 }
    end

    local entities = {}
    appendRelevantPlayers(targetClient, entities, targetPos)

    if #entities < UniversalSync.config.max_entities_per_snapshot then
        appendRelevantElements(targetPos, entities, "vehicle", UniversalSync.config.stream_distance_vehicles, true)
    end
    if #entities < UniversalSync.config.max_entities_per_snapshot then
        appendRelevantElements(targetPos, entities, "ped", UniversalSync.config.stream_distance_peds, false)
    end

    UniversalSync.globalSeq = UniversalSync.globalSeq + 1

    return {
        seq = UniversalSync.globalSeq,
        serverTime = nowMs(),
        tick = UniversalSync.serverTick,
        entities = entities
    }
end

function UniversalSync.sendSnapshotToClient(client)
    if not isClientValid(client) then
        return
    end
    local payload = UniversalSync.buildSnapshotForClient(client)
    if type(triggerNetworkEvent) == "function" then
        triggerNetworkEvent("sync_worldSnapshot", client, payload)
        -- Compatibility shim: old listeners still get snapshot metadata.
        triggerNetworkEvent("sync_entityUpdate", client, {
            entities = payload.entities,
            delay = UniversalSync.config.rate_ms,
            serverTick = payload.tick,
            seq = payload.seq,
            serverTime = payload.serverTime
        })
    end

    UniversalSync.stats.snapshotsSent = UniversalSync.stats.snapshotsSent + 1
    UniversalSync.stats.entitiesSent = UniversalSync.stats.entitiesSent + #payload.entities
    UniversalSync.stats.bytesEstimate = UniversalSync.stats.bytesEstimate + estimatePayloadSize(#payload.entities)
end

function UniversalSync.onStateRequest(client, _data)
    UniversalSync.sendSnapshotToClient(client)
end

function UniversalSync.cleanupStalePlayers()
    local now = nowMs()
    for client, state in pairs(UniversalSync.playerStates) do
        if (now - (state.lastUpdateAt or 0)) > UniversalSync.config.stale_player_timeout_ms then
            local livePos = getClientPos(client)
            if livePos then
                state.position = livePos
                state.rotation = getClientRot(client)
                state.velocity = getClientVel(client)
                state.lastUpdateAt = now
            end
        end
    end
=======
    if not state then return end
    
    -- Update ping and compensation
    state.ping = client.ping or 100
    state.compensatedDelay = UniversalSync.baseDelay + state.ping
    
    -- Calculate velocity for high-speed compensation
    local velocity = data.velocity or {x=0, y=0, z=0}
    local speed = math.sqrt(velocity.x^2 + velocity.y^2 + velocity.z^2)
    
    -- Increase sync rate for high-speed vehicles
    local dynamicDelay = state.compensatedDelay
    if speed > 15 then -- High speed (30+ KM/H)
        dynamicDelay = dynamicDelay / 2 -- Reduce delay for faster sync
        print("[UniversalSync] High speed detected for " .. (client.name or "Unknown") .. ": " .. math.floor(speed * 3.6) .. "KM/H, reducing delay to " .. dynamicDelay .. "ms")
    end
    
    -- Buffer the update for delay compensation
    table.insert(state.interpolationBuffer, {
        position = data.position or state.position,
        velocity = velocity,
        timestamp = platform.ticks,
        serverTick = UniversalSync.serverTick,
        speed = speed
    })
    
    -- Keep buffer size manageable (last 10 updates)
    if #state.interpolationBuffer > 10 then
        table.remove(state.interpolationBuffer, 1)
    end
    
    state.lastUpdate = platform.ticks
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/universal_sync.lua
end

function UniversalSync.mainLoop()
    UniversalSync.serverTick = UniversalSync.serverTick + 1
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/universal_sync.lua
    UniversalSync.stats.lastLoopAt = nowMs()

    local clients = safeGetClients()
    for _, client in ipairs(clients) do
        if UniversalSync.playerStates[client] then
            UniversalSync.sendSnapshotToClient(client)
        end
    end

    if UniversalSync.serverTick % 20 == 0 then
        UniversalSync.cleanupStalePlayers()
=======
    
    -- Process all players
    for client, state in pairs(UniversalSync.playerStates) do
        UniversalSync.processPlayerSync(client, state)
    end
    
    -- Broadcast entity updates every 3 ticks (150ms)
    if UniversalSync.serverTick % 3 == 0 then
        UniversalSync.broadcastEntityUpdates()
    end
    
    -- Clean up old buffer entries every 60 ticks (3 seconds)
    if UniversalSync.serverTick % 60 == 0 then
        UniversalSync.cleanupBuffers()
    end
end

function UniversalSync.processPlayerSync(client, state)
    local currentTime = platform.ticks
    
    -- Find the appropriate buffered update based on delay compensation
    local targetTime = currentTime - state.compensatedDelay
    local bestUpdate = nil
    
    for i = #state.interpolationBuffer, 1, -1 do
        local update = state.interpolationBuffer[i]
        if update.timestamp <= targetTime then
            bestUpdate = update
            break
        end
    end
    
    if bestUpdate then
        -- Update player state
        state.position = bestUpdate.position
        state.velocity = bestUpdate.velocity
        
        -- Send compensated update to all other players
        for otherClient, otherState in pairs(UniversalSync.playerStates) do
            if otherClient ~= client then
                triggerNetworkEvent("sync_playerState", otherClient, {
                    playerId = client.id,
                    position = bestUpdate.position,
                    velocity = bestUpdate.velocity,
                    serverTick = bestUpdate.serverTick,
                    interpolated = true,
                    ping = state.ping
                })
            end
        end
    end
end

function UniversalSync.sendFullState(client)
    -- Send all current player states to the new client
    for otherClient, state in pairs(UniversalSync.playerStates) do
        if otherClient ~= client then
            triggerNetworkEvent("sync_playerState", client, {
                playerId = otherClient.id,
                position = state.position,
                velocity = state.velocity,
                serverTick = UniversalSync.serverTick,
                interpolated = false,
                ping = state.ping
            })
        end
    end
end

function UniversalSync.broadcastEntityUpdates()
    -- Sync vehicles and other entities with delay compensation
    for client, state in pairs(UniversalSync.playerStates) do
        local entities = UniversalSync.getRelevantEntities(client)
        if #entities > 0 then
            triggerNetworkEvent("sync_entityUpdate", client, {
                entities = entities,
                delay = state.compensatedDelay,
                serverTick = UniversalSync.serverTick
            })
        end
    end
end

function UniversalSync.getRelevantEntities(client)
    -- Return entities within streaming distance
    local entities = {}
    
    if not client or not isElement(client) then
        return entities
    end
    
    local playerPos = getElementPosition(client)
    if not playerPos then
        return entities
    end
    
    -- Add vehicles within range
    local vehicles = getElementsByType("vehicle")
    for _, entity in pairs(vehicles) do
        if isElement(entity) then
            local entityPos = getElementPosition(entity)
            if entityPos then
                local distance = getDistanceBetweenPoints3D(playerPos, entityPos)
                
                if distance < 200 then -- Stream distance
                    table.insert(entities, {
                        id = getElementID(entity),
                        type = "vehicle",
                        position = entityPos,
                        rotation = getElementRotation(entity),
                        velocity = getElementVelocity(entity),
                        model = getElementModel(entity)
                    })
                end
            end
        end
    end
    
    -- Add peds within range
    local peds = getElementsByType("ped")
    for _, entity in pairs(peds) do
        if isElement(entity) then
            local entityPos = getElementPosition(entity)
            if entityPos then
                local distance = getDistanceBetweenPoints3D(playerPos, entityPos)
                
                if distance < 150 then -- Stream distance for peds
                    table.insert(entities, {
                        id = getElementID(entity),
                        type = "ped",
                        position = entityPos,
                        rotation = getElementRotation(entity),
                        model = getElementModel(entity)
                    })
                end
            end
        end
    end
    
    return entities
end

function UniversalSync.cleanupBuffers()
    -- Clean up old buffer entries to prevent memory leaks
    for client, state in pairs(UniversalSync.playerStates) do
        local currentTime = platform.ticks
        local cutoffTime = currentTime - 5000 -- 5 seconds
        
        -- Remove old entries
        for i = #state.interpolationBuffer, 1, -1 do
            if state.interpolationBuffer[i].timestamp < cutoffTime then
                table.remove(state.interpolationBuffer, i)
            end
        end
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/universal_sync.lua
    end
end

function UniversalSync.getStats()
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/server/universal_sync.lua
    local players = 0
    local avgPing = 0
    local maxPing = 0

    for _, state in pairs(UniversalSync.playerStates) do
        players = players + 1
        avgPing = avgPing + (state.ping or 0)
        if (state.ping or 0) > maxPing then
            maxPing = state.ping or 0
        end
    end

    if players > 0 then
        avgPing = avgPing / players
    end

    return {
        players = players,
        avgPing = avgPing,
        maxPing = maxPing,
        tick = UniversalSync.serverTick,
        seq = UniversalSync.globalSeq,
        snapshotsSent = UniversalSync.stats.snapshotsSent,
        entitiesSent = UniversalSync.stats.entitiesSent,
        bytesEstimate = UniversalSync.stats.bytesEstimate,
        droppedInvalidUpdates = UniversalSync.stats.droppedInvalidUpdates,
        lastLoopAt = UniversalSync.stats.lastLoopAt
    }
end

function UniversalSync.showSyncStats(adminClient)
    local s = UniversalSync.getStats()
    local msg = string.format(
        "[Sync] Players:%d AvgPing:%.0f MaxPing:%.0f Tick:%d Seq:%d Snapshots:%d Entities:%d KB:%.1f Dropped:%d",
        s.players, s.avgPing, s.maxPing, s.tick, s.seq, s.snapshotsSent, s.entitiesSent, (s.bytesEstimate / 1024), s.droppedInvalidUpdates
    )

    if adminClient and type(messageClient) == "function" then
        messageClient(adminClient, msg, 0, 255, 120)
    else
        print(msg)
    end
end

function UniversalSync.init()
    print("[UniversalSync] Initializing snapshot sync")

    addEventHandler("OnPlayerJoined", UniversalSync.onPlayerJoin)
    addEventHandler("OnPlayerQuit", UniversalSync.onPlayerQuit)

    addNetworkHandler("sync_playerUpdate", function(client, data)
        UniversalSync.onPlayerUpdate(client, data)
    end)

    addNetworkHandler("sync_requestState", function(client, data)
        UniversalSync.onStateRequest(client, data)
    end)

    stopRepeating(UniversalSync.mainLoopTimer)
    UniversalSync.mainLoopTimer = startRepeating(function()
        UniversalSync.mainLoop()
    end, UniversalSync.config.rate_ms)

    if type(addCommandHandler) == "function" then
        addCommandHandler("syncserverstats", function(...)
            local client = nil
            if select("#", ...) > 0 then
                local a = select(1, ...)
                if type(a) == "userdata" or type(a) == "table" then
                    client = a
                end
            end
            UniversalSync.showSyncStats(client)
        end)
    end

    print("[UniversalSync] Snapshot sync loaded at " .. tostring(UniversalSync.config.rate_ms) .. "ms")
end

UniversalSync.init()
=======
    local totalPlayers = 0
    local avgPing = 0
    local maxPing = 0
    
    for client, state in pairs(UniversalSync.playerStates) do
        totalPlayers = totalPlayers + 1
        avgPing = avgPing + state.ping
        if state.ping > maxPing then
            maxPing = state.ping
        end
    end
    
    if totalPlayers > 0 then
        avgPing = avgPing / totalPlayers
    end
    
    return {
        totalPlayers = totalPlayers,
        averagePing = avgPing,
        maxPing = maxPing,
        serverTick = UniversalSync.serverTick
    }
end

-- Admin command to show sync stats
function UniversalSync.showSyncStats(adminClient)
    local stats = UniversalSync.getStats()
    local message = string.format("[Sync] Players: %d, Avg Ping: %.0fms, Max Ping: %.0fms, Server Tick: %d", 
        stats.totalPlayers, stats.averagePing, stats.maxPing, stats.serverTick)
    
    if adminClient and messageClient then
        messageClient(adminClient, message, 0, 255, 0)
    else
        print(message)
    end
end

-- Initialize the system
UniversalSync.init()

print("[UniversalSync] Universal sync system loaded successfully")
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/server/universal_sync.lua
