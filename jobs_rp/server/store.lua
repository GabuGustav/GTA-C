JobsRP = JobsRP or {}
JobsRP.Store = JobsRP.Store or {}

local Store = JobsRP.Store

Store.profilesById = Store.profilesById or {}
Store.accountsById = Store.accountsById or {}
Store.playerToId = Store.playerToId or {}
Store.dirtyProfilesById = Store.dirtyProfilesById or {}
Store.dirtyAccountsById = Store.dirtyAccountsById or {}
Store.autosaveTimer = Store.autosaveTimer or nil
Store.storageReady = Store.storageReady or false
Store.backendMode = Store.backendMode or "json"
Store.backendLastError = Store.backendLastError or nil

local function isFileExisting(path)
    if not fileExists then
        return false
    end
    local ok, result = pcall(fileExists, path)
    return ok and result == true
end

local function loadText(path)
    if loadTextFile then
        local ok, result = pcall(loadTextFile, path)
        if ok then
            return result
        end
    end
    if io and io.open then
        local file = io.open(path, "r")
        if file then
            local content = file:read("*a")
            file:close()
            return content
        end
    end
    return nil
end

local function saveText(path, content)
    if saveTextFile then
        local ok, result = pcall(saveTextFile, path, content)
        if ok then
            return result ~= false
        end
    end
    if io and io.open then
        local file = io.open(path, "w")
        if file then
            file:write(content)
            file:close()
            return true
        end
    end
    return false
end

local function sanitizeFileName(value)
    return tostring(value):gsub("[^%w%-%_]", "_")
end

local function ensureDirectory(path)
    if not path or path == "" then
        return false
    end

    if createDirectory then
        local ok = pcall(createDirectory, path)
        if ok then
            return true
        end
    end

    if os and os.execute then
        local ok = pcall(function()
            os.execute(string.format("mkdir \"%s\"", tostring(path)))
        end)
        if ok then
            return true
        end
    end

    return false
end

local function usingMysqlBackend()
    if not Store.storageReady then
        Store.ensureStorageDirs()
    end

    if Store.backendMode ~= "mysql" then
        return false
    end

    if not JobsRP.DB or not JobsRP.DB.isReady then
        return false
    end

    local ok, ready = pcall(function()
        return JobsRP.DB.isReady()
    end)
    return ok and ready == true
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
local function getClientMapKey(actor)
    local client = resolveClient(actor)
    if not client then
        return nil, nil
    end

    local idx = nil
    local okIdx = pcall(function()
        idx = client.index
    end)
    if okIdx and idx ~= nil then
        return "idx:" .. tostring(idx), client
    end

    if client.getIndex then
        local okMethod, methodIdx = pcall(function()
            return client:getIndex()
        end)
        if okMethod and methodIdx ~= nil then
            return "idx:" .. tostring(methodIdx), client
        end
    end

    return "obj:" .. tostring(client), client
end



function Store.ensureStorageDirs()
    if Store.storageReady then
        return true
    end

    local requestedBackend = tostring(JobsRP.Config.storage_backend or "json")
    if requestedBackend == "mysql" and JobsRP.DB and JobsRP.DB.init then
        local okInit, initResult = pcall(function()
            return JobsRP.DB.init()
        end)
        local dbReady = false
        if okInit and initResult == true and JobsRP.DB.isReady then
            local okReady, ready = pcall(function()
                return JobsRP.DB.isReady()
            end)
            dbReady = okReady and ready == true
        end

        if dbReady then
            Store.backendMode = "mysql"
            Store.backendLastError = nil
            Store.storageReady = true
            return true
        end

        local lastError = nil
        if JobsRP.DB and JobsRP.DB.getLastError then
            local okErr, err = pcall(function()
                return JobsRP.DB.getLastError()
            end)
            if okErr then
                lastError = tostring(err or "")
            end
        end
        if not okInit then
            lastError = tostring(initResult)
        elseif lastError == nil or lastError == "" then
            lastError = "DB init failed"
        end

        Store.backendMode = "json"
        Store.backendLastError = lastError
        JobsRP.debugLog("DB backend unavailable; using JSON fallback.", lastError)
    else
        Store.backendMode = "json"
        Store.backendLastError = nil
    end

    ensureDirectory(JobsRP.Config.accounts_dir)
    ensureDirectory(JobsRP.Config.profiles_dir)

    Store.storageReady = true
    return true
end

local function makeDefaultJobs()
    local jobs = {}
    for _, jobDef in ipairs(JobsRP.JobDefs.list or {}) do
        jobs[jobDef.id] = {
            xp = 0,
            grade = 0,
            completedRuns = 0,
            totalEarned = 0
        }
    end
    return jobs
end

function Store.newProfile(playerId)
    return {
        version = JobsRP.Config.version,
        playerId = playerId,
        cash = 0,
        currentJobId = nil,
        switchCooldownUntil = 0,
        jobs = makeDefaultJobs(),
        stats = {
            totalRuns = 0,
            totalEarned = 0
        }
    }
end

function Store.ensureProfileShape(profile, playerId)
    local fallback = Store.newProfile(playerId)
    if type(profile) ~= "table" then
        return fallback
    end

    profile.version = JobsRP.toNumber(profile.version, fallback.version)
    profile.playerId = tostring(profile.playerId or playerId)
    profile.cash = JobsRP.toNumber(profile.cash, 0) or 0
    profile.currentJobId = profile.currentJobId
    profile.switchCooldownUntil = JobsRP.toNumber(profile.switchCooldownUntil, 0) or 0
    profile.jobs = type(profile.jobs) == "table" and profile.jobs or {}
    profile.stats = type(profile.stats) == "table" and profile.stats or {}
    profile.stats.totalRuns = JobsRP.toNumber(profile.stats.totalRuns, 0) or 0
    profile.stats.totalEarned = JobsRP.toNumber(profile.stats.totalEarned, 0) or 0

    for _, jobDef in ipairs(JobsRP.JobDefs.list or {}) do
        local current = profile.jobs[jobDef.id]
        if type(current) ~= "table" then
            current = {}
            profile.jobs[jobDef.id] = current
        end
        current.xp = JobsRP.toNumber(current.xp, 0) or 0
        current.grade = JobsRP.toNumber(current.grade, 0) or 0
        current.completedRuns = JobsRP.toNumber(current.completedRuns, 0) or 0
        current.totalEarned = JobsRP.toNumber(current.totalEarned, 0) or 0
    end

    return profile
end

function Store.newAccount(accountId, token, playerName, ip)
    local record = {
        version = JobsRP.Config.version,
        accountId = accountId,
        token = tostring(token or ""),
        createdAt = JobsRP.nowSeconds(),
        lastLoginAt = 0,
        lastSeenName = tostring(playerName or ""),
        knownIps = {},
        failed = {}
    }

    if ip and ip ~= "" then
        record.knownIps[#record.knownIps + 1] = tostring(ip)
    end

    return record
end

function Store.ensureAccountShape(record, accountId)
    local fallback = Store.newAccount(accountId, "", "", "")
    if type(record) ~= "table" then
        return fallback
    end

    record.version = JobsRP.toNumber(record.version, fallback.version)
    record.accountId = JobsRP.normalizeName(record.accountId or accountId)
    record.token = tostring(record.token or "")
    record.createdAt = JobsRP.toNumber(record.createdAt, JobsRP.nowSeconds()) or JobsRP.nowSeconds()
    record.lastLoginAt = JobsRP.toNumber(record.lastLoginAt, 0) or 0
    record.lastSeenName = tostring(record.lastSeenName or "")
    record.knownIps = type(record.knownIps) == "table" and record.knownIps or {}
    record.failed = type(record.failed) == "table" and record.failed or {}

    return record
end

local function quarantineCorrupt(path, rawText)
    local stamp = tostring(JobsRP.nowSeconds())
    local badPath = path .. ".bad." .. stamp
    local renamed = false

    if os and os.rename and isFileExisting(path) then
        local ok = pcall(os.rename, path, badPath)
        if ok then
            renamed = true
        end
    end

    if not renamed then
        saveText(badPath, rawText or "")
    end
end

function Store.getProfilePath(playerId)
    Store.ensureStorageDirs()
    local safeId = sanitizeFileName(playerId)
    return string.format("%s/%s.json", JobsRP.Config.profiles_dir, safeId)
end

function Store.getAccountPath(accountId)
    Store.ensureStorageDirs()
    local safeId = sanitizeFileName(accountId)
    return string.format("%s/%s.json", JobsRP.Config.accounts_dir, safeId)
end

function Store.getProfileById(playerId)
    return Store.profilesById[playerId]
end

function Store.loadProfileById(playerId)
    if not playerId or playerId == "" then
        return nil
    end

    local normalizedId = JobsRP.normalizeName(playerId)
    local cached = Store.profilesById[normalizedId]
    if cached then
        return cached
    end

    local path = Store.getProfilePath(normalizedId)
    local profile

    if usingMysqlBackend() then
        local decoded = nil
        local okDb, dbValue = pcall(function()
            return JobsRP.DB.loadProfile(normalizedId)
        end)
        if okDb then
            decoded = dbValue
        end

        if type(decoded) == "table" then
            profile = Store.ensureProfileShape(decoded, normalizedId)
        else
            profile = Store.newProfile(normalizedId)
        end
    else
        if isFileExisting(path) then
            local rawText = loadText(path)
            if rawText and rawText ~= "" then
                local ok, decoded = pcall(JobsRP.Json.decode, rawText)
                if ok and type(decoded) == "table" then
                    profile = Store.ensureProfileShape(decoded, normalizedId)
                else
                    quarantineCorrupt(path, rawText)
                    profile = Store.newProfile(normalizedId)
                end
            else
                profile = Store.newProfile(normalizedId)
            end
        else
            profile = Store.newProfile(normalizedId)
        end
    end

    Store.profilesById[normalizedId] = profile
    Store.dirtyProfilesById[normalizedId] = Store.dirtyProfilesById[normalizedId] == true
    return profile
end

function Store.replaceProfileById(playerId, profile)
    local normalizedId = JobsRP.normalizeName(playerId or "")
    if normalizedId == "" then
        return nil
    end

    Store.profilesById[normalizedId] = Store.ensureProfileShape(profile, normalizedId)
    Store.markDirty(normalizedId)
    return Store.profilesById[normalizedId]
end

function Store.getAccountById(accountId)
    if not accountId then
        return nil
    end
    return Store.accountsById[JobsRP.normalizeName(accountId)]
end

function Store.accountExists(accountId)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return false
    end

    if Store.accountsById[normalizedId] then
        return true
    end

    if usingMysqlBackend() then
        local ok, exists = pcall(function()
            return JobsRP.DB.accountExists(normalizedId)
        end)
        return ok and exists == true
    end

    local path = Store.getAccountPath(normalizedId)
    return isFileExisting(path)
end

function Store.loadAccountById(accountId)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return nil
    end

    local cached = Store.accountsById[normalizedId]
    if cached then
        return cached
    end

    local account

    if usingMysqlBackend() then
        local decoded = nil
        local okDb, dbValue = pcall(function()
            return JobsRP.DB.loadAccount(normalizedId)
        end)
        if okDb then
            decoded = dbValue
        end

        if type(decoded) == "table" then
            account = Store.ensureAccountShape(decoded, normalizedId)
        end
    else
        local path = Store.getAccountPath(normalizedId)
        if isFileExisting(path) then
            local rawText = loadText(path)
            if rawText and rawText ~= "" then
                local ok, decoded = pcall(JobsRP.Json.decode, rawText)
                if ok and type(decoded) == "table" then
                    account = Store.ensureAccountShape(decoded, normalizedId)
                else
                    quarantineCorrupt(path, rawText)
                    return nil
                end
            end
        end
    end

    if not account then
        return nil
    end

    Store.accountsById[normalizedId] = account
    Store.dirtyAccountsById[normalizedId] = Store.dirtyAccountsById[normalizedId] == true
    return account
end

function Store.replaceAccountById(accountId, account)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return nil
    end

    Store.accountsById[normalizedId] = Store.ensureAccountShape(account, normalizedId)
    Store.markAccountDirty(normalizedId)
    return Store.accountsById[normalizedId]
end

function Store.attachPlayerAccount(player, accountId)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    local key = nil
    key, _ = getClientMapKey(player)
    if not key or normalizedId == "" then
        return nil
    end

    Store.playerToId[key] = normalizedId
    return Store.loadProfileById(normalizedId)
end

function Store.detachPlayer(player)
    local key = nil
    key, _ = getClientMapKey(player)
    if not key then
        return
    end

    local playerId = Store.playerToId[key]
    if not playerId then
        return
    end

    Store.saveProfileById(playerId, true)
    Store.playerToId[key] = nil
end

function Store.getPlayerId(player)
    local key = nil
    key, _ = getClientMapKey(player)
    if not key then
        return nil
    end
    return Store.playerToId[key]
end

function Store.isPlayerAttached(player)
    return Store.getPlayerId(player) ~= nil
end

function Store.getProfileByPlayer(player)
    local playerId = Store.getPlayerId(player)
    if not playerId then
        return nil
    end
    return Store.loadProfileById(playerId)
end

function Store.markDirty(playerId)
    local normalizedId = JobsRP.normalizeName(playerId or "")
    if normalizedId == "" then
        return
    end
    Store.dirtyProfilesById[normalizedId] = true
end

function Store.markAccountDirty(accountId)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return
    end
    Store.dirtyAccountsById[normalizedId] = true
end

function Store.publicProfile(profile)
    if type(profile) ~= "table" then
        return nil
    end
    return JobsRP.deepCopy({
        version = profile.version,
        playerId = profile.playerId,
        cash = profile.cash,
        currentJobId = profile.currentJobId,
        switchCooldownUntil = profile.switchCooldownUntil,
        jobs = profile.jobs,
        stats = profile.stats
    })
end

function Store.publicAccount(account)
    if type(account) ~= "table" then
        return nil
    end

    return JobsRP.deepCopy({
        version = account.version,
        accountId = account.accountId,
        createdAt = account.createdAt,
        lastLoginAt = account.lastLoginAt,
        lastSeenName = account.lastSeenName,
        knownIps = account.knownIps
    })
end

function Store.getBackendInfo()
    local requested = tostring(JobsRP.Config.storage_backend or "json")
    local dbReady = false
    local dbError = nil

    if JobsRP.DB and JobsRP.DB.isReady then
        local okReady, ready = pcall(function()
            return JobsRP.DB.isReady()
        end)
        dbReady = okReady and ready == true
    end

    if JobsRP.DB and JobsRP.DB.getLastError then
        local okErr, err = pcall(function()
            return JobsRP.DB.getLastError()
        end)
        if okErr and err and tostring(err) ~= "" then
            dbError = tostring(err)
        end
    end

    return {
        requested = requested,
        active = Store.backendMode or "json",
        fallbackReason = Store.backendLastError,
        dbReady = dbReady,
        dbError = dbError
    }
end

function Store.saveProfileById(playerId, force)
    local normalizedId = JobsRP.normalizeName(playerId or "")
    if normalizedId == "" then
        return false
    end

    local profile = Store.profilesById[normalizedId]
    if not profile then
        return true
    end
    if not force and not Store.dirtyProfilesById[normalizedId] then
        return true
    end

    if usingMysqlBackend() then
        local okWrite, result = pcall(function()
            return JobsRP.DB.saveProfile(normalizedId, profile)
        end)
        if okWrite and result == true then
            Store.dirtyProfilesById[normalizedId] = false
            return true
        end

        JobsRP.debugLog("Failed to write profile DB row", normalizedId)
        return false
    end

    local encoded
    local okEncode, encodeResult = pcall(JobsRP.Json.encode, profile)
    if okEncode then
        encoded = encodeResult
    else
        JobsRP.debugLog("Failed to encode profile", normalizedId, encodeResult)
        return false
    end

    local path = Store.getProfilePath(normalizedId)
    local okWrite = saveText(path, encoded)
    if okWrite then
        Store.dirtyProfilesById[normalizedId] = false
        return true
    end

    JobsRP.debugLog("Failed to write profile file", path)
    return false
end

function Store.saveAccountById(accountId, force)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return false
    end

    local account = Store.accountsById[normalizedId]
    if not account then
        return true
    end
    if not force and not Store.dirtyAccountsById[normalizedId] then
        return true
    end

    if usingMysqlBackend() then
        local okWrite, result = pcall(function()
            return JobsRP.DB.saveAccount(normalizedId, account)
        end)
        if okWrite and result == true then
            Store.dirtyAccountsById[normalizedId] = false
            return true
        end

        JobsRP.debugLog("Failed to write account DB row", normalizedId)
        return false
    end

    local encoded
    local okEncode, encodeResult = pcall(JobsRP.Json.encode, account)
    if okEncode then
        encoded = encodeResult
    else
        JobsRP.debugLog("Failed to encode account", normalizedId, encodeResult)
        return false
    end

    local path = Store.getAccountPath(normalizedId)
    local okWrite = saveText(path, encoded)
    if okWrite then
        Store.dirtyAccountsById[normalizedId] = false
        return true
    end

    JobsRP.debugLog("Failed to write account file", path)
    return false
end

function Store.saveProfileForPlayer(player, force)
    local playerId = Store.getPlayerId(player)
    if not playerId then
        return true
    end
    return Store.saveProfileById(playerId, force)
end

function Store.saveAll(force)
    local total = 0
    local saved = 0

    for playerId, _ in pairs(Store.profilesById) do
        total = total + 1
        if Store.saveProfileById(playerId, force) then
            saved = saved + 1
        end
    end

    for accountId, _ in pairs(Store.accountsById) do
        total = total + 1
        if Store.saveAccountById(accountId, force) then
            saved = saved + 1
        end
    end

    JobsRP.debugLog("saveAll", saved, "/", total)
    return saved, total
end

function Store.reloadProfileById(playerId)
    local normalizedId = JobsRP.normalizeName(playerId or "")
    if normalizedId == "" then
        return nil
    end

    Store.profilesById[normalizedId] = nil
    Store.dirtyProfilesById[normalizedId] = nil
    return Store.loadProfileById(normalizedId)
end

function Store.reloadProfileForPlayer(player)
    local playerId = Store.getPlayerId(player)
    if not playerId then
        return nil
    end
    return Store.reloadProfileById(playerId)
end

function Store.reloadAccountById(accountId)
    local normalizedId = JobsRP.normalizeName(accountId or "")
    if normalizedId == "" then
        return nil
    end

    Store.accountsById[normalizedId] = nil
    Store.dirtyAccountsById[normalizedId] = nil
    return Store.loadAccountById(normalizedId)
end

function Store.startAutosave()
    Store.ensureStorageDirs()

    if Store.autosaveTimer and clearInterval then
        clearInterval(Store.autosaveTimer)
        Store.autosaveTimer = nil
    end

    if setInterval then
        Store.autosaveTimer = setInterval(function()
            Store.saveAll(false)
        end, JobsRP.Config.autosave_ms)
    end
end

function Store.stopAutosave()
    if Store.autosaveTimer and clearInterval then
        clearInterval(Store.autosaveTimer)
        Store.autosaveTimer = nil
    end
end






