-- Commands Core Utilities
-- Shared functions used across all command modules

local Core = {}

-- Normalize token by removing leading slash
function Core.normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

-- Resolve client from actor with multiple fallback methods
function Core.resolveClient(actor)
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
    
    -- Check for client identity
    local hasClientIdentity = false
    local okIdentity = pcall(function()
        hasClientIdentity = (actor.index ~= nil and actor.name ~= nil) or (actor.ip ~= nil and actor.name ~= nil)
    end)
    if okIdentity and hasClientIdentity then
        return actor
    end
    
    return nil
end

-- Check if value is a client object
function Core.isClientObject(value)
    -- Try multiple resolveClient methods
    if JobsRP and JobsRP.Auth and JobsRP.Auth.resolveClient then
        return JobsRP.Auth.resolveClient(value) ~= nil
    elseif type(resolveClient) == "function" then
        return resolveClient(value) ~= nil
    else
        -- Fallback: check if it looks like a client
        return type(value) == "table" and (value.name or value.index)
    end
end

-- Convert parameters to words array
function Core.toWords(parameters)
    local out = {}
    
    if type(parameters) == "table" then
        for _, item in ipairs(parameters) do
            out[#out + 1] = tostring(item)
        end
        return out
    end
    
    local raw = tostring(parameters or "")
    for token in string.gmatch(raw, "%S+") do
        out[#out + 1] = token
    end
    return out
end

-- Trim whitespace from text
function Core.trimText(value)
    return JobsRP.trim(value or "")
end

-- Parse quoted text and angle brackets
function Core.parseQuotedAndAngle(text)
    local out = {}
    
    if type(text) == "table" then
        for _, item in ipairs(text) do
            out[#out + 1] = tostring(item)
        end
        return out
    end
    
    local raw = tostring(text or "")
    for token in string.gmatch(raw, "%S+") do
        out[#out + 1] = token
    end
    return out
end

-- Extract client and parameters from command arguments (matches original behavior)
function Core.extractClientAndParams(commandName, ...)
    local args = { ... }
    local player = nil
    
    -- Find player in args (search backwards like original)
    for i = #args, 1, -1 do
        local resolved = Core.resolveClient(args[i])
        if resolved then
            player = resolved
            break
        end
    end
    
    -- Fallback to global variables
    if not player then
        player = Core.resolveClient(_G and _G.client or nil)
            or Core.resolveClient(_G and _G.source or nil)
            or Core.resolveClient(_G and _G.this or nil)
    end
    
    -- Fallback to single client
    if not player and getClients then
        local okClients, clients = pcall(getClients)
        if okClients and type(clients) == "table" and #clients == 1 then
            player = Core.resolveClient(clients[1])
        end
    end
    
    if not player then
        print("[Commands] /" .. commandName .. ": Could not resolve player")
        return nil, ""
    end
    
    -- Build fragments from non-client, non-command arguments
    local fragments = {}
    for _, value in ipairs(args) do
        if Core.isClientObject(value) then
            -- skip client/player objects
        elseif type(value) == "string" then
            local candidate = JobsRP.trim(value)
            if candidate ~= "" and candidate ~= commandName then
                fragments[#fragments + 1] = candidate
            end
        elseif type(value) == "table" then
            local words = {}
            for _, item in ipairs(value) do
                words[#words + 1] = tostring(item)
            end
            local candidate = table.concat(words, " ")
            candidate = JobsRP.trim(candidate)
            if candidate ~= "" and candidate ~= commandName then
                fragments[#fragments + 1] = candidate
            end
        end
    end
    
    local parameters = table.concat(fragments, " ")
    return player, parameters
end

-- Expose Core globally so command modules can access it
_G.Core = Core

return Core
