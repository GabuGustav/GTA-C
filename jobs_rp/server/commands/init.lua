-- Commands Initialization
-- Loads all command modules and initializes them

local CommandsInit = {}

-- Initialize all command modules
CommandsInit.init = function()
    if not addCommandHandler then
        print("[Commands] Command system not available")
        return
    end
    
    -- Load core utilities
    local Core = require("server.commands.core")
    if not Core then
        print("[Commands] Failed to load core utilities")
        return
    end
    
    -- Load admin commands
    local Admin = require("server.commands.admin")
    if Admin then
        Admin.init()
    else
        print("[Commands] Failed to load admin commands")
    end
    
    -- Load XP commands
    local XPCommands = require("server.commands.xp")
    if XPCommands then
        XPCommands.init()
    else
        print("[Commands] Failed to load XP commands")
    end
    
    print("[Commands] All command modules initialized successfully")
end

return CommandsInit
