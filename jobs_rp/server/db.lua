JobsRP = JobsRP or {}
JobsRP.DB = JobsRP.DB or {}

local DB = JobsRP.DB

DB.connection = DB.connection or nil
DB.ready = DB.ready or false
DB.initialized = DB.initialized or false
DB.lastError = DB.lastError or nil
DB.accountsTable = DB.accountsTable or "jobs_rp_accounts"
DB.profilesTable = DB.profilesTable or "jobs_rp_profiles"

local function cfg(name, fallback)
    if JobsRP and JobsRP.Config and JobsRP.Config[name] ~= nil then
        return JobsRP.Config[name]
    end
    return fallback
end

local function log(...)
    local parts = { "[jobs_rp] [DB]" }
    for i = 1, select("#", ...) do
        parts[#parts + 1] = tostring(select(i, ...))
    end
    if JobsRP.Config and JobsRP.Config.debug then
        print(table.concat(parts, " "))
    end
end

local function safeIdentifier(raw, fallback)
    local text = tostring(raw or "")
    text = string.gsub(text, "[^%w_]", "")
    if text == "" then
        text = tostring(fallback or "")
    end
    return text
end

local function hasNativeDbApi()
    return type(dbConnect) == "function"
        and type(dbExec) == "function"
        and type(dbQuery) == "function"
        and type(dbPoll) == "function"
end

local function hasHttpClient()
    return JobsRP.HttpClient and type(JobsRP.HttpClient.request) == "function"
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

local function buildConnectionString()
    local dbName = tostring(cfg("db_name", "gtac"))
    local host = tostring(cfg("db_host", "127.0.0.1"))
    local port = tonumber(cfg("db_port", 3306)) or 3306
    local charset = tostring(cfg("db_charset", "utf8mb4"))

    local segments = {
        "dbname=" .. dbName,
        "host=" .. host,
        "port=" .. tostring(port)
    }

    if charset ~= "" then
        segments[#segments + 1] = "charset=" .. charset
    end

    local extra = tostring(cfg("db_connect_options", ""))
    if extra ~= "" then
        segments[#segments + 1] = extra
    end

    return table.concat(segments, ";")
end

local function exec(sql, ...)
    if not DB.connection then
        return false
    end

    local args = { ... }
    local ok, result = pcall(function()
        return dbExec(DB.connection, sql, unpackTable(args))
    end)
    if not ok then
        DB.lastError = tostring(result)
        return false
    end

    return result ~= false
end

local function query(sql, ...)
    if not DB.connection then
        return false, nil
    end

    local args = { ... }
    local okQuery, queryHandle = pcall(function()
        return dbQuery(DB.connection, sql, unpackTable(args))
    end)
    if not okQuery or not queryHandle then
        DB.lastError = tostring(queryHandle or "dbQuery failed")
        return false, nil
    end

    local okPoll, rows = pcall(function()
        return dbPoll(queryHandle, -1)
    end)
    if not okPoll then
        DB.lastError = tostring(rows)
        return false, nil
    end

    if type(rows) ~= "table" then
        rows = {}
    end
    return true, rows
end

local function decodePayload(payload)
    if type(payload) ~= "string" or payload == "" then
        return nil
    end

    local ok, decoded = pcall(JobsRP.Json.decode, payload)
    if not ok or type(decoded) ~= "table" then
        return nil
    end

    return decoded
end

local function encodePayload(record)
    local ok, encoded = pcall(JobsRP.Json.encode, record)
    if not ok then
        return nil
    end
    return encoded
end

local function localRecordPath(kind, accountId)
    local baseDir = kind == "profile"
        and tostring(cfg("profiles_dir", "data/profiles"))
        or tostring(cfg("accounts_dir", "data/accounts"))
    return baseDir .. "/" .. safeIdentifier(accountId, "unknown") .. ".json"
end

local function loadLocalRecord(kind, accountId)
    local path = localRecordPath(kind, accountId)
    local raw = nil

    if loadTextFile then
        local ok, result = pcall(loadTextFile, path)
        if ok then
            raw = result
        end
    end

    if (not raw or raw == "") and io and io.open then
        local file = io.open(path, "r")
        if file then
            raw = file:read("*a")
            file:close()
        end
    end

    if not raw or raw == "" then
        return nil
    end

    local ok, decoded = pcall(JobsRP.Json.decode, raw)
    if ok and type(decoded) == "table" then
        return decoded
    end

    return nil
end

local function saveLocalRecord(kind, accountId, record)
    local path = localRecordPath(kind, accountId)
    local payload = encodePayload(record)
    if not payload then
        return false
    end

    if saveTextFile then
        local ok = pcall(saveTextFile, path, payload)
        if ok then
            return true
        end
    end

    if io and io.open then
        local file = io.open(path, "w")
        if file then
            file:write(payload)
            file:close()
            return true
        end
    end

    return false
end

local function ensureSchema()
    local accountOk = exec(
        "CREATE TABLE IF NOT EXISTS `" .. DB.accountsTable .. "` (" ..
        "`account_id` VARCHAR(64) NOT NULL," ..
        "`payload` LONGTEXT NOT NULL," ..
        "`updated_at` BIGINT NOT NULL," ..
        "PRIMARY KEY (`account_id`))"
    )

    local profileOk = exec(
        "CREATE TABLE IF NOT EXISTS `" .. DB.profilesTable .. "` (" ..
        "`account_id` VARCHAR(64) NOT NULL," ..
        "`payload` LONGTEXT NOT NULL," ..
        "`updated_at` BIGINT NOT NULL," ..
        "PRIMARY KEY (`account_id`))"
    )

    return accountOk and profileOk
end

function DB.isReady()
    return DB.ready == true and DB.connection ~= nil
end

function DB.getLastError()
    return DB.lastError
end

function DB.init()
    if DB.initialized then
        return DB.isReady()
    end

    DB.initialized = true
    DB.ready = false
    DB.lastError = nil

    local requested = tostring(cfg("storage_backend", "json"))
    if requested == "supabase" then
        return DB.initSupabase()
    elseif requested ~= "mysql" then
        return false
    end

    if not hasNativeDbApi() then
        DB.lastError = "dbConnect/dbExec/dbQuery/dbPoll API is unavailable"
        log(DB.lastError)
        return false
    end

    local driver = tostring(cfg("db_driver", "mysql"))
    local connStr = buildConnectionString()
    local user = tostring(cfg("db_user", "root"))
    local pass = tostring(cfg("db_password", ""))

    local conn = nil
    local okConnect, connectErr = pcall(function()
        conn = dbConnect(driver, connStr, user, pass)
    end)
    if not okConnect or not conn then
        DB.lastError = tostring(connectErr or "dbConnect failed")
        log("connection failed:", DB.lastError)
        return false
    end

    DB.connection = conn

    local prefix = safeIdentifier(cfg("db_table_prefix", "jobs_rp_"), "jobs_rp_")
    DB.accountsTable = prefix .. "accounts"
    DB.profilesTable = prefix .. "profiles"

    if not ensureSchema() then
        DB.ready = false
        DB.connection = nil
        log("schema setup failed:", tostring(DB.lastError or "unknown"))
        return false
    end

    DB.ready = true
    log("ready", "tables=" .. DB.accountsTable .. "," .. DB.profilesTable)
    return true
end

function DB.accountExists(accountId)
    if not DB.isReady() then
        return false
    end

    local key = tostring(accountId or "")
    if key == "" then
        return false
    end

    if DB.connection == "supabase" then
        return loadLocalRecord("account", key) ~= nil
    end

    local ok, rows = query(
        "SELECT account_id FROM `" .. DB.accountsTable .. "` WHERE account_id = ? LIMIT 1",
        key
    )
    if not ok then
        return false
    end

    return rows[1] ~= nil
end

function DB.loadAccount(accountId)
    if not DB.isReady() then
        return nil
    end

    local key = tostring(accountId or "")
    if key == "" then
        return nil
    end

    if DB.connection == "supabase" then
        local record = loadLocalRecord("account", key)
        if not record then
            return nil
        end
        if record.payload then
            local decoded = decodePayload(record.payload)
            if decoded then
                return decoded
            end
        end
        return record
    end

    local ok, rows = query(
        "SELECT payload FROM `" .. DB.accountsTable .. "` WHERE account_id = ? LIMIT 1",
        key
    )
    if not ok or not rows[1] then
        return nil
    end

    return decodePayload(rows[1].payload)
end

function DB.saveAccount(accountId, record)
    if not DB.isReady() then
        return false
    end

    local key = tostring(accountId or "")
    if key == "" then
        return false
    end

    if DB.connection == "supabase" then
        local payload = encodePayload(record)
        if not payload then
            return false
        end

        local cacheRecord = {
            account_id = key,
            payload = payload,
            updated_at = JobsRP.nowSeconds()
        }

        if not saveLocalRecord("account", key, cacheRecord) then
            return false
        end

        if hasHttpClient() then
            JobsRP.HttpClient.request("POST", "/supabase/upsert", {
                table = DB.accountsTable,
                account_id = key,
                payload = payload,
                updated_at = cacheRecord.updated_at
            })
        end

        return true
    end

    local payload = encodePayload(record)
    if not payload then
        return false
    end

    local now = JobsRP.nowSeconds()
    return exec(
        "INSERT INTO `" .. DB.accountsTable .. "` (account_id, payload, updated_at) VALUES (?, ?, ?) " ..
        "ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)",
        key,
        payload,
        now
    )
end

function DB.loadProfile(accountId)
    if not DB.isReady() then
        return nil
    end

    local key = tostring(accountId or "")
    if key == "" then
        return nil
    end

    if DB.connection == "supabase" then
        local record = loadLocalRecord("profile", key)
        if not record then
            return nil
        end
        if record.payload then
            local decoded = decodePayload(record.payload)
            if decoded then
                return decoded
            end
        end
        return record
    end

    local ok, rows = query(
        "SELECT payload FROM `" .. DB.profilesTable .. "` WHERE account_id = ? LIMIT 1",
        key
    )
    if not ok or not rows[1] then
        return nil
    end

    return decodePayload(rows[1].payload)
end

function DB.saveProfile(accountId, record)
    if not DB.isReady() then
        return false
    end

    local key = tostring(accountId or "")
    if key == "" then
        return false
    end

    if DB.connection == "supabase" then
        local payload = encodePayload(record)
        if not payload then
            return false
        end

        local cacheRecord = {
            account_id = key,
            payload = payload,
            updated_at = JobsRP.nowSeconds()
        }

        if not saveLocalRecord("profile", key, cacheRecord) then
            return false
        end

        if hasHttpClient() then
            JobsRP.HttpClient.request("POST", "/supabase/upsert", {
                table = DB.profilesTable,
                account_id = key,
                payload = payload,
                updated_at = cacheRecord.updated_at
            })
        end

        return true
    end

    local payload = encodePayload(record)
    if not payload then
        return false
    end

    local now = JobsRP.nowSeconds()
    return exec(
        "INSERT INTO `" .. DB.profilesTable .. "` (account_id, payload, updated_at) VALUES (?, ?, ?) " ..
        "ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)",
        key,
        payload,
        now
    )
end

-- Supabase integration functions
local function makeHttpRequest(url, method, headers, body)
    if not JobsRP.Http then
        log("HTTP client not available for Supabase")
        return false, "HTTP client not available"
    end
    
    local defaultHeaders = {
        ["Content-Type"] = "application/json",
        ["apikey"] = cfg("supabase_key", ""),
        ["Authorization"] = "Bearer " .. cfg("supabase_service_key", "")
    }
    
    for k, v in pairs(headers or {}) do
        defaultHeaders[k] = v
    end
    
    return JobsRP.Http.request(url, method, defaultHeaders, body)
end

function DB.initSupabase()
    local supabaseUrl = tostring(cfg("supabase_url", ""))
    local supabaseKey = tostring(cfg("supabase_key", ""))
    local serviceKey = tostring(cfg("supabase_service_role", cfg("supabase_service_key", "")))
    
    if supabaseUrl == "" or supabaseKey == "" or serviceKey == "" then
        DB.lastError = "Supabase configuration missing (url, key, or service_key)"
        log(DB.lastError)
        return false
    end

    DB.connection = "supabase"
    local prefix = safeIdentifier(cfg("db_table_prefix", "jobs_rp_"), "jobs_rp_")
    DB.accountsTable = prefix .. "accounts"
    DB.profilesTable = prefix .. "profiles"
    DB.ready = true
    if not hasHttpClient() then
        log("Supabase cache initialized; HttpClient bridge not yet available")
    end
    log("Supabase backend configured")
    return true
end

function DB.supabaseUpsert(table, key, payload)
    local kind = table == DB.profilesTable and "profile" or "account"
    local now = JobsRP.nowSeconds()
    local cacheRecord = {
        account_id = key,
        payload = payload,
        updated_at = now
    }

    if not saveLocalRecord(kind, key, cacheRecord) then
        return false
    end

    if hasHttpClient() then
        JobsRP.HttpClient.request("POST", "/supabase/upsert", {
            table = table,
            account_id = key,
            payload = payload,
            updated_at = now
        })
    end

    return true
end

function DB.supabaseGet(table, key)
    local kind = table == DB.profilesTable and "profile" or "account"
    local record = loadLocalRecord(kind, key)
    if not record then
        return false, nil
    end
    return true, record
end

-- Override functions for Supabase
if cfg("storage_backend", "json") == "supabase" then
    DB.setAccount = function(key, payload)
        return DB.supabaseUpsert(DB.accountsTable, key, payload)
    end
    
    DB.getAccount = function(key)
        local success, record = DB.supabaseGet(DB.accountsTable, key)
        if not success or not record then
            return nil
        end
        if record.payload then
            local decoded = decodePayload(record.payload)
            if decoded then
                return decoded
            end
        end
        return record
    end
    
    DB.setProfile = function(key, payload)
        return DB.supabaseUpsert(DB.profilesTable, key, payload)
    end
    
    DB.getProfile = function(key)
        local success, record = DB.supabaseGet(DB.profilesTable, key)
        if not success or not record then
            return nil
        end
        if record.payload then
            local decoded = decodePayload(record.payload)
            if decoded then
                return decoded
            end
        end
        return record
    end
end
