// Dynamic trainer CVAR management based on gamemode and admin status
// Following GTA Connected scripting expert patterns

// Reference: gtac_patterns.md - Use globalThis for global access
// Reference: gtac_mistakes.md - Don't assume globals exist

// Global state management
globalThis.TrainerManager = globalThis.TrainerManager || {};
const TrainerManager = globalThis.TrainerManager;

// Configuration
TrainerManager.config = {
    // Gamemodes that allow trainers
    allowedGamemodes: [8], // 8 = Free Roam only (removed 16 = Custom GameModes)
    cvarName: "trainers",
    checkInterval: 5000, // Check every 5 seconds
    debugMode: false,
    // v-admin inspired trainer blocking
    blockTrainersInRestrictedModes: true,
    trainerBlockMessage: "Trainers are disabled in this gamemode. Only available in Free Mode.",
    enableSCMBlocking: true, // Block SCM/SCO scripts like v-admin
    enableScriptHookBlocking: true, // Block trainer script hooks
    // GTA Connected anticheat integration
    enableAnticheatIntegration: true, // Work with built-in anticheat
    anticheatBypassMessage: "Anticheat violation detected. Trainers blocked.",
    enableFileIntegrityCheck: true, // Monitor for file tampering
    // Jobs RP integration
    enableJobsRPIntegration: true, // Integrate with jobs_rp resource
    jobsRPResourceName: "jobs_rp", // Resource name to integrate with
    blockInJobsMode: true, // Block trainers when in jobs
    allowInFreeMode: true, // Allow trainers in free mode
    jobsRPIntegrationMessage: "Trainers disabled during jobs. Switch to Free Mode to use trainers."
};

// State tracking
TrainerManager.state = {
    currentGamemode: -1,
    isAdmin: false,
    lastCvarValue: -1,
    initialized: false,
    trainerBlocked: false,
    lastBlockCheck: 0,
    anticheatViolations: 0, // Track anticheat violations
    lastFileCheck: 0, // Track file integrity checks
    isInJob: false, // Track if player is in a job
    jobsRPResource: null, // Reference to jobs_rp resource
    lastJobsCheck: 0 // Track jobs RP integration checks
};

// Logging function (Reference: gtac_patterns.md - Use console.log)
TrainerManager.log = function(message) {
    if (TrainerManager.config.debugMode && console && console.log) {
        console.log("[TrainerManager] " + message);
    }
};

// v-admin inspired trainer blocking functions (BetterIV approach)
TrainerManager.blockTrainerScripts = function() {
    try {
        // BetterIV approach: Block specific script types that trainers use
        if (TrainerManager.config.enableSCMBlocking && typeof natives !== 'undefined') {
            TrainerManager.log("Blocking trainer scripts (BetterIV method)");
            
            // Block trainer scripts by name pattern (BetterIV method)
            if (typeof game !== 'undefined' && typeof game.getActiveScripts === 'function') {
                const activeScripts = game.getActiveScripts();
                const trainerPatterns = ['trainer', 'cheat', 'hack', 'mod', 'menu'];
                
                activeScripts.forEach(scriptName => {
                    const scriptLower = String(scriptName).toLowerCase();
                    const isTrainerScript = trainerPatterns.some(pattern => scriptLower.includes(pattern));
                    
                    if (isTrainerScript) {
                        TrainerManager.log("Terminating trainer script: " + scriptName);
                        game.terminateScript(scriptName);
                    }
                });
            }
            
            // Additional native blocking for trainer hooks
            if (typeof natives.setScriptFlags === 'function') {
                natives.setScriptFlags(0x1); // Block custom scripts
            }
            
            // Remove trainer pickups (BetterIV method)
            const trainerPickupTypes = [1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17];
            trainerPickupTypes.forEach(type => {
                try {
                    if (typeof natives.removeAllPickupsOfType === 'function') {
                        natives.removeAllPickupsOfType(type);
                    }
                } catch (e) {
                    TrainerManager.log("Error removing pickup type " + type + ": " + e.toString());
                }
            });
        }
        
        return true;
    } catch (error) {
        TrainerManager.log("Error blocking trainer scripts: " + error.toString());
        return false;
    }
};

TrainerManager.unblockTrainerScripts = function() {
    try {
        // BetterIV approach: Unblock trainer functionality
        if (TrainerManager.config.enableSCMBlocking && typeof natives !== 'undefined') {
            TrainerManager.log("Unblocking trainer scripts (BetterIV method)");
            
            // Restore script flags
            if (typeof natives.setScriptFlags === 'function') {
                natives.setScriptFlags(0x0); // Allow custom scripts
            }
        }
        
        return true;
    } catch (error) {
        TrainerManager.log("Error unblocking trainer scripts: " + error.toString());
        return false;
    }
};

TrainerManager.showBlockMessage = function() {
    if (globalThis.localPlayer && typeof chat !== 'undefined') {
        chat(localPlayer, "[TrainerManager] " + TrainerManager.config.trainerBlockMessage, [255, 100, 100]);
        TrainerManager.log("Trainer block message shown to player");
    }
};

// GTA Connected anticheat integration functions
TrainerManager.checkAnticheatViolation = function() {
    try {
        // Check if anticheat has detected violations
        if (TrainerManager.config.enableAnticheatIntegration) {
            // Monitor for suspicious activity that might indicate anticheat bypass
            const now = Date.now();
            
            // Check for rapid script execution (possible trainer injection)
            if (now - TrainerManager.state.lastFileCheck < 1000) {
                TrainerManager.state.anticheatViolations++;
                TrainerManager.log("Potential anticheat bypass detected - rapid script execution");
                
                if (TrainerManager.state.anticheatViolations > 3) {
                    TrainerManager.enhanceBlocking();
                }
            }
            
            TrainerManager.state.lastFileCheck = now;
        }
        
        return false;
    } catch (error) {
        TrainerManager.log("Error checking anticheat violation: " + error.toString());
        return false;
    }
};

TrainerManager.enhanceBlocking = function() {
    try {
        TrainerManager.log("Enhancing blocking due to anticheat violations");
        
        // Enable maximum blocking
        if (typeof natives !== 'undefined') {
            // Aggressive script termination
            if (typeof game !== 'undefined' && typeof game.getActiveScripts === 'function') {
                const allScripts = game.getActiveScripts();
                allScripts.forEach(scriptName => {
                    try {
                        game.terminateScript(scriptName);
                    } catch (e) {
                        // Continue trying to block all scripts
                    }
                });
            }
            
            // Block all script execution
            if (typeof natives.setScriptFlags === 'function') {
                natives.setScriptFlags(0x1); // Maximum blocking
            }
        }
        
        // Notify player of enhanced security
        if (globalThis.localPlayer && typeof chat !== 'undefined') {
            chat(localPlayer, "[TrainerManager] " + TrainerManager.config.anticheatBypassMessage, [255, 50, 50]);
        }
        
        return true;
    } catch (error) {
        TrainerManager.log("Error enhancing blocking: " + error.toString());
        return false;
    }
};

TrainerManager.checkFileIntegrity = function() {
    try {
        if (!TrainerManager.config.enableFileIntegrityCheck) {
            return true;
        }
        
        // Basic file integrity monitoring
        const criticalFiles = [
            "data/handling.cfg",
            "data/weaponinfo.xml", 
            "data/vehicles.ide"
        ];
        
        criticalFiles.forEach(filePath => {
            try {
                // Check if file exists and is accessible
                if (typeof fileExists !== 'undefined' && !fileExists(filePath)) {
                    TrainerManager.log("Critical file missing: " + filePath);
                    TrainerManager.state.anticheatViolations++;
                }
            } catch (e) {
                TrainerManager.log("Error checking file integrity for " + filePath + ": " + e.toString());
            }
        });
        
        return true;
    } catch (error) {
        TrainerManager.log("Error checking file integrity: " + error.toString());
        return false;
    }
};

// Jobs RP integration functions
TrainerManager.initJobsRPIntegration = function() {
    try {
        if (!TrainerManager.config.enableJobsRPIntegration) {
            return false;
        }
        
        // Try to get jobs_rp resource
        if (typeof getResources !== 'undefined') {
            const resources = getResources();
            for (let i = 0; i < resources.length; i++) {
                const resource = resources[i];
                if (resource.name === TrainerManager.config.jobsRPResourceName) {
                    TrainerManager.state.jobsRPResource = resource;
                    TrainerManager.log("Jobs RP integration initialized with resource: " + resource.name);
                    
                    // Set up event listeners for jobs_rp
                    TrainerManager.setupJobsRPEventListeners();
                    return true;
                }
            }
        }
        
        TrainerManager.log("Jobs RP resource not found, integration disabled");
        return false;
    } catch (error) {
        TrainerManager.log("Error initializing Jobs RP integration: " + error.toString());
        return false;
    }
};

TrainerManager.setupJobsRPEventListeners = function() {
    try {
        if (!TrainerManager.state.jobsRPResource) {
            return false;
        }
        
        // Listen for job state changes from jobs_rp
        if (typeof addNetworkHandler !== 'undefined') {
            addNetworkHandler("jobsRP_jobStarted", function(jobData) {
                TrainerManager.state.isInJob = true;
                TrainerManager.log("Job started, blocking trainers");
                TrainerManager.updateTrainerBlocking();
            });
            
            addNetworkHandler("jobsRP_jobEnded", function(jobData) {
                TrainerManager.state.isInJob = false;
                TrainerManager.log("Job ended, checking trainer access");
                TrainerManager.updateTrainerBlocking();
            });
            
            addNetworkHandler("jobsRP_stateSync", function(stateData) {
                TrainerManager.state.isInJob = stateData.isInJob || false;
                TrainerManager.log("Jobs RP state sync: isInJob = " + TrainerManager.state.isInJob);
                TrainerManager.updateTrainerBlocking();
            });
        }
        
        return true;
    } catch (error) {
        TrainerManager.log("Error setting up Jobs RP event listeners: " + error.toString());
        return false;
    }
};

TrainerManager.checkJobsRPState = function() {
    try {
        if (!TrainerManager.config.enableJobsRPIntegration || !TrainerManager.state.jobsRPResource) {
            return false;
        }
        
        const now = Date.now();
        
        // Check jobs RP state every 2 seconds
        if (now - TrainerManager.state.lastJobsCheck > 2000) {
            // Request current state from jobs_rp
            if (typeof triggerNetworkEvent !== 'undefined') {
                triggerNetworkEvent("trainerManager_requestJobsState");
            }
            
            TrainerManager.state.lastJobsCheck = now;
        }
        
        return true;
    } catch (error) {
        TrainerManager.log("Error checking Jobs RP state: " + error.toString());
        return false;
    }
};

// Check if player is admin using auth_module integration
TrainerManager.checkAdminStatus = function() {
    try {
        // Check if auth_module is available
        if (typeof module !== 'undefined' && module.auth) {
            // Reference: gtac_patterns.md - Use apply for API calls
            const hasAdminRole = Function.prototype.apply.call(module.auth.hasRole, module.auth, [globalThis.localPlayer ? globalThis.localPlayer.getData("accountId") : "", "admin"]);
            const hasAdminPermission = Function.prototype.apply.call(module.auth.hasPermission, module.auth, [globalThis.localPlayer, "admin"]);
            
            TrainerManager.state.isAdmin = hasAdminRole === true || hasAdminPermission === true;
            TrainerManager.log("Admin status: " + TrainerManager.state.isAdmin);
        } else {
            // Fallback: check if player is in admin list (config-based)
            // This would need server-side implementation
            TrainerManager.state.isAdmin = false;
            TrainerManager.log("Auth module not available, admin status: false");
        }
    } catch (error) {
        TrainerManager.log("Error checking admin status: " + error.toString());
        TrainerManager.state.isAdmin = false;
    }
};

// Get current gamemode
TrainerManager.getCurrentGamemode = function() {
    try {
        // Reference: gtac_patterns.md - Use API safely
        if (typeof getGameMode !== 'undefined') {
            const gamemode = getGameMode();
            TrainerManager.log("Current gamemode: " + gamemode);
            return gamemode;
        }
        
        // Fallback: check server CVAR
        if (typeof getCVar !== 'undefined') {
            const ivGamemode = getCVar("iv_gamemode");
            if (ivGamemode !== null) {
                TrainerManager.log("Fallback gamemode from CVAR: " + ivGamemode);
                return parseInt(ivGamemode);
            }
        }
        
        TrainerManager.log("Could not determine gamemode");
        return -1;
    } catch (error) {
        TrainerManager.log("Error getting gamemode: " + error.toString());
        return -1;
    }
};

// Set trainers CVAR
TrainerManager.setTrainersCvar = function(value) {
    try {
        if (typeof setCVar !== 'undefined') {
            // Reference: gtac_patterns.md - Use explicit returns
            const result = setCVar(TrainerManager.config.cvarName, value.toString());
            TrainerManager.log("Set " + TrainerManager.config.cvarName + " to " + value + " (result: " + result + ")");
            return result;
        } else {
            TrainerManager.log("setCVar not available");
            return false;
        }
    } catch (error) {
        TrainerManager.log("Error setting CVAR: " + error.toString());
        return false;
    }
};

// Get trainers CVAR
TrainerManager.getTrainersCvar = function() {
    try {
        if (typeof getCVar !== 'undefined') {
            const value = getCVar(TrainerManager.config.cvarName);
            TrainerManager.log("Current " + TrainerManager.config.cvarName + " value: " + value);
            return value;
        } else {
            TrainerManager.log("getCVar not available");
            return null;
        }
    } catch (error) {
        TrainerManager.log("Error getting CVAR: " + error.toString());
        return null;
    }
};

// Main logic: determine if trainers should be enabled
TrainerManager.shouldEnableTrainers = function() {
    // Admins always have trainers enabled
    if (TrainerManager.state.isAdmin) {
        TrainerManager.log("Admin detected - trainers enabled");
        return true;
    }
    
    // Check Jobs RP integration first (highest priority)
    if (TrainerManager.config.enableJobsRPIntegration && TrainerManager.state.isInJob) {
        TrainerManager.log("Player is in job - trainers blocked");
        return false;
    }
    
    // Check if current gamemode is in allowed list (Free Mode only)
    const currentGamemode = TrainerManager.getCurrentGamemode();
    const isAllowedGamemode = TrainerManager.config.allowedGamemodes.includes(currentGamemode);
    
    // Special case: allow trainers in Free Mode even if Jobs RP integration is active
    if (isAllowedGamemode && TrainerManager.config.allowInFreeMode) {
        TrainerManager.log("Free Mode detected - trainers allowed");
        return true;
    }
    
    TrainerManager.log("Gamemode " + currentGamemode + " allowed: " + isAllowedGamemode);
    return isAllowedGamemode;
};

// Enhanced trainer blocking logic (BetterIV approach)
TrainerManager.updateTrainerBlocking = function() {
    const shouldEnable = TrainerManager.shouldEnableTrainers();
    const now = Date.now();
    
    // Check if we need to update blocking state
    if (shouldEnable !== TrainerManager.state.trainerBlocked || (now - TrainerManager.state.lastBlockCheck) > 1000) {
        if (shouldEnable) {
            // Unblock trainers
            if (TrainerManager.state.trainerBlocked) {
                TrainerManager.log("Unblocking trainers for allowed gamemode");
                TrainerManager.unblockTrainerScripts();
                TrainerManager.state.trainerBlocked = false;
                
                // Notify player with context-aware message
                if (globalThis.localPlayer && typeof chat !== 'undefined') {
                    let message = "Trainers enabled for this gamemode";
                    if (TrainerManager.config.enableJobsRPIntegration && !TrainerManager.state.isInJob) {
                        message = "Trainers enabled - Free Mode active";
                    }
                    chat(localPlayer, "[TrainerManager] " + message, [100, 255, 100]);
                }
            }
        } else {
            // Block trainers
            if (!TrainerManager.state.trainerBlocked) {
                TrainerManager.log("Blocking trainers for restricted gamemode");
                TrainerManager.blockTrainerScripts();
                
                // Show context-aware blocking message
                if (globalThis.localPlayer && typeof chat !== 'undefined') {
                    let message = TrainerManager.config.trainerBlockMessage;
                    if (TrainerManager.config.enableJobsRPIntegration && TrainerManager.state.isInJob) {
                        message = TrainerManager.config.jobsRPIntegrationMessage;
                    }
                    chat(localPlayer, "[TrainerManager] " + message, [255, 100, 100]);
                }
                
                TrainerManager.state.trainerBlocked = true;
            }
        }
        
        TrainerManager.state.lastBlockCheck = now;
    }
};

// BetterIV style continuous trainer monitoring (OnProcess)
TrainerManager.continuousTrainerCheck = function() {
    if (TrainerManager.config.blockTrainersInRestrictedModes && typeof game !== 'undefined') {
        // Only run continuous checks in GTA IV
        if (typeof gta !== 'undefined') {
            // BetterIV method: Check for and terminate trainer scripts every frame
            const blockedScripts = TrainerManager.state.blockedScripts || [];
            
            blockedScripts.forEach((scriptName) => {
                try {
                    game.terminateScript(scriptName);
                } catch (e) {
                    // Script might not exist, continue
                }
            });
        }
    }
};

// Update trainers CVAR based on current state
TrainerManager.updateTrainersCvar = function() {
    const shouldEnable = TrainerManager.shouldEnableTrainers();
    const targetValue = shouldEnable ? "1" : "0";
    
    const currentCvar = TrainerManager.getTrainersCvar();
    
    // Only update if value needs to change
    if (currentCvar !== targetValue) {
        TrainerManager.log("Updating trainers CVAR from " + currentCvar + " to " + targetValue);
        TrainerManager.setTrainersCvar(targetValue);
        TrainerManager.state.lastCvarValue = targetValue;
        
        // Notify player of change (if localPlayer exists)
        if (globalThis.localPlayer && typeof chat !== 'undefined') {
            const message = shouldEnable ? 
                "Trainers enabled for this gamemode" : 
                "Trainers disabled for this gamemode";
            chat(localPlayer, "[TrainerManager] " + message, shouldEnable ? [100, 255, 100] : [255, 100, 100]);
        }
    }
};

// Main update loop
TrainerManager.update = function() {
    // Update admin status periodically (in case it changes)
    TrainerManager.checkAdminStatus();
    
    // Update current gamemode tracking
    const newGamemode = TrainerManager.getCurrentGamemode();
    if (newGamemode !== TrainerManager.state.currentGamemode) {
        TrainerManager.log("Gamemode changed from " + TrainerManager.state.currentGamemode + " to " + newGamemode);
        TrainerManager.state.currentGamemode = newGamemode;
    }
    
    // Update trainers CVAR based on current state
    TrainerManager.updateTrainersCvar();
    
    // v-admin inspired trainer blocking
    if (TrainerManager.config.blockTrainersInRestrictedModes) {
        TrainerManager.updateTrainerBlocking();
    }
    
    // GTA Connected anticheat integration
    if (TrainerManager.config.enableAnticheatIntegration) {
        TrainerManager.checkAnticheatViolation();
        TrainerManager.checkFileIntegrity();
    }
    
    // Jobs RP integration
    if (TrainerManager.config.enableJobsRPIntegration) {
        TrainerManager.checkJobsRPState();
    }
};

// Initialize trainer manager
TrainerManager.initialize = function() {
    TrainerManager.log("Initializing Trainer Manager");
    
    // Check initial state
    TrainerManager.checkAdminStatus();
    TrainerManager.state.currentGamemode = TrainerManager.getCurrentGamemode();
    
    // Set initial CVAR value
    TrainerManager.updateTrainersCvar();
    
    // Initialize Jobs RP integration
    TrainerManager.initJobsRPIntegration();
    
    // Start update loop
    if (typeof setInterval !== 'undefined') {
        TrainerManager.updateInterval = setInterval(TrainerManager.update, TrainerManager.config.checkInterval);
        TrainerManager.log("Update interval started: " + TrainerManager.config.checkInterval + "ms");
    }
    
    TrainerManager.state.initialized = true;
    TrainerManager.log("Trainer Manager initialized successfully");
};

// Cleanup function
TrainerManager.cleanup = function() {
    if (TrainerManager.updateInterval) {
        clearInterval(TrainerManager.updateInterval);
        TrainerManager.updateInterval = null;
        TrainerManager.log("Update interval cleared");
    }
    TrainerManager.state.initialized = false;
};

// Event handlers for gamemode changes (BetterIV approach)
if (typeof addEventHandler !== 'undefined') {
    // Reference: gtac_patterns.md - Use proper event handling
    addEventHandler("gameModeChange", function(event, newGamemode) {
        TrainerManager.log("Game mode change event: " + newGamemode);
        TrainerManager.state.currentGamemode = newGamemode;
        TrainerManager.updateTrainersCvar();
        TrainerManager.updateTrainerBlocking();
    });
    
    addEventHandler("playerAuth", function(event, player) {
        TrainerManager.log("Player auth event for: " + (player.name || "Unknown"));
        if (player === globalThis.localPlayer) {
            TrainerManager.checkAdminStatus();
            TrainerManager.updateTrainersCvar();
            TrainerManager.updateTrainerBlocking();
        }
    });
    
    // BetterIV style: Continuous trainer monitoring
    addEventHandler("OnProcess", function(event, deltaTime) {
        TrainerManager.continuousTrainerCheck();
    });
    
    // BetterIV style: Handle script requests from server
    if (typeof addNetworkHandler !== 'undefined') {
        addNetworkHandler("receiveBlockedScripts", function(scripts) {
            TrainerManager.state.blockedScripts = scripts;
            TrainerManager.log("Received blocked scripts list from server: " + JSON.stringify(scripts));
        });
        
        // Request current script list from server
        if (typeof triggerNetworkEvent !== 'undefined') {
            triggerNetworkEvent("requestGameScripts");
        }
    }
}

// Auto-initialize when script loads
if (typeof localPlayer !== 'undefined') {
    // Wait for localPlayer to be ready
    if (localPlayer) {
        TrainerManager.initialize();
    } else {
        // Reference: gtac_patterns.md - Use setTimeout for initialization delays
        setTimeout(TrainerManager.initialize, 1000);
    }
} else {
    TrainerManager.log("localPlayer not available, deferring initialization");
    // Fallback: try initialization after a delay
    setTimeout(function() {
        if (typeof localPlayer !== 'undefined' && localPlayer) {
            TrainerManager.initialize();
        }
    }, 2000);
}

// Export for external access
globalThis.TrainerManager = TrainerManager;
