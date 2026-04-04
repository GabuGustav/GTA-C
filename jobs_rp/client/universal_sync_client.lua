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
