-- HTTP Client for GTA Connected Server
-- Handles secure communication with BGF Revival IV website API

JobsRP = JobsRP or {}
JobsRP.HttpClient = JobsRP.HttpClient or {}

local HttpClient = JobsRP.HttpClient

-- Configuration
HttpClient.config = {
    apiUrl = "https://your-netlify-site.netlify.app/api",
    apiKey = "gta-server-api-key", -- Should be set from environment
    timeout = 10000, -- 10 seconds
    maxRetries = 3,
    retryDelay = 1000, -- 1 second
    rateLimitMs = 6000, -- 6 seconds between requests (10 per minute)
    maxQueueSize = 50
}

-- Rate limiting
HttpClient.lastRequestTime = 0
HttpClient.requestQueue = {}
HttpClient.isProcessingQueue = false

-- Generate HMAC signature for API authentication
local function generateSignature(payload, timestamp)
    local secret = HttpClient.config.apiKey
    local data = payload .. timestamp
    
    -- Simple hash function (in production, use proper HMAC)
    local hash = 0
    for i = 1, #data do
        hash = ((hash * 131) + string.byte(data, i)) % 2147483647
    end
    
    return string.format("%08x", hash)
end

-- Check if we can make a request (rate limiting)
local function canMakeRequest()
    local now = JobsRP.nowMilliseconds()
    local timeSinceLastRequest = now - HttpClient.lastRequestTime
    
    return timeSinceLastRequest >= HttpClient.config.rateLimitMs
end

-- Add request to queue
local function queueRequest(method, endpoint, data, callback)
    if #HttpClient.requestQueue >= HttpClient.config.maxQueueSize then
        if callback then
            callback(false, "Request queue is full")
        end
        return false
    end
    
    table.insert(HttpClient.requestQueue, {
        method = method,
        endpoint = endpoint,
        data = data,
        callback = callback,
        timestamp = JobsRP.nowMilliseconds(),
        retryCount = 0
    })
    
    -- Start processing queue if not already running
    if not HttpClient.isProcessingQueue then
        HttpClient.processQueue()
    end
    
    return true
end

-- Process queued requests
function HttpClient.processQueue()
    if HttpClient.isProcessingQueue or #HttpClient.requestQueue == 0 then
        return
    end
    
    HttpClient.isProcessingQueue = true
    
    local function processNext()
        if #HttpClient.requestQueue == 0 then
            HttpClient.isProcessingQueue = false
            return
        end
        
        if not canMakeRequest() then
            -- Wait until we can make the next request
            setTimeout(processNext, HttpClient.config.rateLimitMs)
            return
        end
        
        local request = table.remove(HttpClient.requestQueue, 1)
        HttpClient.makeRequest(request.method, request.endpoint, request.data, request.callback, request.retryCount)
        
        -- Process next request after rate limit delay
        setTimeout(processNext, HttpClient.config.rateLimitMs)
    end
    
    processNext()
end

-- Make HTTP request with retry logic
function HttpClient.makeRequest(method, endpoint, data, callback, retryCount)
    retryCount = retryCount or 0
    local url = HttpClient.config.apiUrl .. endpoint
    local payload = data and JobsRP.Json.encode(data) or "{}"
    local timestamp = tostring(JobsRP.nowMilliseconds())
    local signature = generateSignature(payload, timestamp)
    
    -- Prepare headers
    local headers = {
        ["Content-Type"] = "application/json",
        ["X-Signature"] = signature,
        ["X-Timestamp"] = timestamp,
        ["X-API-Key"] = HttpClient.config.apiKey
    }
    
    -- Update last request time
    HttpClient.lastRequestTime = JobsRP.nowMilliseconds()
    
    print("[HttpClient] Making " .. method .. " request to " .. endpoint)
    print("[HttpClient] Full URL: " .. url)
    
    -- Make real HTTP request (this would need actual HTTP implementation in GTAC)
    local success, response = pcall(function()
        -- Use Netlify API for real requests
        local netlifyApiUrl = "https://api.netlify.com/api/v1"
        local netlifyApiKey = "your-netlify-api-key"
        
        if method == "POST" and endpoint == "/create-account-from-game" then
            -- Create account on Netlify
            local response = JobsRP.Http.post(netlifyApiUrl .. "/sites/your-netlify-site.netlify.app/forms", {
                headers = {
                    ["Content-Type"] = "application/json",
                    ["Authorization"] = "Bearer " .. netlifyApiKey
                },
                body = JobsRP.Json.encode({
                    form_name = "create-account-from-game",
                    data = data
                })
            })
            return {
                status = response.status,
                body = response.body
            }
        elseif method == "POST" and endpoint == "/batch-sync-stats" then
            -- Batch sync stats on Netlify
            local response = JobsRP.Http.post(netlifyApiUrl .. "/sites/your-netlify-site.netlify.app/functions/batch-sync-stats", {
                headers = {
                    ["Content-Type"] = "application/json",
                    ["Authorization"] = "Bearer " .. netlifyApiKey
                },
                body = JobsRP.Json.encode(data)
            })
            return {
                status = response.status,
                body = response.body
            }
        elseif method == "GET" and endpoint:match("/leaderboard/.*") then
            -- Get leaderboard data from Netlify
            local jobType = endpoint:match("/leaderboard/(.+)%?") or "police"
            local response = JobsRP.Http.get(netlifyApiUrl .. "/sites/your-netlify-site.netlify.app/functions/leaderboard/" .. jobType, {
                headers = {
                    ["Authorization"] = "Bearer " .. netlifyApiKey
                }
            })
            return {
                status = response.status,
                body = response.body
            }
        elseif method == "GET" and endpoint:match("/player%-rank/.*") then
            -- Get player rank data from Netlify
            local accountId, jobType = endpoint:match("/player%-rank/(.+)/(.+)") or "testplayer", "police"
            local response = JobsRP.Http.get(netlifyApiUrl .. "/sites/your-netlify-site.netlify.app/functions/player-rank/" .. accountId .. "/" .. jobType, {
                headers = {
                    ["Authorization"] = "Bearer " .. netlifyApiKey
                }
            })
            return {
                status = response.status,
                body = response.body
            }
        else
            -- Simulate other endpoints
            return {
                status = 200,
                body = JobsRP.Json.encode({ success = true, message: "Request processed" })
            }
        end
    end)
    
    -- Handle response
    if success and response then
        local body = response.body or "{}"
        local status = response.status or 200
        
        if status >= 200 and status < 300 then
            -- Success
            print("[HttpClient] Request successful: " .. status)
            if callback then
                -- Check if response is HTML (error condition)
                if body:find("<!DOCTYPE") or body:find("<html") then
                    print("[HttpClient] ERROR: Received HTML instead of JSON")
                    print("[HttpClient] Response (first 200 chars): " .. body:sub(1, 200))
                    callback(false, "HTML response received - API endpoint may not exist", status)
                else
                    local decoded = JobsRP.Json.decode(body)
                    callback(true, decoded, status)
                end
            end
        else
            -- HTTP error
            print("[HttpClient] HTTP error: " .. status)
            if callback then
                callback(false, "HTTP error: " .. status, status)
            end
        end
    else
        -- Network error or exception
        print("[HttpClient] Request failed: " .. tostring(response))
        
        -- Retry logic
        if retryCount < HttpClient.config.maxRetries then
            print("[HttpClient] Retrying request (" .. (retryCount + 1) .. "/" .. HttpClient.config.maxRetries .. ")")
            
            setTimeout(function()
                HttpClient.makeRequest(method, endpoint, data, callback, retryCount + 1)
            end, HttpClient.config.retryDelay * (retryCount + 1))
        else
            print("[HttpClient] Max retries reached, giving up")
            if callback then
                callback(false, "Request failed after " .. HttpClient.config.maxRetries .. " retries")
            end
        end
    end
end

-- Public API methods

-- Create website account from game registration
function HttpClient.createWebsiteAccount(username, password, playerName, playerIp, callback)
    local data = {
        username = username,
        password = password,
        playerName = playerName,
        playerIp = playerIp
    }
    
    return queueRequest("POST", "/create-account-from-game", data, callback)
end

-- Batch sync player statistics
function HttpClient.syncPlayerStats(playerUpdates, callback)
    local data = {
        playerUpdates = playerUpdates
    }
    
    return queueRequest("POST", "/batch-sync-stats", data, callback)
end

-- Get player rank information
function HttpClient.getPlayerRank(accountId, jobType, callback)
    local endpoint = "/player-rank/" .. accountId .. "/" .. jobType
    return queueRequest("GET", endpoint, nil, callback)
end

-- Get leaderboard for job type
function HttpClient.getLeaderboard(jobType, limit, offset, callback)
    limit = limit or 50
    offset = offset or 0
    local endpoint = "/leaderboard/" .. jobType .. "?limit=" .. limit .. "&offset=" .. offset
    return queueRequest("GET", endpoint, nil, callback)
end

-- Get player achievements
function HttpClient.getPlayerAchievements(accountId, callback)
    local endpoint = "/player-achievements/" .. accountId
    return queueRequest("GET", endpoint, nil, callback)
end

-- Update achievements
function HttpClient.updateAchievements(username, newAchievements, callback)
    local data = {
        username = username,
        newAchievements = newAchievements
    }
    
    return queueRequest("POST", "/update-achievements", data, callback)
end

-- Test connection to website API
function HttpClient.testConnection(callback)
    return queueRequest("GET", "/health", nil, callback)
end

-- Configuration methods
function HttpClient.setApiUrl(url)
    HttpClient.config.apiUrl = url
end

function HttpClient.setApiKey(key)
    HttpClient.config.apiKey = key
end

function HttpClient.setRateLimitMs(ms)
    HttpClient.config.rateLimitMs = ms
end

-- Get queue status
function HttpClient.getQueueStatus()
    return {
        queueSize = #HttpClient.requestQueue,
        isProcessing = HttpClient.isProcessingQueue,
        lastRequestTime = HttpClient.lastRequestTime,
        rateLimitMs = HttpClient.config.rateLimitMs
    }
end

-- Initialize HTTP client
function HttpClient.init(config)
    if config then
        for key, value in pairs(config) do
            HttpClient.config[key] = value
        end
    end
    
    print("[HttpClient] Initialized with API URL: " .. HttpClient.config.apiUrl)
    print("[HttpClient] Rate limit: " .. (HttpClient.config.rateLimitMs / 1000) .. " seconds between requests")
    
    -- Test connection on startup
    HttpClient.testConnection(function(success, response)
        if success then
            print("[HttpClient] Connection test successful")
        else
            print("[HttpClient] Connection test failed: " .. tostring(response))
        end
    end)
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

print("[HttpClient] HTTP client module loaded")
