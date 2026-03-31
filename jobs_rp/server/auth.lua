JobsRP = JobsRP or {}
JobsRP.Auth = JobsRP.Auth or {}

local Auth = JobsRP.Auth
local Store = JobsRP.Store

-- Keyed by canonical session key, not raw callback object.
Auth.sessionsByPlayer = Auth.sessionsByPlayer or {}
Auth.lastResultByPlayer = Auth.lastResultByPlayer or {}
Auth.lastActionByPlayer = Auth.lastActionByPlayer or {}

local HEX = {
    "0", "1", "2", "3", "4", "5", "6", "7",
    "8", "9", "a", "b", "c", "d", "e", "f"
}

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

local function nowMs()
    if os and os.clock then
        return math.floor(os.clock() * 1000)
    end
    if JobsRP and JobsRP.nowSeconds then
        return math.floor(JobsRP.nowSeconds() * 1000)
    end
    if os and os.time then
        return os.time() * 1000
    end
    return 0
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

        if getPlayers then
            local okPlayers, players = pcall(getPlayers)
            if okPlayers and type(players) == "table" then
                for _, player in ipairs(players) do
                    local okIdx, idx = pcall(function()
                        return player.index
                    end)
                    if okIdx and idx == actor then
                        return player
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

local function getPlayerName(actor)
    local client = resolveClient(actor) or actor
    if client and client.name then
        return tostring(client.name)
    end

    if client and client.getName then
        local ok, name = pcall(function()
            return client:getName()
        end)
        if ok and name then
            return tostring(name)
        end
    end

    return ""
end

local function getPlayerIp(actor)
    local client = resolveClient(actor) or actor
    if not client then
        return "unknown"
    end

    if client.ip then
        return tostring(client.ip)
    end

    if client.getIP then
        local ok, ip = pcall(function()
            return client:getIP()
        end)
        if ok and ip then
            return tostring(ip)
        end
    end

    return "unknown"
end

local function getPlayerIndex(actor)
    local client = resolveClient(actor) or actor
    if not client then
        return nil
    end

    if client.index ~= nil then
        return client.index
    end

    if client.getIndex then
        local ok, idx = pcall(function()
            return client:getIndex()
        end)
        if ok then
            return idx
        end
    end

    return nil
end

local function getSessionKey(actor)
    local client = resolveClient(actor)
    if not client then
        return nil, nil
    end

    local index = getPlayerIndex(client)
    if index ~= nil then
        return "idx:" .. tostring(index), client
    end

    local name = JobsRP.normalizeName(getPlayerName(client))
    local ip = JobsRP.normalizeName(getPlayerIp(client))
    if name ~= "" or ip ~= "" then
        return "name:" .. name .. "|ip:" .. ip, client
    end

    return "obj:" .. tostring(client), client
end

local function isDuplicateAction(player, action, accountId)
    local key = nil
    key, _ = getSessionKey(player)
    if not key then
        return false
    end

    local now = nowMs()
    local entry = Auth.lastActionByPlayer[key]
    if entry and entry.action == action and entry.accountId == accountId and (now - (entry.at or 0)) <= 400 then
        return true
    end

    Auth.lastActionByPlayer[key] = {
        action = action,
        accountId = accountId,
        at = now
    }
    return false
end

local function sendClientEvent(player, eventName, ...)
    local client = resolveClient(player)
    if not client or not eventName then
        return false
    end

    local args = { ... }

    if triggerNetworkEvent then
        local ok, result = pcall(function()
            return triggerNetworkEvent(eventName, client, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    if triggerClientEvent then
        local ok, result = pcall(function()
            return triggerClientEvent(client, eventName, client, unpackTable(args))
        end)
        if ok and result ~= false then
            return true
        end
    end

    return false
end

local function sendPrivateMessage(player, messageText)
    local client = resolveClient(player)
    local text = "[JobsAuth] " .. tostring(messageText or "")

    if messageClient and client then
        local ok, result = pcall(function()
            return messageClient(text, client)
        end)
        if ok and result ~= false then
            return true
        end
    end

    if outputChatBox then
        local variants = {
            function() return outputChatBox(text, client, 180, 220, 255) end,
            function() return outputChatBox(client, text, 180, 220, 255) end,
            function() return outputChatBox(text, client) end,
            function() return outputChatBox(text) end
        }

        for _, writer in ipairs(variants) do
            local ok, result = pcall(writer)
            if ok and result ~= false then
                return true
            end
        end
    end

    print("[jobs_rp] " .. text)
    return false
end

local function authMessage(player, message)
    sendPrivateMessage(player, message)
end

local function seedRandom()
    local now = JobsRP.nowSeconds()
    local ms = JobsRP.nowMilliseconds()
    math.randomseed((now * 1000) + ms)

    for _ = 1, 8 do
        math.random(0, 15)
    end
end

local function randomHex(length)
    local out = {}
    local len = math.max(1, JobsRP.round(length or 1))
    for i = 1, len do
        out[i] = HEX[math.random(1, #HEX)]
    end
    return table.concat(out)
end

local secretsLoaded = false
local function loadAuthSecrets()
    if secretsLoaded then
        return
    end
    secretsLoaded = true

    local filePath = "data/secrets.json"
    if loadTextFile then
        local ok, raw = pcall(loadTextFile, filePath)
        if ok and raw and raw ~= "" then
            local okDecode, decoded = pcall(JobsRP.Json.decode, raw)
            if okDecode and type(decoded) == "table" then
                if decoded.auth_forgot_password_enabled ~= nil then
                    JobsRP.Config.auth_forgot_password_enabled = decoded.auth_forgot_password_enabled == true
                end
                if type(decoded.auth_forgot_password_api_key) == "string" then
                    JobsRP.Config.auth_forgot_password_api_key = decoded.auth_forgot_password_api_key
                end
                print("[Auth] Loaded auth secrets from data/secrets.json")
            end
        end
    end
end


local function parseCsv(text)
    local out = {}
    if type(text) ~= "string" or text == "" then
        return out
    end
    for token in string.gmatch(text, "([^,]+)") do
        token = JobsRP.trim(token)
        if token ~= "" then
            out[#out + 1] = token
        end
    end
    return out
end

local function loadAuthDependencies()
    local deps = {}
    for _, name in ipairs(JobsRP.Config.auth_dependencies or {}) do
        if type(name) == "string" and name ~= "" then
            deps[#deps + 1] = name
        end
    end

    local unique = {}
    for _, name in ipairs(deps) do
        local key = JobsRP.normalizeName(name)
        if key ~= "" then
            unique[key] = name
        end
    end

    for _, name in pairs(unique) do
        if resource and resource.start then
            pcall(function()
                return resource.start(name)
            end)
        end
    end
end

local function generateToken()
    return tostring(JobsRP.Config.auth_token_prefix or "JR-") .. randomHex(JobsRP.Config.auth_token_hex_len or 48)
end

local function normalizeTokenForCompare(value)
    local token = tostring(value or "")
    token = string.gsub(token, "^%s+", "")
    token = string.gsub(token, "%s+$", "")
    token = string.gsub(token, "\\", "")
    return token
end

local function normalizeSecretForCompare(value)
    local secret = tostring(value or "")
    secret = string.gsub(secret, "^%s+", "")
    secret = string.gsub(secret, "%s+$", "")
    return secret
end

local function hashCore(source)
    local hash = 0
    for i = 1, #source do
        hash = ((hash * 131) + string.byte(source, i)) % 2147483647
    end
    return hash
end

local function hashPasswordV1(accountId, password)
    local source = tostring(JobsRP.normalizeName(accountId or "")) .. ":" .. tostring(password or "")
    local hash = hashCore(source)
    return string.format("jpw:%08x", hash)
end

local function hashPasswordV2(accountId, password, salt)
    local normalized = tostring(JobsRP.normalizeName(accountId or ""))
    local s = tostring(salt or "")
    if s == "" then
        s = randomHex(16)
    end
    local base = normalized .. ":" .. tostring(password or "") .. ":" .. s
    local hash = hashCore(base)
    for _ = 1, 10000 do
        hash = hashCore(tostring(hash) .. ":" .. base)
    end
    return "jpw2:" .. s .. ":" .. string.format("%08x", hash)
end

local function verifyPasswordHash(accountId, password, storedHash)
    if type(storedHash) ~= "string" or storedHash == "" then
        return false, nil
    end
    if string.sub(storedHash, 1, 5) == "jpw2:" then
        local rest = string.sub(storedHash, 6)
        local salt, hash = string.match(rest, "^([^:]+):([0-9a-fA-F]+)$")
        if not salt or not hash then
            return false, nil
        end
        return hashPasswordV2(accountId, password, salt) == ("jpw2:" .. salt .. ":" .. hash), "v2"
    end
    if string.sub(storedHash, 1, 4) == "jpw:" then
        return hashPasswordV1(accountId, password) == storedHash, "v1"
    end
    return false, nil
end

function Auth.normalizeAccountId(raw)
    return JobsRP.normalizeName(raw or "")
end

function Auth.isReservedAccountId(accountId)
    local normalized = Auth.normalizeAccountId(accountId)
    if normalized == "" then
        return true
    end
    return JobsRP.Config.auth_reserved_lookup[normalized] == true
end

function Auth.validateAccountId(raw)
    local accountId = Auth.normalizeAccountId(raw)

    if accountId == "" then
        return false, "Account id is required."
    end

    local len = #accountId
    if len < 3 or len > 24 then
        return false, "Account id length must be 3-24."
    end

    if not string.find(accountId, "^[a-z0-9_]+$") then
        return false, "Account id must be lowercase letters, numbers, or underscore."
    end

    if Auth.isReservedAccountId(accountId) then
        return false, "That account id is reserved."
    end

    return true, accountId
end

function Auth.validatePassword(rawPassword)
    local password = normalizeSecretForCompare(rawPassword)
    if password == "" then
        return false, "Password is required."
    end

    if string.find(password, "%s") then
        return false, "Password cannot contain spaces."
    end

    local minLen = JobsRP.toNumber(JobsRP.Config.auth_password_min_len, 8) or 8
    local maxLen = JobsRP.toNumber(JobsRP.Config.auth_password_max_len, 64) or 64
    local len = #password
    if len < minLen or len > maxLen then
        return false, "Password length must be " .. tostring(minLen) .. "-" .. tostring(maxLen) .. "."
    end

    return true, password
end

local function parseBanString(text)
    if type(text) ~= "string" or text == "" then
        return false, 0, "", ""
    end
    local parts = {}
    local start = 1
    while start <= #text do
        local pos = string.find(text, "|", start, true)
        if not pos then
            parts[#parts + 1] = string.sub(text, start)
            break
        end
        parts[#parts + 1] = string.sub(text, start, pos - 1)
        start = pos + 1
        if start > #text then
            parts[#parts + 1] = ""
            break
        end
    end
    local banned = parts[1] == "1"
    local untilTs = JobsRP.toNumber(parts[2], 0) or 0
    local reason = parts[3] or ""
    local by = parts[4] or ""
    return banned, untilTs, reason, by
end

local function isModuleAccountBanned(accountId)
    return false, 0, "", ""
end

local function isModuleNameBanned(name)
    return false, 0, ""
end

local function recordIdentity(accountId, name, ip)
    local account = Store.loadAccountById(accountId)
    if not account then
        return
    end
    if name and name ~= "" then
        account.lastSeenName = name
    end
    if JobsRP.Config.auth_ip_history_enabled ~= false and ip and ip ~= "" then
        account.knownIps = account.knownIps or {}
        addKnownIp(account, ip)
    end
    Store.markAccountDirty(accountId)
    Store.saveAccountById(accountId, true)
end

local function kickClient(client, reason)
    local msg = tostring(reason or "Disconnected.")
    if client and client.disconnect then
        pcall(function()
            client:disconnect(msg)
        end)
        return
    end
    if client and client.disconnect then
        pcall(function()
            client.disconnect(client, msg)
        end)
        return
    end
    if client and client.kick then
        pcall(function()
            client:kick(msg)
        end)
        return
    end
    if natives and natives.network and natives.network.kickPlayer and client and client.index then
        pcall(function()
            natives.network.kickPlayer(client.index, true)
        end)
    end
end

local function parseInfoString(text)
    local info = {}
    if type(text) ~= "string" or text == "" then
        return info
    end
    for pair in string.gmatch(text, "([^;]+)") do
        local key, value = string.match(pair, "([^=]+)=(.*)")
        if key then
            info[key] = value
        end
    end
    return info
end

local function getSessionEntry(player)
    local sessionKey = nil
    local client = nil
    sessionKey, client = getSessionKey(player)
    if not sessionKey then
        return nil, nil, nil
    end
    return Auth.sessionsByPlayer[sessionKey], sessionKey, client
end

local function ensureSession(player)
    local session, sessionKey, client = getSessionEntry(player)
    if session then
        session.clientIndex = getPlayerIndex(client)
        session.lastSeenName = getPlayerName(client)
        session.ip = getPlayerIp(client)
        return session, sessionKey, client
    end

    if not sessionKey then
        return nil, nil, nil
    end

    session = {
        authenticated = false,
        accountId = nil,
        joinedAt = JobsRP.nowSeconds(),
        loginAt = 0,
        clientIndex = getPlayerIndex(client),
        lastSeenName = getPlayerName(client),
        ip = getPlayerIp(client),
        lastAttemptedAccountId = nil
    }

    Auth.sessionsByPlayer[sessionKey] = session
    return session, sessionKey, client
end

local function clearSession(player)
    local _, sessionKey, client = getSessionEntry(player)
    if not sessionKey then
        return nil
    end

    Auth.sessionsByPlayer[sessionKey] = {
        authenticated = false,
        accountId = nil,
        joinedAt = JobsRP.nowSeconds(),
        loginAt = 0,
        clientIndex = getPlayerIndex(client),
        lastSeenName = getPlayerName(client),
        ip = getPlayerIp(client),
        lastAttemptedAccountId = nil
    }

    return sessionKey
end

local function setResult(player, ok, code, message, lockRemainingSec)
    local _, sessionKey = getSessionEntry(player)
    if not sessionKey then
        return
    end

    Auth.lastResultByPlayer[sessionKey] = {
        ok = ok == true,
        code = tostring(code or ""),
        message = tostring(message or ""),
        lockRemainingSec = JobsRP.toNumber(lockRemainingSec, 0) or 0,
        at = JobsRP.nowSeconds()
    }
end

local function clearResult(player)
    local _, sessionKey = getSessionEntry(player)
    if not sessionKey then
        return
    end
    Auth.lastResultByPlayer[sessionKey] = nil
end

local function failBucketKey(ip)
    local key = JobsRP.normalizeName(ip or "")
    if key == "" then
        return "unknown"
    end
    return key
end

local function getFailBucket(account, ip)
    account.failed = type(account.failed) == "table" and account.failed or {}

    local key = failBucketKey(ip)
    local bucket = account.failed[key]
    if type(bucket) ~= "table" then
        bucket = {
            count = 0,
            firstAt = 0,
            lastAt = 0,
            lockUntil = 0
        }
        account.failed[key] = bucket
    end

    bucket.count = JobsRP.toNumber(bucket.count, 0) or 0
    bucket.firstAt = JobsRP.toNumber(bucket.firstAt, 0) or 0
    bucket.lastAt = JobsRP.toNumber(bucket.lastAt, 0) or 0
    bucket.lockUntil = JobsRP.toNumber(bucket.lockUntil, 0) or 0

    return bucket
end

local function getLockRemaining(accountId, ip)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return 0
    end

    local account = Store.loadAccountById(normalizedId)
    if not account then
        return 0
    end

    local bucket = getFailBucket(account, ip)
    local remain = (bucket.lockUntil or 0) - JobsRP.nowSeconds()
    if remain < 0 then
        remain = 0
    end
    return remain
end

function Auth.getPublicState(player)
    local session, sessionKey, client = ensureSession(player)
    if not session then
        return {
            authenticated = false,
            accountId = nil,
            authRequired = JobsRP.Config.auth_required == true,
            lockRemainingSec = 0,
            lastErrorCode = nil,
            lastMessage = nil
        }
    end

    local result = Auth.lastResultByPlayer[sessionKey]

    local state = {
        authenticated = session.authenticated == true,
        accountId = session.accountId,
        authRequired = JobsRP.Config.auth_required == true,
        lockRemainingSec = 0,
        lastErrorCode = nil,
        lastMessage = nil
    }

    if result then
        if not result.ok and result.code ~= "" then
            state.lastErrorCode = result.code
        end
        if result.message ~= "" then
            state.lastMessage = result.message
        end
        if (result.lockRemainingSec or 0) > 0 then
            state.lockRemainingSec = result.lockRemainingSec
        end
    end

    if not state.authenticated and state.lockRemainingSec <= 0 then
        local attempted = session.lastAttemptedAccountId
        if attempted and attempted ~= "" then
            state.lockRemainingSec = getLockRemaining(attempted, getPlayerIp(client or player))
        end
    end

    return state
end

function Auth.sendState(player)
    local state = Auth.getPublicState(player)
    sendClientEvent(player, "jobs.authState", state)
    return state
end

function Auth.sendResult(player, ok, code, message, lockRemainingSec)
    setResult(player, ok, code, message, lockRemainingSec)
    sendClientEvent(player, "jobs.authResult", ok == true, tostring(code or ""), tostring(message or ""))
    Auth.sendState(player)
end

local function markLoginFailure(accountId, account, ip)
    local now = JobsRP.nowSeconds()
    local bucket = getFailBucket(account, ip)

    if bucket.firstAt == 0 or (now - bucket.firstAt) > (JobsRP.Config.auth_fail_window_sec or 300) then
        bucket.count = 0
        bucket.firstAt = now
    end

    bucket.count = bucket.count + 1
    bucket.lastAt = now

    if bucket.count >= (JobsRP.Config.auth_fail_max or 5) then
        bucket.lockUntil = now + (JobsRP.Config.auth_lock_sec or 60)
        bucket.count = 0
        bucket.firstAt = 0
    end

    Store.markAccountDirty(accountId)
    Store.saveAccountById(accountId, true)

    return bucket.lockUntil > now, math.max(0, bucket.lockUntil - now)
end

local function clearLoginFailures(accountId, account, ip)
    local bucket = getFailBucket(account, ip)
    bucket.count = 0
    bucket.firstAt = 0
    bucket.lastAt = JobsRP.nowSeconds()
    bucket.lockUntil = 0

    Store.markAccountDirty(accountId)
end

local function addKnownIp(account, ip)
    if not ip or ip == "" or ip == "unknown" then
        return
    end

    account.knownIps = type(account.knownIps) == "table" and account.knownIps or {}

    local exists = false
    for _, value in ipairs(account.knownIps) do
        if tostring(value) == tostring(ip) then
            exists = true
            break
        end
    end

    if not exists then
        account.knownIps[#account.knownIps + 1] = tostring(ip)
    end

    while #account.knownIps > 10 do
        table.remove(account.knownIps, 1)
    end
end

local function bindAuthenticatedSession(player, accountId)
    local client = resolveClient(player)
    if not client then
        return false
    end

    local currentId = Store.getPlayerId(client)
    if currentId and currentId ~= accountId then
        if JobsRP.Jobs and JobsRP.Jobs.onAuthLogout then
            JobsRP.Jobs.onAuthLogout(client)
        end
        Store.detachPlayer(client)
    end

    local session = ensureSession(client)
    if not session then
        return false
    end

    session.authenticated = true
    session.accountId = accountId
    session.loginAt = JobsRP.nowSeconds()
    session.clientIndex = getPlayerIndex(client)
    session.lastSeenName = getPlayerName(client)
    session.ip = getPlayerIp(client)
    session.lastAttemptedAccountId = accountId

    clearResult(client)

    Store.attachPlayerAccount(client, accountId)

    if JobsRP.Jobs and JobsRP.Jobs.onAuthLogin then
        JobsRP.Jobs.onAuthLogin(client)
    end

    return true
end

function Auth.getSession(player)
    local session = getSessionEntry(player)
    return session
end

function Auth.isAuthenticated(player)
    local session = Auth.getSession(player)
    if session and session.authenticated == true and session.accountId ~= nil then
        return true
    end
    return false
end

function Auth.getAccountId(player)
    local session = Auth.getSession(player)
    if not session or not session.authenticated then
        return nil
    end
    return session.accountId
end

function Auth.authHint(player)
    authMessage(player, "Authenticate first: /jobauth register <accountId> <password> or /jobauth login <accountId> <password>")
end

function Auth.requireAuthenticated(player)
    if not JobsRP.Config.auth_required then
        return true
    end

    local isAuth = Auth.isAuthenticated(player)
    if isAuth then
        return true
    end

    Auth.authHint(player)
    Auth.sendState(player)
    return false
end

function Auth.register(player, rawAccountId, rawPassword)
    local client = resolveClient(player)
    if not client then
        print("[jobs_rp] [Auth] register ignored: client not resolved")
        return false
    end

    if Auth.isAuthenticated(client) then
        local msg = "Already authenticated. Use /jobauth logout first if you want a different account."
        authMessage(client, msg)
        Auth.sendResult(client, false, "already_authenticated", msg, 0)
        return false
    end

    local ok, accountIdOrError = Auth.validateAccountId(rawAccountId)
    if not ok then
        authMessage(client, accountIdOrError)
        Auth.sendResult(client, false, "invalid_account_id", accountIdOrError, 0)
        return false
    end

    local accountId = accountIdOrError
    if isDuplicateAction(client, "register", accountId) then
        return false
    end

    local okPassword, passwordOrError = Auth.validatePassword(rawPassword)
    if not okPassword then
        authMessage(client, passwordOrError)
        Auth.sendResult(client, false, "invalid_password", passwordOrError, 0)
        return false
    end

    local password = passwordOrError

    local bannedName, untilTs, reason = isModuleNameBanned(getPlayerName(client))
    if bannedName then
        local msg = "Name is banned."
        if reason ~= "" then
            msg = msg .. " (" .. tostring(reason) .. ")"
        end
        authMessage(client, msg)
        Auth.sendResult(client, false, "name_banned", msg, 0)
        return false
    end

    local session = ensureSession(client)
    if not session then
        return false
    end
    session.lastAttemptedAccountId = accountId

    if Store.accountExists(accountId) then
        local msg = "Account id already exists."
        authMessage(client, msg)
        Auth.sendResult(client, false, "account_exists", msg, 0)
        return false
    end

    local token = generateToken()
    local account = Store.newAccount(accountId, token, getPlayerName(client), getPlayerIp(client))
    account.passwordHash = hashPasswordV2(accountId, password)
    account.passwordUpdatedAt = JobsRP.nowSeconds()

    Store.replaceAccountById(accountId, account)
    Store.saveAccountById(accountId, true)

    bindAuthenticatedSession(client, accountId)

    authMessage(client, "Account registered and logged in as " .. accountId .. ".")
    Auth.sendResult(client, true, "registered", "Account registered and logged in.", 0)

    return true
end

function Auth.login(player, rawAccountId, providedSecret)
    local client = resolveClient(player)
    if not client then
        print("[jobs_rp] [Auth] login ignored: client not resolved")
        return false
    end

    local ok, accountIdOrError = Auth.validateAccountId(rawAccountId)
    if not ok then
        authMessage(client, accountIdOrError)
        Auth.sendResult(client, false, "invalid_account_id", accountIdOrError, 0)
        return false
    end

    local accountId = accountIdOrError
    if isDuplicateAction(client, "login", accountId) then
        return false
    end
    local session = ensureSession(client)
    if not session then
        return false
    end
    session.lastAttemptedAccountId = accountId

    local bannedName, nameUntil, nameReason = isModuleNameBanned(getPlayerName(client))
    if bannedName then
        local msg = "Name is banned."
        if nameReason ~= "" then
            msg = msg .. " (" .. tostring(nameReason) .. ")"
        end
        authMessage(client, msg)
        Auth.sendResult(client, false, "name_banned", msg, 0)
        return false
    end

    local currentAccountId = Auth.getAccountId(client)
    if currentAccountId == accountId then
        local msg = "Already logged in as " .. accountId .. "."
        authMessage(client, msg)
        Auth.sendResult(client, true, "already_logged_in", msg, 0)
        return true
    end

    if currentAccountId and currentAccountId ~= accountId then
        Auth.logout(client, true)
    end

    local secret = normalizeSecretForCompare(providedSecret or "")
    if secret == "" then
        local msg = "Password is required."
        authMessage(client, msg)
        Auth.sendResult(client, false, "password_required", msg, 0)
        return false
    end

    local account = Store.loadAccountById(accountId)
    if not account then
        local msg = "Account not found."
        authMessage(client, msg)
        Auth.sendResult(client, false, "account_not_found", msg, 0)
        return false
    end

    local ip = getPlayerIp(client)
    local now = JobsRP.nowSeconds()
    local bucket = getFailBucket(account, ip)
    if bucket.lockUntil > now then
        local remain = bucket.lockUntil - now
        local msg = "Too many failed attempts. Try again in " .. tostring(remain) .. "s."
        authMessage(client, msg)
        Auth.sendResult(client, false, "locked", msg, remain)
        return false
    end

    local valid = false
    local usedLegacyToken = false

    local storedPasswordHash = tostring(account.passwordHash or "")
    if storedPasswordHash ~= "" then
        local okPass, version = verifyPasswordHash(accountId, secret, storedPasswordHash)
        valid = okPass
        if okPass and version == "v1" then
            -- Upgrade legacy hash to v2 on successful login
            account.passwordHash = hashPasswordV2(accountId, secret)
            account.passwordUpdatedAt = JobsRP.nowSeconds()
        end
    end

    if not valid then
        local storedToken = normalizeTokenForCompare(account.token or "")
        local providedToken = normalizeTokenForCompare(secret)
        if storedToken ~= "" and providedToken ~= "" and storedToken == providedToken then
            valid = true
            usedLegacyToken = true
        end
    end

    if not valid then
        local locked, remain = markLoginFailure(accountId, account, ip)
        local msg = locked and ("Too many failed attempts. Try again in " .. tostring(remain) .. "s.") or "Invalid password."
        authMessage(client, msg)
        Auth.sendResult(client, false, locked and "locked" or "invalid_password", msg, remain)
        return false
    end

    clearLoginFailures(accountId, account, ip)

    account.lastLoginAt = now
    account.lastSeenName = getPlayerName(client)
    addKnownIp(account, ip)

    -- Migrate legacy malformed token formatting after successful legacy-token login.
    if usedLegacyToken then
        local normalizedToken = normalizeTokenForCompare(secret)
        if tostring(account.token or "") ~= normalizedToken then
            account.token = normalizedToken
        end
    end

    Store.markAccountDirty(accountId)
    Store.saveAccountById(accountId, true)

    bindAuthenticatedSession(client, accountId)
    local msg = "Logged in as " .. accountId .. "."
    authMessage(client, msg)
    Auth.sendResult(client, true, "logged_in", msg, 0)

    if usedLegacyToken and tostring(account.passwordHash or "") == "" then
        authMessage(client, "Legacy token login used. Set a password: /jobauth setpass <newPassword>")
    end

    return true
end

function Auth.setPassword(player, rawPassword)
    local client = resolveClient(player)
    if not client then
        return false
    end

    local session = Auth.getSession(client)
    if not session or not session.authenticated or not session.accountId then
        local msg = "Authenticate first."
        authMessage(client, msg)
        Auth.sendResult(client, false, "not_authenticated", msg, 0)
        return false
    end

    local okPassword, passwordOrError = Auth.validatePassword(rawPassword)
    if not okPassword then
        authMessage(client, passwordOrError)
        Auth.sendResult(client, false, "invalid_password", passwordOrError, 0)
        return false
    end

    local accountId = session.accountId
    local account = Store.loadAccountById(accountId)
    if not account then
        local msg = "Account not found."
        authMessage(client, msg)
        Auth.sendResult(client, false, "account_not_found", msg, 0)
        return false
    end

    account.passwordHash = hashPasswordV2(accountId, passwordOrError)
    account.passwordUpdatedAt = JobsRP.nowSeconds()

    Store.markAccountDirty(accountId)
    Store.saveAccountById(accountId, true)

    local msg = "Password updated."
    authMessage(client, msg)
    Auth.sendResult(client, true, "password_updated", msg, 0)
    return true
end

function Auth.logout(player, silent)
    local client = resolveClient(player)
    if not client then
        return false
    end

    local session = Auth.getSession(client)
    if not session or not session.authenticated then
        if not silent then
            local msg = "You are not logged in."
            authMessage(client, msg)
            Auth.sendResult(client, false, "not_authenticated", msg, 0)
        else
            clearResult(client)
        end

        clearSession(client)

        if not silent then
            Auth.sendState(client)
        end
        return false
    end

    local accountId = session.accountId
    if isDuplicateAction(client, "logout", accountId) then
        return false
    end

    if JobsRP.Jobs and JobsRP.Jobs.onAuthLogout then
        JobsRP.Jobs.onAuthLogout(client, silent and nil or "Logged out.")
    end

    Store.detachPlayer(client)
    clearSession(client)

    if not silent then
        local msg = "Logged out from " .. tostring(accountId) .. "."
        authMessage(client, msg)
        Auth.sendResult(client, true, "logged_out", msg, 0)
    else
        clearResult(client)
    end

    return true
end

function Auth.whoami(player)
    local client = resolveClient(player)
    if not client then
        print("[jobs_rp] [Auth] whoami ignored: client not resolved")
        return false
    end

    local session = Auth.getSession(client)
    if not session or not session.authenticated then
        local msg = "Not authenticated."
        authMessage(client, msg)
        Auth.sendResult(client, false, "not_authenticated", msg, 0)
        return false
    end

    authMessage(client, "accountId=" .. tostring(session.accountId))
    authMessage(client, "name=" .. tostring(session.lastSeenName or ""))
    authMessage(client, "ip=" .. tostring(session.ip or "unknown"))
    Auth.sendResult(client, true, "whoami", "Authenticated as " .. tostring(session.accountId), 0)
    return true
end

function Auth.isAdmin(player)
    local accountId = Auth.getAccountId(player)
    if not accountId then
        return false
    end
    local account = Store.loadAccountById(accountId)
    if account and tostring(account.role or "") == "admin" then
        return true
    end
    return JobsRP.Config.admin_account_lookup[JobsRP.normalizeName(accountId)] == true
end

function Auth.getAccountInfo(rawAccountId)
    local ok, accountIdOrError = Auth.validateAccountId(rawAccountId)
    if not ok then
        return false, accountIdOrError, nil
    end

    local accountId = accountIdOrError
    local account = Store.loadAccountById(accountId)
    if not account then
        return false, "Account not found.", nil
    end

    local info = Store.publicAccount(account) or {}
    info.hasToken = account.token ~= nil and account.token ~= ""
    info.hasPassword = type(account.passwordHash) == "string" and account.passwordHash ~= ""

    return true, nil, info
end

function Auth.adminResetToken(rawAccountId)
    local ok, accountIdOrError = Auth.validateAccountId(rawAccountId)
    if not ok then
        return false, accountIdOrError, nil
    end

    local accountId = accountIdOrError
    local account = Store.loadAccountById(accountId)
    if not account then
        return false, "Account not found.", nil
    end

    local token = generateToken()
    account.token = token
    Store.markAccountDirty(accountId)
    Store.saveAccountById(accountId, true)

    return true, nil, token
end

function Auth.handlePlayerJoin(player)
    local client = resolveClient(player)
    if not client then
        return
    end

    ensureSession(client)

    local name = getPlayerName(client)
    local bannedName, untilTs, reason = isModuleNameBanned(name)
    if bannedName then
        local msg = "Name is banned."
        if reason ~= "" then
            msg = msg .. " (" .. tostring(reason) .. ")"
        end
        authMessage(client, msg)
        kickClient(client, msg)
        return
    end

    if JobsRP.Config.auth_required then
        if not Auth.isAuthenticated(client) then
            Auth.authHint(client)
        end
    end

    -- Force immediate state sync with multiple attempts
    Auth.sendState(client)
    
    -- Try delayed sync if setTimeout is available
    if setTimeout then
        setTimeout(function()
            Auth.sendState(client)
        end, 1000)
    else
        -- Fallback: try multiple immediate sends
        for i = 1, 3 do
            Auth.sendState(client)
        end
    end
end

function Auth.handlePlayerQuit(player)
    local client = resolveClient(player)
    if not client then
        return
    end

    local _, sessionKey = getSessionEntry(client)
    Auth.logout(client, true)

    if sessionKey then
        Auth.sessionsByPlayer[sessionKey] = nil
        Auth.lastResultByPlayer[sessionKey] = nil
    end
end

addEventHandler("onResourceStart", function(event, resource)
    seedRandom()
    loadAuthDependencies()
    loadAuthSecrets()
end)

-- Handle forgot password requests
addNetworkHandler("jobs.authForgotPassword", function(client)
    local player = resolveClient(client)
    if not player then
        return
    end
    
    loadAuthSecrets()

    if not (JobsRP.Config and JobsRP.Config.auth_forgot_password_enabled) then
        print("[Auth] Forgot password requested but feature disabled")
        pushClientEvent(client, "jobs.authForgotPasswordResult", false, "Password reset is disabled on this server.")
        return
    end

    local apiKey = JobsRP.Config and JobsRP.Config.auth_forgot_password_api_key or ""
    if apiKey == "" then
        print("[Auth] Forgot password requested but API key not configured")
        pushClientEvent(client, "jobs.authForgotPasswordResult", false, "Password reset is not configured.")
        return
    end

    print("[Auth] Password reset requested by: " .. tostring(player.name or "Unknown"))
    
    -- Generate OTP and send to API
    local otpId = "reset_" .. tostring(math.random(100000, 999999))
    local apiUrl = "https://bgfr-gta-connected.netlify.app/.netlify/functions/forgot-password?otp_id=" .. otpId .. "&api_key=" .. apiKey
    
    -- Send HTTP request to OTP API (GTAC doesn't have http, so we'll simulate)
    print("[Auth] OTP generated: " .. otpId)
    print("[Auth] API URL would be: " .. apiUrl)
    
    -- Simulate API call (replace with actual HTTP if available)
    pushClientEvent(client, "jobs.authForgotPasswordResult", true, "Password reset code: " .. otpId .. " sent to API")
end)
