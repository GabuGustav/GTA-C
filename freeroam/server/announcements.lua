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

local function broadcast(message)
    if not message or message == "" then
        return
    end
    local r, g, b = 180, 220, 255
    if Freeroam.Color and Freeroam.Color.palette then
        local palette = Freeroam.Color.palette
        if #palette > 0 then
            local idx = math.random(1, #palette)
            r = palette[idx].r or r
            g = palette[idx].g or g
            b = palette[idx].b or b
        end
    end
    for _, client in ipairs(getOnlineClients()) do
        outputChat(client, message, r, g, b)
    end
end

local function startAnnouncements()
    local cfg = Freeroam.Config or {}
    local interval = tonumber(cfg.announcement_interval_ms or 900000) or 900000
    local message = tostring(cfg.announcement_message or "")
    if message == "" then
        return
    end

    if setTimeout then
        setTimeout(function()
            broadcast(message)
        end, 5000)
    else
        broadcast(message)
    end

    if setInterval then
        setInterval(function()
            broadcast(message)
        end, interval)
    else
        print("[freeroam] Announcement interval unavailable (setInterval missing).")
    end
end

addEventHandler("onResourceStart", function(ev, res)
    if thisResource and res ~= thisResource then
        return
    end
    startAnnouncements()
end)

addEventHandler("onPlayerJoined", function(a, b)
    local client = resolveClient(b) or resolveClient(a)
    if not client then
        return
    end
    local name = tostring(client.name or "Player")
    local r, g, b2 = 180, 220, 255
    if Freeroam.Color and Freeroam.Color.getFor then
        local rgb = Freeroam.Color.getFor(client)
        if rgb then
            r = rgb.r or r
            g = rgb.g or g
            b2 = rgb.b or b2
        end
    end
    for _, target in ipairs(getOnlineClients()) do
        outputChat(target, "Welcome to BGF IV " .. name .. "!", r, g, b2)
    end
end)

addEventHandler("onPlayerQuit", function(a, b)
    local client = resolveClient(b) or resolveClient(a)
    if not client then
        return
    end
    local name = tostring(client.name or "Player")
    local r, g, b2 = 180, 220, 255
    if Freeroam.Color and Freeroam.Color.getFor then
        local rgb = Freeroam.Color.getFor(client)
        if rgb then
            r = rgb.r or r
            g = rgb.g or g
            b2 = rgb.b or b2
        end
    end
    for _, target in ipairs(getOnlineClients()) do
        outputChat(target, "Goodbye " .. name .. "!", r, g, b2)
    end
end)
