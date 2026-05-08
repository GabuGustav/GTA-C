-- Commands Initialization
-- Loads all command modules and initializes them

local CommandsInit = {}

local function safeRequire(moduleName)
    if type(require) == "function" then
        local ok, mod = pcall(require, moduleName)
        if ok then
            return mod
        end
        print("[Commands] require failed for " .. tostring(moduleName) .. ": " .. tostring(mod))
    end

    local loader = loadstring or load
    if type(loader) ~= "function" or type(loadTextFile) ~= "function" then
        return nil
    end

    local modulePath = tostring(moduleName or ""):gsub("%.", "/")
    local candidatePaths = {
        moduleName .. ".lua",
        modulePath .. ".lua",
        "server/" .. modulePath .. ".lua",
        "resources/jobs_rp/server/" .. modulePath .. ".lua"
    }

    for _, path in ipairs(candidatePaths) do
        local okRead, source = pcall(loadTextFile, path)
        if okRead and type(source) == "string" and source ~= "" then
            local chunk = loader(source, "@" .. path)
            if chunk then
                local okExec, result = pcall(chunk)
                if okExec then
                    return result
                end
                print("[Commands] module execution failed for " .. path .. ": " .. tostring(result))
            end
        end
    end

    return nil
end

-- Initialize all command modules
CommandsInit.init = function()
    if not addCommandHandler then
        print("[Commands] Command system not available")
        return
    end
    
    -- Load core utilities
    local Core = safeRequire("commands.core")
    if not Core then
        print("[Commands] Failed to load core utilities")
        return
    end
    
    -- Load admin commands
    local Admin = safeRequire("commands.admin")
    if Admin then
        Admin.init()
    else
        print("[Commands] Failed to load admin commands")
    end
    
    -- Load XP commands
    local XPCommands = safeRequire("commands.xp")
    if XPCommands then
        XPCommands.init()
    else
        print("[Commands] Failed to load XP commands")
    end
    
    print("[Commands] All command modules initialized successfully")
end

return CommandsInit
