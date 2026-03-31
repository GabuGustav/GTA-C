-- Backup System Server Handler
-- Handles backup requests and officer coordination

local BackupSystem = {}

-- Active backup requests
BackupSystem.requests = {}
BackupSystem.activeOfficers = {}
BackupSystem.calloutAssignments = {}

-- Initialize backup system
function BackupSystem.init()
    print("[BackupSystem] Initializing server-side backup system")
    
    -- Check if addNetworkHandler is available
    if not addNetworkHandler then
        print("[BackupSystem] ERROR: addNetworkHandler function not available!")
        return
    end
    
    -- Register network handlers
    local success1 = pcall(function()
        return addNetworkHandler("police.requestBackup", BackupSystem.handleBackupRequest)
    end)
    
    local success2 = pcall(function()
        return addNetworkHandler("police.respondToBackup", BackupSystem.handleBackupResponse)
    end)
    
    local success3 = pcall(function()
        return addNetworkHandler("police.broadcastPosition", BackupSystem.handlePositionBroadcast)
    end)
    
    if success1 and success2 and success3 then
        print("[BackupSystem] All network handlers registered successfully")
    else
        print("[BackupSystem] ERROR: Failed to register some network handlers")
    end
    
    print("[BackupSystem] Server backup system initialized")
end

-- Handle backup request from officer
function BackupSystem.handleBackupRequest(client, data)
    if not data or not data.position then
        return
    end
    
    print("[BackupSystem] Backup request from " .. (data.officerName or "Unknown") .. 
          " at " .. tostring(data.position.x) .. "," .. tostring(data.position.y) .. "," .. tostring(data.position.z))
    
    -- Store request with collision-resistant ID
    local requestId = data.requestId or ("req_" .. os.time() .. "_" .. math.random(1000000) .. "_" .. tostring(client):sub(-3))
    BackupSystem.requests[requestId] = {
        officerName = data.officerName,
        position = data.position,
        timestamp = data.timestamp or os.time(),
        situation = data.situation or "Unknown"
    }
    
    -- Broadcast to all on-duty officers
    local policePlayers = Jobs.getPlayersByJob("police")
    for _, player in pairs(policePlayers) do
        if player ~= client then -- Don't send back to requester
            triggerNetworkEvent("police.backupRequest", player, {
                officerName = data.officerName,
                position = data.position,
                timestamp = data.timestamp,
                requestId = requestId,
                situation = data.situation
            })
        end
    end
end

-- Handle backup response from officer
function BackupSystem.handleBackupResponse(client, data)
    if not data or not data.requestId then
        print("[BackupSystem] ERROR: Invalid backup response from " .. (client.name or "Unknown") .. " - missing requestId")
        return
    end
    
    print("[BackupSystem] Backup response from " .. (data.officerName or "Unknown") .. 
          " for request " .. (data.requestId or "Unknown"))
    
    -- Find the original request
    local request = BackupSystem.requests[data.requestId]
    if not request then
        print("[BackupSystem] ERROR: Request not found: " .. (data.requestId or "Unknown") .. " from " .. (client.name or "Unknown"))
        return
    end
    
    -- Get the requesting officer
    local requestingPlayer = nil
    local policePlayers = Jobs.getPlayersByJob("police")
    for _, player in pairs(policePlayers) do
        if getPlayerName(player) == request.officerName then
            requestingPlayer = player
            break
        end
    end
    
    -- Send response to requesting officer
    if requestingPlayer then
        triggerNetworkEvent("police.backupResponse", requestingPlayer, {
            requestId = data.requestId,
            officerName = data.officerName,
            accept = data.accept,
            position = data.position,
            timestamp = data.timestamp
        })
    end
    
    -- If accepted, track responding officer
    if data.accept then
        BackupSystem.activeOfficers[data.officerName] = {
            position = data.position,
            timestamp = data.timestamp,
            respondingTo = data.requestId
        }
    end
end

-- Handle officer position broadcast
function BackupSystem.handlePositionBroadcast(client, data)
    if not data or not data.position then
        return
    end
    
    -- Update officer position tracking
    BackupSystem.activeOfficers[data.officerName] = {
        position = data.position,
        timestamp = data.timestamp,
        onDuty = data.onDuty or false,
        currentCallout = data.currentCallout
    }
    
    -- Broadcast to other officers
    local policePlayers = Jobs.getPlayersByJob("police")
    for _, player in pairs(policePlayers) do
        if player ~= client then
            triggerNetworkEvent("police.officerPosition", player, {
                officerName = data.officerName,
                position = data.position,
                timestamp = data.timestamp,
                onDuty = data.onDuty,
                currentCallout = data.currentCallout
            })
        end
    end
end

-- Assign callout to available officer
function BackupSystem.assignCallout(calloutType, position)
    local policePlayers = Jobs.getPlayersByJob("police")
    local availableOfficers = {}
    
    -- Find available officers (not on active callout)
    for _, player in pairs(policePlayers) do
        local officerName = getPlayerName(player)
        local isAvailable = true
        
        -- Check if officer is already responding to backup
        if BackupSystem.activeOfficers[officerName] and 
           BackupSystem.activeOfficers[officerName].respondingTo then
            isAvailable = false
        end
        
        -- Check if officer is already on a callout
        if BackupSystem.calloutAssignments[officerName] then
            isAvailable = false
        end
        
        if isAvailable then
            table.insert(availableOfficers, {
                player = player,
                name = officerName,
                distance = BackupSystem.getDistance(player, position)
            })
        end
    end
    
    -- Sort by distance (closest first)
    table.sort(availableOfficers, function(a, b) 
        return a.distance < b.distance 
    end)
    
    -- Assign to closest available officer
    if #availableOfficers > 0 then
        local assigned = availableOfficers[1]
        local assignmentId = "assign_" .. os.time() .. "_" .. math.random(1000)
        
        -- Store assignment
        BackupSystem.calloutAssignments[assigned.name] = {
            calloutType = calloutType,
            position = position,
            timestamp = os.time(),
            assignmentId = assignmentId
        }
        
        -- Notify assigned officer
        triggerNetworkEvent("police.calloutAssignment", assigned.player, {
            officerName = assigned.name,
            calloutType = calloutType,
            position = position,
            assignmentId = assignmentId
        })
        
        print("[BackupSystem] Assigned " .. calloutType .. " to " .. assigned.name .. 
              " (distance: " .. math.floor(assigned.distance) .. "m)")
        
        return assigned.name
    else
        print("[BackupSystem] No available officers for " .. calloutType)
        return nil
    end
end

-- Calculate distance between player and position
function BackupSystem.getDistance(player, targetPos)
    if not player or not targetPos then
        return math.huge
    end
    
    local playerPos = getPlayerPosition(player)
    if not playerPos then
        return math.huge
    end
    
    local dx = playerPos.x - targetPos.x
    local dy = playerPos.y - targetPos.y
    local dz = playerPos.z - targetPos.z
    
    return math.sqrt(dx*dx + dy*dy + dz*dz)
end

-- Clean up old requests and assignments
function BackupSystem.cleanup()
    local currentTime = os.time()
    
    -- Clean requests older than 10 minutes
    for requestId, request in pairs(BackupSystem.requests) do
        if currentTime - request.timestamp > 600 then
            BackupSystem.requests[requestId] = nil
        end
    end
    
    -- Clean assignments older than 30 minutes
    for officerName, assignment in pairs(BackupSystem.calloutAssignments) do
        if currentTime - assignment.timestamp > 1800 then
            BackupSystem.calloutAssignments[officerName] = nil
        end
    end
    
    -- Clean officer positions older than 5 minutes
    for officerName, officerData in pairs(BackupSystem.activeOfficers) do
        if currentTime - officerData.timestamp > 300 then
            BackupSystem.activeOfficers[officerName] = nil
        end
    end
end

-- Start cleanup timer using available GTAC function
if setTimer then
    setTimer(BackupSystem.cleanup, 60000) -- Clean every minute
elseif createTimer then
    createTimer(BackupSystem.cleanup, 60000) -- Clean every minute
else
    print("[BackupSystem] Warning: No timer function available, cleanup disabled")
end

-- Handle player disconnection
addEventHandler("onPlayerQuit", function(event, player)
    if not player then
        return
    end
    
    -- Check if player was an active officer
    local playerName = player.name or "Unknown"
    local officerData = BackupSystem.activeOfficers[playerName]
    
    if officerData then
        print("[BackupSystem] Officer " .. playerName .. " disconnected, removing from tracking")
        
        -- Remove from active officers
        BackupSystem.activeOfficers[playerName] = nil
        
        -- Notify all other officers about disconnection
        local disconnectData = {
            officerName = playerName,
            timestamp = os.time()
        }
        
        for client, clientData in pairs(getElementsByType("player")) do
            if client ~= player then
                -- Check if this client is an officer
                for officerName, officerInfo in pairs(BackupSystem.activeOfficers) do
                    if officerName == client.name then
                        pushClientEvent(client, "police.officerDisconnected", disconnectData)
                        break
                    end
                end
            end
        end
    end
end)

-- Initialize when resource starts
addEventHandler("onResourceStart", function(event, resourceName)
    print("[BackupSystem] Resource start event triggered for: " .. tostring(resourceName or "unknown"))
    -- Try different ways to detect jobs_rp resource
    local isJobsRp = false
    if type(resourceName) == "string" then
        isJobsRp = (resourceName == "jobs_rp")
    elseif type(resourceName) == "nil" then
        -- If resourceName is nil, assume this is jobs_rp starting
        isJobsRp = true
    else
        -- If resourceName is a resource object or memory address, try to get name
        local success, name = pcall(function() return resourceName.name end)
        if success and name == "jobs_rp" then
            isJobsRp = true
        end
    end
    
    if isJobsRp and BackupSystem.init then
        print("[BackupSystem] Initializing backup system for jobs_rp resource")
        -- Initialize immediately
        BackupSystem.init()
    else
        print("[BackupSystem] Resource name doesn't match or BackupSystem.init not available")
        print("[BackupSystem] resourceName type: " .. type(resourceName))
        print("[BackupSystem] resourceName value: " .. tostring(resourceName))
    end
end)

-- Direct initialization as fallback
print("[BackupSystem] Attempting direct initialization...")
if BackupSystem and BackupSystem.init then
    BackupSystem.init()
else
    print("[BackupSystem] ERROR: BackupSystem or init function not available")
end
