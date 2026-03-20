Freeroam = Freeroam or {}
Freeroam.Color = Freeroam.Color or {}

local Color = Freeroam.Color

Color.palette = {
    { r = 255, g = 80, b = 80 },
    { r = 255, g = 140, b = 40 },
    { r = 255, g = 210, b = 80 },
    { r = 120, g = 255, b = 120 },
    { r = 80, g = 200, b = 255 },
    { r = 140, g = 120, b = 255 },
    { r = 220, g = 120, b = 255 },
    { r = 255, g = 255, b = 255 }
}

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

local function pickColorIndex(seed)
    if #Color.palette == 0 then
        return 1
    end
    math.randomseed(os.time() + (seed or 0))
    return math.random(1, #Color.palette)
end

function Color.assignTo(client)
    local c = resolveClient(client)
    if not c then
        return
    end
    local player = getPlayerElement(c)
    if not player or not player.setData then
        return
    end

    local idx = pickColorIndex(c.index or 0)
    local rgb = Color.palette[idx]

    player:setData("freeroam.colorIndex", idx)
    player:setData("freeroam.colorRGB", rgb)
end

function Color.getFor(client)
    local c = resolveClient(client)
    if not c then
        return nil
    end
    local player = getPlayerElement(c)
    if not player or not player.getData then
        return nil
    end
    local rgb = player:getData("freeroam.colorRGB")
    if type(rgb) == "table" and rgb.r and rgb.g and rgb.b then
        return rgb
    end
    return nil
end

addEventHandler("onPlayerJoined", function(a, b)
    local client = resolveClient(b) or resolveClient(a)
    if not client then
        return
    end
    Color.assignTo(client)
end)

addEventHandler("onResourceStart", function(ev, res)
    if thisResource and res ~= thisResource then
        return
    end
    math.randomseed(os.time())
    if getClients then
        local okClients, clients = pcall(getClients)
        if okClients and type(clients) == "table" then
            for _, client in ipairs(clients) do
                Color.assignTo(client)
            end
        end
    end
end)
