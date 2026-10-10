-- Web Integration Module
-- Coordinates all web integration components and provides unified interface

JobsRP = JobsRP or {}
JobsRP.WebIntegration = JobsRP.WebIntegration or {}

local WebIntegration = JobsRP.WebIntegration

local function debugPrint(...)
    if JobsRP.Config and JobsRP.Config.debug then
        print(...)
    end
end

-- Initialize web integration system
function WebIntegration.init(config)
    debugPrint("[WebIntegration] Initializing web integration system...")
    
    -- Set default configuration
    WebIntegration.config = {
        enabled = true,
        apiUrl = "https://bgfr-gta-connected.netlify.app/.netlify/functions",
        apiKey = "gta-server-api-key",
        syncInterval = 5, -- minutes
        autoCreateAccounts = true,
        enableStats = true,
        enableSync = true
    }
    
    -- Override with provided config
    if config then
        for key, value in pairs(config) do
            WebIntegration.config[key] = value
        end
    end
    
    -- Update JobsRP.Config for other modules
    JobsRP.Config.web_integration_enabled = WebIntegration.config.enabled
    JobsRP.Config.website_api_url = WebIntegration.config.apiUrl
    JobsRP.Config.api_secret_key = WebIntegration.config.apiKey
    
    -- Initialize HTTP client
    if WebIntegration.config.enabled and JobsRP.HttpClient then
        JobsRP.HttpClient.init({
            apiUrl = WebIntegration.config.apiUrl,
            apiKey = WebIntegration.config.apiKey
        })
        debugPrint("[WebIntegration] HTTP client initialized")
    end
    
    -- Initialize job stats if enabled
    if WebIntegration.config.enableStats and JobsRP.JobStats then
        JobsRP.JobStats.init()
        debugPrint("[WebIntegration] Job stats initialized")
    end
    
    -- Initialize sync scheduler if enabled
    if WebIntegration.config.enableSync and JobsRP.SyncScheduler then
        JobsRP.SyncScheduler.init({
            enabled = WebIntegration.config.enabled,
            intervalMinutes = WebIntegration.config.syncInterval
        })
        debugPrint("[WebIntegration] Sync scheduler initialized")
    end
    
    -- Initialize account data store for local JSON backup
    if JobsRP.AccountDataStore then
        JobsRP.AccountDataStore.init({
            autoSave = true,
            syncToApi = true,
            retryFailedSync = true,
            retryInterval = 60
        })
        debugPrint("[WebIntegration] Account data store initialized")
        
        -- Set up automatic retry of failed syncs every 2 minutes
        WebIntegration.startRetryScheduler()
    end
    
    -- Test connection to website
    if WebIntegration.config.enabled and JobsRP.HttpClient then
        WebIntegration.testConnection()
    end
    
    debugPrint("[WebIntegration] Web integration system ready")
end

-- Test connection to website API
function WebIntegration.testConnection()
    if not JobsRP.HttpClient then
        print("[WebIntegration] HTTP client not available for connection test")
        return false
    end
    
    JobsRP.HttpClient.testConnection(function(success, response)
        if success then
        debugPrint("[WebIntegration] Connection test successful")
            if response and response.status then
                debugPrint("[WebIntegration] Website status: " .. response.status)
            end
        else
            print("[WebIntegration] Connection test failed: " .. tostring(response))
        end
    end)
    
    return true
end

-- Get integration status
function WebIntegration.getStatus()
    local status = {
        enabled = WebIntegration.config.enabled,
        apiUrl = WebIntegration.config.apiUrl,
        components = {}
    }
    
    -- Check HTTP client status
    if JobsRP.HttpClient then
        status.components.httpClient = JobsRP.HttpClient.getQueueStatus()
    else
        status.components.httpClient = { loaded = false }
    end
    
    -- Check job stats status
    if JobsRP.JobStats then
        local allStats = JobsRP.JobStats.getAllPlayerStats()
        status.components.jobStats = {
            loaded = true,
            playersTracked = #allStats
        }
    else
        status.components.jobStats = { loaded = false }
    end
    
    -- Check sync scheduler status
    if JobsRP.SyncScheduler then
        status.components.syncScheduler = JobsRP.SyncScheduler.getStatus()
    else
        status.components.syncScheduler = { loaded = false }
    end
    
    -- Check account data store status
    if JobsRP.AccountDataStore then
        local allStats = {}
        -- Get pending sync count
        local pendingCount = 0
        for _ in pairs(JobsRP.AccountDataStore.pendingSync) do
            pendingCount = pendingCount + 1
        end
        status.components.accountDataStore = {
            loaded = true,
            pendingSyncs = pendingCount
        }
    else
        status.components.accountDataStore = { loaded = false }
    end
    
    return status
end

-- Manual sync trigger
function WebIntegration.triggerSync()
    if not WebIntegration.config.enabled then
        print("[WebIntegration] Integration disabled, cannot trigger sync")
        return false
    end
    
    if JobsRP.SyncScheduler then
        return JobsRP.SyncScheduler.triggerSync()
    end
    
    print("[WebIntegration] Sync scheduler not available")
    return false
end

-- Update player statistic (convenience function)
function WebIntegration.updatePlayerStat(accountId, jobType, statName, value, operation)
    if not WebIntegration.config.enableStats or not JobsRP.JobStats then
        return false
    end
    
    return JobsRP.JobStats.updateStat(accountId, jobType, statName, value, operation)
end

-- Get player statistics
function WebIntegration.getPlayerStats(accountId, jobType)
    if not WebIntegration.config.enableStats or not JobsRP.JobStats then
        return nil
    end
    
    return JobsRP.JobStats.getPlayerStats(accountId, jobType)
end

-- Get leaderboard
function WebIntegration.getLeaderboard(jobType, limit)
    if not WebIntegration.config.enableStats or not JobsRP.JobStats then
        return {}
    end
    
    return JobsRP.JobStats.getLeaderboard(jobType, limit)
end

-- Retry scheduler timer
WebIntegration.retryTimer = nil

-- Start retry scheduler for failed syncs
function WebIntegration.startRetryScheduler()
    if WebIntegration.retryTimer then
        clearInterval(WebIntegration.retryTimer)
    end
    
    -- Retry every 2 minutes (120 seconds = 120000ms)
    if setInterval then
        WebIntegration.retryTimer = setInterval(function()
            if JobsRP.SyncScheduler and JobsRP.SyncScheduler.retryFailedSyncs then
                JobsRP.SyncScheduler.retryFailedSyncs()
            end
        end, 120000) -- 2 minutes in ms
        print("[WebIntegration] Retry scheduler started (120s interval)")
    else
        print("[WebIntegration] WARNING: setInterval not available, retry scheduler disabled")
    end
end

-- Stop retry scheduler
function WebIntegration.stopRetryScheduler()
    if WebIntegration.retryTimer and clearInterval then
        clearInterval(WebIntegration.retryTimer)
        WebIntegration.retryTimer = nil
        print("[WebIntegration] Retry scheduler stopped")
    end
end

-- Admin command to show integration status
function WebIntegration.adminStatus(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    local status = WebIntegration.getStatus()
    
    messageClient(client, "=== Web Integration Status ===", 255, 255, 255)
    messageClient(client, "Enabled: " .. (status.enabled and "Yes" or "No"), 255, 255, 255)
    messageClient(client, "API URL: " .. status.apiUrl, 255, 255, 255)
    
    -- HTTP Client status
    local httpStatus = status.components.httpClient
    if httpStatus.loaded then
        messageClient(client, "HTTP Client: Loaded", 0, 255, 0)
        messageClient(client, "Queue Size: " .. (httpStatus.queueSize or 0), 255, 255, 255)
        messageClient(client, "Processing: " .. (httpStatus.isProcessing and "Yes" or "No"), 255, 255, 255)
    else
        messageClient(client, "HTTP Client: Not loaded", 255, 0, 0)
    end
    
    -- Job Stats status
    local statsStatus = status.components.jobStats
    if statsStatus.loaded then
        messageClient(client, "Job Stats: Loaded", 0, 255, 0)
        messageClient(client, "Players Tracked: " .. (statsStatus.playersTracked or 0), 255, 255, 255)
    else
        messageClient(client, "Job Stats: Not loaded", 255, 0, 0)
    end
    
    -- Sync Scheduler status
    local syncStatus = status.components.syncScheduler
    if syncStatus.loaded then
        messageClient(client, "Sync Scheduler: Loaded", 0, 255, 0)
        messageClient(client, "Running: " .. (syncStatus.isRunning and "Yes" or "No"), 255, 255, 255)
        messageClient(client, "Total Syncs: " .. (syncStatus.stats.totalSyncs or 0), 255, 255, 255)
        messageClient(client, "Successful: " .. (syncStatus.stats.successfulSyncs or 0), 255, 255, 255)
        messageClient(client, "Failed: " .. (syncStatus.stats.failedSyncs or 0), 255, 255, 255)
    else
        messageClient(client, "Sync Scheduler: Not loaded", 255, 0, 0)
    end
    
    return true
end

-- Admin command to check authentication status
function WebIntegration.adminAuthStatus(client)
    if not client then
        print("[WebIntegration] ERROR: No client provided")
        return false
    end
    
    messageClient(client, "Checking authentication status...", 255, 255, 0)
    
    -- Get accountId from Auth system
    local accountId = nil
    if JobsRP and JobsRP.Auth and JobsRP.Auth.getAccountId then
        accountId = JobsRP.Auth.getAccountId(client)
        print("[WebIntegration] DEBUG: getAccountId returned: " .. tostring(accountId))
    else
        print("[WebIntegration] DEBUG: Auth.getAccountId not available")
    end
    
    if accountId then
        messageClient(client, "Authenticated as: " .. accountId, 0, 255, 0)
        messageClient(client, "XP rewards are active!", 0, 255, 0)
    else
        messageClient(client, "Not authenticated!", 255, 0, 0)
        messageClient(client, "Use: /jobauth login <username> <password>", 255, 255, 0)
        messageClient(client, "Then you will earn XP for playtime", 255, 255, 0)
    end
    
    return true
end

-- Admin command to test playtime XP system
function WebIntegration.adminTestXP(client)
    if not client then
        print("[WebIntegration] ERROR: No client provided for testxp command")
        return false
    end
    
    -- Validate client has required methods
    if not client.name then
        print("[WebIntegration] ERROR: Invalid client object for testxp command")
        return false
    end
    
    print("[WebIntegration] DEBUG: testxp command called by client: " .. (client.name or "Unknown"))
    
    if messageClient then
        messageClient(client, "Testing playtime XP system...", 255, 255, 0)
    else
        print("[WebIntegration] ERROR: messageClient function not available")
        return false
    end
    
    if JobsRP and JobsRP.JobStats then
        -- Get accountId from Auth system or fallback to Store system
        local accountId = nil
        
        -- Try Auth system first
        if JobsRP.Auth and JobsRP.Auth.getAccountId then
            accountId = JobsRP.Auth.getAccountId(client)
            print("[WebIntegration] DEBUG: Auth.getAccountId returned: " .. tostring(accountId))
        end
        
        -- Fallback: Try Store system if Auth fails
        if not accountId and JobsRP.Store and JobsRP.Store.getPlayerId then
            accountId = JobsRP.Store.getPlayerId(client)
            print("[WebIntegration] DEBUG: Store.getPlayerId returned: " .. tostring(accountId))
        end
        
        if accountId then
            print("[WebIntegration] DEBUG: Granting 10 XP to " .. accountId)
            messageClient(client, "Manually granting 10 XP to " .. accountId, 0, 255, 0)
            JobsRP.JobStats.addExperience(accountId, "civilian", 10)
            
            -- Get updated stats
            local stats = JobsRP.JobStats.getPlayerStats(accountId, "civilian")
            if stats then
                messageClient(client, "New XP: " .. stats.experience .. ", Level: " .. stats.level, 0, 255, 0)
            end
        else
            messageClient(client, "You have no accountId! Please authenticate first with /jobauth login", 255, 0, 0)
            print("[WebIntegration] DEBUG: No accountId found for client: " .. (client.name or "Unknown"))
        end
    else
        messageClient(client, "JobStats system not available!", 255, 0, 0)
        print("[WebIntegration] ERROR: JobStats system not available")
        return false
    end
    
    return true
end

-- Admin command to reset all accounts
function WebIntegration.adminResetAccounts(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    messageClient(client, "RESETTING ALL PLAYER ACCOUNTS...", 255, 0, 0)
    
    if JobsRP and JobsRP.JobStats and JobsRP.JobStats.resetAllAccounts then
        JobsRP.JobStats.resetAllAccounts()
        messageClient(client, "All accounts have been reset!", 0, 255, 0)
        messageClient(client, "New playtime XP system is now active.", 0, 255, 0)
    else
        messageClient(client, "JobStats system not available!", 255, 0, 0)
        return false
    end
    
    return true
end

-- Admin command to test connection
function WebIntegration.adminTest(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    messageClient(client, "Testing website connection...", 255, 255, 0)
    
    local success = WebIntegration.testConnection()
    if success then
        messageClient(client, "Connection test initiated. Check console for results.", 0, 255, 0)
    else
        messageClient(client, "HTTP client not available for connection test.", 255, 0, 0)
    end
    
    return true
end

-- Admin command to trigger manual sync
function WebIntegration.adminSync(client)
    if not Auth or not Auth.requireAuthenticated(client) then
        return false
    end
    
    if not WebIntegration.config.enabled then
        messageClient(client, "Web integration is disabled.", 255, 0, 0)
        return false
    end
    
    messageClient(client, "Triggering manual sync...", 255, 255, 0)
    
    local success = WebIntegration.triggerSync()
    if success then
        messageClient(client, "Manual sync triggered. Check console for progress.", 0, 255, 0)
    else
        messageClient(client, "Failed to trigger sync. Check if sync scheduler is loaded.", 255, 0, 0)
    end
    
    return true
end

-- Event handlers for job system integration
function WebIntegration.onPlayerJobChange(client, oldJob, newJob)
    if not WebIntegration.config.enabled or not client.accountId then
        return
    end
    
    print("[WebIntegration] Player " .. client.name .. " changed job from " .. (oldJob or "none") .. " to " .. (newJob or "none"))
    
    -- Initialize stats for new job
    if newJob and JobsRP.JobStats then
        JobsRP.JobStats.initPlayerStats(client.accountId, newJob)
    end
end

function WebIntegration.onPlayerStatUpdate(client, jobType, statName, value, operation)
    if not WebIntegration.config.enabled or not client.accountId then
        return
    end
    
    -- Update the statistic
    WebIntegration.updatePlayerStat(client.accountId, jobType, statName, value, operation)
end

-- Register event handlers and commands
function WebIntegration.registerEventHandlers()
    -- Register admin commands
    if addCommandHandler then
        addCommandHandler("webstatus", WebIntegration.adminStatus)
        addCommandHandler("webtest", WebIntegration.adminTest)
        addCommandHandler("websync", WebIntegration.adminSync)
        addCommandHandler("resetaccounts", WebIntegration.adminResetAccounts)
        addCommandHandler("testxp", WebIntegration.adminTestXP)
        addCommandHandler("authstatus", WebIntegration.adminAuthStatus)
        print("[WebIntegration] Admin commands registered: /webstatus, /webtest, /websync, /resetaccounts, /testxp, /authstatus")
    end
    
    -- Register event handlers if event system is available
    if addEventHandler then
        -- These would be called by other parts of the job system
        -- addEventHandler("onPlayerJobChange", WebIntegration.onPlayerJobChange)
        -- addEventHandler("onPlayerStatUpdate", WebIntegration.onPlayerStatUpdate)
    end
    
    print("[WebIntegration] Event handlers registered")
end

-- Configuration update
function WebIntegration.updateConfig(key, value)
    WebIntegration.config[key] = value
    
    -- Update related configurations
    if key == "enabled" then
        JobsRP.Config.web_integration_enabled = value
    elseif key == "apiUrl" then
        JobsRP.Config.website_api_url = value
        if JobsRP.HttpClient then
            JobsRP.HttpClient.setApiUrl(value)
        end
    elseif key == "apiKey" then
        JobsRP.Config.api_secret_key = value
        if JobsRP.HttpClient then
            JobsRP.HttpClient.setApiKey(value)
        end
    elseif key == "syncInterval" then
        if JobsRP.SyncScheduler then
            JobsRP.SyncScheduler.setInterval(value)
        end
    end
    
    print("[WebIntegration] Config updated: " .. key .. " = " .. tostring(value))
end

-- Initialize the web integration system
function WebIntegration.startup(config)
    WebIntegration.init(config)
    WebIntegration.registerEventHandlers()
    
    print("[WebIntegration] Web integration startup complete")
end

-- Cleanup function
function WebIntegration.shutdown()
    print("[WebIntegration] Shutting down web integration...")
    
    -- Stop sync scheduler
    if JobsRP.SyncScheduler then
        JobsRP.SyncScheduler.stop()
    end
    
    -- Stop retry scheduler
    WebIntegration.stopRetryScheduler()
    
    -- Clear any pending requests
    if JobsRP.HttpClient then
        local queueStatus = JobsRP.HttpClient.getQueueStatus()
        if queueStatus.queueSize > 0 then
            print("[WebIntegration] Warning: " .. queueStatus.queueSize .. " requests still in queue")
        end
    end
    
    print("[WebIntegration] Shutdown complete")
end

-- Auto-start with default configuration
if JobsRP.Config and JobsRP.Config.web_integration_enabled ~= false then
    setTimeout(function()
        WebIntegration.startup()
    end, 2000) -- Start 2 seconds after server loads
end

    debugPrint("[WebIntegration] Web integration module loaded")
