-- Enhanced auth_module integration for jobs_rp
-- Following GTA Connected scripting expert patterns

JobsRP = JobsRP or {}
JobsRP.AuthModule = JobsRP.AuthModule or {}

local AuthModule = JobsRP.AuthModule

-- Reference: gtac_patterns.md lines 7, 40, 45 - Auth integration patterns
-- Reference: gtac_mistakes.md lines 2, 5 - Global access and dependency patterns

-- Enhanced auth module detection with proper error handling
function AuthModule.getModule()
    -- Reference: gtac_mistakes.md line 2 - Don't assume globals exist
    if type(module) ~= "table" or type(module.auth) ~= "table" then
        if console and console.log then
            console.log("[jobs_rp] Auth module not available")
        end
        return nil
    end
    
    -- Test module functionality before returning
    if type(module.auth.hasPermission) ~= "function" then
        if console and console.log then
            console.log("[jobs_rp] Auth module missing hasPermission function")
        end
        return nil
    end
    
    return module.auth
end

-- Safe auth module call with proper error handling
function AuthModule.callAuthFunction(functionName, ...)
    local mod = AuthModule.getModule()
    if not mod then
        return false, "Auth module not available"
    end
    
    if type(mod[functionName]) ~= "function" then
        return false, "Function " .. functionName .. " not available"
    end
    
    -- Reference: gtac_patterns.md - Use pcall for API safety
    local ok, result = pcall(mod[functionName], ...)
    if not ok then
        return false, "Auth module error: " .. tostring(result)
    end
    
    return true, result
end

-- Enhanced role checking with fallback patterns
function AuthModule.hasRole(player, roleName)
    -- Check auth_module first
    local ok, result = AuthModule.callAuthFunction("hasRole", AuthModule.getAccountId(player), roleName)
    if ok and result == true then
        return true
    end
    
    -- Fallback to permission checking
    ok, result = AuthModule.callAuthFunction("hasPermission", player, roleName)
    if ok and result == true then
        return true
    end
    
    -- Fallback to jobs_rp config
    local accountId = AuthModule.getAccountId(player)
    if accountId and JobsRP.Config.admin_account_lookup then
        if roleName == "admin" then
            return JobsRP.Config.admin_account_lookup[JobsRP.normalizeName(accountId)] == true
        end
    end
    
    return false
end

-- Enhanced permission checking with multiple fallbacks
function AuthModule.hasPermission(player, permission)
    -- Primary: auth_module permission check
    local ok, result = AuthModule.callAuthFunction("hasPermission", player, permission)
    if ok and result == true then
        return true
    end
    
    -- Secondary: role-based permission check
    if permission == "admin" then
        return AuthModule.hasRole(player, "admin")
    elseif permission == "mod" then
        return AuthModule.hasRole(player, "mod") or AuthModule.hasRole(player, "admin")
    elseif permission == "player" then
        return true -- All authenticated users have player permission
    end
    
    return false
end

-- Get account info with enhanced error handling
function AuthModule.getAccountInfo(accountId)
    local ok, result = AuthModule.callAuthFunction("getAccountInfo", accountId)
    if not ok then
        return false, result
    end
    
    if type(result) ~= "string" or result == "" then
        return false, "Account not found"
    end
    
    -- Parse the info string (reference: existing pattern in auth.lua)
    local info = AuthModule.parseInfoString(result)
    return true, info
end

-- Set role with proper validation and logging
function AuthModule.setRole(accountId, newRole)
    -- Validate role
    if newRole ~= "admin" and newRole ~= "mod" and newRole ~= "player" then
        return false, "Invalid role: " .. tostring(newRole)
    end
    
    -- Check if module supports role setting
    local mod = AuthModule.getModule()
    if not mod or type(mod.setRole) ~= "function" then
        return false, "Role setting not supported by auth module"
    end
    
    local ok, result = AuthModule.callAuthFunction("setRole", accountId, newRole)
    if ok then
        -- Log the role change
        if console and console.log then
            console.log("[jobs_rp] Role changed: " .. accountId .. " -> " .. newRole)
        end
        return true, "Role changed successfully"
    else
        return false, result
    end
end

-- Get current role with fallbacks
function AuthModule.getRole(accountId)
    -- Try auth_module first
    local ok, result = AuthModule.callAuthFunction("getRole", accountId)
    if ok then
        return result
    end
    
    -- Fallback to account info parsing
    ok, result = AuthModule.getAccountInfo(accountId)
    if ok and type(result) == "table" and result.role then
        return result.role
    end
    
    -- Default fallback
    return "player"
end

-- Enhanced admin checking following patterns
function AuthModule.isAdmin(player)
    -- Reference: gtac_patterns.md - Check auth module roles directly
    -- REMOVED admin_allow_all override - only actual admins should have admin access
    
    local ok, hasAdminRole = AuthModule.callAuthFunction("hasRole", player, "admin")
    if not ok then
        if console and console.log then
            console.log("[jobs_rp] Admin role check failed: " .. tostring(hasAdminRole))
        end
        return false
    end
    
    if hasAdminRole == true then
        if console and console.log then
            console.log("[jobs_rp] Admin role confirmed for player")
        end
        return true
    end
    
    -- Check moderator as fallback
    local ok, hasModRole = AuthModule.callAuthFunction("hasRole", player, "mod")
    if ok and hasModRole == true then
        if console and console.log then
            console.log("[jobs_rp] Moderator role found for player")
        end
        return true
    end
    
    if console and console.log then
        console.log("[jobs_rp] No admin/mod role found for player")
    end
    return false
end

-- Enhanced moderator checking
function AuthModule.isModerator(player)
    return AuthModule.hasRole(player, "mod") or AuthModule.hasRole(player, "admin")
end

-- Role-based command validation
function AuthModule.canUseCommand(player, commandLevel)
    if commandLevel == "admin" then
        return AuthModule.isAdmin(player)
    elseif commandLevel == "mod" then
        return AuthModule.isModerator(player)
    elseif commandLevel == "player" then
        return AuthModule.hasPermission(player, "player")
    end
    
    return false
end

-- Utility function to get account ID safely
function AuthModule.getAccountId(player)
    -- Reference: Existing pattern in jobs_rp auth.lua
    if not player then
        return nil
    end
    
    local session = JobsRP.Auth.sessionsByPlayer[player]
    if session and session.accountId then
        return session.accountId
    end
    
    return nil
end

-- Parse info string from auth_module (reference: existing pattern)
function AuthModule.parseInfoString(infoText)
    if type(infoText) ~= "string" then
        return {}
    end
    
    local info = {}
    for pair in infoText:gmatch("([^;]+)") do
        local key, value = pair:match("^(.-)=(.+)$")
        if key and value then
            info[key:trim()] = value:trim()
        end
    end
    
    return info
end

-- Initialize integration with diagnostic logging
function AuthModule.initialize()
    local mod = AuthModule.getModule()
    if mod then
        if console and console.log then
            console.log("[jobs_rp] Auth module integration initialized")
        end
        return true
    else
        if console and console.log then
            console.log("[jobs_rp] Auth module not available - using fallback auth")
        end
        return false
    end
end

-- Export functions for use in jobs_rp
JobsRP.AuthModule = AuthModule

-- Auto-initialize
AuthModule.initialize()
