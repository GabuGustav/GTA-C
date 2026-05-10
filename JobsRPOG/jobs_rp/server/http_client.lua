-- HTTP Client queue for GTA Connected web sync
-- Lua writes request jobs to disk; a JS bridge performs the actual HTTP transport.

JobsRP = JobsRP or {}
JobsRP.HttpClient = JobsRP.HttpClient or {}

local HttpClient = JobsRP.HttpClient

HttpClient.config = {
    apiUrl = "https://bgfr-gta-connected.netlify.app/.netlify/functions",
    apiKey = "gta-server-api-key",
    queueFile = "data/web_api_queue.json",
    statusFile = "data/web_sync_status.json",
    maxQueueSize = 100
}

local function loadText(path)
    if loadTextFile then
        local ok, result = pcall(loadTextFile, path)
        if ok then
            return result
        end
    end

    if io and io.open then
        local file = io.open(path, "r")
        if file then
            local content = file:read("*a")
            file:close()
            return content
        end
    end

    return nil
end

local function saveText(path, content)
    if saveTextFile then
        local ok, result = pcall(saveTextFile, path, content)
        if ok then
            return result ~= false
        end
    end

    if io and io.open then
        local file = io.open(path, "w")
        if file then
            file:write(content)
            file:close()
            return true
        end
    end

    return false
end

local function decodeJson(raw, fallback)
    if not raw or raw == "" then
        return fallback
    end

    local ok, decoded = pcall(function()
        return JobsRP.Json.decode(raw)
    end)

    if ok and type(decoded) == "table" then
        return decoded
    end

    return fallback
end

local function encodeJson(value)
    local ok, encoded = pcall(function()
        return JobsRP.Json.encode(value)
    end)

    if ok and encoded then
        return encoded
    end

    return "{}"
end

local function loadQueue()
    local queue = decodeJson(loadText(HttpClient.config.queueFile), { requests = {} })
    if type(queue.requests) ~= "table" then
        queue.requests = {}
    end
    return queue
end

local function saveQueue(queue)
    return saveText(HttpClient.config.queueFile, encodeJson(queue))
end

local function loadBridgeStatus()
    local status = decodeJson(loadText(HttpClient.config.statusFile), {})
    if type(status) ~= "table" then
        status = {}
    end
    return status
end

local function nextRequestId()
    return tostring(JobsRP.nowMilliseconds()) .. "-" .. tostring(math.random(100000, 999999))
end

local function queueRequest(method, endpoint, data, callback)
    local queue = loadQueue()

    if #queue.requests >= HttpClient.config.maxQueueSize then
        if callback then
            callback(false, "Web sync queue is full")
        end
        return false
    end

    local request = {
        id = nextRequestId(),
        method = method,
        endpoint = endpoint,
        data = data,
        createdAt = JobsRP.nowSeconds()
    }

    table.insert(queue.requests, request)

    if not saveQueue(queue) then
        if callback then
            callback(false, "Failed to persist web sync queue")
        end
        return false
    end

    print("[HttpClient] Queued " .. method .. " " .. endpoint .. " as request " .. request.id)

    if callback then
        callback(true, {
            queued = true,
            requestId = request.id,
            endpoint = endpoint
        }, 202)
    end

    return true
end

function HttpClient.createWebsiteAccount(username, password, playerName, playerIp, callback)
    return queueRequest("POST", "/create-account-from-game", {
        username = username,
        password = password,
        playerName = playerName,
        playerIp = playerIp
    }, callback)
end

function HttpClient.syncPlayerStats(playerUpdates, callback)
    local queuedCount = 0

    for _, update in ipairs(playerUpdates or {}) do
        local queued = queueRequest("POST", "/batch-sync-stats", {
            playerUpdates = { update }
        }, nil)

        if queued then
            queuedCount = queuedCount + 1
        end
    end

    if callback then
        callback(queuedCount > 0, {
            queued = queuedCount > 0,
            queuedCount = queuedCount
        }, 202)
    end

    return queuedCount > 0
end

function HttpClient.getPlayerRank(accountId, jobType, callback)
    return queueRequest("GET", "/player-rank/" .. accountId .. "/" .. jobType, nil, callback)
end

function HttpClient.getLeaderboard(jobType, limit, offset, callback)
    limit = limit or 50
    offset = offset or 0
    return queueRequest("GET", "/leaderboard/" .. jobType .. "?limit=" .. limit .. "&offset=" .. offset, nil, callback)
end

function HttpClient.getPlayerAchievements(accountId, callback)
    return queueRequest("GET", "/player-achievements/" .. accountId, nil, callback)
end

function HttpClient.updateAchievements(username, newAchievements, callback)
    return queueRequest("POST", "/update-achievements", {
        username = username,
        newAchievements = newAchievements
    }, callback)
end

function HttpClient.testConnection(callback)
    local status = loadBridgeStatus()
    if status.lastSuccessAt then
        if callback then
            callback(true, status, 200)
        end
        return true
    end

    return queueRequest("GET", "/health", nil, callback)
end

function HttpClient.setApiUrl(url)
    HttpClient.config.apiUrl = url
end

function HttpClient.setApiKey(key)
    HttpClient.config.apiKey = key
end

function HttpClient.setSyncApiUrl(url)
    HttpClient.config.syncApiUrl = url
end

function HttpClient.getQueueStatus()
    local queue = loadQueue()
    local status = loadBridgeStatus()

    return {
        loaded = true,
        queueSize = #queue.requests,
        isProcessing = status.isProcessing == true,
        lastRequestTime = status.lastAttemptAt or 0,
        lastSuccessAt = status.lastSuccessAt or 0,
        lastError = status.lastError,
        processedCount = status.processedCount or 0,
        failedCount = status.failedCount or 0,
        bridgeMode = "js-httpget"
    }
end

function HttpClient.init(config)
    if config then
        for key, value in pairs(config) do
            HttpClient.config[key] = value
        end
    end

    if JobsRP.Config then
        HttpClient.config.queueFile = JobsRP.Config.web_bridge_queue_file or HttpClient.config.queueFile
        HttpClient.config.statusFile = JobsRP.Config.web_bridge_status_file or HttpClient.config.statusFile
        HttpClient.config.syncApiUrl = JobsRP.Config.website_sync_api_url or HttpClient.config.syncApiUrl
    end

    local queue = loadQueue()
    if not queue.requests then
        queue.requests = {}
        saveQueue(queue)
    end

    print("[HttpClient] Initialized in file queue mode")
    print("[HttpClient] Sync API URL: " .. tostring(HttpClient.config.syncApiUrl))
    print("[HttpClient] Queue file: " .. tostring(HttpClient.config.queueFile))
end

print("[HttpClient] HTTP client module loaded")
