-- Zone Commands Module
-- Debug command to check current player zone

local ZoneCommands = {}

local function chat(player, message, r, g, b)
    if outputChatBox then
        outputChatBox(message, player, r or 180, g or 220, b or 255)
        return
    end
    if JobsRP.Jobs and JobsRP.Jobs.chat then
        JobsRP.Jobs.chat(player, message, r, g, b)
    end
end

ZoneCommands.register = function()
    if not addCommandHandler then
        print("[ZoneCommands] Command system not available")
        return
    end

    addCommandHandler("zone", function(...)
        local client, _ = Core.extractClientAndParams("zone", ...)
        if not client then
            print("[ZoneCommands] /zone: Could not resolve player")
            return
        end

        local player = client.player
        if not player then
            chat(client, "[Zone] Could not get player element", 255, 120, 120)
            return
        end

        local pos = player.position
        if not pos then
            chat(client, "[Zone] Could not get player position", 255, 120, 120)
            return
        end

        local x = pos.x
        local y = pos.y
        local z = pos.z

        chat(client, "[Zone] Position: x=" .. string.format("%.2f", x) .. " y=" .. string.format("%.2f", y) .. " z=" .. string.format("%.2f", z), 180, 220, 255)
        print("[Zone] Player " .. (client.name or "?") .. " position: x=" .. x .. " y=" .. y .. " z=" .. z)
    end)

    print("[ZoneCommands] /zone command registered")
end

return ZoneCommands