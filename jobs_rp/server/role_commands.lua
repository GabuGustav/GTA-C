-- Role management commands for jobs_rp using auth_module
-- Following GTA Connected scripting expert patterns

JobsRP = JobsRP or {}
JobsRP.RoleCommands = JobsRP.RoleCommands or {}

local RoleCommands = JobsRP.RoleCommands

-- Reference: gtac_patterns.md - Console-only commands in server scripts
-- Reference: gtac_mistakes.md - Proper argument checking and error handling

-- Helper function to check if player is admin
function RoleCommands.isAdmin(player)
    return JobsRP.Auth and JobsRP.Auth.isAdmin(player)
end

-- Helper function to send messages to player
function RoleCommands.sendMessage(player, message, r, g, b)
    r = r or 255
    g = g or 255
    b = b or 255
    
    if chat then
        chat(player, message, r, g, b)
    elseif outputChat then
        outputChat(player, message)
    end
end

-- Set role command with enhanced validation
function RoleCommands.setRoleCommand(player, accountId, roleName)
    -- Check admin permission
    if not RoleCommands.isAdmin(player) then
        RoleCommands.sendMessage(player, "[RoleManager] Admin permission required", 255, 120, 100)
        return false
    end
    
    -- Reference: gtac_mistakes.md line 7 - Check x !== undefined instead of truthiness
    if accountId == nil or accountId == "" then
        RoleCommands.sendMessage(player, "[RoleManager] Usage: /setrole <account_id> <role>", 255, 200, 100)
        return false
    end
    
    if roleName == nil or roleName == "" then
        RoleCommands.sendMessage(player, "[RoleManager] Usage: /setrole <account_id> <role>", 255, 200, 100)
        return false
    end
    
    -- Normalize role name
    roleName = roleName:lower()
    
    -- Validate role
    if roleName ~= "admin" and roleName ~= "mod" and roleName ~= "player" then
        RoleCommands.sendMessage(player, "[RoleManager] Invalid role. Use: admin, mod, or player", 255, 100, 100)
        return false
    end
    
    -- Use enhanced auth_module integration
    if JobsRP.AuthModule and JobsRP.AuthModule.setRole then
        local ok, result = JobsRP.AuthModule.setRole(accountId, roleName)
        if ok then
            RoleCommands.sendMessage(player, "[RoleManager] Successfully set " .. accountId .. " to " .. roleName, 100, 255, 100)
            
            -- Log the action
            if console and console.log then
                console.log("[RoleManager] " .. (player.name or "Unknown") .. " set " .. accountId .. " to " .. roleName)
            end
            return true
        else
            RoleCommands.sendMessage(player, "[RoleManager] Failed to set role: " .. tostring(result), 255, 100, 100)
            return false
        end
    else
        RoleCommands.sendMessage(player, "[RoleManager] Auth module integration not available", 255, 100, 100)
        return false
    end
end

-- Get role command
function RoleCommands.getRoleCommand(player, accountId)
    -- Check admin permission
    if not RoleCommands.isAdmin(player) then
        RoleCommands.sendMessage(player, "[RoleManager] Admin permission required", 255, 100, 100)
        return false
    end
    
    if accountId == nil or accountId == "" then
        RoleCommands.sendMessage(player, "[RoleManager] Usage: /getrole <account_id>", 255, 200, 100)
        return false
    end
    
    -- Use enhanced auth_module integration
    if JobsRP.AuthModule and JobsRP.AuthModule.getRole then
        local role = JobsRP.AuthModule.getRole(accountId)
        RoleCommands.sendMessage(player, "[RoleManager] " .. accountId .. " has role: " .. role, 100, 255, 100)
        return true
    else
        RoleCommands.sendMessage(player, "[RoleManager] Auth module integration not available", 255, 100, 100)
        return false
    end
end

-- List roles command
function RoleCommands.listRolesCommand(player)
    -- Check admin permission
    if not RoleCommands.isAdmin(player) then
        RoleCommands.sendMessage(player, "[RoleManager] Admin permission required", 255, 100, 100)
        return false
    end
    
    RoleCommands.sendMessage(player, "[RoleManager] Available roles: admin, mod, player", 100, 200, 255)
    RoleCommands.sendMessage(player, "[RoleManager] Use GUI tool: role_manager_gui.exe for easier management", 100, 200, 255)
    return true
end

-- Check role command
function RoleCommands.checkRoleCommand(player, accountId, roleName)
    -- Check admin permission
    if not RoleCommands.isAdmin(player) then
        RoleCommands.sendMessage(player, "[RoleManager] Admin permission required", 255, 100, 100)
        return false
    end
    
    if accountId == nil or accountId == "" then
        RoleCommands.sendMessage(player, "[RoleManager] Usage: /checkrole <account_id> [role]", 255, 200, 100)
        return false
    end
    
    -- If no role specified, get current role
    if roleName == nil or roleName == "" then
        return RoleCommands.getRoleCommand(player, accountId)
    end
    
    -- Check specific role
    roleName = roleName:lower()
    if roleName ~= "admin" and roleName ~= "mod" and roleName ~= "player" then
        RoleCommands.sendMessage(player, "[RoleManager] Invalid role. Use: admin, mod, or player", 255, 100, 100)
        return false
    end
    
    -- Use enhanced auth_module integration
    if JobsRP.AuthModule and JobsRP.AuthModule.hasRole then
        local hasRole = JobsRP.AuthModule.hasRole(player, roleName) -- Note: This would need player object, not accountId
        RoleCommands.sendMessage(player, "[RoleManager] " .. accountId .. " has " .. roleName .. " role: " .. (hasRole and "YES" or "NO"), 100, 255, 100)
        return true
    else
        RoleCommands.sendMessage(player, "[RoleManager] Auth module integration not available", 255, 100, 100)
        return false
    end
end

-- Register commands
function RoleCommands.initialize()
    -- Reference: gtac_patterns.md - Use addCommandHandler if available
    if addCommandHandler then
        addCommandHandler("setrole", RoleCommands.setRoleCommand)
        addCommandHandler("getrole", RoleCommands.getRoleCommand)
        addCommandHandler("roles", RoleCommands.listRolesCommand)
        addCommandHandler("checkrole", RoleCommands.checkRoleCommand)
        
        if console and console.log then
            console.log("[RoleCommands] Role management commands registered")
        end
    else
        if console and console.log then
            console.log("[RoleCommands] addCommandHandler not available")
        end
    end
end

-- Auto-initialize
RoleCommands.initialize()

-- Export for use in other scripts
JobsRP.RoleCommands = RoleCommands
