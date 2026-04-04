-- ============================================================================
-- JOBSRP AUTH TOKEN SYSTEM CONFIGURATION
-- ============================================================================

-- Add these configurations to your JobsRP Config object
-- You can copy these settings to your main config file

JobsRP.Config = JobsRP.Config or {}

-- ============================================================================
-- TOKEN SYSTEM SETTINGS
-- ============================================================================

-- Enable/disable the dual-token system
JobsRP.Config.auth_tokens_enabled = true

-- Session token settings (short-lived, for current session)
JobsRP.Config.auth_session_token_expire_sec = 7200  -- 2 hours
JobsRP.Config.auth_session_token_bind_ip = true      -- Bind to IP address

-- Refresh token settings (long-lived, for convenience)
JobsRP.Config.auth_refresh_token_expire_sec = 604800 -- 7 days

-- Development vs Production settings
-- Set to true for development (longer token lifetimes)
JobsRP.Config.auth_development_mode = false

if JobsRP.Config.auth_development_mode then
    -- Development: Longer lifetimes for convenience
    JobsRP.Config.auth_session_token_expire_sec = 86400  -- 24 hours
    JobsRP.Config.auth_refresh_token_expire_sec = 2592000 -- 30 days
    JobsRP.Config.auth_session_token_bind_ip = false      -- Don't bind to IP for dev
end

-- ============================================================================
-- SECURITY SETTINGS
-- ============================================================================

-- Rate limiting for token refresh attempts
JobsRP.Config.auth_token_refresh_rate_limit = 5     -- Max attempts per minute
JobsRP.Config.auth_token_refresh_window_sec = 60      -- Time window for rate limit

-- Device fingerprint settings
JobsRP.Config.auth_device_fingerprint_enabled = true  -- Enable device binding

-- Token cleanup settings
JobsRP.Config.auth_token_cleanup_interval_sec = 300   -- Clean expired tokens every 5 minutes

-- ============================================================================
-- CLIENT-SIDE SETTINGS
-- ============================================================================

-- Auto-login settings
JobsRP.Config.auth_auto_login_enabled = true        -- Enable automatic login
JobsRP.Config.auth_auto_login_delay_ms = 500       -- Delay before attempting auto-login

-- Token storage settings
JobsRP.Config.auth_token_storage_filename = "jobs_auth_tokens.json"

-- ============================================================================
-- DEBUG SETTINGS
-- ============================================================================

-- Enable debug logging for token system
JobsRP.Config.auth_token_debug = false

print("[Auth] Token system configuration loaded")
