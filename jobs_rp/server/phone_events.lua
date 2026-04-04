-- Phone UI event handlers for GTAC phone system
-- Uses triggerNetworkEvent for client-server communication

print("[PhoneEvents] Loading phone UI event handlers...");

-- Handle message sending from phone UI
if triggerNetworkEvent then
    -- Register network event handler using the correct GTAC pattern
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
    
    if addNetworkHandler then
        addNetworkHandler("phone.sendMessage", function(client, data)
            handleMessage(client, data)
        end)
        print("[PhoneEvents] Registered phone.sendMessage event with addNetworkHandler");
    else
        print("[PhoneEvents] addNetworkHandler not available; phone.sendMessage not registered");
    end
    if addNetworkHandler then
        addNetworkHandler("phone.requestPlayerList", function(client)
            if not client then
                return
            end
            local list = {}
            if getClients then
                for _, player in ipairs(getClients()) do
                    if JobsRP and JobsRP.Auth and JobsRP.Auth.isAuthenticated and JobsRP.Auth.isAuthenticated(player) then
                        list[#list + 1] = {
                            id = player.id,
                            name = string.gsub(player.name or "", "#%d+$", "")
                        }
                    end
                end
            end
            triggerNetworkEvent("phone.playerList", client, list)
        end)
        print("[PhoneEvents] Registered phone.requestPlayerList")
    end
else
    print("[PhoneEvents] triggerNetworkEvent not available");
end

print("[PhoneEvents] Phone UI event handlers loaded");
