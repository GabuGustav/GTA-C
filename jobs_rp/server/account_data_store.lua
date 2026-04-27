-- Account Data Store Module
-- Saves player statistics to local JSON files for backup and retry capability
-- Location: resources/jobs_rp/data/sync_backup/{accountId}.json

JobsRP = JobsRP or {}
JobsRP.AccountDataStore = JobsRP.AccountDataStore or {}

local AccountDataStore = JobsRP.AccountDataStore

-- Configuration
AccountDataStore.config = {
    basePath = "resources/jobs_rp/data/sync_backup/",
    fileExtension = ".json",
    autoSave = true,           -- Save on every stat update
    syncToApi = true,          -- Also queue for API sync
    retryFailedSync = true,    -- Retry failed API calls from local files
    retryInterval = 60         -- Retry interval in seconds
}

-- Pending sync tracking (for retry mechanism)
AccountDataStore.pendingSync = {}

-- Ensure directory exists (using os.execute for mkdir)
function AccountDataStore.ensureDirectory()
    local path = AccountDataStore.config.basePath
    -- Try to create directory if it doesn't exist
    if io and io.open then
        -- Check if directory exists by trying to open a test file
        local testFile = io.open(path .. ".test", "w")
        if testFile then
            testFile:close()
            os.remove(path .. ".test")
            return true
        end
        
        -- Directory doesn't exist, try to create it
        -- Note: os.execute may not work in all environments
        local ok = pcall(function()
            if os.execute then
                os.execute('mkdir "' .. path .. '"')
            end
        end)
        return ok
    end
    return false
end

-- Get full file path for an account
function AccountDataStore.getFilePath(accountId)
    return AccountDataStore.config.basePath .. accountId .. AccountDataStore.config.fileExtension
end

-- Load account data from JSON file
function AccountDataStore.loadAccount(accountId)
    if not accountId then return nil end
    
    local filePath = AccountDataStore.getFilePath(accountId)
    local content = nil
    
    -- Try to load using loadTextFile first (GTA Connected function)
    if loadTextFile then
        local ok, result = pcall(loadTextFile, filePath)
        if ok then
            content = result
        end
    end
    
    -- Fallback to io.open
    if not content and io and io.open then
        local file = io.open(filePath, "r")
        if file then
            content = file:read("*a")
            file:close()
        end
    end
    
    -- Parse JSON
    if content and content ~= "" then
        local ok, data = pcall(function()
            return JobsRP.Json.decode(content)
        end)
        if ok and type(data) == "table" then
            print("[AccountDataStore] Loaded account data: " .. accountId)
            return data
        end
    end
    
    return nil
end

-- Save account data to JSON file
function AccountDataStore.saveAccount(accountId, data)
    if not accountId or not data then return false end
    
    AccountDataStore.ensureDirectory()
    
    local filePath = AccountDataStore.getFilePath(accountId)
    
    -- Add metadata
    data._meta = {
        lastSaved = JobsRP.nowSeconds(),
        version = "1.0"
    }
    
    -- Encode to JSON
    local ok, jsonContent = pcall(function()
        return JobsRP.Json.encode(data)
    end)
    
    if not ok or not jsonContent then
        print("[AccountDataStore] ERROR: Failed to encode JSON for " .. accountId)
        return false
    end
    
    -- Save using saveTextFile first (GTA Connected function)
    if saveTextFile then
        local saveOk = pcall(saveTextFile, filePath, jsonContent)
        if saveOk then
            print("[AccountDataStore] Saved account data: " .. accountId)
            return true
        end
    end
    
    -- Fallback to io.open
    if io and io.open then
        local file = io.open(filePath, "w")
        if file then
            file:write(jsonContent)
            file:close()
            print("[AccountDataStore] Saved account data: " .. accountId)
            return true
        end
    end
    
    print("[AccountDataStore] ERROR: Failed to save account data: " .. accountId)
    return false
end

-- Save player stats from JobStats system
function AccountDataStore.savePlayerStats(accountId)
    if not accountId or not JobsRP.JobStats then return false end
    
    local playerData = {
        accountId = accountId,
        stats = JobsRP.JobStats.playerStats[accountId] or {},
        session = JobsRP.JobStats.playerSessions[accountId] or {}
    }
    
    -- Get all job stats for this player
    local allPlayerStats = {}
    for jobType, jobData in pairs(playerData.stats) do
        if type(jobData) == "table" then
            allPlayerStats[jobType] = {
                stats = jobData.stats or {},
                experience = jobData.experience or 0,
                level = jobData.level or 1,
                lastUpdated = jobData.lastUpdated or 0
            }
        end
    end
    
    playerData.jobStats = allPlayerStats
    
    -- Mark as pending sync if auto-sync is enabled
    if AccountDataStore.config.syncToApi then
        AccountDataStore.pendingSync[accountId] = {
            lastAttempt = 0,
            retryCount = 0,
            data = playerData
        }
    end
    
    return AccountDataStore.saveAccount(accountId, playerData)
end

-- Load all accounts from disk
function AccountDataStore.loadAllAccounts()
    local accounts = {}
    
    -- Note: We can't easily list directory contents in Lua without os.execute
    -- So we'll load accounts on-demand when needed for retry
    
    return accounts
end

-- Get account data for API sync (with fallback to disk)
function AccountDataStore.getAccountForSync(accountId)
    -- First try memory
    if AccountDataStore.pendingSync[accountId] and AccountDataStore.pendingSync[accountId].data then
        return AccountDataStore.pendingSync[accountId].data
    end
    
    -- Fallback to disk
    return AccountDataStore.loadAccount(accountId)
end

-- Mark account as synced successfully
function AccountDataStore.markSynced(accountId)
    AccountDataStore.pendingSync[accountId] = nil
    
    -- Update the saved file to reflect sync status
    local data = AccountDataStore.loadAccount(accountId)
    if data then
        data._meta = data._meta or {}
        data._meta.lastSynced = JobsRP.nowSeconds()
        data._meta.syncStatus = "synced"
        AccountDataStore.saveAccount(accountId, data)
    end
end

-- Mark account sync as failed (for retry)
function AccountDataStore.markSyncFailed(accountId, errorMsg)
    if AccountDataStore.pendingSync[accountId] then
        AccountDataStore.pendingSync[accountId].retryCount = 
            (AccountDataStore.pendingSync[accountId].retryCount or 0) + 1
        AccountDataStore.pendingSync[accountId].lastError = errorMsg
        AccountDataStore.pendingSync[accountId].lastAttempt = JobsRP.nowSeconds()
    end
    
    -- Update the saved file
    local data = AccountDataStore.loadAccount(accountId)
    if data then
        data._meta = data._meta or {}
        data._meta.lastSyncAttempt = JobsRP.nowSeconds()
        data._meta.syncStatus = "failed"
        data._meta.lastError = errorMsg
        AccountDataStore.saveAccount(accountId, data)
    end
end

-- Get all pending syncs that need retry
function AccountDataStore.getPendingSyncs()
    local pending = {}
    local now = JobsRP.nowSeconds()
    
    for accountId, syncInfo in pairs(AccountDataStore.pendingSync) do
        -- Check if it's time to retry
        local timeSinceLastAttempt = now - (syncInfo.lastAttempt or 0)
        if timeSinceLastAttempt >= AccountDataStore.config.retryInterval then
            local data = AccountDataStore.getAccountForSync(accountId)
            if data then
                table.insert(pending, {
                    accountId = accountId,
                    data = data,
                    retryCount = syncInfo.retryCount or 0
                })
            end
        end
    end
    
    return pending
end

-- Initialize the data store
function AccountDataStore.init(config)
    if config then
        for key, value in pairs(config) do
            AccountDataStore.config[key] = value
        end
    end
    
    AccountDataStore.ensureDirectory()
    print("[AccountDataStore] Initialized with base path: " .. AccountDataStore.config.basePath)
    
    -- Hook into JobStats updates
    AccountDataStore.hookIntoJobStats()
end

-- Hook into JobStats to auto-save on updates
function AccountDataStore.hookIntoJobStats()
    if not JobsRP.JobStats then return end
    
    -- Store reference to original updateStat function
    local originalUpdateStat = JobsRP.JobStats.updateStat
    
    -- Wrap it to save after updates
    JobsRP.JobStats.updateStat = function(accountId, jobType, statName, value, operation)
        -- Call original function
        local result = originalUpdateStat(accountId, jobType, statName, value, operation)
        
        -- Save to disk if enabled
        if result and AccountDataStore.config.autoSave then
            AccountDataStore.savePlayerStats(accountId)
        end
        
        return result
    end
    
    print("[AccountDataStore] Hooked into JobStats updateStat")
end

-- Debug: List all saved accounts (if possible)
function AccountDataStore.listSavedAccounts()
    print("[AccountDataStore] Pending sync accounts:")
    for accountId, info in pairs(AccountDataStore.pendingSync) do
        print("  - " .. accountId .. " (retries: " .. (info.retryCount or 0) .. ")")
    end
end

print("[AccountDataStore] Module loaded")
