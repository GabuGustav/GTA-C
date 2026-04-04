"use strict";

var JobsClient = JobsClient || {};

JobsClient.profile = JobsClient.profile || null;
JobsClient.session = JobsClient.session || null;
JobsClient.authState = JobsClient.authState || {
    authenticated: false,
    authRequired: (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.auth_required) === true
};
JobsClient.lastAuthResult = JobsClient.lastAuthResult || null;
JobsClient.wasAuthenticated = JobsClient.wasAuthenticated || false;
JobsClient.diagnosticsShown = JobsClient.diagnosticsShown || false;
JobsClient.commandsRegistered = JobsClient.commandsRegistered || false;
JobsClient.diagSentAt = JobsClient.diagSentAt || 0;

function unwrapArgs(a, b, c) {
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        return [b, c];
    }
    return [a, b];
}

function unwrapArgs3(a, b, c, d) {
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        return [b, c, d];
    }
    return [a, b, c];
}

function unwrapArgs6(a, b, c, d, e, f, g) {
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        return [b, c, d, e, f, g];
    }
    return [a, b, c, d, e, f];
}

function isAuthenticated() {
    return JobsClient.authState && JobsClient.authState.authenticated === true;
}

JobsClient.isAuthenticated = isAuthenticated;

JobsClient.sendServer = function(eventName) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    try {
        if (typeof triggerNetworkEvent === "function") {
            triggerNetworkEvent.apply(null, [eventName].concat(args));
            return true;
        }
    } catch (e) {
    }

    try {
        if (typeof triggerServerEvent === "function") {
            triggerServerEvent.apply(null, [eventName, localPlayer].concat(args));
            return true;
        }
    } catch (e2) {
    }

    return false;
};

function bindInteractKey() {
    if (typeof bindKey !== "function") {
        return false;
    }

    function onInteractKey() {
        if (JobsClient.Zones) {
            JobsClient.Zones.handleInteractKey();
        }
    }

    var attempts = [
        ["e", "down"],
        [69, "down"],
        [0x45, "down"],
        ["E", "down"]
    ];

    for (var i = 0; i < attempts.length; i++) {
        var keyTry = attempts[i];
        try {
            bindKey(keyTry[0], keyTry[1], onInteractKey);
            return true;
        } catch (e) {
        }
    }

    return false;
}

function checkInteractKeyCapability() {
    var hasBindKey = (typeof bindKey === "function");
    var hasOnKeyDown = (typeof OnKeyDown === "function");
    
    // Try to bind E key to test capability
    var canBindE = false;
    if (hasBindKey) {
        try {
            bindKey("e", "down", function() { 
                canBindE = true; 
            });
            // If we get here, binding worked
            canBindE = true;
        } catch (e) {
            canBindE = false;
        }
    }
    
    return {
        hasBindKey: hasBindKey,
        hasOnKeyDown: hasOnKeyDown,
        canBindE: canBindE,
        interactAvailable: canBindE || hasOnKeyDown
    };
}

function syncGameplayAfterAuth() {
    JobsClient.sendServer("jobs.requestStatus");
    JobsClient.sendServer("jobs.requestList");
}

addNetworkHandler("jobs.authState", function(a, b) {
    var state = unwrapArgs(a, b)[0];
    if (!state || typeof state !== "object") {
        state = {
            authenticated: false,
            authRequired: (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.auth_required) === true
        };
    }

    var wasAuthenticated = isAuthenticated();
    JobsClient.authState = state;

    if (JobsClient.AuthUI && typeof JobsClient.AuthUI.handleAuthState === "function") {
        JobsClient.AuthUI.handleAuthState(state);
    }

    var nowAuthenticated = isAuthenticated();
    if (nowAuthenticated && !wasAuthenticated) {
        syncGameplayAfterAuth();
        if (JobsClient.Zones && typeof JobsClient.Zones.testBlipAtPlayer === "function") {
            JobsClient.Zones.testBlipAtPlayer();
        }
    }

    JobsClient.wasAuthenticated = nowAuthenticated;
});

addNetworkHandler("jobs.authResult", function(a, b, c, d) {
    var parts = unwrapArgs3(a, b, c, d);
    var ok = parts[0];
    var code = parts[1];
    var message = parts[2];

    var okFlag = (ok === true);
    var codeText = String(code || "");

    JobsClient.lastAuthResult = {
        ok: okFlag,
        code: codeText,
        message: String(message || "")
    };

    if (okFlag && (codeText === "registered" || codeText === "logged_in" || codeText === "already_logged_in")) {
        JobsClient.authState = JobsClient.authState || {};
        JobsClient.authState.authenticated = true;
        JobsClient.authState.authRequired = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.auth_required) === true;
    } else if (okFlag && codeText === "logged_out") {
        JobsClient.authState = JobsClient.authState || {};
        JobsClient.authState.authenticated = false;
    }

    if (JobsClient.AuthUI && typeof JobsClient.AuthUI.handleAuthResult === "function") {
        JobsClient.AuthUI.handleAuthResult(okFlag, codeText, message);
    }

    if (JobsClient.UI && message && message !== "") {
        var level = okFlag ? "success" : "warn";
        JobsClient.UI.showPrompt("Auth: " + String(message), level, true);
    }
});

addNetworkHandler("jobs.authTokenIssued", function(a, b, c) {
    var accountId = a;
    var token = b;
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        accountId = b;
        token = c;
    }

    if (JobsClient.AuthUI && typeof JobsClient.AuthUI.handleTokenIssued === "function") {
        JobsClient.AuthUI.handleTokenIssued(accountId, token);
    }

    if (JobsClient.UI && accountId && token) {
        JobsClient.UI.showPrompt("Token issued for " + String(accountId) + ". Check auth panel.", "success", true);
    }
});

addNetworkHandler("jobs.syncProfile", function(a, b) {
    var profile = unwrapArgs(a, b)[0];
    if (!profile || typeof profile !== "object") {
        profile = null;
    }
    
    // Add player name from GTAC API if not present in profile
    if (profile && !profile.name && typeof player !== "undefined" && typeof player.name === "function") {
        try {
            var playerName = player.name();
            if (playerName && playerName !== "") {
                profile.name = playerName;
                console.log("[JobsClient] Added player name to profile: " + playerName);
            }
        } catch (e) {
            console.log("[JobsClient] Error getting player name: " + String(e));
        }
    }
    
    JobsClient.profile = profile;
    if (JobsClient.UI && typeof JobsClient.UI.setProfile === "function") {
        JobsClient.UI.setProfile(profile);
    }
    if (JobsClient.Zones) {
        JobsClient.Zones.refreshHubBlips();
    }
});

addNetworkHandler("jobs.syncSession", function(a, b) {
    var session = unwrapArgs(a, b)[0];
    if (!session || typeof session !== "object") {
        session = null;
    }
    JobsClient.session = session;

    if (!JobsClient.Zones) {
        return;
    }

    if (!session) {
        JobsClient.Zones.clearRoute();
        if (typeof JobsClient.Zones.refreshProps === "function") {
            JobsClient.Zones.refreshProps();
        }
        return;
    }

    if (session.target) {
        JobsClient.Zones.setRoute(session.jobId, [session.target]);
    }
    if (typeof JobsClient.Zones.refreshProps === "function") {
        JobsClient.Zones.refreshProps();
    }
});

addNetworkHandler("jobs.showPrompt", function(a, b, c) {
    var message = a;
    var level = b;
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        message = b;
        level = c;
    }
    if (JobsClient.UI) {
        JobsClient.UI.showPrompt(message, level, true);
    }
});

addNetworkHandler("jobs.showRoute", function(a, b, c) {
    var jobId = a;
    var routePoints = b;
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        jobId = b;
        routePoints = c;
    }
    if (JobsClient.Zones) {
        JobsClient.Zones.setRoute(jobId, routePoints);
    }
});

addNetworkHandler("jobs.clearRoute", function() {
    if (JobsClient.Zones) {
        JobsClient.Zones.clearRoute();
    }
});

addNetworkHandler("jobs.walletUpdate", function(a, b, c, d) {
    var cash = a;
    var delta = b;
    var reason = c;
    if (typeof a === "object" && a !== null && typeof a.getPosition === "function") {
        cash = b;
        delta = c;
        reason = d;
    }
    if (JobsClient.UI) {
        JobsClient.UI.showWallet(cash, delta, reason);
    }
});

addNetworkHandler("jobs.jobReward", function(_, jobId, xpGain, xpTotal, gradeBefore, gradeAfter, payoutGranted) {
    var jobId = jobId;
    var xpGain = Number(xpGain) || 0;
    var xpTotal = Number(xpTotal) || 0;
    var gradeBefore = gradeBefore;
    var gradeAfter = gradeAfter;
    var payoutGranted = payoutGranted;
    if (JobsClient.UI && typeof JobsClient.UI.handleJobReward === "function") {
        JobsClient.UI.handleJobReward(jobId, xpGain, xpTotal, gradeBefore, gradeAfter, payoutGranted);
    }
});

addNetworkHandler("jobs.syncHubElements", function(hubElements) {
    try {
        console.log("[jobs_rp] Received hub elements sync: " + JSON.stringify(hubElements));
        console.log("[jobs_rp] HubElements type: " + typeof hubElements + ", value: " + JSON.stringify(hubElements));
        if (typeof JobsClient.Zones !== "undefined" && JobsClient.Zones.updateHubElements) {
            JobsClient.Zones.updateHubElements(hubElements);
        } else {
            console.log("[jobs_rp] JobsClient.Zones not available for hub update");
        }
    } catch (e) {
        console.log("[jobs_rp] Error handling hub elements sync: " + String(e));
    }
});

addEventHandler("onResourceStart", function() {
    // Initialize PoliceMenu
    if (typeof PoliceMenu !== "undefined" && PoliceMenu) {
        JobsClient.PoliceMenu = PoliceMenu;
    }

    // Request hub elements from server
    if (typeof JobsClient.Zones !== "undefined" && JobsClient.Zones.requestHubElements) {
        setTimeout(function() {
            JobsClient.Zones.requestHubElements();
        }, 2000); // Delay 2 seconds to ensure connection
    }

    if (!JobsClient.commandsRegistered && typeof addCommandHandler === "function") {
        JobsClient.commandsRegistered = true;
        addCommandHandler("jobstatue", function(_, x, y, z) {
            var coords = null;
            if (x !== undefined && y !== undefined && z !== undefined) {
                coords = [Number(x), Number(y), Number(z)];
                if (JobsClient.UI) {
                    JobsClient.UI.showPrompt("Statue blip args: " + String(x) + " " + String(y) + " " + String(z), "info", true);
                }
            } else if (typeof localPlayer !== "undefined" && localPlayer) {
                try {
                    if (typeof localPlayer.getPosition === "function") {
                        var pos = localPlayer.getPosition();
                        coords = pos && pos.length >= 3 ? [pos[0], pos[1], pos[2]] : null;
                    }
                } catch (e1) {
                }
            }

            if (!coords || isNaN(coords[0]) || isNaN(coords[1]) || isNaN(coords[2])) {
                if (JobsClient.UI) {
                    JobsClient.UI.showPrompt("Statue blip: missing coords. Use /jobstatue x y z", "warn", true);
                }
                return;
            }

            if (JobsClient.Zones && typeof JobsClient.Zones.createPoliceBlipAt === "function") {
                var blip = JobsClient.Zones.createPoliceBlipAt(coords, "Statue Blip");
                if (blip && JobsClient.UI) {
                    JobsClient.UI.showPrompt("Statue blip created at: " + coords.join(", "), "success", true);
                } else if (JobsClient.UI) {
                    JobsClient.UI.showPrompt("Statue blip failed (API unavailable).", "warn", true);
                }
            }
        });

        addCommandHandler("jobbliptest", function() {
            if (JobsClient.Zones && typeof JobsClient.Zones.forceTestBlipAtPlayer === "function") {
                JobsClient.Zones.forceTestBlipAtPlayer();
            } else if (JobsClient.Zones && typeof JobsClient.Zones.testBlipAtPlayer === "function") {
                JobsClient.Zones.testBlipAtPlayer();
            }
        });

        addCommandHandler("jobhubtest", function() {
            if (JobsClient.Zones && typeof JobsClient.Zones.refreshHubBlips === "function") {
                JobsClient.Zones.refreshHubBlips();
                if (JobsClient.UI) {
                    JobsClient.UI.showPrompt("Hub blips refreshed - they should now be always visible on map", "info", true);
                }
            }
        });

        addCommandHandler("jobblipinfo", function() {
            if (JobsClient.Zones) {
                var info = "Blip Status:\n";
                info += "Hub blips: " + JobsClient.Zones.hubBlips.length + "\n";
                info += "Route blips: " + JobsClient.Zones.routeBlips.length + "\n";
                info += "Use native blips: " + (JobsClient.Zones.useNativeBlips ? "yes" : "no") + "\n";
                info += "Interact available: " + (JobsClient.Zones.interactAvailable !== false ? "yes" : "no") + "\n";
                
                // Test native blip APIs (NOT gta.createBlip - developers said to use natives only)
                var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
                var hasNativeBlip = (
                    (globalEnv.natives && typeof globalEnv.natives.addBlipForCoord === "function") ||
                    (globalEnv.Native && typeof globalEnv.Native.addBlipForCoord === "function") ||
                    (globalEnv.gta && globalEnv.gta.natives && typeof globalEnv.gta.natives.addBlipForCoord === "function")
                );
                info += "Native blip API available: " + (hasNativeBlip ? "yes" : "no");
                
                if (JobsClient.UI) {
                    JobsClient.UI.showPrompt(info, "info", true);
                }
            }
        });

        addCommandHandler("jobgtaapi", function() {
            var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
            var info = "GTA Connected API Status:\n";
            
            // Check ALL blip creation methods
            info += "gta.createBlip: " + (globalEnv.gta && typeof globalEnv.gta.createBlip === "function" ? "yes" : "no") + "\n";
            info += "gta.createMarker: " + (globalEnv.gta && typeof globalEnv.gta.createMarker === "function" ? "yes" : "no") + "\n";
            
            // Check ALL native blip creation functions
            var blipFunctions = [
                "addBlipForCoord",
                "addBlipForRadius", 
                "addBlipForContact",
                "addBlipForChar",
                "addBlipForCar"
            ];
            
            for (var i = 0; i < blipFunctions.length; i++) {
                var funcName = blipFunctions[i];
                var available = false;
                
                // Check all native sources
                var sources = [
                    { name: "natives", obj: globalEnv.natives },
                    { name: "Native", obj: globalEnv.Native },
                    { name: "gta.natives", obj: globalEnv.gta && globalEnv.gta.natives },
                    { name: "game.natives", obj: globalEnv.game && globalEnv.game.natives },
                    { name: "world.natives", obj: globalEnv.world && globalEnv.world.natives }
                ];
                
                for (var j = 0; j < sources.length; j++) {
                    var source = sources[j];
                    if (source.obj && typeof source.obj[funcName] === "function") {
                        available = true;
                        break;
                    }
                }
                
                info += funcName + ": " + (available ? "yes" : "no") + "\n";
            }
            
            // Check input APIs
            info += "bindKey: " + (typeof bindKey === "function" ? "yes" : "no") + "\n";
            info += "OnKeyDown: " + (typeof OnKeyDown === "function" ? "yes" : "no") + "\n";
            
            if (JobsClient.UI) {
                JobsClient.UI.showPrompt(info, "info", true);
            }
        });

        addCommandHandler("policemenu", function() {
            console.log("[DEBUG] /policemenu command executed");
            if (JobsClient.PoliceMenu && typeof JobsClient.PoliceMenu.toggle === "function") {
                console.log("[DEBUG] Calling PoliceMenu.toggle() via command");
                JobsClient.PoliceMenu.toggle();
            } else {
                console.log("[DEBUG] PoliceMenu not available: " + typeof JobsClient.PoliceMenu);
                if (JobsClient.UI) {
                    JobsClient.UI.showPrompt("Police menu not available.", "error", true);
                }
            }
        });

        addCommandHandler("debugmenu", function() {
            console.log("[DEBUG] Debug menu command - checking PoliceMenu availability");
            console.log("[DEBUG] typeof PoliceMenu: " + typeof PoliceMenu);
            console.log("[DEBUG] typeof JobsClient.PoliceMenu: " + typeof JobsClient.PoliceMenu);
            console.log("[DEBUG] typeof globalThis.PoliceMenu: " + (typeof globalThis !== "undefined" ? typeof globalThis.PoliceMenu : "globalThis undefined"));
            
            if (typeof PoliceMenu !== "undefined" && PoliceMenu && typeof PoliceMenu.show === "function") {
                console.log("[DEBUG] Forcing PoliceMenu.show() - bypassing job check");
                // Temporarily set police job for testing
                var originalJob = JobsClient.profile ? JobsClient.profile.currentJobId : null;
                if (JobsClient.profile) {
                    JobsClient.profile.currentJobId = "police";
                }
                PoliceMenu.show();
                // Restore original job after 100ms
                setTimeout(function() {
                    if (JobsClient.profile && originalJob) {
                        JobsClient.profile.currentJobId = originalJob;
                    }
                }, 100);
            } else if (typeof JobsClient.PoliceMenu !== "undefined" && JobsClient.PoliceMenu && typeof JobsClient.PoliceMenu.show === "function") {
                console.log("[DEBUG] Using JobsClient.PoliceMenu instead");
                var originalJob = JobsClient.profile ? JobsClient.profile.currentJobId : null;
                if (JobsClient.profile) {
                    JobsClient.profile.currentJobId = "police";
                }
                JobsClient.PoliceMenu.show();
                setTimeout(function() {
                    if (JobsClient.profile && originalJob) {
                        JobsClient.profile.currentJobId = originalJob;
                    }
                }, 100);
            } else {
                console.log("[DEBUG] No PoliceMenu available for testing");
            }
        });

        addCommandHandler("testmenu", function() {
            console.log("[TEST] Simple menu test");
            try {
                if (typeof PoliceMenu !== "undefined") {
                    console.log("[TEST] PoliceMenu exists, type: " + typeof PoliceMenu);
                    if (typeof PoliceMenu.toggle === "function") {
                        console.log("[TEST] Calling PoliceMenu.toggle()");
                        PoliceMenu.toggle();
                    } else {
                        console.log("[TEST] PoliceMenu.toggle is not a function");
                    }
                } else {
                    console.log("[TEST] PoliceMenu is undefined");
                }
            } catch (e) {
                console.log("[TEST] Error: " + String(e));
            }
        });

        addCommandHandler("testpatrol", function() {
            console.log("[TEST] Manual patrol check trigger");
            try {
                if (typeof Zones !== "undefined" && Zones.policePatrolCheck) {
                    Zones.policePatrolCheck();
                } else {
                    console.log("[TEST] Zones.policePatrolCheck not available");
                }
            } catch (e) {
                console.log("[TEST] Error in patrol check: " + String(e));
            }
        });

        addCommandHandler("requesthub", function() {
            console.log("[TEST] Manual hub data request");
            try {
                if (typeof Zones !== "undefined" && Zones.requestHubData) {
                    Zones.requestHubData();
                } else {
                    console.log("[TEST] Zones.requestHubData not available");
                }
            } catch (e) {
                console.log("[TEST] Error requesting hub data: " + String(e));
            }
        });

        addCommandHandler("testprofile", function() {
            console.log("[TEST] Profile structure test");
            try {
                console.log("[TEST] JobsClient.profile: " + JSON.stringify(JobsClient.profile));
                console.log("[TEST] JobsClient.profile.name: " + (JobsClient.profile ? JobsClient.profile.name : "undefined"));
                console.log("[TEST] JobsClient.profile.jobs: " + JSON.stringify(JobsClient.profile ? JobsClient.profile.jobs : "null"));
                
                // Test manual update
                if (typeof PoliceMenu !== "undefined" && PoliceMenu && typeof PoliceMenu.updatePlayerInfo === "function") {
                    console.log("[TEST] Calling PoliceMenu.updatePlayerInfo()");
                    PoliceMenu.updatePlayerInfo();
                } else {
                    console.log("[TEST] PoliceMenu.updatePlayerInfo not available");
                }
            } catch (e) {
                console.log("[TEST] Error testing profile: " + String(e));
            }
        });
    }

    if (!JobsClient.diagnosticsShown) {
        JobsClient.diagnosticsShown = true;
        var hasBindKey = (typeof bindKey === "function");
        var msg = "Client input API: bindKey=" + (hasBindKey ? "yes" : "no");
        if (JobsClient.UI) {
            JobsClient.UI.showPrompt(msg, hasBindKey ? "info" : "warn", true);
        }
    }
    
    // Initialize callout system
    if (typeof Callouts !== "undefined" && Callouts.Manager) {
        setTimeout(function() {
            Callouts.Manager.init();
        }, 3000);
    }
    
    // Initialize world events system
    if (typeof WorldEvents !== "undefined" && WorldEvents.Manager) {
        setTimeout(function() {
            WorldEvents.Manager.init();
        }, 4000);
    }
    
    // Initialize backup system
    if (typeof BackupSystem !== "undefined" && BackupSystem.Manager) {
        setTimeout(function() {
            BackupSystem.Manager.init();
        }, 5000);
    }
    
    // Initialize callout UI
    if (typeof CalloutUI !== "undefined" && CalloutUI.Manager) {
        setTimeout(function() {
            CalloutUI.Manager.init();
        }, 6000);
    }

    if (JobsClient.AuthUI && typeof JobsClient.AuthUI.start === "function") {
        JobsClient.AuthUI.start();
    }

    if (JobsClient.Zones) {
        JobsClient.Zones.start();
    }

    var bound = bindInteractKey();
    if (!bound && JobsClient.UI) {
        JobsClient.UI.showPrompt("Interact key is unavailable in this client build. Use /job commands.", "info", true);
    }

    var okAuth = JobsClient.sendServer("jobs.authRequestState");
    if (!okAuth && JobsClient.UI) {
        JobsClient.UI.showPrompt("Auth event API unavailable on client.", "error", true);
        return;
    }

    if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.auth_required !== true) {
        syncGameplayAfterAuth();
    }
});

addNetworkHandler("jobs.diagRequest", function() {
    var now = Date && Date.now ? Date.now() : 0;
    if (JobsClient.diagSentAt && (now - JobsClient.diagSentAt) < 2000) {
        return;
    }
    JobsClient.diagSentAt = now;

    var globalEnv = typeof _G !== "undefined" ? _G : (typeof globalThis !== "undefined" ? globalThis : {});
    var diag = [
        "bindKey=" + (typeof bindKey === "function" ? "yes" : "no"),
        "addCommandHandler=" + (typeof addCommandHandler === "function" ? "yes" : "no"),
        "gta.createBlip=" + ((globalEnv.gta && typeof globalEnv.gta.createBlip === "function") ? "yes" : "no"),
        "createBlip=" + (typeof globalEnv.createBlip === "function" ? "yes" : "no"),
        "addBlip=" + (typeof globalEnv.addBlip === "function" ? "yes" : "no"),
        "addBlipForCoord=" + (typeof globalEnv.addBlipForCoord === "function" ? "yes" : "no"),
        "createMapBlip=" + (typeof globalEnv.createMapBlip === "function" ? "yes" : "no")
    ].join(" ");

    try {
        if (typeof triggerNetworkEvent === "function") {
            triggerNetworkEvent("jobs.clientDiag", "client.diag", diag);
            return;
        }
    } catch (e1) {
    }

    try {
        if (typeof triggerServerEvent === "function") {
            triggerServerEvent("jobs.clientDiag", localPlayer, "client.diag", diag);
        }
    } catch (e2) {
    }
});

// Frame loop for hub proximity checking
var hubCheckInterval = null;
var lastHubCheck = 0;

function startHubProximityCheck() {
    if (hubCheckInterval) {
        clearInterval(hubCheckInterval);
    }
    
    hubCheckInterval = setInterval(function() {
        if (typeof JobsClient.Zones !== "undefined" && JobsClient.Zones.checkHubProximity) {
            var now = Date.now();
            if (now - lastHubCheck >= 500) { // Check every 500ms
                JobsClient.Zones.checkHubProximity();
                lastHubCheck = now;
            }
        }
    }, 100);
}

function stopHubProximityCheck() {
    if (hubCheckInterval) {
        clearInterval(hubCheckInterval);
        hubCheckInterval = null;
    }
}

// Start proximity checking after a short delay
setTimeout(function() {
    startHubProximityCheck();
}, 3000);

// Handle player death client-side
addEventHandler("OnPedWasted", function(event) {
    console.log("[Client] Player died - requesting server respawn");
    
    // Tell server to respawn us (no arguments needed)
    triggerNetworkEvent("requestRespawn");
});

// Health-based death detection (backup method)
var playerLastHealth = 100; // Separate variable to track health
var healthMonitorTimer = null;

// Robust player initialization and health monitoring
function startHealthMonitoring() {
    if (healthMonitorTimer && typeof clearInterval === "function") {
        clearInterval(healthMonitorTimer);
    }
    healthMonitorTimer = setInterval(function() {
        if (typeof localPlayer !== "undefined" && localPlayer.health) {
            if (localPlayer.health <= 0 && playerLastHealth > 0) {
                console.log("[Client] Health-based death detected - requesting respawn");
                triggerNetworkEvent("requestRespawn");
            }
            playerLastHealth = localPlayer.health;
        }
    }, 500);
}

// Wait for player to be available, then start monitoring
setTimeout(function() {
    if (typeof localPlayer !== "undefined") {
        console.log("[Client] Player available - starting health monitoring");
        startHealthMonitoring();
    } else {
        console.log("[Client] Player not available - retrying in 1 second");
        setTimeout(startHealthMonitoring, 1000);
    }
}, 1000); // Initial check after 1 second

// Add respawn command for manual testing
if (typeof addCommandHandler === "function") {
    addCommandHandler("respawn", function() {
        console.log("[Client] Manual respawn requested");
        triggerNetworkEvent("requestRespawn");
    });
    
    addCommandHandler("kill", function() {
        console.log("[Client] Suicide command");
        if (typeof localPlayer !== "undefined" && localPlayer.health) {
            // Set health to a very low value to ensure death
            localPlayer.health = -100;
            console.log("[Client] Health set to -100 to ensure death");
        }
    });
    
    // Debug respawn command
    addCommandHandler("debug_respawn", function() {
        console.log("[Debug] Forcing respawn test");
        triggerNetworkEvent("requestRespawn");
    });
}

addEventHandler("onResourceStop", function() {
    if (healthMonitorTimer && typeof clearInterval === "function") {
        clearInterval(healthMonitorTimer);
        healthMonitorTimer = null;
    }
    stopHubProximityCheck();
    
    if (JobsClient.AuthUI && typeof JobsClient.AuthUI.stop === "function") {
        JobsClient.AuthUI.stop();
    }
    
    if (JobsClient.UI && typeof JobsClient.UI.stopHud === "function") {
        JobsClient.UI.stopHud();
    }
    
    if (JobsClient.Zones) {
        JobsClient.Zones.stop();
    }
    
    if (JobsClient.PoliceMenu && typeof JobsClient.PoliceMenu.hide === "function") {
        JobsClient.PoliceMenu.hide();
    }
});
