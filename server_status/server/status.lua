-- Server Status Resource
-- Writes server status to disk for external queries

local STATUS_FILE = "resources/server_status/data/status.json"
local UPDATE_INTERVAL = 30000 -- 30 seconds

local function getTimestamp()
    if os and os.time then
        return os.time()
    end
    return 0
end

local function saveStatus()
    local clients = getClients()
    local playerCount = clients and #clients or 0
    
    local status = {
        online = true,
        players = playerCount,
        maxPlayers = 32,
        serverName = "BGFR Play Test",
        updatedAt = getTimestamp()
    }
    
    local ok = pcall(function()
        saveTextFile(STATUS_FILE, JobsRP.Json.encode(status))
    end)
    
    if not ok then
        print("[ServerStatus] Failed to write status file")
    end
end

-- Update on interval
setInterval(saveStatus, UPDATE_INTERVAL)

-- Update immediately on start
saveStatus()

print("[ServerStatus] Server status resource started")
