-- Vehicle management for jobs_rp
-- Handles job-specific vehicle spawning, tracking, and cleanup

JobsRP = JobsRP or {}
JobsRP.Vehicles = JobsRP.Vehicles or {}

local Vehicles = JobsRP.Vehicles

-- Vehicle tracking data
Vehicles.vehiclesByPlayer = Vehicles.vehiclesByPlayer or {}
Vehicles.vehicleData = Vehicles.vehicleData or {}

-- Configuration
Vehicles.maxVehiclesPerPlayer = 3
Vehicles.despawnDistance = 200 -- meters
Vehicles.cleanupInterval = 60000 -- 1 minute

local function nowSeconds()
    return os.time()
end

local function getVehicleIdentifier(vehicle)
    if not vehicle then
        return nil
    end
    
    if vehicle.id then
        return tostring(vehicle.id)
    elseif vehicle.index then
        return tostring(vehicle.index)
    else
        return tostring(vehicle)
    end
end

local function getPlayerIdentifier(player)
    local playerId = JobsRP.Store and JobsRP.Store.getPlayerId(player)
    return playerId or tostring(player)
end

-- Spawn job-specific vehicle
function Vehicles.spawnJobVehicle(player, jobId, position, heading)
    local identifier = getPlayerIdentifier(player)
    local now = nowSeconds()
    
    -- Check vehicle limit
    if not Vehicles.vehiclesByPlayer[identifier] then
        Vehicles.vehiclesByPlayer[identifier] = {}
    end
    
    local playerVehicles = Vehicles.vehiclesByPlayer[identifier]
    if #playerVehicles >= Vehicles.maxVehiclesPerPlayer then
        return nil, "Vehicle limit reached"
    end
    
    -- Determine vehicle model based on job
    local vehicleModel = "taxi" -- default
    if jobId == "police" then
        vehicleModel = "police"
    elseif jobId == "taxi" then
        vehicleModel = "taxi"
    end
    
    -- Try to spawn vehicle
    local vehicle = nil
    local spawnError = nil
    
    if createVehicle then
        local ok, result = pcall(createVehicle, vehicleModel, position[1], position[2], position[3])
        if ok and result then
            vehicle = result
        else
            spawnError = "Failed to create vehicle"
        end
    else
        spawnError = "Vehicle creation API not available"
    end
    
    if not vehicle then
        return nil, spawnError or "Unknown spawn error"
    end
    
    -- Set vehicle properties
    if heading and vehicle.setHeading then
        local ok, err = pcall(vehicle.setHeading, heading)
        if not ok then
            print("[jobs_rp] [Vehicles] Failed to set vehicle heading:", err)
        end
    end
    
    -- Lock vehicle for player
    if vehicle.lock then
        local ok, err = pcall(vehicle.lock, true)
        if not ok then
            print("[jobs_rp] [Vehicles] Failed to lock vehicle:", err)
        end
    end
    
    -- Store vehicle data
    local vehicleId = getVehicleIdentifier(vehicle)
    local vehicleData = {
        vehicle = vehicle,
        vehicleId = vehicleId,
        owner = identifier,
        jobId = jobId,
        model = vehicleModel,
        spawnTime = now,
        lastUsed = now,
        position = position,
        heading = heading,
        fuel = 100, -- Full tank
        health = 100
    }
    
    Vehicles.vehicleData[vehicleId] = vehicleData
    table.insert(playerVehicles, vehicleId)
    
    print(string.format("[jobs_rp] [Vehicles] Spawned %s for %s: %s", 
        vehicleModel, identifier, vehicleId))
    
    return vehicle, vehicleData
end

-- Despawn vehicle
function Vehicles.despawnVehicle(vehicleId)
    local vehicleData = Vehicles.vehicleData[vehicleId]
    if not vehicleData then
        return false, "Vehicle not found"
    end
    
    local vehicle = vehicleData.vehicle
    local identifier = vehicleData.owner
    
    -- Remove from player's vehicle list
    if Vehicles.vehiclesByPlayer[identifier] then
        for i, vId in ipairs(Vehicles.vehiclesByPlayer[identifier]) do
            if vId == vehicleId then
                table.remove(Vehicles.vehiclesByPlayer[identifier], i)
                break
            end
        end
    end
    
    -- Delete vehicle
    local deleted = false
    local deleteError = nil
    
    if vehicle and vehicle.delete then
        local ok, err = pcall(vehicle.delete)
        if ok then
            deleted = true
        else
            deleteError = err
        end
    else
        deleteError = "Vehicle deletion API not available"
    end
    
    -- Clean up data
    Vehicles.vehicleData[vehicleId] = nil
    
    if deleted then
        print(string.format("[jobs_rp] [Vehicles] Despawned vehicle %s for %s", 
            vehicleId, identifier))
        return true, nil
    else
        return false, deleteError or "Failed to delete vehicle"
    end
end

-- Get player's vehicles
function Vehicles.getPlayerVehicles(player)
    local identifier = getPlayerIdentifier(player)
    local vehicles = {}
    
    if Vehicles.vehiclesByPlayer[identifier] then
        for _, vehicleId in ipairs(Vehicles.vehiclesByPlayer[identifier]) do
            local vehicleData = Vehicles.vehicleData[vehicleId]
            if vehicleData then
                table.insert(vehicles, vehicleData)
            end
        end
    end
    
    return vehicles
end

-- Get vehicle data
function Vehicles.getVehicleData(vehicleId)
    return Vehicles.vehicleData[vehicleId]
end

-- Update vehicle usage
function Vehicles.updateVehicleUsage(vehicleId)
    local vehicleData = Vehicles.vehicleData[vehicleId]
    if vehicleData then
        vehicleData.lastUsed = nowSeconds()
    end
end

-- Consume fuel (for taxi jobs)
function Vehicles.consumeFuel(vehicleId, amount)
    local vehicleData = Vehicles.vehicleData[vehicleId]
    if not vehicleData then
        return false, "Vehicle not found"
    end
    
    vehicleData.fuel = math.max(0, vehicleData.fuel - amount)
    return true, vehicleData.fuel
end

-- Refuel vehicle
function Vehicles.refuelVehicle(vehicleId)
    local vehicleData = Vehicles.vehicleData[vehicleId]
    if not vehicleData then
        return false, "Vehicle not found"
    end
    
    vehicleData.fuel = 100
    return true, vehicleData.fuel
end

-- Repair vehicle
function Vehicles.repairVehicle(vehicleId)
    local vehicleData = Vehicles.vehicleData[vehicleId]
    if not vehicleData then
        return false, "Vehicle not found"
    end
    
    vehicleData.health = 100
    return true, vehicleData.health
end

-- Check if player is near their vehicle
function Vehicles.isNearPlayerVehicle(player, maxDistance)
    maxDistance = maxDistance or Vehicles.despawnDistance
    
    local identifier = getPlayerIdentifier(player)
    local playerVehicles = Vehicles.getPlayerVehicles(player)
    
    if not player.position then
        return false, nil
    end
    
    local playerPos = player.position
    if not playerPos then
        return false, nil
    end
    
    for _, vehicleData in ipairs(playerVehicles) do
        local vehiclePos = vehicleData.position
        if vehiclePos then
            local distance = math.sqrt(
                (playerPos.x - vehiclePos[1])^2 + 
                (playerPos.y - vehiclePos[2])^2 + 
                (playerPos.z - vehiclePos[3])^2
            )
            
            if distance <= maxDistance then
                return true, vehicleData
            end
        end
    end
    
    return false, nil
end

-- Cleanup abandoned vehicles
function Vehicles.cleanup()
    local now = nowSeconds()
    local toDespawn = {}
    
    for vehicleId, vehicleData in pairs(Vehicles.vehicleData) do
        -- Check if vehicle is abandoned (no usage for 30 minutes)
        if now - vehicleData.lastUsed > 1800 then -- 30 minutes
            table.insert(toDespawn, vehicleId)
        end
    end
    
    -- Despawn abandoned vehicles
    for _, vehicleId in ipairs(toDespawn) do
        local success, error = Vehicles.despawnVehicle(vehicleId)
        if not success then
            print(string.format("[jobs_rp] [Vehicles] Failed to cleanup vehicle %s: %s", 
                vehicleId, error))
        end
    end
    
    if #toDespawn > 0 then
        print(string.format("[jobs_rp] [Vehicles] Cleaned up %d abandoned vehicles", #toDespawn))
    end
end

-- Despawn all player vehicles
function Vehicles.despawnAllPlayerVehicles(player)
    local identifier = getPlayerIdentifier(player)
    local vehicleIds = {}
    
    if Vehicles.vehiclesByPlayer[identifier] then
        for _, vehicleId in ipairs(Vehicles.vehiclesByPlayer[identifier]) do
            table.insert(vehicleIds, vehicleId)
        end
    end
    
    local despawned = 0
    for _, vehicleId in ipairs(vehicleIds) do
        local success, error = Vehicles.despawnVehicle(vehicleId)
        if success then
            despawned = despawned + 1
        else
            print(string.format("[jobs_rp] [Vehicles] Failed to despawn vehicle %s: %s", 
                vehicleId, error))
        end
    end
    
    return despawned
end

-- Initialize cleanup timer
if setTimer then
    setTimer(Vehicles.cleanup, Vehicles.cleanupInterval, 0)
end

return Vehicles
