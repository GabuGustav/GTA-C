JobsRP = JobsRP or {}

local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

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

    local hasLinkedPlayer = false
    local okLinked = pcall(function()
        hasLinkedPlayer = actor.player ~= nil
    end)
    if okLinked and hasLinkedPlayer then
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

    local hasClientIdentity = false
    local okIdentity = pcall(function()
        hasClientIdentity = (actor.index ~= nil and actor.name ~= nil) or (actor.ip ~= nil and actor.name ~= nil)
    end)
    if okIdentity and hasClientIdentity then
        return actor
    end

    local isLikelyPlayer = false
    local okPlayer = pcall(function()
        isLikelyPlayer = actor.getPosition ~= nil or actor.getVariable ~= nil or actor.setVariable ~= nil
    end)
    if okPlayer and isLikelyPlayer then
        return actor
    end

    return nil
end

local function isClientObject(value)
    return resolveClient(value) ~= nil
end

local function toWords(parameters)
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

local function trimText(value)
    return JobsRP.trim(value or "")
end

local function parseQuotedAndAngle(text)
    local raw = trimText(text)
    if raw == "" then
        return nil, nil
    end

    local name = nil
    local category = nil
    local rest = raw

    local first = string.sub(rest, 1, 1)
    if first == "\"" then
        local close = string.find(rest, "\"", 2, true)
        if close then
            name = string.sub(rest, 2, close - 1)
            rest = trimText(string.sub(rest, close + 1))
        end
    end

    if not name then
        local token = string.match(rest, "^(%S+)")
        if token then
            name = token
            rest = trimText(string.sub(rest, #token + 1))
        end
    end

    if rest ~= "" then
        local firstCat = string.sub(rest, 1, 1)
        if firstCat == "<" then
            local close = string.find(rest, ">", 2, true)
            if close then
                category = string.sub(rest, 2, close - 1)
            end
        else
            category = rest
        end
    end

    return name, category
end

local function findNextKeyPos(text, startIndex)
    local keys = { "recipientId=", "recipientName=", "messageId=" }
    local nextPos = nil
    for _, key in ipairs(keys) do
        local pos = string.find(text, key, startIndex, true)
        if pos and (not nextPos or pos < nextPos) then
            nextPos = pos
        end
    end
    return nextPos
end

local function parsePhoneMessageParams(raw)
    local data = {}
    local text = trimText(raw)
    if text == "" then
        return data
    end

    -- Extract content=... allowing spaces or quoted text
    local contentPos = string.find(text, "content=", 1, true)
    if contentPos then
        local valueStart = contentPos + #"content="
        local firstChar = string.sub(text, valueStart, valueStart)
        if firstChar == "\"" then
            local close = string.find(text, "\"", valueStart + 1, true)
            if close then
                data.content = string.sub(text, valueStart + 1, close - 1)
                text = string.sub(text, 1, contentPos - 1) .. " " .. string.sub(text, close + 1)
            else
                data.content = trimText(string.sub(text, valueStart + 1))
                text = string.sub(text, 1, contentPos - 1)
            end
        else
            local nextPos = findNextKeyPos(text, valueStart)
            if nextPos then
                data.content = trimText(string.sub(text, valueStart, nextPos - 1))
                text = string.sub(text, 1, contentPos - 1) .. " " .. string.sub(text, nextPos)
            else
                data.content = trimText(string.sub(text, valueStart))
                text = string.sub(text, 1, contentPos - 1)
            end
        end
    end

    for token in string.gmatch(text, "%S+") do
        local key, value = string.match(token, "([^=]+)=([^=]+)")
        if key and value then
            data[key] = value
        end
    end

    return data
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

    return false
end

local function unpackTable(values, index)
    local i = index or 1
    if type(values) ~= "table" then
        return
    end
    if values[i] == nil then
        return
    end
    return values[i], unpackTable(values, i + 1)
end

local function loadRecordedCoords()
    if JobsRP.Config.recorded_coords_loaded then
        return JobsRP.Config.recorded_coords or {}
    end

    JobsRP.Config.recorded_coords_loaded = true
    JobsRP.Config.recorded_coords = JobsRP.Config.recorded_coords or {}

    local filePath = JobsRP.Config.recorded_coords_file or "data/recorded_coords.json"
    if loadTextFile then
        local ok, raw = pcall(loadTextFile, filePath)
        if ok and raw and raw ~= "" then
            local okDecode, decoded = pcall(JobsRP.Json.decode, raw)
            if okDecode and type(decoded) == "table" then
                JobsRP.Config.recorded_coords = decoded
            end
        end
    end

    return JobsRP.Config.recorded_coords
end

local function saveRecordedCoords()
    local filePath = JobsRP.Config.recorded_coords_file or "data/recorded_coords.json"
    local list = JobsRP.Config.recorded_coords or {}
    local okEncode, encoded = pcall(JobsRP.Json.encode, list)
    if not okEncode then
        return false, "encode failed"
    end
    if saveTextFile then
        local okSave, result = pcall(saveTextFile, filePath, encoded)
        if okSave then
            return result ~= false
        end
    end
    return false, "save failed"
end

pushClientEvent = function(player, eventName, ...)
    if not player or not eventName then
        return false
    end

    local args = { ... }

    if triggerNetworkEvent then
        local ok, result = pcall(function()
            return triggerNetworkEvent(eventName, player, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    if triggerClientEvent then
        local ok, result = pcall(function()
            return triggerClientEvent(player, eventName, player, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    return false
end

local function chat(player, text, r, g, b)
    local messageText = tostring(text or "")
    if messageText == "" then
        return
    end

    if outputChat(player, messageText, r, g, b) then
        return
    end

    print("[jobs_rp] " .. messageText)
end

local function broadcastRecordedCoords(list)
    for _, client in ipairs(getOnlineClients()) do
        pushClientEvent(client, "jobs.recordedCoords", list)
    end
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

local function findPlayerByName(query)
    local needle = JobsRP.normalizeName(query)
    if needle == "" then
        return nil
    end

    local matched = nil
    for _, client in ipairs(getOnlineClients()) do
        local playerName = JobsRP.normalizeName(client.name or "")
        if playerName == needle then
            return client
        end
        if string.find(playerName, needle, 1, true) then
            matched = matched or client
        end
    end

    return matched
end

local function requireAuth(player)
    if JobsRP.Auth and JobsRP.Auth.requireAuthenticated then
        return JobsRP.Auth.requireAuthenticated(player)
    end

    chat(player, "[Jobs] Auth system unavailable.", 255, 120, 120)
    return false
end

local function isAdmin(player)
    if not JobsRP.Auth or not JobsRP.Auth.isAdmin then
        return false
    end
    return JobsRP.Auth.isAdmin(player)
end

local function requireAdmin(player)
    if not requireAuth(player) then
        return false
    end
    if not isAdmin(player) then
        chat(player, "[JobsAuth] Admin access required.", 255, 120, 120)
        return false
    end
    return true
end

local function showJobHelp(player)
    local lines = {
        "/job list",
        "/job join <taxi|robbery|police>",
        "/job leave",
        "/job start",
        "/job stop",
        "/job status",
        "/job paycheck"
    }

    if JobsRP.Config.debug_quick_test == true then
        lines[#lines + 1] = "/job next (debug: force one objective)"
        lines[#lines + 1] = "/job finish (debug: force complete run)"
    end

    for _, line in ipairs(lines) do
        chat(player, "[Jobs] " .. line, 170, 230, 255)
    end
end

local function showJobAuthHelp(player)
    local lines = {
        "/jobauth help",
        "/jobauth register <accountId> <password>",
        "/jobauth login <accountId> <password>",
        "/jobauth logout",
        "/jobauth status",
        "/jobauth whoami",
        "/jobauth sync",
        "/jobauth force",
        "/jobauth debugui <on|off>",
        "/jobauth proximity",
        "/jobauth admincheck",
        "/jobauth forcesync <accountId>"
    }

    for _, line in ipairs(lines) do
        chat(player, "[JobsAuth] " .. line, 180, 220, 255)
    end
end


local function debugAdvance(player, completeAll)
    if JobsRP.Config.debug_quick_test ~= true then
        chat(player, "[Jobs] Debug quick test is disabled in config.", 255, 180, 120)
        return
    end

    if not JobsRP.Jobs.getSessionByPlayer(player) then
        chat(player, "[Jobs] No active run. Use /job start first.", 255, 180, 120)
        return
    end

    if not completeAll then
        JobsRP.Jobs.requestAction(player, "progress", { __force = true })
        return
    end

    local safety = 32
    while safety > 0 do
        local session = JobsRP.Jobs.getSessionByPlayer(player)
        if not session then
            return
        end

        local ok = JobsRP.Jobs.requestAction(player, "progress", { __force = true })
        if not ok then
            return
        end

        safety = safety - 1
    end

    chat(player, "[Jobs] Debug finish stopped by safety guard.", 255, 180, 120)
end

local function handleJobAuth(player, words)
    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showJobAuthHelp(player)
        return
    end

    if not JobsRP.Auth then
        chat(player, "[JobsAuth] Auth module unavailable.", 255, 120, 120)
        return
    end

    if sub == "register" then
        local accountId = words[2]
        local password = words[3]
        if not accountId or not password then
            chat(player, "[JobsAuth] Usage: /jobauth register <accountId> <password>", 255, 180, 120)
            return
        end
        JobsRP.Auth.register(player, accountId, password)
        return
    end

    if sub == "login" then
        local accountId = words[2]
        local password = words[3]
        if not accountId or not password then
            chat(player, "[JobsAuth] Usage: /jobauth login <accountId> <password>", 255, 180, 120)
            return
        end
        JobsRP.Auth.login(player, accountId, password)
        return
    end

    if sub == "setpass" or sub == "passwd" then
        local password = words[2]
        if not password then
            chat(player, "[JobsAuth] Usage: /jobauth setpass <newPassword>", 255, 180, 120)
            return
        end
        JobsRP.Auth.setPassword(player, password)
        return
    end

    if sub == "logout" then
        JobsRP.Auth.logout(player, false)
        return
    end

    if sub == "whoami" then
        JobsRP.Auth.whoami(player)
        return
    end

    if sub == "sync" then
        if JobsRP.Auth and JobsRP.Auth.sendState then
            JobsRP.Auth.sendState(player)
            chat(player, "[JobsAuth] Authentication state synchronized.", 100, 255, 100)
            
            -- Force multiple sync attempts
            if setTimeout then
                setTimeout(function()
                    JobsRP.Auth.sendState(player)
                end, 500)
                setTimeout(function()
                    JobsRP.Auth.sendState(player)
                end, 1000)
            end
        else
            chat(player, "[JobsAuth] Auth module unavailable.", 255, 120, 120)
        end
        return
    end

    if sub == "force" then
        if JobsRP.Auth and JobsRP.Auth.sendState then
            local client = resolveClient(player)
            local isAuthed = JobsRP.Auth.isAuthenticated and JobsRP.Auth.isAuthenticated(client)
            local accountId = JobsRP.Auth.getAccountId and JobsRP.Auth.getAccountId(client)
            chat(player, "[JobsAuth] Auth check:", 180, 220, 255)
            chat(player, "[JobsAuth] Authenticated: " .. tostring(isAuthed == true), 180, 220, 255)
            chat(player, "[JobsAuth] Account ID: " .. tostring(accountId or "none"), 180, 220, 255)
            JobsRP.Auth.sendState(client)
            chat(player, "[JobsAuth] Session synced.", 100, 255, 100)
        else
            chat(player, "[JobsAuth] Auth system unavailable.", 255, 120, 120)
        end
        return
    end

    if sub == "debugui" then
        if not requireAdmin(player) then
            return
        end
        local forceShow = (words[2] == "on" or words[2] == "true")
        local client = resolveClient(player)
        if client then
            sendClientEvent(client, "jobs.authDebugUI", forceShow)
            chat(player, "[JobsAuth] Debug UI " .. (forceShow and "enabled" or "disabled"), 255, 200, 100)
        end
        return
    end

    if sub == "proximity" then
        local client = resolveClient(player)
        if client then
            local playerId = JobsRP.Store.getPlayerId(player)
            local profile = playerId and JobsRP.Store.loadProfileById(playerId)
            
            if profile and profile.currentJobId then
                local jobDef = JobsRP.JobDefs.get(profile.currentJobId)
                if jobDef and jobDef.hub then
                    local pos = client:getPosition()
                    if pos and #pos >= 3 then
                        local hub = jobDef.hub
                        local dx = pos[1] - hub[1]
                        local dy = pos[2] - hub[2]
                        local dz = pos[3] - hub[3]
                        local distance = math.sqrt(dx*dx + dy*dy + dz*dz)
                        
                        chat(player, "[Jobs] Current job: " .. profile.currentJobId, 180, 220, 255)
                        chat(player, "[Jobs] Hub location: " .. table.concat(hub, ", "), 180, 220, 255)
                        chat(player, "[Jobs] Your position: " .. string.format("%.1f, %.1f, %.1f", pos[1], pos[2], pos[3]), 180, 220, 255)
                        chat(player, "[Jobs] Distance to hub: " .. string.format("%.1f units", distance), 180, 220, 255)
                        
                        local maxDistance = (JobsRP.Config and JobsRP.Config.hub_interact_distance) or 50
                        local inRange = distance <= maxDistance
                        chat(player, "[Jobs] In range: " .. (inRange and "Yes" or "No") .. " (max: " .. maxDistance .. ")", inRange and 100 or 255, inRange and 255 or 120, 120)
                    end
                end
            end
        else
            chat(player, "[Jobs] Client not resolved.", 255, 120, 120)
        end
        return
    end

    if sub == "admincheck" then
        if not requireAdmin(player) then
            return
        end
        local client = resolveClient(player)
        if client then
            local playerId = JobsRP.Store.getPlayerId(player)
            local accountId = playerId and JobsRP.Store.getAccountId and JobsRP.Store.getAccountId(playerId)
            
            chat(player, "[Jobs] Admin Status Check:", 180, 220, 255)
            chat(player, "[Jobs] Player ID: " .. tostring(playerId), 180, 220, 255)
            chat(player, "[Jobs] Account ID: " .. tostring(accountId), 180, 220, 255)
            
            -- Check admin status through multiple methods
            local isAdminViaAuth = false
            if JobsRP.Auth and JobsRP.Auth.isAdmin then
                isAdminViaAuth = JobsRP.Auth.isAdmin(player)
            end
            local isAdminViaCommand = isAdmin(player)

            chat(player, "[Jobs] Auth.isAdmin(): " .. tostring(isAdminViaAuth), 180, 220, 255)
            chat(player, "[Jobs] commands.lua isAdmin(): " .. tostring(isAdminViaCommand), 180, 220, 255)
            
            if isAdminViaAuth or isAdminViaCommand then
                chat(player, "[Jobs] Admin access confirmed", 100, 255, 100)
            else
                chat(player, "[Jobs] Admin access denied", 255, 120, 120)
            end
        else
            chat(player, "[Jobs] Client not resolved.", 255, 120, 120)
        end
        return
    end

    if sub == "forcesync" then
        if not requireAdmin(player) then
            return
        end
        -- Force sync auth with JSON database
        local accountId = words[2]
        if not accountId then
            chat(player, "[Jobs] Usage: /jobauth forcesync <accountId>", 255, 120, 120)
            return
        end
        
        chat(player, "[Jobs] Forcing auth sync for account: " .. accountId, 180, 220, 255)
        
        local account = JobsRP.Store.loadAccountById(accountId)
        if account then
            chat(player, "[Jobs] Account exists. Role=" .. tostring(account.role or "player"), 100, 255, 100)
        else
            chat(player, "[Jobs] Account not found in JSON store", 255, 120, 120)
        end
        return
    end

    chat(player, "[JobsAuth] Unknown subcommand. Use /jobauth help.", 255, 120, 120)
end

local function handleJob(player, words)
    if not requireAuth(player) then
        return
    end

    local sub = normalizeToken(words[1] or "help")

    if sub == "help" then
        showJobHelp(player)
        return
    end

    if sub == "list" then
        JobsRP.Jobs.requestList(player)
        return
    end

    if sub == "join" then
        if not words[2] then
            chat(player, "[Jobs] Usage: /job join <taxi|robbery|police>", 255, 180, 120)
            return
        end
        JobsRP.Jobs.joinJob(player, words[2])
        return
    end

    if sub == "leave" then
        JobsRP.Jobs.leaveJob(player)
        return
    end

    if sub == "start" then
        JobsRP.Jobs.startJob(player)
        return
    end

    if sub == "stop" then
        JobsRP.Jobs.stopJob(player, "Run stopped.")
        return
    end

    if sub == "status" then
        JobsRP.Jobs.requestStatus(player)
        return
    end

    if sub == "paycheck" then
        local profile = JobsRP.Store.getProfileByPlayer(player)
        if not profile then
            chat(player, "[Jobs] No authenticated profile loaded.", 255, 120, 120)
            return
        end
        chat(player, "[Jobs] Wallet balance: $" .. tostring(profile.cash or 0), 140, 255, 140)
        return
    end

    if sub == "next" then
        debugAdvance(player, false)
        return
    end

    if sub == "finish" then
        debugAdvance(player, true)
        return
    end

    chat(player, "[Jobs] Unknown subcommand. Use /job help.", 255, 120, 120)
end

local function handleCommand(root, parameters, client)
    if not isClientObject(client) then
        return
    end

    local words = toWords(parameters)
    if words[1] and normalizeToken(words[1]) == root then
        table.remove(words, 1)
    end

    if root == "job" then
        handleJob(client, words)
        return
    end

    if root == "jobauth" then
        handleJobAuth(client, words)
        return
    end

    if root == "recordcoord" then
        local name, category = parseQuotedAndAngle(parameters)
        if not name or name == "" then
            chat(client, "[Jobs] Usage: /recordCoord \"Name\" <Category>", 255, 180, 120)
            return
        end
        if not category or category == "" then
            category = "hub"
        end

        local pos = client.getPosition and client:getPosition() or nil
        if not pos or #pos < 3 then
            chat(client, "[Jobs] Unable to read player position.", 255, 120, 120)
            return
        end

        local list = loadRecordedCoords()
        local entry = {
            name = tostring(name),
            category = tostring(category),
            coords = { pos[1], pos[2], pos[3] }
        }
        list[#list + 1] = entry
        JobsRP.Config.recorded_coords = list

        local okSave, saveErr = saveRecordedCoords()
        if not okSave then
            chat(client, "[Jobs] Failed to save coordinates: " .. tostring(saveErr), 255, 120, 120)
            return
        end

        chat(client, "[Jobs] Coordinate recorded: " .. entry.name .. " (" .. entry.category .. ")", 120, 255, 120)
        return
    end

    if root == "phone" then
        -- Handle phone commands (like sendMessage)
        if words[1] == "sendMessage" then
            -- Extract message data from parameters (preserve spaces in content)
            local rawParams = trimText(parameters or "")
            if rawParams ~= "" and string.sub(rawParams, 1, 11) == "sendMessage" then
                rawParams = trimText(string.sub(rawParams, 12))
            end
            local data = parsePhoneMessageParams(rawParams)
            
            -- Validate input
            if not data or not data.recipientId or not data.content or not data.messageId then
                chat(client, "[Phone] Invalid message data", 255, 120, 120)
                return
            end
            
            if string.len(data.content) > 160 then
                chat(client, "[Phone] Message too long (max 160 characters)", 255, 120, 120)
                return
            end
            
            -- Find recipient player
            local recipient = nil
            
            -- Try to find recipient by ID first
            if data.recipientId then
                for _, player in ipairs(getClients()) do
                    if player.id == tonumber(data.recipientId) then
                        recipient = player
                        break
                    end
                end
            end
            
            -- Fallback to name search if ID doesn't work
            if not recipient and data.recipientName then
                for _, player in ipairs(getClients()) do
                    local cleanName = string.gsub(player.name or "", "#%d+$", "")
                    if cleanName == data.recipientName then
                        recipient = player
                        break
                    end
                end
            end
            
            -- Check if recipient found and online
            if not recipient then
                chat(client, "[Phone] Player '" .. (data.recipientName or "Unknown") .. "' is not online", 255, 120, 120)
                return
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
            }
            
            -- Send to recipient using triggerNetworkEvent
            if triggerNetworkEvent then
                triggerNetworkEvent("phone.messageReceived", recipient, {
                    messageId = message.id,
                    senderId = message.senderId,
                    senderName = message.senderName,
                    content = message.content,
                    timestamp = message.timestamp
                })
            end
            
            -- Confirm delivery to sender
            if triggerNetworkEvent then
                triggerNetworkEvent("phone.messageDelivered", client, {
                    messageId = message.id,
                    recipientId = message.recipientId,
                    status = "sent"
                })
            end
            
            print("[Phone] Message routed: " .. message.senderName .. " -> " .. message.recipientName)
            return
        end
        
        chat(client, "[Phone] Usage: /phone sendMessage recipientId=<id> recipientName=<name> content=<message> messageId=<id>", 255, 180, 120)
        return
    end

    if root == "character" then
        -- Handle character commands
        if not JobsRP.Config.character_enabled then
            chat(client, "[Character] Character system is disabled", 255, 120, 120)
            return
        end
        
        if not words[1] or words[1] == "help" then
            chat(client, "[Character] Commands:", 180, 220, 255)
            chat(client, "[Character] /character - Open character selector", 180, 220, 255)
            chat(client, "[Character] /character info - Show current character info", 180, 220, 255)
            return
        end
        
        if words[1] == "info" then
            local characterInfo = JobsRP.CharacterManager.getPlayerCharacter(client)
            if characterInfo then
                chat(client, "[Character] Current: " .. (characterInfo.model.name or "Unknown"), 120, 255, 120)
                chat(client, "[Character] Last changed: " .. os.date("%Y-%m-%d %H:%M:%S", characterInfo.lastChanged), 120, 255, 120)
                chat(client, "[Character] Context: " .. characterInfo.context, 120, 255, 120)
            else
                chat(client, "[Character] No character selected", 255, 180, 120)
            end
            return
        end
        
        -- Default: open character selector
        local success, message = JobsRP.CharacterManager.openSelector(client, "freeroam")
        if success then
            chat(client, "[Character] " .. message, 120, 255, 120)
        else
            chat(client, "[Character] " .. message, 255, 120, 120)
        end
        return
    end

end

local function isCommandNameToken(token, root)
    local normalized = normalizeToken(token or "")
    return normalized == root
end

local function describeArgs(...)
    local parts = {}
    for i = 1, select("#", ...) do
        local value = select(i, ...)
        parts[#parts + 1] = string.format("%d:%s=%s", i, type(value), tostring(value))
    end
    return table.concat(parts, " | ")
end
local function extractClientAndParams(root, ...)
    local args = { ... }
    local client = nil

    for i = #args, 1, -1 do
        local resolved = resolveClient(args[i])
        if resolved then
            client = resolved
            break
        end
    end

    if not client then
        client = resolveClient(_G and _G.client or nil)
            or resolveClient(_G and _G.source or nil)
            or resolveClient(_G and _G.this or nil)
    end

    if (not client) and getClients then
        local okClients, clients = pcall(getClients)
        if okClients and type(clients) == "table" and #clients == 1 then
            client = resolveClient(clients[1])
        end
    end

    if (not client) and getPlayers then
        local okPlayers, players = pcall(getPlayers)
        if okPlayers and type(players) == "table" and #players == 1 then
            client = resolveClient(players[1])
        end
    end

    if not client then
        return nil, ""
    end

    local fragments = {}

    for _, value in ipairs(args) do
        if isClientObject(value) then
            -- skip client/player objects
        elseif type(value) == "string" then
            local candidate = JobsRP.trim(value)
            if candidate ~= "" and (not isCommandNameToken(candidate, root)) then
                if string.find(candidate, "%s") then
                    return client, candidate
                end
                fragments[#fragments + 1] = candidate
            end
        elseif type(value) == "table" then
            local words = {}
            for _, item in ipairs(value) do
                words[#words + 1] = tostring(item)
            end

            local candidate = table.concat(words, " ")
            candidate = JobsRP.trim(candidate)
            if candidate ~= "" and (not isCommandNameToken(candidate, root)) then
                if string.find(candidate, "%s") then
                    return client, candidate
                end
                fragments[#fragments + 1] = candidate
            end
        end
    end

    if #fragments > 0 then
        return client, table.concat(fragments, " ")
    end

    return client, ""
end

if addCommandHandler then
    addCommandHandler("job", function(...)
        local client, parameters = extractClientAndParams("job", ...)
        if not client then
            print("[jobs_rp] [Commands] /job ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("job", parameters, client)
    end)

    addCommandHandler("jobauth", function(...)
        local client, parameters = extractClientAndParams("jobauth", ...)
        if not client then
            print("[jobs_rp] [Commands] /jobauth ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("jobauth", parameters, client)
    end)

    addCommandHandler("jobdiag", function(...)
        local client, parameters = extractClientAndParams("jobdiag", ...)
        if not client then
            print("[jobs_rp] [Commands] /jobdiag ignored: client not resolved | args=" .. describeArgs(...))
            return
        end

        if triggerNetworkEvent then
            pcall(function()
                triggerNetworkEvent("jobs.diagRequest", client)
            end)
        elseif triggerClientEvent then
            pcall(function()
                triggerClientEvent(client, "jobs.diagRequest", client)
            end)
        end

        chat(client, "[Jobs] Diagnostic request sent to client.", 180, 220, 255)
    end)

    addCommandHandler("recordCoord", function(...)
        local client, parameters = extractClientAndParams("recordcoord", ...)
        if not client then
            print("[jobs_rp] [Commands] /recordCoord ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("recordcoord", parameters, client)
    end)

    addCommandHandler("phone", function(...)
        local client, parameters = extractClientAndParams("phone", ...)
        if not client then
            print("[jobs_rp] [Commands] /phone ignored: client not resolved | args=" .. describeArgs(...))
            return
        end

        handleCommand("phone", parameters, client)
    end)

    -- Character system commands
    addCommandHandler("character", function(...)
        local client, parameters = extractClientAndParams("character", ...)
        if not client then
            print("[jobs_rp] [Commands] /character ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("character", parameters, client)
    end)

    addCommandHandler("char", function(...)
        local client, parameters = extractClientAndParams("char", ...)
        if not client then
            print("[jobs_rp] [Commands] /char ignored: client not resolved | args=" .. describeArgs(...))
            return
        end
        handleCommand("character", parameters, client)
    end)
end

if addEventHandler then
    addEventHandler("OnPlayerJoin", function(player)
        local client = resolveClient(player)
        if not client then
            return
        end
        local list = loadRecordedCoords()
        pushClientEvent(client, "jobs.recordedCoords", list)
    end)

    addEventHandler("OnResourceStart", function(res)
        if res and res ~= thisResource then
            return
        end
        local list = loadRecordedCoords()
        broadcastRecordedCoords(list)
    end)
end
