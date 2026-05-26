JobsRP = JobsRP or {}

local root = JobsRP

root.Config = root.Config or {
    version = 3,
    resource_name = "jobs_rp",
    data_dir = "data/players",
    accounts_dir = "data/accounts",
    profiles_dir = "data/profiles",
    storage_backend = "supabase", -- json|mysql|supabase
    db_driver = "mysql",
    db_host = "127.0.0.1",
    db_port = 3306,
    db_name = "gtac",
    db_user = "root",
    db_password = "",
    db_charset = "utf8mb4",
    -- Supabase configuration
    supabase_url = "https://yfsgmytvwnfotgymskxz.supabase.co",
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc2dteXR2d25mb3RneW1za3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2Mjg2NDAsImV4cCI6MjA5MjIwNDY0MH0.zD3CJ9NUgvW297HI2r2vs_yF1Y8vUfpaaicxpz0-jKM
",
    supabase_service_key = "https://yfsgmytvwnfotgymskxz.supabase.co
service roe:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc2dteXR2d25mb3RneW1za3h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYyODY0MCwiZXhwIjoyMDkyMjA0NjQwfQ.OHD6cYtUwQSrJQW83IFOmJIQFk3XA7bCqJb1p5kWLJM",
    db_table_prefix = "jobs_rp_",
    db_connect_options = "",
    autosave_ms = 90000,
    switch_cooldown_sec = 300,
    run_timeout_sec = 480,
    action_rate_limit_ms = 250,
    action_distance = 8.0,
    hub_interact_distance = 5.0,
    hub_blip_short_range = false,
    hub_blip_range = 2000.0,
    hub_blip_min_scale = 0.5,
    hub_blip_max_scale = 1.0,
    robbery_group_window_sec = 30,
    payout_cap_amount = 1500,
    payout_cap_window_sec = 600,
    grade_thresholds = { 0, 100, 250, 500, 900 },
    grade_bonus_per_level = 0.08,
    -- Civilian XP thresholds (additive progression: 100, 200, 300, 400, 500...)
    civilian_xp_thresholds = { 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000 },
    hub_blip_sprite = 1,
    route_blip_sprite = 2,
    custom_police_blip_sprite = 101,
    custom_police_blip_alpha = 0,  -- Full opacity (255) or 0-255 for transparency
    route_blips_show_all = false,
    hud_cash_enabled = true,
    hud_use_native_cash = false,
    hud_xp_bar_duration_ms = 2500,
    hud_xp_bar_fade_ms = 600,
    police_rank_names = {
        "Recruit",
        "Officer",
        "Senior Officer",
        "Sergeant",
        "Lieutenant",
        "Captain"
    },
    prop_stream_in_distance = 200.0,
    prop_stream_out_distance = 260.0,
    prop_models = {
        taxi_hub = 0,
        robbery_stash = 0,
        robbery_bag = 0,
        police_dispatch = 0
    },
    recorded_coords_file = "data/recorded_coords.json",
    recorded_coords = {
    },
    auth_required = true,
    auth_token_prefix = "JR-",
    auth_token_hex_len = 48,
    auth_fail_window_sec = 300,
    auth_fail_max = 5,
    auth_lock_sec = 60,
    auth_ip_history_enabled = true,
    auth_name_history_limit = 10,
    auth_ip_history_limit = 10,
    auth_dependencies = {
    },
    auth_password_min_len = 8,
    auth_password_max_len = 64,
    auth_ui_enabled = true,
    auth_ui_force_modal = true,
    auth_ui_max_account_len = 24,
    auth_ui_max_password_len = 64,
    auth_ui_max_token_len = 80,
    auth_ui_show_token_once = true,
    auth_command_root = "auth",
    legacy_auth_command_root = "jobauth",
    admin_command_root = "admin",
    legacy_admin_command_root = "jobadmin",
    mod_command_root = "mod",
    auth_forgot_password_enabled = false,
    auth_forgot_password_api_key = "",
    web_integration_enabled = true,
    website_api_url = "https://bgfr-gta-connected.netlify.app/.netlify/functions",
    website_sync_api_url = "http://127.0.0.1:3001/api",
    api_secret_key = "poxhcNUcGhya2Gl44ZDv+06A1LOpfNwA+csaifFV23UqWWBdEKmYMGNUVszjGEl9",
    web_bridge_enabled = true,
    web_bridge_queue_file = "data/web_api_queue.json",
    web_bridge_status_file = "data/web_sync_status.json",
    admin_accounts = {
        "your_account_id"
    },
    mod_accounts = {
    },
    auth_reserved_ids = {
        "onplayerjoined",
        "onplayercommand",
        "admin",
        "system",
        "jobs_rp"
    },
    ip_access_mode = "off", -- off|blacklist|whitelist
    ip_security_file = "data/security/ip_security.json",
    auto_ban_window_sec = 600,
    auto_ban_lockouts = 3,
    auto_ban_duration_sec = 1800,
    admins = {
        "homepc",
        "admin"
    },
    debug_quick_test = false,
    admin_allow_all = false,
    debug = false,
    
    -- Character System Configuration
    character_enabled = true,
    character_change_cooldown_sec = 300,
    character_force_on_login = false,
    character_auto_open_jobs = true,
    character_allow_custom_models = false,
    character_validation_strict = false,
    character_save_history = true,
    character_max_history = 10
}

function root.trim(value)
    local s = tostring(value or "")
    s = string.gsub(s, "^%s+", "")
    s = string.gsub(s, "%s+$", "")
    return s
end

function root.normalizeName(value)
    return string.lower(root.trim(value))
end

function root.nowSeconds()
    return os.time()
end

function root.nowMilliseconds()
    local clock = 0
    if os and os.clock then
        clock = os.clock()
    end
    return math.floor(clock * 1000)
end

function root.deepCopy(value)
    if type(value) ~= "table" then
        return value
    end
    local out = {}
    for key, item in pairs(value) do
        out[key] = root.deepCopy(item)
    end
    return out
end

function root.round(value)
    local n = tonumber(value) or 0
    return math.floor(n + 0.5)
end

function root.toNumber(value, fallback)
    local n = tonumber(value)
    if n == nil then
        return fallback
    end
    return n
end

function root.tableLength(tbl)
    local count = 0
    for _, _ in pairs(tbl or {}) do
        count = count + 1
    end
    return count
end

function root.debugLog(...)
    if not root.Config.debug then
        return
    end

    local parts = { "[jobs_rp]" }
    for i = 1, select("#", ...) do
        parts[#parts + 1] = tostring(select(i, ...))
    end
    print(table.concat(parts, " "))
end

local adminAccountLookup = {}
for _, accountId in ipairs(root.Config.admin_accounts or {}) do
    adminAccountLookup[root.normalizeName(accountId)] = true
end
root.Config.admin_account_lookup = adminAccountLookup

local modAccountLookup = {}
for _, accountId in ipairs(root.Config.mod_accounts or {}) do
    modAccountLookup[root.normalizeName(accountId)] = true
end
root.Config.mod_account_lookup = modAccountLookup

local authReservedLookup = {}
for _, reserved in ipairs(root.Config.auth_reserved_ids or {}) do
    authReservedLookup[root.normalizeName(reserved)] = true
end
root.Config.auth_reserved_lookup = authReservedLookup

local adminLookup = {}
for _, name in ipairs(root.Config.admins or {}) do
    adminLookup[root.normalizeName(name)] = true
end
root.Config.admin_lookup = adminLookup
