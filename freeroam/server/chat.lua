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

    if messageClient and player then
        local ok, result = pcall(function()
            return messageClient(messageText, player)
        end)
        if ok and result ~= false then
            return true
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
    return {}
end

local function getPlayerElementFrom(actor)
    if not actor then
        return nil
    end
    if type(actor) == "table" or type(actor) == "userdata" then
        if actor.getData and actor.setData then
            return actor
        end
    end
    local client = resolveClient(actor)
    if client then
        local okPlayer, player = pcall(function()
            return client.player
        end)
        if okPlayer and player then
            return player
        end
    end
    return nil
end

local function getChatColor(actor)
    if Freeroam.Color and Freeroam.Color.getFor then
        local rgb = Freeroam.Color.getFor(actor)
        if rgb then
            return rgb.r or 255, rgb.g or 255, rgb.b or 255
        end
    end
    return 255, 255, 255
end

addEventHandler("OnPlayerChat", function(a, b)
    if cancellableEvent and cancellableEvent.preventDefault then
        pcall(function()
            cancellableEvent.preventDefault()
        end)
    end

    local player = getPlayerElementFrom(a) or getPlayerElementFrom(b)
    local client = resolveClient(a) or resolveClient(b) or (player and resolveClient(player)) or nil

    local message = nil
    if type(a) == "string" then
        message = a
    elseif type(b) == "string" then
        message = b
    end

    if not message or message == "" then
        return false
    end
    if string.sub(message, 1, 1) == "/" then
        return false
    end

    local r, g, b2 = getChatColor(player or client)
    local name = "Player"
    if client and client.name then
        name = tostring(client.name)
    elseif player and player.name then
        name = tostring(player.name)
    end
    local line = string.format("%s: %s", name, message)
    for _, target in ipairs(getOnlineClients()) do
        outputChat(target, line, r, g, b2)
    end
    return false
end)
