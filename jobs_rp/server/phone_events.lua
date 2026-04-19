-- Phone UI event handlers for GTAC phone system
-- Uses addNetworkHandler for registration, triggerNetworkEvent for sending

print("[PhoneEvents] Loading phone UI event handlers...");

-- Handle message sending from phone UI using addNetworkHandler
if addNetworkHandler then
    -- Register network event handler using correct GTAC pattern
    local function handleMessage(client, data)
        print("[PhoneEvents] Message send request from " .. (client.name or "Unknown") .. 
              " to " .. (data.recipientName or "Unknown") .. ": " .. (data.content or ""));
        
        -- Validate input
        if not data or not data.recipientId or not data.content or not data.messageId then
            print("[PhoneEvents] Invalid message data received");
            return;
        end
        
        if string.len(data.content) > 160 then
            if messageClient then
                messageClient(client, "Message too long (max 160 characters)", 255, 0, 0);
            end
            return;
        end
        
        -- Find recipient player
        local recipient = nil;
        
        -- Try to find recipient by ID first
        if data.recipientId then
            for _, player in ipairs(getClients()) do
                if player.id == tonumber(data.recipientId) then
                    recipient = player;
                    break;
                end
            end
        end
        
        -- Fallback to name search if ID doesn't work
        if not recipient and data.recipientName then
            for _, player in ipairs(getClients()) do
                local cleanName = string.gsub(player.name or "", "#%d+$", "");
                if cleanName == data.recipientName then
                    recipient = player;
                    break;
                end
            end
        end
        
        -- Check if recipient found and online
        if not recipient then
            if messageClient then
                messageClient(client, "Player '" .. (data.recipientName or "Unknown") .. "' is not online", 255, 0, 0);
            end
            return;
        end
        
        -- Create message object
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
        
        -- Send to recipient
        triggerNetworkEvent("phone.messageReceived", recipient, {
            messageId = message.id,
            senderId = message.senderId,
            senderName = message.senderName,
            content = message.content,
            timestamp = message.timestamp
        });
        
        -- Confirm delivery to sender
        triggerNetworkEvent("phone.messageDelivered", client, {
            messageId = message.id,
            recipientId = message.recipientId,
            status = "sent"
        });
        
        print("[PhoneEvents] Message routed: " .. message.senderName .. " -> " .. message.recipientName);
    end
    
    -- Register the handler using addNetworkEvent
    addNetworkHandler("phone.sendMessage", handleMessage);
    print("[PhoneEvents] Registered phone.sendMessage event with addNetworkHandler");
else
    print("[PhoneEvents] addNetworkHandler not available");
end

-- Handle player list requests from phone UI
if addNetworkHandler then
    local function handlePlayerListRequest(client)
        print("[PhoneEvents] Player list request from " .. (client.name or "Unknown"));
        
        -- Get all clients and send back to requesting client
        local allClients = getClients();
        if allClients then
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
            
            -- Send player list back to requesting client
            triggerNetworkEvent("phone.playerList", client, playerList);
            print("[PhoneEvents] Sent player list with " .. #playerList .. " players");
        else
            print("[PhoneEvents] Failed to get clients for player list");
        end
    end
    
    -- Register the handler using addNetworkEvent
    addNetworkHandler("phone.requestPlayerList", handlePlayerListRequest);
    print("[PhoneEvents] Registered phone.requestPlayerList event with addNetworkHandler");
else
    print("[PhoneEvents] addNetworkHandler not available for player list");
end

print("[PhoneEvents] Phone UI event handlers loaded");
