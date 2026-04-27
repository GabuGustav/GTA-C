-- Synchronization Scheduler
-- Handles batch synchronization of player data with website API

JobsRP = JobsRP or {}
JobsRP.SyncScheduler = JobsRP.SyncScheduler or {}

local SyncScheduler = JobsRP.SyncScheduler

-- Configuration
SyncScheduler.config = {
    enabled = true,
    intervalMinutes = 5, -- Sync every 5 minutes
    maxRetries = 3,
    retryDelayMinutes = 1,
    batchSize = 50, -- Max players per sync batch
    enableTimeUpdates = true
}

-- Sync state
SyncScheduler.isRunning = false
SyncScheduler.lastSyncTime = 0
SyncScheduler.syncCount = 0
SyncScheduler.errorCount = 0
SyncScheduler.retryCount = 0

-- Sync statistics
SyncScheduler.stats = {
    totalSyncs = 0,
    successfulSyncs = 0,
    failedSyncs = 0,
    playersSynced = 0,
    lastSyncDuration = 0,
    averageSyncDuration = 0
}

-- Perform batch synchronization
function SyncScheduler.performSync()
    if not SyncScheduler.config.enabled then
        return false
    end
    
    if SyncScheduler.isRunning then
        print("[SyncScheduler] Sync already in progress, skipping")
        return false
    end
    
    -- Check if web integration is available
    if not JobsRP.Config.web_integration_enabled or not JobsRP.HttpClient then
        print("[SyncScheduler] Web integration not enabled or HTTP client not available")
        return false
    end
    
    SyncScheduler.isRunning = true
    local startTime = JobsRP.nowMilliseconds()
    
    print("[SyncScheduler] Starting batch synchronization...")
    
    -- Collect all player statistics
    local allPlayerStats = {}
    if JobsRP.JobStats and JobsRP.JobStats.getAllPlayerStats then
        allPlayerStats = JobsRP.JobStats.getAllPlayerStats()
    end
    
    if #allPlayerStats == 0 then
        print("[SyncScheduler] No player data to sync")
        SyncScheduler.isRunning = false
        return true
    end
    
    -- Process in batches
    local batches = {}
    for i = 1, #allPlayerStats, SyncScheduler.config.batchSize do
        local batch = {}
        for j = i, math.min(i + SyncScheduler.config.batchSize - 1, #allPlayerStats) do
            table.insert(batch, allPlayerStats[j])
        end
        table.insert(batches, batch)
    end
    
    print("[SyncScheduler] Processing " .. #allPlayerStats .. " players in " .. #batches .. " batches")
    
    -- Process batches with delay to respect rate limits
    local batchIndex = 0
    local function processNextBatch()
        batchIndex = batchIndex + 1
        
        if batchIndex > #batches then
            -- All batches processed
            local endTime = JobsRP.nowMilliseconds()
            local duration = endTime - startTime
            
            SyncScheduler.updateSyncStats(true, #allPlayerStats, duration)
            SyncScheduler.isRunning = false
            SyncScheduler.lastSyncTime = JobsRP.nowSeconds()
            
            print("[SyncScheduler] Sync completed in " .. duration .. "ms")
            return
        end
        
        local batch = batches[batchIndex]
        SyncScheduler.syncBatch(batch, function(success, error)
            if not success then
                print("[SyncScheduler] Batch " .. batchIndex .. " failed: " .. tostring(error))
                SyncScheduler.errorCount = SyncScheduler.errorCount + 1
            end
            
            -- Process next batch after delay
            setTimeout(processNextBatch, 1000) -- 1 second delay between batches
        end)
    end
    
    -- Start processing batches
    processNextBatch()
    
    return true
end

-- Sync a single batch of players
function SyncScheduler.syncBatch(playerUpdates, callback)
    if not JobsRP.HttpClient then
        if callback then callback(false, "HTTP client not available") end
        return
    end
    
    -- First, save all player stats to local JSON files
    if JobsRP.AccountDataStore then
        for _, update in ipairs(playerUpdates) do
            if update.accountId then
                JobsRP.AccountDataStore.savePlayerStats(update.accountId)
                print("[SyncScheduler] Saved player stats to local file: " .. update.accountId)
            end
        end
    end
    
    JobsRP.HttpClient.syncPlayerStats(playerUpdates, function(success, response, status)
        if success and response then
            print("[SyncScheduler] Batch sync successful: " .. (response.updatedCount or 0) .. " players updated")
            
            -- Mark all synced accounts as synced
            if JobsRP.AccountDataStore then
                for _, update in ipairs(playerUpdates) do
                    if update.accountId then
                        JobsRP.AccountDataStore.markSynced(update.accountId)
                    end
                end
            end
            
            -- Log any errors from individual players
            if response.errors and #response.errors > 0 then
                print("[SyncScheduler] Individual player errors: " .. #response.errors)
                for _, error in ipairs(response.errors) do
                    print("[SyncScheduler]   " .. error.username .. ": " .. error.error)
                end
            end
            
            if callback then callback(true, nil) end
        else
            print("[SyncScheduler] Batch sync failed: " .. tostring(response))
            
            -- Mark accounts as failed for retry
            if JobsRP.AccountDataStore then
                for _, update in ipairs(playerUpdates) do
                    if update.accountId then
                        JobsRP.AccountDataStore.markSyncFailed(update.accountId, tostring(response))
                        print("[SyncScheduler] Marked for retry from local file: " .. update.accountId)
                    end
                end
            end
            
            if callback then callback(false, response) end
        end
    end)
end

-- Retry failed syncs from local JSON files
function SyncScheduler.retryFailedSyncs()
    if not JobsRP.AccountDataStore then
        print("[SyncScheduler] AccountDataStore not available for retry")
        return false
    end
    
    local pendingSyncs = JobsRP.AccountDataStore.getPendingSyncs()
    
    if #pendingSyncs == 0 then
        return true
    end
    
    print("[SyncScheduler] Retrying " .. #pendingSyncs .. " failed syncs from local files")
    
    -- Convert pending syncs to player updates format
    local playerUpdates = {}
    for _, pending in ipairs(pendingSyncs) do
        local accountId = pending.accountId
        local data = pending.data
        
        if data and data.jobStats then
            for jobType, jobData in pairs(data.jobStats) do
                table.insert(playerUpdates, {
                    accountId = accountId,
                    jobType = jobType,
                    stats = jobData.stats or {},
                    experience = jobData.experience or 0,
                    level = jobData.level or 1,
                    lastUpdated = jobData.lastUpdated or 0,
                    retryCount = pending.retryCount or 0
                })
            end
        end
    end
    
    if #playerUpdates == 0 then
        print("[SyncScheduler] No valid player updates found for retry")
        return false
    end
    
    -- Sync the batch
    SyncScheduler.syncBatch(playerUpdates, function(success, error)
        if success then
            print("[SyncScheduler] Retry sync successful for " .. #playerUpdates .. " updates")
        else
            print("[SyncScheduler] Retry sync failed: " .. tostring(error))
        end
    end)
    
    return true
end

-- Update sync statistics
function SyncScheduler.updateSyncStats(success, playersCount, duration)
    SyncScheduler.stats.totalSyncs = SyncScheduler.stats.totalSyncs + 1
    
    if success then
        SyncScheduler.stats.successfulSyncs = SyncScheduler.stats.successfulSyncs + 1
        SyncScheduler.stats.playersSynced = SyncScheduler.stats.playersSynced + playersCount
    else
        SyncScheduler.stats.failedSyncs = SyncScheduler.stats.failedSyncs + 1
    end
    
    SyncScheduler.stats.lastSyncDuration = duration
    SyncScheduler.stats.averageSyncDuration = (SyncScheduler.stats.averageSyncDuration * (SyncScheduler.stats.totalSyncs - 1) + duration) / SyncScheduler.stats.totalSyncs
    
    SyncScheduler.syncCount = SyncScheduler.syncCount + 1
end

-- Get sync status
function SyncScheduler.getStatus()
    return {
        isRunning = SyncScheduler.isRunning,
        lastSyncTime = SyncScheduler.lastSyncTime,
        syncCount = SyncScheduler.syncCount,
        errorCount = SyncScheduler.errorCount,
        retryCount = SyncScheduler.retryCount,
        stats = SyncScheduler.stats,
        config = SyncScheduler.config,
        nextSyncIn = math.max(0, (SyncScheduler.lastSyncTime + (SyncScheduler.config.intervalMinutes * 60)) - JobsRP.nowSeconds())
    }
end

-- Manual sync trigger
function SyncScheduler.triggerSync()
    print("[SyncScheduler] Manual sync triggered")
    return SyncScheduler.performSync()
end

-- Start the scheduler
function SyncScheduler.start()
    if SyncScheduler.isRunning then
        print("[SyncScheduler] Scheduler already running")
        return false
    end
    
    print("[SyncScheduler] Starting scheduler with " .. SyncScheduler.config.intervalMinutes .. " minute intervals")
    
    -- Set up periodic sync
    if setInterval then
        setInterval(function()
            SyncScheduler.performSync()
        end, SyncScheduler.config.intervalMinutes * 60 * 1000)
    else
        -- Fallback: check every 30 seconds and sync if needed
        setInterval(function()
            local now = JobsRP.nowSeconds()
            local nextSyncTime = SyncScheduler.lastSyncTime + (SyncScheduler.config.intervalMinutes * 60)
            
            if now >= nextSyncTime then
                SyncScheduler.performSync()
            end
        end, 30 * 1000)
    end
    
    -- Perform initial sync after a short delay
    setTimeout(function()
        SyncScheduler.performSync()
    end, 5000) -- 5 seconds after startup
    
    return true
end

-- Stop the scheduler
function SyncScheduler.stop()
    print("[SyncScheduler] Stopping scheduler")
    SyncScheduler.config.enabled = false
    
    -- Wait for current sync to finish
    local checkCount = 0
    setInterval(function()
        if not SyncScheduler.isRunning or checkCount > 30 then -- Wait max 30 seconds
            print("[SyncScheduler] Scheduler stopped")
            return
        end
        checkCount = checkCount + 1
    end, 1000)
    
    return true
end

-- Configuration methods
function SyncScheduler.setInterval(minutes)
    SyncScheduler.config.intervalMinutes = math.max(1, tonumber(minutes) or 5)
    print("[SyncScheduler] Sync interval set to " .. SyncScheduler.config.intervalMinutes .. " minutes")
end

function SyncScheduler.setBatchSize(size)
    SyncScheduler.config.batchSize = math.max(1, tonumber(size) or 50)
    print("[SyncScheduler] Batch size set to " .. SyncScheduler.config.batchSize)
end

function SyncScheduler.setEnabled(enabled)
    SyncScheduler.config.enabled = enabled == true
    print("[SyncScheduler] Scheduler " .. (SyncScheduler.config.enabled and "enabled" or "disabled"))
end

-- Admin commands
function SyncScheduler.adminSync(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    messageClient(client, "Starting manual synchronization...", 0, 255, 255)
    
    local success = SyncScheduler.triggerSync()
    if success then
        messageClient(client, "Manual sync started. Check console for progress.", 0, 255, 0)
    else
        messageClient(client, "Sync already in progress or not available.", 255, 255, 0)
    end
    
    return true
end

function SyncScheduler.adminStatus(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    local status = SyncScheduler.getStatus()
    
    messageClient(client, "=== Sync Scheduler Status ===", 255, 255, 255)
    messageClient(client, "Running: " .. (status.isRunning and "Yes" or "No"), 255, 255, 255)
    messageClient(client, "Enabled: " .. (status.config.enabled and "Yes" or "No"), 255, 255, 255)
    messageClient(client, "Interval: " .. status.config.intervalMinutes .. " minutes", 255, 255, 255)
    messageClient(client, "Batch Size: " .. status.config.batchSize, 255, 255, 255)
    messageClient(client, "Total Syncs: " .. status.stats.totalSyncs, 255, 255, 255)
    messageClient(client, "Successful: " .. status.stats.successfulSyncs, 255, 255, 255)
    messageClient(client, "Failed: " .. status.stats.failedSyncs, 255, 255, 255)
    messageClient(client, "Players Synced: " .. status.stats.playersSynced, 255, 255, 255)
    
    if status.lastSyncTime > 0 then
        local timeSince = JobsRP.nowSeconds() - status.lastSyncTime
        messageClient(client, "Last Sync: " .. math.floor(timeSince) .. " seconds ago", 255, 255, 255)
    else
        messageClient(client, "Last Sync: Never", 255, 255, 255)
    end
    
    messageClient(client, "Next Sync: " .. math.floor(status.nextSyncIn) .. " seconds", 255, 255, 255)
    
    return true
end

-- Initialize the sync scheduler
function SyncScheduler.init(config)
    if config then
        for key, value in pairs(config) do
            SyncScheduler.config[key] = value
        end
    end
    
    print("[SyncScheduler] Initializing with " .. SyncScheduler.config.intervalMinutes .. " minute intervals")
    
    -- Register admin commands if available
    if addCommandHandler then
        addCommandHandler("sync", SyncScheduler.adminSync)
        addCommandHandler("syncstatus", SyncScheduler.adminStatus)
        print("[SyncScheduler] Admin commands registered: /sync, /syncstatus")
    end
    
    -- Start the scheduler
    SyncScheduler.start()
    
    print("[SyncScheduler] Sync scheduler initialized")
end

-- Helper function for setTimeout (if not available)
if not setTimeout then
    function setTimeout(func, delay)
        -- Simple implementation - in real GTAC this might be different
        local startTime = JobsRP.nowMilliseconds()
        local checkTime = function()
            if JobsRP.nowMilliseconds() - startTime >= delay then
                func()
            else
                checkTime()
            end
        end
        checkTime()
    end
end

if not setInterval then
    function setInterval(func, delay)
        -- Simple implementation - in real GTAC this might be different
        local function loop()
            func()
            setTimeout(loop, delay)
        end
        setTimeout(loop, delay)
    end
end

print("[SyncScheduler] Sync scheduler module loaded")
