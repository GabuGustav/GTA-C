-- Phone UI event handlers for GTAC phone system
-- Uses addNetworkHandler for registration, triggerNetworkEvent for sending

print("[PhoneEvents] Loading phone UI event handlers...");
print("[PhoneEvents] addNetworkHandler type: " .. type(addNetworkHandler));

if not addNetworkHandler then
    print("[PhoneEvents] FATAL: addNetworkHandler not available, no handlers will be registered");
    return;
end

-- Handle message sending from phone UI
local function handleMessage(client, data)
    print("[PhoneEvents] Message send request from " .. (client.name or "Unknown") ..
          " to " .. (data.recipientName or "Unknown") .. ": " .. (data.content or ""));

    if not data or not data.recipientId or not data.content or not data.messageId then
        print("[PhoneEvents] Invalid message data received");
        return;
    end

    if string.len(data.content) > 160 then
        messageClient(client, "Message too long (max 160 characters)", 255, 0, 0);
        return;
    end

    local recipient = nil;

    for _, player in ipairs(getClients()) do
        if player.id == tonumber(data.recipientId) then
            recipient = player;
            break;
        end
    end

    if not recipient and data.recipientName then
        for _, player in ipairs(getClients()) do
            local cleanName = string.gsub(player.name or "", "#%d+$", "");
            if cleanName == data.recipientName then
                recipient = player;
                break;
            end
        end
    end

    if not recipient then
        messageClient(client, "Player '" .. (data.recipientName or "Unknown") .. "' is not online", 255, 0, 0);
        return;
    end

    local message = {
        id = data.messageId,
        senderId = client.id,
        senderName = string.gsub(client.name or "", "#%d+$", ""),
        recipientId = recipient.id,
        recipientName = data.recipientName,
        content = data.content,
        timestamp = os.time(),
        status = "delivered"
    };

    triggerNetworkEvent("phone.messageReceived", recipient, {
        messageId = message.id,
        senderId = message.senderId,
        senderName = message.senderName,
        content = message.content,
        timestamp = message.timestamp
    });

    triggerNetworkEvent("phone.messageDelivered", client, {
        messageId = message.id,
        recipientId = message.recipientId,
        status = "sent"
    });

    print("[PhoneEvents] Message routed: " .. message.senderName .. " -> " .. message.recipientName);
end

local ok, err = pcall(function()
    addNetworkHandler("phone.sendMessage", handleMessage);
end)
print("[PhoneEvents] phone.sendMessage registered: " .. tostring(ok) .. " " .. tostring(err));

-- Handle player list requests from phone UI
local function handlePlayerListRequest(client)
    print("[PhoneEvents] Player list request from " .. (client.name or "Unknown"));

    local allClients = getClients();
    if not allClients then
        print("[PhoneEvents] Failed to get clients for player list");
        return;
    end

    local playerList = {};
    for i, player in ipairs(allClients) do
        if player and player.name then
            local cleanName = string.gsub(player.name, "#%d+$", "");
            playerList[i] = {
                id = player.id,
                name = cleanName
            };
        end
    end

    triggerNetworkEvent("phone.playerList", client, playerList);
    print("[PhoneEvents] Sent player list with " .. #playerList .. " players");
end

local ok2, err2 = pcall(function()
    addNetworkHandler("phone.requestPlayerList", handlePlayerListRequest);
end)
print("[PhoneEvents] phone.requestPlayerList registered: " .. tostring(ok2) .. " " .. tostring(err2));

-- Handle taxi requests from phone UI
local vehicleModels = {
    ["Taxi"]         = 0xC703DB5F,
    ["Taxi2"]        = 0x480DAF95,
    ["Cabby"]        = 0x705A3E41,
    ["Roman's Taxi"] = 0x8CD0264C,
    ["Stretch Limo"] = 0x8B13F083,
    ["Cognoscenti"]  = 0x86FE0B60
}

local function handleTaxiRequest(client, vehicleModel, x, y, z)
    print("[PhoneEvents] client type: " .. type(client));
    print("[PhoneEvents] client value: " .. tostring(client));
    print("[PhoneEvents] vehicleModel type: " .. type(vehicleModel));
    print("[PhoneEvents] x type: " .. type(x));

    if not vehicleModel or not x or not y or not z then
        print("[PhoneEvents] Invalid taxi request - missing arguments");
        messageClient(client, "Invalid taxi request", 255, 0, 0);
        return;
    end

    local modelIndex = vehicleModels[vehicleModel];
    if not modelIndex then
        print("[PhoneEvents] Unknown vehicle model: " .. vehicleModel);
        messageClient(client, "Unknown vehicle: " .. vehicleModel, 255, 0, 0);
        return;
    end

    print("[PhoneEvents] Triggering taxi.spawnVehicle for " .. client.name);
triggerNetworkEvent("taxi.spawnVehicle", client, tostring(modelIndex), tostring(x), tostring(y), tostring(z));
end

local ok3, err3 = pcall(function()
    addNetworkHandler("taxi.requestVehicle", handleTaxiRequest);
end)
print("[PhoneEvents] taxi.requestVehicle registered: " .. tostring(ok3) .. " " .. tostring(err3));

print("[PhoneEvents] All handlers loaded.");