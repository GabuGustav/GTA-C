-- Text messaging server-side handler for GTAC phone system
-- Implements Switch-based message routing and delivery

print("[TextMessaging] Loading text messaging server...");

-- Message storage for persistence and delivery tracking
local messageQueue = {};
local playerConnections = {};

-- Handle message sending from client using triggerNetworkEvent pattern
addEventHandler("phone.sendMessage", function(client, data)
    print("[TextMessaging] Message send request from " .. (client.name or "Unknown") .. 
          " to " .. (data.recipientName or "Unknown") .. ": " .. (data.content or ""));
    
    -- Validate input
    if not data or not data.recipientId or not data.content or not data.messageId then
        print("[TextMessaging] Invalid message data received");
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
    
    -- Send to recipient using triggerNetworkEvent
    if triggerNetworkEvent then
        triggerNetworkEvent("phone.messageReceived", recipient, {
            messageId = message.id,
            senderId = message.senderId,
            senderName = message.senderName,
            content = message.content,
            timestamp = message.timestamp
        });
    end
    
    -- Confirm delivery to sender
    if triggerNetworkEvent then
        triggerNetworkEvent("phone.messageDelivered", client, {
            messageId = message.id,
            recipientId = message.recipientId,
            status = "sent"
        });
    end
    
    -- Log message for persistence
    logMessage(message);
    
    print("[TextMessaging] Message routed: " .. message.senderName .. " -> " .. message.recipientName);
end);

-- Log message for persistence (could be enhanced with file storage)
function logMessage(message)
    -- Store in memory for now - could be enhanced with database/file storage
    local date = os.date("%Y-%m-%d");
    if not messageQueue[date] then
        messageQueue[date] = {};
    end
    
    table.insert(messageQueue[date], message);
    
    -- Keep only last 100 messages per day to prevent memory issues
    if #messageQueue[date] > 100 then
        table.remove(messageQueue[date], 1);
    end
end

-- Handle player disconnect to clean up connections
addEventHandler("onPlayerQuit", function(player)
    if playerConnections[player.id] then
        playerConnections[player.id] = nil;
        print("[TextMessaging] Player " .. (player.name or "Unknown") .. " disconnected");
    end
end);

-- Handle player connect to track connections
addEventHandler("onPlayerJoin", function(player)
    playerConnections[player.id] = {
        name = player.name,
        joinTime = os.time()
    };
    print("[TextMessaging] Player " .. (player.name or "Unknown") .. " connected");
end);

-- Command to check message status (for debugging)
addCommandHandler("msgstatus", function(player)
    local count = 0;
    for date, messages in pairs(messageQueue) do
        count = count + #messages;
    end
    
    messageClient(player, "Messages in queue: " .. count, 0, 255, 0);
end);

print("[TextMessaging] Text messaging server loaded");
