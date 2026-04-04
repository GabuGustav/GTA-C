-- Web Integration Module
-- Coordinates all web integration components and provides unified interface

JobsRP = JobsRP or {}
JobsRP.WebIntegration = JobsRP.WebIntegration or {}

local WebIntegration = JobsRP.WebIntegration

-- Initialize web integration system
function WebIntegration.init(config)
    print("[WebIntegration] Initializing web integration system...")
    
    -- Set default configuration
    WebIntegration.config = {
        enabled = true,
        apiUrl = "https://bgf-revival-iv.netlify.app/api",  -- Updated for Netlify deployment
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
        print("[WebIntegration] HTTP client initialized")
    end
    
    -- Initialize job stats if enabled
    if WebIntegration.config.enableStats and JobsRP.JobStats then
        JobsRP.JobStats.init()
        print("[WebIntegration] Job stats initialized")
    end
    
    -- Initialize sync scheduler if enabled
    if WebIntegration.config.enableSync and JobsRP.SyncScheduler then
        JobsRP.SyncScheduler.init({
            enabled = WebIntegration.config.enabled,
            intervalMinutes = WebIntegration.config.syncInterval
        })
        print("[WebIntegration] Sync scheduler initialized")
    end
    
    -- Test connection to website
    if WebIntegration.config.enabled and JobsRP.HttpClient then
        WebIntegration.testConnection()
    end
    
    print("[WebIntegration] Web integration system ready")
end

-- Test connection to website API
function WebIntegration.testConnection()
    if not JobsRP.HttpClient then
        print("[WebIntegration] HTTP client not available for connection test")
        return false
    end
    
    JobsRP.HttpClient.testConnection(function(success, response)
        if success then
            print("[WebIntegration] Connection test successful")
            if response and response.status then
                print("[WebIntegration] Website status: " .. response.status)
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
        print("[WebIntegration] Admin commands registered: /webstatus, /webtest, /websync")
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

print("[WebIntegration] Web integration module loaded")
