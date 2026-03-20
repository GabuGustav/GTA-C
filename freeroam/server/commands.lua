Freeroam = Freeroam or {}

local function resolveClient(actor)
    if not actor then
        return nil
    end

    local t = type(actor)
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
        return nil
    end

    if t ~= "userdata" and t ~= "table" then
        return nil
    end

    local okLinked, hasLinked = pcall(function()
        return actor.player ~= nil
    end)
    if okLinked and hasLinked then
        return actor
    end

    if getClientFromPlayerElement then
        local okClient, client = pcall(function()
            return getClientFromPlayerElement(actor)
        end)
        if okClient and client then
            return client
        end
    end

    local okIdentity, hasIdentity = pcall(function()
        return (actor.index ~= nil and actor.name ~= nil) or (actor.ip ~= nil and actor.name ~= nil)
    end)
    if okIdentity and hasIdentity then
        return actor
    end

    return nil
end

local function outputChat(player, text, r, g, b)
    local messageText = tostring(text or "")
    if messageText == "" then
        return false
    end

    if messageClient and player then
        local ok, result = pcall(function()
            return messageClient(messageText, player)
        end)
        if ok and result ~= false then
            return true
        end
    end

    if outputChatBox then
        local variants = {
            function() return outputChatBox(messageText, player, r or 255, g or 255, b or 255) end,
            function() return outputChatBox(player, messageText, r or 255, g or 255, b or 255) end,
            function() return outputChatBox(messageText, player) end,
            function() return outputChatBox(messageText) end
        }
        for _, writer in ipairs(variants) do
            local ok, result = pcall(writer)
            if ok and result ~= false then
                return true
            end
        end
    end

    print("[freeroam] " .. messageText)
    return true
end

local function getOnlineClients()
    if getClients then
        local ok, clients = pcall(getClients)
        if ok and type(clients) == "table" then
            return clients
        end
    end

    local out = {}
    if getPlayers then
        for _, player in ipairs(getPlayers()) do
            local client = resolveClient(player)
            if client then
                out[#out + 1] = client
            end
        end
    end
    return out
end

local function showRules(player, title, rules)
    local list = rules or {}
    outputChat(player, "[" .. title .. "] Rules:", 255, 220, 120)
    if type(list) ~= "table" or #list == 0 then
        outputChat(player, "[" .. title .. "] (no rules configured)", 255, 180, 120)
        return
    end
    for i, rule in ipairs(list) do
        outputChat(player, string.format("[%s] %d. %s", title, i, tostring(rule)), 200, 220, 255)
    end
end

local function showPlayers(player)
    local clients = getOnlineClients()
    outputChat(player, "[Players] Online: " .. tostring(#clients), 180, 220, 255)
    for _, client in ipairs(clients) do
        local idx = nil
        pcall(function()
            idx = client.index
        end)
        outputChat(player, string.format("[Players] %s (#%s)", tostring(client.name or "unknown"), tostring(idx or "?")), 180, 220, 255)
    end
end

local function resolveClientOrFirst(a, b)
    local client = resolveClient(b) or resolveClient(a)
    if client then
        return client, false
    end
    if getClients then
        local ok, clients = pcall(getClients)
        if ok and type(clients) == "table" and #clients >= 1 then
            return clients[1], true
        end
    end
    return nil, false
end

local function getPlayerElement(client)
    if not client then
        return nil
    end
    local okPlayer, player = pcall(function()
        return client.player
    end)
    if okPlayer and player then
        return player
    end
    return client
end

local function runAuthTest(client)
    if type(module) ~= "table" or type(module.auth) ~= "table" then
        outputChat(client, "[Auth] module.auth namespace not available.", 255, 120, 120)
        return
    end
    local player = getPlayerElement(client)
    if not player then
        outputChat(client, "[Auth] player element not resolved.", 255, 120, 120)
        return
    end

    local okAuth, authResult = pcall(function()
        return module.auth.authenticate(player, "test_token")
    end)
    outputChat(client, "[Auth] authenticate: " .. tostring(okAuth and authResult), 180, 220, 255)

    local okSession, sessionId = pcall(function()
        return module.auth.createSession(player, {"admin", "player.kick"})
    end)
    outputChat(client, "[Auth] createSession: " .. tostring(okSession and sessionId), 180, 220, 255)

    local okPerm, hasPerm = pcall(function()
        return module.auth.hasPermission(player, "admin")
    end)
    outputChat(client, "[Auth] hasPermission(admin): " .. tostring(okPerm and hasPerm), 180, 220, 255)
end

if addCommandHandler then
    addCommandHandler("rules", function(a, b)
        local client = resolveClientOrFirst(a, b)
        if not client then
            print("[freeroam] /rules ignored: client not resolved")
            return
        end
        showRules(client, "Rules", Freeroam.Config.rules or {})
    end)

    addCommandHandler("gamerules", function(a, b)
        local client = resolveClientOrFirst(a, b)
        if not client then
            print("[freeroam] /gamerules ignored: client not resolved")
            return
        end
        showRules(client, "Gamemode", Freeroam.Config.gamemode_rules or {})
    end)

    addCommandHandler("players", function(a, b)
        local client = resolveClientOrFirst(a, b)
        if not client then
            print("[freeroam] /players ignored: client not resolved")
            return
        end
        showPlayers(client)
    end)

    addCommandHandler("authtest", function(a, b)
        local client, usedFallback = resolveClientOrFirst(a, b)
        if not client then
            print("[freeroam] /authtest ignored: client not resolved")
            return
        end
        if usedFallback then
            print("[freeroam] /authtest: using first connected client fallback")
        end
        runAuthTest(client)
    end)
end
