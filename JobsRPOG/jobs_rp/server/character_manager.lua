-- Character Manager for GTAC Roleplay
-- Handles character validation, storage, and job requirements

JobsRP = JobsRP or {}
JobsRP.CharacterManager = JobsRP.CharacterManager or {}

local CharacterManager = JobsRP.CharacterManager

-- Initialization flag
CharacterManager.initialized = false

-- Character storage structure
-- profile.character = {
--     current = "model_id",
--     history = {"model_id_1", "model_id_2"},
--     lastChanged = timestamp,
--     context = "freeroam" | "jobs" | etc.
-- }

-- Initialize character manager
function CharacterManager.init()
    if CharacterManager.initialized then
        return
    end
    
    print("[CharacterManager] Initializing character management system")
    
    -- Register event handlers
    addEventHandler("onPlayerJoined", CharacterManager.onPlayerJoined)
    addEventHandler("onPlayerQuit", CharacterManager.onPlayerQuit)
    
    -- Register network event handlers for client-to-server communication
    if addNetworkHandler then
        addNetworkHandler("characterSelector_requestSelect", function(client, modelId)
            local success, message = CharacterManager.onCharacterSelect(client, modelId)
            if not success then
                messageClient(client, message, 255, 0, 0)
            end
        end)
        
        addNetworkHandler("characterSelector_requestClose", function(client)
            triggerNetworkEvent("characterSelector_close", client)
        end)
        
        print("[CharacterManager] Network handlers registered")
    else
        print("[CharacterManager] addNetworkHandler not available")
    end
    
    CharacterManager.initialized = true
end

-- Handle player join - check for existing character
function CharacterManager.onPlayerJoined(client)
    if not client or not client.accountId then
        return
    end
    
    -- Load character data from profile
    local profile = nil
    if JobsRP.Store and JobsRP.Store.getProfile then
        profile = JobsRP.Store.getProfile(client.accountId)
    end
    
    if profile and profile.character then
        client.character = profile.character
        print("[CharacterManager] Loaded character data for " .. client.name)
    else
        -- Initialize character data
        client.character = {
            current = nil,
            history = {},
            lastChanged = os.time(),
            context = "freeroam"
        }
        print("[CharacterManager] Initialized character data for " .. client.name)
    end
end

-- Handle player quit - save character data
function CharacterManager.onPlayerQuit(client)
    if not client or not client.accountId then
        return
    end
    
    -- Save character data to profile
    if JobsRP.Store and JobsRP.Store.getProfile and JobsRP.Store.saveProfile then
        local profile = JobsRP.Store.getProfile(client.accountId) or {}
        profile.character = client.character
        JobsRP.Store.saveProfile(client.accountId, profile)
        print("[CharacterManager] Saved character data for " .. client.name)
    else
        print("[CharacterManager] Store not available, could not save character data for " .. client.name)
    end
end

-- Open character selector for player
function CharacterManager.openSelector(client, context)
    if not client or not client.accountId then
        return false, "Invalid client or account"
    end
    
    -- Validate model exists
    local model = JobsRP.CharacterDefs.getModelById(modelId)
    if not model then
        return false, "Character model not found"
    end
    
    -- Check job requirements if player has job
    if client.jobId then
        local valid, message = JobsRP.CharacterDefs.validateModelForJob(modelId, client.jobId)
        if not valid then
            return false, message
        end
    end
    
    -- Update character data
    if client.character.current then
        table.insert(client.character.history, client.character.current)
    end
    client.character.current = modelId
    client.character.lastChanged = os.time()
    
    -- Apply character model change
    triggerNetworkEvent("characterSelector_select", client, {
        modelId = modelId,
        modelHash = model.hash,
        modelName = model.name
    })
    
    -- Spawn player after character selection (if character system is enabled)
    if JobsRP.Config.character_enabled and JobsRP.Config.auth_required then
        -- Call the spawn function from server.js
        if spawnPlayerAfterCharacterSelection then
            spawnPlayerAfterCharacterSelection(client)
        else
            -- Fallback: spawn the player normally
            if spawnPlayer then
                spawnPlayer(client, {39.59, 128.88, 15.63})
                fadeCamera(client, true)
            end
        end
    end
    
    -- Save to profile
    if JobsRP.Store and JobsRP.Store.getProfile and JobsRP.Store.saveProfile then
        local profile = JobsRP.Store.getProfile(client.accountId) or {}
        profile.character = client.character
        JobsRP.Store.saveProfile(client.accountId, profile)
    else
        print("[CharacterManager] Store not available, could not save character selection for " .. client.name)
    end
    
    print("[CharacterManager] " .. client.name .. " selected character: " .. model.name)
    return true, "Character selected successfully"
end

-- Validate character for job
function CharacterManager.validateForJob(client, jobId)
    if not client or not client.character or not client.character.current then
        return false, "No character selected"
    end
    
    local valid, message = JobsRP.CharacterDefs.validateModelForJob(client.character.current, jobId)
    return valid, message
end

-- Get character requirements for job
function CharacterManager.getJobRequirements(jobId)
    return JobsRP.CharacterDefs.jobRequirements[jobId] or nil
end

-- Admin command to reset player character
function CharacterManager.resetPlayerCharacter(adminClient, targetName)
    local target = getClientFromName(targetName)
    if not target then
        messageClient(adminClient, "Player not found: " .. targetName, 255, 0, 0)
        return false
    end
    
    -- Reset character data
    target.character = {
        current = nil,
        history = {},
        lastChanged = os.time(),
        context = "freeroam"
    }
    
    -- Save to profile
    local profile = JobsRP.Store.getProfile(target.accountId) or {}
    profile.character = target.character
    JobsRP.Store.saveProfile(target.accountId, profile)
    
    messageClient(adminClient, "Character reset for " .. target.name, 0, 255, 0)
    messageClient(target, "Your character has been reset by an admin", 255, 255, 0)
    
    print("[CharacterManager] Admin " .. adminClient.name .. " reset character for " .. target.name)
    return true
end

-- Admin command to set player character
function CharacterManager.setPlayerCharacter(adminClient, targetName, modelId)
    local target = getClientFromName(targetName)
    if not target then
        messageClient(adminClient, "Player not found: " .. targetName, 255, 0, 0)
        return false
    end
    
    local model = JobsRP.CharacterDefs.getModelById(modelId)
    if not model then
        messageClient(adminClient, "Model not found: " .. modelId, 255, 0, 0)
        return false
    end
    
    -- Set character
    return CharacterManager.onCharacterSelect(target, modelId)
end

-- Get player character info
function CharacterManager.getPlayerCharacter(client)
    if not client or not client.character then
        return nil
    end
    
    local modelId = client.character.current
    if not modelId then
        return nil
    end
    
    local model = JobsRP.CharacterDefs.getModelById(modelId)
    if not model then
        return nil
    end
    
    return {
        modelId = modelId,
        model = model,
        lastChanged = client.character.lastChanged,
        history = client.character.history,
        context = client.character.context
    }
end

-- Initialize the character manager
CharacterManager.init()

-- Universal Sync Integration
function CharacterManager.enableUniversalSync()
    print("[CharacterManager] Enabling universal sync integration")
    
    -- Disable default sync for this resource to use universal sync
    if setElementSyncRate then
        setElementSyncRate(thisResource, 0.3) -- 30% of normal rate
    end
    
    -- Enable universal sync for all connected players
    print("[CharacterManager] Attempting to get players...")
    local success, players = pcall(getPlayers)
    
    if success and players then
        print("[CharacterManager] Got players table, type: " .. type(players))
        if type(players) == "table" then
            print("[CharacterManager] Players table has " .. #players .. " indexed elements")
        end
        
        -- Enable universal sync for all connected players
        for _, client in pairs(players) do
            if UniversalSync and UniversalSync.playerStates then
                local state = UniversalSync.playerStates[client]
                if state then
                    state.compensatedDelay = 100 + (client.ping or 100)
                    print("[CharacterManager] Updated sync delay for " .. (client.name or "Unknown") .. ": " .. state.compensatedDelay .. "ms")
                end
            end
        end
    else
        print("[CharacterManager] Failed to get players: " .. tostring(players))
    end
    
    -- For now, just print that universal sync is enabled
    print("[CharacterManager] Universal sync integration enabled")
end

function CharacterManager.monitorPingChanges()
    local players = getPlayers()
    if players then
        for _, client in pairs(players) do
            if UniversalSync and UniversalSync.playerStates then
                local state = UniversalSync.playerStates[client]
                if state and client.ping ~= state.ping then
                    local oldDelay = state.compensatedDelay
                    state.ping = client.ping or 100
                    state.compensatedDelay = 100 + state.ping
                    
                    if math.abs(oldDelay - state.compensatedDelay) > 20 then
                        print("[CharacterManager] Ping changed for " .. (client.name or "Unknown") .. ": " .. state.ping .. "ms (delay: " .. state.compensatedDelay .. "ms)")
                    end
                end
            end
        end
    end
end

function CharacterManager.getSyncStats()
    if UniversalSync and UniversalSync.getStats then
        return UniversalSync.getStats()
    end
    return nil
end

-- Enable universal sync after initialization
CharacterManager.enableUniversalSync()

print("[CharacterManager] Character manager loaded")
