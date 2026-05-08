-- Authentication Core Module
-- Basic authentication functions and utilities

local AuthCore = {}

-- HEX values for token generation
local HEX = {
    "0", "1", "2", "3", "4", "5", "6", "7",
    "8", "9", "a", "b", "c", "d", "e", "f"
}

-- Utility functions
local function unpackTable(values, index)
    local i = index or 1
    if type(values) ~= "table" then
        return
    end
    if values[i] == nil then
        return
    end
    return values[i], unpackTable(values, i + 1)
end

local function nowMs()
    if os and os.clock then
        return math.floor(os.clock() * 1000)
    end
    if JobsRP and JobsRP.nowSeconds then
        return math.floor(JobsRP.nowSeconds() * 1000)
    end
    if os and os.time then
        return os.time() * 1000
    end
    return 0
end

-- Generate random token
function AuthCore.generateToken(length)
    length = length or 32
    local token = ""
    for i = 1, length do
        token = token .. HEX[math.random(1, #HEX)]
    end
    return token
end

-- Hash password with salt
function AuthCore.hashPassword(password, salt)
    if not password then
        return nil
    end
    
    local salted = password .. (salt or "")
    -- Simple hash for now - replace with proper hashing in production
    return string.format("%08x", string.len(salted) * 31 + string.byte(salted, 1) or 0)
end

-- Verify password against hash
function AuthCore.verifyPassword(password, hash, salt)
    local computedHash = AuthCore.hashPassword(password, salt)
    return computedHash == hash
end

-- Resolve client from actor with multiple fallback methods
function AuthCore.resolveClient(actor)
    if not actor then
        return nil
    end
    
    local t = type(actor)
    
    -- Try to get client by index
    if t == "number" then
        if getClients then
            local okClients, clients = pcall(getClients)
            if okClients and type(clients) == "table" then
                for _, client in ipairs(clients) do
                    local okIdx, idx = pcall(function()
                        return client.index
                    end)
                    if okIdx and idx == actor then
                        return client
                    end
                end
            end
        end
    end
    
    -- Try userdata/table methods
    if t ~= "userdata" and t ~= "table" then
        return nil
    end
    
    -- Check for linked player
    local hasLinkedPlayer = false
    local okLinked = pcall(function()
        hasLinkedPlayer = actor.player ~= nil
    end)
    if okLinked and hasLinkedPlayer then
        return actor
    end
    
    -- Try player element method
    if getClientFromPlayerElement then
        local okClient, client = pcall(function()
            return getClientFromPlayerElement(actor)
        end)
        if okClient and client then
            return client
        end
    end
    
    return nil
end

-- Get account ID from client with robust fallback methods
function AuthCore.getAccountId(player)
    -- Method 1: Direct session lookup
    if JobsRP.Auth.sessionsByPlayer[player] then
        return JobsRP.Auth.sessionsByPlayer[player].accountId
    end
    
    -- Method 2: Try to get from player object
    if player and player.accountId then
        return player.accountId
    end
    
    -- Method 3: Try to get from store
    if JobsRP.Store and JobsRP.Store.getAccountId then
        local accountId = JobsRP.Store.getAccountId(player)
        if accountId then
            return accountId
        end
    end
    
    -- Method 4: Try to get from player name
    if player and player.name then
        local profile = JobsRP.Store and JobsRP.Store.getProfileByName(player.name)
        if profile and profile.accountId then
            return profile.accountId
        end
    end
    
    return nil
end

-- Check if player is authenticated
function AuthCore.isAuthenticated(player)
    local accountId = AuthCore.getAccountId(player)
    return accountId ~= nil
end

return AuthCore
