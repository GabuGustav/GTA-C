<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/universal_sync_client.lua
-- universal_sync_client.lua - Snapshot interpolation/extrapolation (smoothness-first)

local SyncClient = {}

SyncClient.config = {
    interp_delay_ms = 120,
    max_extrap_ms = 140,
    snap_threshold = 9.0,
    blend_factor = 0.25,
    max_buffer_per_entity = 30,
    stale_entity_ms = 6000,
    render_rate_ms = 16,
    request_state_interval_ms = 2000,
    jitter_alpha = 0.08,
    jitter_clamp_min = 90,
    jitter_clamp_max = 180
}

SyncClient.buffers = {}
SyncClient.lastSeq = 0
SyncClient.metrics = {
    snapshotsReceived = 0,
    staleDropped = 0,
    extrapolations = 0,
    blendCorrections = 0,
    hardCorrections = 0,
    lastInterpDelay = SyncClient.config.interp_delay_ms,
    jitterEstimate = 0,
    activeEntities = 0
}

local function nowMs()
    return (gta and gta.tickCount) or 0
end

local function toVec3(v)
    if type(v) ~= "table" then
        return { x = 0, y = 0, z = 0 }
    end
    return {
        x = tonumber(v.x) or tonumber(v[1]) or 0,
        y = tonumber(v.y) or tonumber(v[2]) or 0,
        z = tonumber(v.z) or tonumber(v[3]) or 0
    }
end

local function vecDist(a, b)
    local dx = (a.x or 0) - (b.x or 0)
    local dy = (a.y or 0) - (b.y or 0)
    local dz = (a.z or 0) - (b.z or 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

local function lerp(a, b, t)
    return a + (b - a) * t
end

local function lerpVec3(a, b, t)
    return {
        x = lerp(a.x, b.x, t),
        y = lerp(a.y, b.y, t),
        z = lerp(a.z, b.z, t)
    }
end

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function startRepeating(task, intervalMs)
    if type(setInterval) == "function" then
        setInterval(task, intervalMs)
        return true
    end
    if type(setTimeout) == "function" then
        local function tick()
            pcall(task)
            setTimeout(tick, intervalMs)
        end
        setTimeout(tick, intervalMs)
        return true
    end
    return false
end

local function makeEntityKey(entityType, entityId)
    return tostring(entityType or "unknown") .. ":" .. tostring(entityId or "")
end

local function getEntityElement(entity)
    if not entity or not entity.id then
        return nil
    end

    if entity.type == "player" and type(getPlayerFromID) == "function" then
        local candidateId = tonumber(entity.playerNumericId) or tonumber(entity.id)
        local p = candidateId and getPlayerFromID(candidateId) or nil
        if (not p) and entity.playerName and entity.playerName ~= "" and type(getPlayers) == "function" then
            local players = getPlayers()
            if type(players) == "table" then
                for _, pp in ipairs(players) do
                    if pp and pp.name == entity.playerName then
                        p = pp
                        break
                    end
                end
            end
        end
        if p and (type(isElement) ~= "function" or isElement(p)) then
            return p
        end
    end

    if type(getElementByID) == "function" then
        local e = getElementByID(entity.id)
        if e and (type(isElement) ~= "function" or isElement(e)) then
            return e
        end
    end

    return nil
end

function SyncClient.getBuffer(id)
    local buffer = SyncClient.buffers[id]
    if not buffer then
        buffer = {
            snapshots = {},
            type = "unknown",
            lastAppliedPos = nil,
            lastSeenAt = nowMs()
        }
        SyncClient.buffers[id] = buffer
    end
    return buffer
end

function SyncClient.updateInterpDelay(arrivalDelta)
    local jitter = math.abs((arrivalDelta or 0) - SyncClient.config.interp_delay_ms)
    local oldJitter = SyncClient.metrics.jitterEstimate or 0
    local nextJitter = oldJitter + (jitter - oldJitter) * SyncClient.config.jitter_alpha
    SyncClient.metrics.jitterEstimate = nextJitter

    local dynamicDelay = SyncClient.config.interp_delay_ms + (nextJitter * 0.5)
    SyncClient.metrics.lastInterpDelay = clamp(dynamicDelay, SyncClient.config.jitter_clamp_min, SyncClient.config.jitter_clamp_max)
end

function SyncClient.onWorldSnapshot(data)
    if type(data) ~= "table" then
        return
    end

    local seq = tonumber(data.seq) or 0
    if seq <= SyncClient.lastSeq then
        SyncClient.metrics.staleDropped = SyncClient.metrics.staleDropped + 1
        return
    end

    local previousSeq = SyncClient.lastSeq
    SyncClient.lastSeq = seq
    SyncClient.metrics.snapshotsReceived = SyncClient.metrics.snapshotsReceived + 1

    if previousSeq > 0 then
        SyncClient.updateInterpDelay(nowMs() - (tonumber(data.serverTime) or nowMs()))
    end

    local entities = data.entities
    if type(entities) ~= "table" then
        return
    end

    local arrival = nowMs()

    for _, entity in ipairs(entities) do
        if type(entity) == "table" and entity.id and entity.pos then
            local key = makeEntityKey(entity.type, entity.id)
            local buffer = SyncClient.getBuffer(key)
            buffer.type = entity.type or buffer.type
            buffer.entityRef = {
                id = entity.id,
                playerNumericId = entity.playerNumericId,
                playerName = entity.playerName,
                type = entity.type
            }
            buffer.lastSeenAt = arrival

            local snap = {
                seq = seq,
                serverTime = tonumber(data.serverTime) or arrival,
                arrivalTime = arrival,
                pos = toVec3(entity.pos),
                rot = entity.rot and toVec3(entity.rot) or nil,
                vel = entity.vel and toVec3(entity.vel) or nil
            }

            local snaps = buffer.snapshots
            snaps[#snaps + 1] = snap
            if #snaps > SyncClient.config.max_buffer_per_entity then
                table.remove(snaps, 1)
            end
        end
    end
end

function SyncClient.sampleBuffer(buffer, renderTime)
    local snaps = buffer.snapshots
    local count = #snaps
    if count == 0 then
        return nil, nil, 0
    end
    if count == 1 then
        return snaps[1], nil, 0
    end

    local older = nil
    local newer = nil

    for i = count, 1, -1 do
        local s = snaps[i]
        if s.serverTime <= renderTime then
            older = s
            newer = snaps[i + 1]
            break
        end
    end

    if not older then
        older = snaps[1]
        newer = snaps[2]
    end

    if not newer then
        return older, nil, 1
    end

    local dt = math.max(1, (newer.serverTime - older.serverTime))
    local t = clamp((renderTime - older.serverTime) / dt, 0, 1)
    return older, newer, t
end

function SyncClient.applyEntityState(entityId, buffer, renderTime)
    local ref = buffer.entityRef or { id = entityId, type = buffer.type }
    local element = getEntityElement(ref)
    if not element then
        return
    end

    local a, b, t = SyncClient.sampleBuffer(buffer, renderTime)
    if not a then
        return
    end

    local desiredPos = a.pos
    local desiredRot = a.rot
    local desiredVel = a.vel

    if b then
        desiredPos = lerpVec3(a.pos, b.pos, t)
        if a.rot and b.rot then
            desiredRot = lerpVec3(a.rot, b.rot, t)
        end
        if a.vel and b.vel then
            desiredVel = lerpVec3(a.vel, b.vel, t)
        end
    else
        local extrapMs = renderTime - a.serverTime
        if extrapMs > 0 and extrapMs <= SyncClient.config.max_extrap_ms and a.vel then
            desiredPos = {
                x = a.pos.x + a.vel.x * (extrapMs / 1000.0),
                y = a.pos.y + a.vel.y * (extrapMs / 1000.0),
                z = a.pos.z + a.vel.z * (extrapMs / 1000.0)
            }
            SyncClient.metrics.extrapolations = SyncClient.metrics.extrapolations + 1
        end
    end

    local currentPos = nil
    if type(getElementPosition) == "function" then
        local okPos, posRaw = pcall(getElementPosition, element)
        if okPos and type(posRaw) == "table" then
            currentPos = toVec3(posRaw)
        end
    end

    if not currentPos then
        if type(setElementPosition) == "function" then
            setElementPosition(element, desiredPos)
        end
        buffer.lastAppliedPos = desiredPos
    else
        local d = vecDist(currentPos, desiredPos)
        if d >= SyncClient.config.snap_threshold then
            if type(setElementPosition) == "function" then
                setElementPosition(element, desiredPos)
            end
            SyncClient.metrics.hardCorrections = SyncClient.metrics.hardCorrections + 1
        else
            local blended = lerpVec3(currentPos, desiredPos, SyncClient.config.blend_factor)
            if type(setElementPosition) == "function" then
                setElementPosition(element, blended)
            end
            SyncClient.metrics.blendCorrections = SyncClient.metrics.blendCorrections + 1
        end
        buffer.lastAppliedPos = desiredPos
    end

    if desiredRot and type(setElementRotation) == "function" then
        setElementRotation(element, desiredRot)
    end

    if desiredVel and type(setElementVelocity) == "function" then
        setElementVelocity(element, desiredVel)
    end
end

function SyncClient.renderLoop()
    local now = nowMs()
    local renderTime = now - (SyncClient.metrics.lastInterpDelay or SyncClient.config.interp_delay_ms)

    local active = 0
    for entityId, buffer in pairs(SyncClient.buffers) do
        if (now - (buffer.lastSeenAt or now)) > SyncClient.config.stale_entity_ms then
            SyncClient.buffers[entityId] = nil
        else
            active = active + 1
            SyncClient.applyEntityState(entityId, buffer, renderTime)
        end
    end
    SyncClient.metrics.activeEntities = active
end

function SyncClient.sendLocalUpdate()
    if not localPlayer then
        return
    end

    if type(isElement) == "function" and not isElement(localPlayer) then
        return
    end

    local pos = nil
    local rot = nil
    local vel = nil

    if type(getElementPosition) == "function" then
        local okPos, posRaw = pcall(getElementPosition, localPlayer)
        if okPos and type(posRaw) == "table" then
            pos = toVec3(posRaw)
        end
    end
    if type(getElementRotation) == "function" then
        local okRot, rotRaw = pcall(getElementRotation, localPlayer)
        if okRot and type(rotRaw) == "table" then
            rot = toVec3(rotRaw)
        end
    end
    if type(getElementVelocity) == "function" then
        local okVel, velRaw = pcall(getElementVelocity, localPlayer)
        if okVel and type(velRaw) == "table" then
            vel = toVec3(velRaw)
        end
    end

    if pos and type(triggerNetworkEvent) == "function" then
        triggerNetworkEvent("sync_playerUpdate", {
            position = pos,
            rotation = rot,
            velocity = vel,
            timestamp = nowMs()
        })
    end
end

function SyncClient.requestState()
    if type(triggerNetworkEvent) == "function" then
        triggerNetworkEvent("sync_requestState", { reason = "periodic" })
    end
end

addNetworkHandler("sync_worldSnapshot", function(_client, data)
    SyncClient.onWorldSnapshot(data)
end)

-- Compatibility shim: if server still emits old packets, map them.
addNetworkHandler("sync_entityUpdate", function(_client, data)
    if type(data) ~= "table" or type(data.entities) ~= "table" then
        return
    end
    SyncClient.onWorldSnapshot({
        seq = tonumber(data.seq) or (SyncClient.lastSeq + 1),
        serverTime = tonumber(data.serverTime) or nowMs(),
        tick = tonumber(data.serverTick) or 0,
        entities = data.entities
    })
end)

startRepeating(function()
    SyncClient.renderLoop()
end, SyncClient.config.render_rate_ms)

startRepeating(function()
    SyncClient.sendLocalUpdate()
end, 50)

startRepeating(function()
    SyncClient.requestState()
end, SyncClient.config.request_state_interval_ms)

addCommandHandler("syncstats", function()
    local m = SyncClient.metrics
    local out = string.format(
        "snap:%d stale:%d active:%d interp:%dms jitter:%.1f extrap:%d blend:%d hard:%d",
        m.snapshotsReceived,
        m.staleDropped,
        m.activeEntities,
        math.floor(m.lastInterpDelay or 0),
        m.jitterEstimate or 0,
        m.extrapolations,
        m.blendCorrections,
        m.hardCorrections
    )
    if type(message) == "function" then
        message("[Sync] " .. out, 255, 255, 120)
    else
        print("[Sync] " .. out)
    end
end)

print("[UniversalSync Client] Snapshot interpolation loaded")
=======
-- universal_sync_client.lua - Client-side interpolation for universal sync
-- Smooth interpolation for mixed ping environments

local interpolationBuffer = {}
local player = localPlayer
local lastUpdateTime = gta.tickCount

-- Network event handlers with correct GTAC syntax
addNetworkHandler("sync_playerState", function(client, data)
    if data.interpolated then
        -- Smooth interpolate to new position
        local currentTime = gta.tickCount
        
        -- Adjust interpolation duration based on speed
        local duration = math.max(50, data.ping or 100) -- Base duration
        if data.speed and data.speed > 15 then -- High speed
            duration = duration / 2 -- Faster interpolation for high speed
        end
        
        interpolationBuffer[data.playerId] = {
            targetPos = data.position,
            targetVel = data.velocity,
            startTime = currentTime,
            duration = duration,
            serverTick = data.serverTick,
            ping = data.ping,
            speed = data.speed or 0
        }
    else
        -- Instant update for initial state
        local player = getPlayerFromID(data.playerId)
        if player and isElement(player) then
            setElementPosition(player, data.position)
            if data.velocity then
                setElementVelocity(player, data.velocity)
            end
        end
    end
end)

addNetworkHandler("sync_entityUpdate", function(client, data)
    -- Handle vehicle and other entity updates with interpolation
    for _, entity in ipairs(data.entities) do
        local element = getElementByID(entity.id)
        if element and isElement(element) then
            -- Apply delay compensation
            local delay = data.delay or 100
            if setTimeout then
                setTimeout(function()
                    if isElement(element) then
                        setElementPosition(element, entity.position)
                        if entity.rotation then
                            setElementRotation(element, entity.rotation)
                        end
                        if entity.velocity then
                            setElementVelocity(element, entity.velocity)
                        end
                    end
                end, delay, 1)
            end
        end
    end
end)

-- Smooth interpolation loop
if setTimeout then
    setTimeout(function()
        local currentTime = gta.tickCount
        
        for playerId, buffer in pairs(interpolationBuffer) do
            local player = getPlayerFromID(playerId)
            if player and isElement(player) then
                local elapsed = currentTime - buffer.startTime
                local progress = math.min(elapsed / buffer.duration, 1.0)
                
                -- Smooth easing function (ease-in-out)
                local easedProgress
                if progress < 0.5 then
                    easedProgress = 2 * progress * progress
                else
                    easedProgress = 1 - math.pow(-2 * progress + 2, 2) / 2
                end
                
                -- Get current position
                local currentPos = getElementPosition(player)
                if currentPos then
                    -- Calculate interpolated position
                    local newPos = {
                        x = currentPos.x + (buffer.targetPos.x - currentPos.x) * easedProgress,
                        y = currentPos.y + (buffer.targetPos.y - currentPos.y) * easedProgress,
                        z = currentPos.z + (buffer.targetPos.z - currentPos.z) * easedProgress
                    }
                    
                    -- Apply interpolated position
                    setElementPosition(player, newPos)
                    
                    -- Apply velocity if available and close to target
                    if buffer.targetVel and progress > 0.8 then
                        setElementVelocity(player, buffer.targetVel)
                    end
                end
                
                -- Remove completed interpolations
                if progress >= 1.0 then
                    interpolationBuffer[playerId] = nil
                end
            else
                -- Clean up invalid player references
                interpolationBuffer[playerId] = nil
            end
        end
    end, 16)
end

-- Send local player updates to server (disabled due to GTAC timer issues)
-- setTimer(function()
--     if player and isElement(player) then
--         local pos = getElementPosition(player)
--         local vel = getElementVelocity(player)
--         
--         if pos then
--             triggerNetworkEvent("sync_playerUpdate", rootElement, {
--                 position = pos,
--                 velocity = vel,
--                 timestamp = getTickCount()
--             })
--         end
--     end
-- end, 50, 0) -- Send updates 20 times per second

-- Debug command to show interpolation stats
addCommandHandler("syncstats", function()
    local activeInterpolations = 0
    local avgPing = 0
    local count = 0
    
    for playerId, buffer in pairs(interpolationBuffer) do
        activeInterpolations = activeInterpolations + 1
        if buffer.ping then
            avgPing = avgPing + buffer.ping
            count = count + 1
        end
    end
    
    if count > 0 then
        avgPing = avgPing / count
    end
    
    local output = string.format("Active interpolations: %d, Average ping: %.0fms", activeInterpolations, avgPing)
    message("[Sync] " .. output, 255, 255, 0)
end)

-- Clean up old interpolation entries periodically (disabled due to GTAC timer issues)
-- setTimer(function()
--     local currentTime = gta.tickCount
--     local cutoffTime = currentTime - 5000 -- 5 seconds
--     
--     for playerId, buffer in pairs(interpolationBuffer) do
--         if buffer.startTime < cutoffTime then
--             interpolationBuffer[playerId] = nil
--         end
--     end
-- end, 10000, 0) -- Clean up every 10 seconds

print("[UniversalSync Client] Client-side interpolation loaded")
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/universal_sync_client.lua
