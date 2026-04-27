
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
        
        if accountId then
            JobsRP.JobStats.cleanupPlayerSession(accountId)
        end
    end
    
    UniversalSync.playerStates[client] = nil
    print("[UniversalSync] Player quit: " .. (client.name or "Unknown"))
end

function UniversalSync.onPlayerUpdate(client, data)
    local state = UniversalSync.playerStates[client]
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
end

function UniversalSync.mainLoop()
    UniversalSync.serverTick = UniversalSync.serverTick + 1
    
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
    end
end

function UniversalSync.getStats()
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
