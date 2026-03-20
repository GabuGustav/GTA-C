JobsRP = JobsRP or {}

local function normalizeToken(value)
    local token = JobsRP.normalizeName(value or "")
    if string.sub(token, 1, 1) == "/" then
        token = string.sub(token, 2)
    end
    return token
end

local function isConsoleInvoker(client)
    if client == nil then
        return true
    end
    if type(client) == "table" and client.console == true then
        return true
    end
    return false
end

local function messageConsole(text)
    print("[jobs_rp] [AuthConsole] " .. tostring(text or ""))
end

local function getAuthModule()
    if type(module) ~= "table" or type(module.auth) ~= "table" then
        return nil
    end
    return module.auth
end

local function audit(action, accountId, ok, reason)
    local mod = getAuthModule()
    if mod and mod.audit then
        pcall(function()
            mod.audit(action, tostring(accountId or "system"), ok and 1 or 0, tostring(reason or ""))
        end)
    end
end

local function splitWords(parameters)
    local out = {}
    local raw = tostring(parameters or "")
    for token in string.gmatch(raw, "%S+") do
        out[#out + 1] = token
    end
    return out
end

local function getClientsSafe()
    if getClients then
        local ok, clients = pcall(getClients)
        if ok and type(clients) == "table" then
            return clients
        end
    end
    return {}
end

local function findClientByAccountOrName(query)
    local needle = JobsRP.normalizeName(query or "")
    if needle == "" then
        return nil
    end

    local clients = getClientsSafe()
    local matched = nil
    for _, client in ipairs(clients) do
        local name = JobsRP.normalizeName(client.name or "")
        if name == needle then
            return client
        end
        if string.find(name, needle, 1, true) then
            matched = matched or client
        end
    end

    if JobsRP.Auth and JobsRP.Auth.getAccountId then
        for _, client in ipairs(clients) do
            local accountId = JobsRP.Auth.getAccountId(client)
            if accountId and JobsRP.normalizeName(accountId) == needle then
                return client
            end
        end
    end

    return matched
end

local function kickClient(client, reason)
    if not client then
        return false
    end
    local msg = tostring(reason or "Disconnected.")
    if client.disconnect then
        pcall(function()
            client:disconnect(msg)
        end)
        return true
    end
    if client.disconnect then
        pcall(function()
            client.disconnect(client, msg)
        end)
        return true
    end
    if natives and natives.network and natives.network.kickPlayer and client.index then
        pcall(function()
            natives.network.kickPlayer(client.index, true)
        end)
        return true
    end
    return false
end

local function handleConsoleAuth(command, params, client)
    if not isConsoleInvoker(client) then
        return false
    end

    local mod = getAuthModule()
    if not mod then
        messageConsole("Auth module unavailable.")
        return true
    end

    local words = splitWords(params)
    local sub = normalizeToken(words[1] or "")

    if command == "authrole" then
        local accountId = words[1]
        local role = words[2]
        if not accountId or not role then
            messageConsole("Usage: /authrole <accountId> <admin|mod|player>")
            return true
        end
        local ok = pcall(function()
            return mod.setRole(accountId, role)
        end)
        messageConsole(ok and "Role updated." or "Role update failed.")
        audit("authrole", accountId, ok, role)
        return true
    end

    if command == "authpermadd" then
        local accountId = words[1]
        local perm = words[2]
        if not accountId or not perm then
            messageConsole("Usage: /authpermadd <accountId> <perm>")
            return true
        end
        local ok = pcall(function()
            return mod.addPermission(accountId, perm)
        end)
        messageConsole(ok and "Permission added." or "Permission add failed.")
        audit("authpermadd", accountId, ok, perm)
        return true
    end

    if command == "authpermremove" then
        local accountId = words[1]
        local perm = words[2]
        if not accountId or not perm then
            messageConsole("Usage: /authpermremove <accountId> <perm>")
            return true
        end
        local ok = pcall(function()
            return mod.removePermission(accountId, perm)
        end)
        messageConsole(ok and "Permission removed." or "Permission remove failed.")
        audit("authpermremove", accountId, ok, perm)
        return true
    end

    if command == "authban" then
        local accountId = words[1]
        if not accountId then
            messageConsole("Usage: /authban <accountId> [reason]")
            return true
        end
        local reason = table.concat(words, " ", 2)
        local ok = pcall(function()
            return mod.banAccount(accountId, 0, reason, "console")
        end)
        messageConsole(ok and "Account banned." or "Ban failed.")
        audit("authban", accountId, ok, reason)
        return true
    end

    if command == "authtempban" then
        local accountId = words[1]
        local minutes = tonumber(words[2] or "")
        if not accountId or not minutes then
            messageConsole("Usage: /authtempban <accountId> <minutes> [reason]")
            return true
        end
        local reason = table.concat(words, " ", 3)
        local ok = pcall(function()
            return mod.banAccount(accountId, math.floor(minutes), reason, "console")
        end)
        messageConsole(ok and "Account temp-banned." or "Temp-ban failed.")
        audit("authtempban", accountId, ok, reason)
        return true
    end

    if command == "authunban" then
        local accountId = words[1]
        if not accountId then
            messageConsole("Usage: /authunban <accountId>")
            return true
        end
        local ok = pcall(function()
            return mod.unbanAccount(accountId)
        end)
        messageConsole(ok and "Account unbanned." or "Unban failed.")
        audit("authunban", accountId, ok, "ok")
        return true
    end

    if command == "authbanname" then
        local name = words[1]
        if not name then
            messageConsole("Usage: /authbanname <name> [reason]")
            return true
        end
        local reason = table.concat(words, " ", 2)
        local ok = pcall(function()
            return mod.banName(name, 0, reason, "console")
        end)
        messageConsole(ok and "Name banned." or "Name ban failed.")
        audit("authbanname", name, ok, reason)
        return true
    end

    if command == "authtempbanname" then
        local name = words[1]
        local minutes = tonumber(words[2] or "")
        if not name or not minutes then
            messageConsole("Usage: /authtempbanname <name> <minutes> [reason]")
            return true
        end
        local reason = table.concat(words, " ", 3)
        local ok = pcall(function()
            return mod.banName(name, math.floor(minutes), reason, "console")
        end)
        messageConsole(ok and "Name temp-banned." or "Temp-ban failed.")
        audit("authtempbanname", name, ok, reason)
        return true
    end

    if command == "authunbanname" then
        local name = words[1]
        if not name then
            messageConsole("Usage: /authunbanname <name>")
            return true
        end
        local ok = pcall(function()
            return mod.unbanName(name)
        end)
        messageConsole(ok and "Name unbanned." or "Unban failed.")
        audit("authunbanname", name, ok, "ok")
        return true
    end

    if command == "authkick" then
        local target = words[1]
        if not target then
            messageConsole("Usage: /authkick <accountIdOrName> [reason]")
            return true
        end
        local reason = table.concat(words, " ", 2)
        local clientTarget = findClientByAccountOrName(target)
        if not clientTarget then
            messageConsole("Target not found.")
            return true
        end
        kickClient(clientTarget, reason)
        audit("authkick", target, true, reason)
        messageConsole("Kick sent.")
        return true
    end

    return true
end

if addCommandHandler then
    addCommandHandler("authrole", handleConsoleAuth)
    addCommandHandler("authpermadd", handleConsoleAuth)
    addCommandHandler("authpermremove", handleConsoleAuth)
    addCommandHandler("authban", handleConsoleAuth)
    addCommandHandler("authtempban", handleConsoleAuth)
    addCommandHandler("authunban", handleConsoleAuth)
    addCommandHandler("authbanname", handleConsoleAuth)
    addCommandHandler("authtempbanname", handleConsoleAuth)
    addCommandHandler("authunbanname", handleConsoleAuth)
    addCommandHandler("authkick", handleConsoleAuth)
end
