"use strict";

function debugLog() {
    var enabled = false;
    try {
        enabled = (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config && JobsRP.Config.debug === true);
    } catch (e) {
        enabled = false;
    }
    if (!enabled) {
        return;
    }
    if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log.apply(console, arguments);
    }
}

debugLog("[Phone] Script loading...");

// Load shared utilities
if (typeof require !== "undefined") {
    try {
        require("shared_utils.js");
    } catch (e) {
        debugLog("[Phone] Could not load shared utilities: " + String(e));
    }
}

var JobsClient = JobsClient || {};
JobsClient.Phone = JobsClient.Phone || {};

var Phone = JobsClient.Phone;
var Utils = JobsClient.Utils || {};

Phone.config = {
    width: 320,
    height: 520, // Screen height (content area)
    padding: 16,
    headerHeight: 48,
    buttonHeight: 56,
    buttonSpacing: 12,
    gridGap: 14,
    messageCharLimit: 160,
    messageHistoryLimit: 50,
    // Phone frame styling
    frameWidth: 340,
    frameHeight: 640, // Extra space for home button area
    framePadding: 10,
    topBarHeight: 25, // Space for speaker/camera
    bottomBarHeight: 70, // Space for home button
    cornerRadius: 30, // Rounded corners for phone look
    bezelColour: toColour(40, 40, 45, 255), // Phone bezel color
    screenCornerRadius: 8 // Rounded screen corners
};

Phone.active = false;
Phone.window = null;
Phone.controls = {};
Phone.currentApp = "home";
Phone.textState = {
    currentPanel: "playerList", // playerList, messageCompose, conversation
    selectedPlayer: null,
    conversations: {},
    currentConversation: null,
    messageInput: "",
    isTyping: false,
    playerList: [],
    serverPlayerList: null
};

function getConversationName(playerId) {
    if (Phone.textState.selectedPlayer && String(Phone.textState.selectedPlayer.id) === String(playerId)) {
        return Phone.textState.selectedPlayer.name || "Unknown";
    }
    var players = Phone.textState.playerList || [];
    for (var i = 0; i < players.length; i++) {
        if (String(players[i].id) === String(playerId)) {
            return players[i].name || "Unknown";
        }
    }
    return "Unknown";
}

function getJobsRpUi() {
    return Utils.getJobsRpUi();
}

function getScreenSize() {
    return Utils.getScreenSize();
}

function makeStyles() {
    return {
        window: {
            main: {
                backgroundColour: toColour(18, 22, 32, 235),
                borderColour: toColour(60, 70, 95, 255),
                borderSize: 2
            }
        },
        header: {
            main: {
                backgroundColour: toColour(26, 32, 48, 255)
            }
        },
        titleText: {
            main: {
                textColour: toColour(230, 235, 255, 255),
                textIndent: 0
            }
        },
        subText: {
            main: {
                textColour: toColour(160, 170, 195, 255),
                textIndent: 0
            }
        },
        button: {
            main: {
                backgroundColour: toColour(40, 50, 70, 230),
                textColour: toColour(240, 240, 255, 255),
                borderColour: toColour(70, 85, 110, 255),
                borderSize: 1
            },
            hover: {
                backgroundColour: toColour(55, 70, 100, 240),
                textColour: toColour(255, 255, 255, 255),
                borderColour: toColour(110, 130, 160, 255)
            },
            active: {
                backgroundColour: toColour(70, 90, 130, 240),
                textColour: toColour(255, 255, 255, 255),
                borderColour: toColour(140, 170, 210, 255)
            }
        },
        accentButton: {
            main: {
                backgroundColour: toColour(68, 94, 220, 230),
                textColour: toColour(255, 255, 255, 255),
                borderColour: toColour(120, 150, 255, 255),
                borderSize: 1
            },
            hover: {
                backgroundColour: toColour(88, 118, 240, 240),
                textColour: toColour(255, 255, 255, 255),
                borderColour: toColour(160, 185, 255, 255)
            }
        }
    };
}

Phone.windowCreating = false;

function ensureWindow() {
    // Check if we have both frame and window (new structure)
    if (Phone.window && Phone.frame) {
        return true;
    }
    
    // If we only have old window without frame, cleanup and recreate
    if (Phone.window && !Phone.frame) {
        debugLog("[Phone] Old window structure detected, cleaning up and recreating");
        if (Phone.window.shown !== undefined) {
            Phone.window.shown = false;
        }
        Phone.window = null;
    }
    
    // Prevent race condition
    if (Phone.windowCreating) {
        debugLog("[Phone] Window creation already in progress");
        return false;
    }
    
    Phone.windowCreating = true;
    
    try {
        var ui = getJobsRpUi();
        if (!ui) {
            debugLog("[Phone] UI framework not available");
            return false;
        }

        var screen = getScreenSize();
        var x = Math.floor(screen.width - Phone.config.frameWidth - 30);
        var y = Math.floor((screen.height - Phone.config.frameHeight) / 2);

        var styles = makeStyles();
        // Create phone frame (the outer bezel) - positioned on screen
        Phone.frame = ui.window(x, y, Phone.config.frameWidth, Phone.config.frameHeight, "Phone", {
            main: {
                backgroundColour: Phone.config.bezelColour,
                borderColour: toColour(60, 60, 65, 255),
                borderSize: 1
            }
        });
        Phone.frame.titleBarShown = false;
        Phone.frame.shown = false;

        // Create inner screen window - at SAME screen position as frame, offset by top bar
        var screenX = x + Phone.config.framePadding;
        var screenY = y + Phone.config.topBarHeight; // Start after top speaker/camera area
        var win = ui.window(screenX, screenY, Phone.config.width, Phone.config.height, "Phone", styles.window);
        win.titleBarShown = false;
        win.shown = false;

        Phone.window = win;
        Phone.controls = {};
        Phone.controls.styles = styles;

        // Ensure screen window is on top of frame (z-order)
        if (Phone.window.setTop) {
            Phone.window.setTop();
        }

        // Build phone frame elements (home button, speaker, etc.)
        buildPhoneFrame();
        
        // Start visibility watchdog to prevent mexui from hiding phone on outside click
        startVisibilityWatchdog();

        buildHeader();
        debugLog("[Phone] Header built");
        buildHome();
        debugLog("[Phone] Home built");
        buildJobs();
        debugLog("[Phone] Jobs built");
        buildText();
        debugLog("[Phone] Text built");
        // Don't call buildPlaceholder for text app since it's now fully implemented
        // buildPlaceholder("cars", "Cars");
        // buildPlaceholder("bank", "Bank");
        debugLog("[Phone] All apps built");

        showApp("home");
        debugLog("[Phone] Phone setup complete, showing home");
        return true;
    } catch (e) {
        debugLog("[Phone] Error creating window: " + String(e));
        return false;
    } finally {
        Phone.windowCreating = false;
    }
}

function buildHeader() {
    var styles = Phone.controls.styles;
    var pad = Phone.config.padding;
    var header = Phone.window.rectangle(0, 0, Phone.config.width, Phone.config.headerHeight, styles.header);
    var title = Phone.window.text(pad, 12, Phone.config.width - pad * 2, 24, "PHONE", styles.titleText);
    var back = Phone.window.button(Phone.config.width - 70, 8, 60, 28, "Back", styles.button, function() {
    debugLog("[Phone] Back button clicked - closing phone");
    try {
        hidePlayerButtons(); // Hide player buttons when closing phone
        Phone.hide();
        debugLog("[Phone] Phone.hide() called successfully");
    } catch (e) {
        debugLog("[Phone] Error in Phone.hide(): " + String(e));
    }
});

// Add debugging to back button
back.onMouseDown = function(e) {
    debugLog("[Phone] Back button onMouseDown triggered");
    if(e.button == 0 && this.isCursorOverControl()) {
        debugLog("[Phone] Back button mouse down over control");
        e.used = true;
        this.checkToCallCallback();
    } else {
        debugLog("[Phone] Back button mouse down but not over control");
    }
};

// Add visual debugging to back button
back.debug = function() {
    debugLog("[Phone] Back button debug - position: " + this.getScreenPosition() + " size: " + this.size + " shown: " + this.shown);
};

    Phone.controls.header = header;
    Phone.controls.title = title;
    Phone.controls.back = back;
}

function buildPhoneFrame() {
    debugLog("[Phone] Building phone frame...");
    var styles = Phone.controls.styles;
    var cfg = Phone.config;
    
    // Create phone frame elements on the outer frame window
    if (!Phone.frame) return;
    
    // Top speaker grill
    var speakerWidth = 80;
    var speakerX = (cfg.frameWidth - speakerWidth) / 2;
    var speakerY = (cfg.topBarHeight - 6) / 2; // Center vertically in top bar
    Phone.controls.speaker = Phone.frame.rectangle(speakerX, speakerY, speakerWidth, 6, {
        main: {
            backgroundColour: toColour(30, 30, 35, 255),
            borderSize: 1,
            borderColour: toColour(50, 50, 55, 255)
        }
    });
    Phone.controls.speaker.shown = true;
    
    // Home button at bottom - positioned below screen
    var homeBtnSize = 50;
    var homeBtnX = (cfg.frameWidth - homeBtnSize) / 2;
    var homeBtnY = cfg.topBarHeight + cfg.height + 10; // Position after screen + gap
    
    Phone.controls.homeButton = Phone.frame.button(homeBtnX, homeBtnY, homeBtnSize, homeBtnSize, "", {
        main: {
            backgroundColour: toColour(50, 50, 55, 200),
            borderSize: 2,
            borderColour: toColour(80, 80, 85, 255)
        },
        hover: {
            backgroundColour: toColour(70, 70, 75, 220),
            borderColour: toColour(100, 100, 105, 255)
        }
    }, function() {
        debugLog("[Phone] Home button clicked - going to home");
        showApp("home");
    });
    Phone.controls.homeButton.shown = true;
    
    // White circle inside home button using Unicode character
    var circleSize = 20;
    var circleX = homeBtnX + (homeBtnSize - circleSize) / 2;
    var circleY = homeBtnY + (homeBtnSize - 24) / 2; // Adjust for text height
    Phone.controls.homeButtonCircle = Phone.frame.text(circleX, circleY, circleSize, 24, "\u25CF", { // Unicode black circle
        main: {
            textColour: toColour(255, 255, 255, 255), // White
            textAlign: 0.5, // Center
            textSize: 18
        }
    });
    Phone.controls.homeButtonCircle.shown = true;
    
    // Back button to the right of home button
    var backBtnSize = 50;
    var backBtnX = homeBtnX + homeBtnSize + 20; // 20px gap from home button
    var backBtnY = homeBtnY;
    
    Phone.controls.frameBackButton = Phone.frame.button(backBtnX, backBtnY, backBtnSize, backBtnSize, "", {
        main: {
            backgroundColour: toColour(50, 50, 55, 200),
            borderSize: 2,
            borderColour: toColour(80, 80, 85, 255)
        },
        hover: {
            backgroundColour: toColour(70, 70, 75, 220),
            borderColour: toColour(100, 100, 105, 255)
        }
    }, function() {
        debugLog("[Phone] Frame back button clicked - going back");
        if (Phone.currentApp === "text" && Phone.textState.currentPanel === "messageCompose") {
            showTextPanel("playerList"); // Go back to player list from compose
        } else if (Phone.currentApp !== "home") {
            showApp("home"); // Go to home from other apps
        }
    });
    Phone.controls.frameBackButton.shown = true;
    
    // Back arrow inside back button using Unicode
    var arrowSize = 20;
    var arrowX = backBtnX + (backBtnSize - arrowSize) / 2;
    var arrowY = backBtnY + (backBtnSize - 24) / 2;
    Phone.controls.frameBackButtonArrow = Phone.frame.text(arrowX, arrowY, arrowSize, 24, "\u25C0", { // Unicode left-pointing triangle
        main: {
            textColour: toColour(255, 255, 255, 255), // White
            textAlign: 0.5, // Center
            textSize: 16
        }
    });
    Phone.controls.frameBackButtonArrow.shown = true;
    
    // Camera dot - positioned near speaker
    Phone.controls.camera = Phone.frame.rectangle(cfg.frameWidth / 2 + 50, speakerY + 1, 8, 4, {
        main: {
            backgroundColour: toColour(20, 20, 25, 255),
            borderSize: 1,
            borderColour: toColour(40, 40, 45, 255)
        }
    });
    Phone.controls.camera.shown = true;
    
    debugLog("[Phone] Phone frame built with home button, back button, speaker, camera");
}

function buildHome() {
    debugLog("[Phone] Building home screen...");
    var styles = Phone.controls.styles;
    var pad = Phone.config.padding;
    var startY = Phone.config.headerHeight + pad;
    var cellW = Math.floor((Phone.config.width - pad * 2 - Phone.config.gridGap) / 2);
    var cellH = 90;

    var buttons = [];
    var apps = [
        { id: "text", label: "Text", icon: "client/jobsrpui/mexui/Images/Message.png" },
        { id: "jobs", label: "Jobs" },
        { id: "cars", label: "Cars" },
        { id: "bank", label: "Bank" }
    ];
    
    debugLog("[Phone] Apps to create: " + JSON.stringify(apps));

    for (var i = 0; i < apps.length; i++) {
        var app = apps[i];
        var row = Math.floor(i / 2);
        var col = i % 2;
        var x = pad + col * (cellW + Phone.config.gridGap);
        var y = startY + row * (cellH + Phone.config.gridGap);
        
        if (app.icon) {
            // Create container button for click area with callback as parameter
            var button = Phone.window.button(x, y, cellW, cellH, "", styles.accentButton, (function(appId) {
                return function() {
                    debugLog("[Phone] Button clicked! App: " + appId + " (manual click)");
                    showApp(appId);
                };
            })(app.id));
            button.appId = app.id;
            debugLog("[Phone] Created button for app: " + app.id);
            
            // Add debugging to home screen buttons
            if (app.id === "text") {
                button.onMouseDown = function(e) {
                    debugLog("[Phone] Text button onMouseDown triggered");
                    if(e.button == 0 && this.isCursorOverControl()) {
                        debugLog("[Phone] Text button mouse down over control");
                        e.used = true;
                        this.checkToCallCallback();
                    }
                };
            }
            
            // Create image control for icon - larger and centered
            var iconSize = 48; // Increased from 30 to 48 pixels
            var iconX = x + (cellW - iconSize) / 2; // Center horizontally
            var iconY = y + 8; // Position near top of button
            var icon = Phone.window.image(iconX, iconY, iconSize, iconSize, app.icon, styles);
            icon.shown = true;
            debugLog("[Phone] Created icon for: " + app.id + " at " + iconX + "," + iconY + " size " + iconSize);
            
            // Create text label below icon - centered
            var label = Phone.window.text(x, y + 58, cellW, 24, app.label, styles.titleText);
            label.shown = true;
            debugLog("[Phone] Created label for: " + app.id);
            
            buttons.push(button, icon, label);
        } else {
            // Regular button for apps without icons with callback as parameter
            var button = Phone.window.button(x, y, cellW, cellH, app.label, styles.accentButton, (function(appId) {
                return function() {
                    debugLog("[Phone] Button clicked! App: " + appId + " (manual click)");
                    showApp(appId);
                };
            })(app.id));
            button.appId = app.id;
            buttons.push(button);
        }
    }

    Phone.controls.home = { buttons: buttons };
    debugLog("[Phone] Home controls created with " + buttons.length + " buttons");
}

function buildJobs() {
    var styles = Phone.controls.styles;
    var pad = Phone.config.padding;
    var top = Phone.config.headerHeight + pad;

    var title = Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "Jobs", styles.titleText);
    var sub = Phone.window.text(pad, top + 28, Phone.config.width - pad * 2, 18, "Quick actions and status", styles.subText);

    var btnY = top + 60;
    var fullW = Phone.config.width - pad * 2;

    var statusBtn = Phone.window.button(pad, btnY, fullW, Phone.config.buttonHeight, "Refresh Status", styles.button, function() {
        Utils.sendServerSafe("jobs.requestStatus");
    });

    var listBtn = Phone.window.button(pad, btnY + 64, fullW, Phone.config.buttonHeight, "Job List", styles.button, function() {
        Utils.sendServerSafe("jobs.requestList");
    });

    var startBtn = Phone.window.button(pad, btnY + 128, fullW, Phone.config.buttonHeight, "Start Job", styles.button, function() {
        Utils.sendServerSafe("jobs.requestStart");
    });

    var stopBtn = Phone.window.button(pad, btnY + 192, fullW, Phone.config.buttonHeight, "Stop Job", styles.button, function() {
        Utils.sendServerSafe("jobs.requestStop");
    });

    Phone.controls.jobs = {
        title: title,
        sub: sub,
        statusBtn: statusBtn,
        listBtn: listBtn,
        startBtn: startBtn,
        stopBtn: stopBtn
    };
}

function buildText() {
    debugLog("[Phone] Building text messaging app...");
    var styles = Phone.controls.styles;
    var pad = Phone.config.padding;
    var top = Phone.config.headerHeight + pad;
    
    // Initialize text controls object
    Phone.controls.text = {};
    
    // Player List Panel
    Phone.controls.text.playerListPanel = {
        title: Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "Select Player", styles.titleText),
        list: Phone.window.list(pad, top + 40, Phone.config.width - pad * 2, 320, styles),
        noPlayersText: Phone.window.text(pad, top + 100, Phone.config.width - pad * 2, 24, "", {
            main: {
                textColour: toColour(150, 150, 150, 255),
                textSize: 14,
                textAlign: 0.5
            }
        }),
        visible: true
    };
    Phone.controls.text.playerListPanel.noPlayersText.shown = false;
    
    // Message Compose Panel
    Phone.controls.text.composePanel = {
        title: Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "", styles.titleText),
        input: Phone.window.textInput(pad, top + 60, Phone.config.width - pad * 2 - 50, 80, "Type your message...", styles),
        charCount: Phone.window.text(pad, top + 145, Phone.config.width - pad * 2, 18, "0/" + Phone.config.messageCharLimit, styles.subText),
        visible: false
    };
    Phone.controls.text.composePanel.charCount.shown = false;
    
    // Send button with image - positioned to the right of input
    var sendBtnSize = 40;
    var sendBtnX = pad + (Phone.config.width - pad * 2 - 50) + 5; // Right of input
    var sendBtnY = top + 60 + 20; // Centered vertically with input
    
    Phone.controls.text.composePanel.sendButton = Phone.window.imageButton(
        sendBtnX, 
        sendBtnY, 
        sendBtnSize, 
        sendBtnSize, 
        "jobsrpui/mexui/Images/Send Message.png",
        {
            main: {
                backgroundColour: toColour(50, 150, 255, 200)
            },
            hover: {
                backgroundColour: toColour(80, 180, 255, 220)
            }
        },
        function() {
            debugLog("[Phone] Send button clicked");
            sendMessage();
        }
    );
    Phone.controls.text.composePanel.sendButton.shown = false; // Hidden by default
    
    // Create blinking cursor for input (same pattern as auth UI)
    var inputX = pad + 5; // Slight offset from input edge
    var inputY = top + 60 + 10; // Position inside input
    Phone.controls.text.composePanel.cursor = Phone.window.text(inputX, inputY, 12, 24, "|", {
        main: {
            textColour: toColour(255, 255, 255, 255), // White cursor
            textSize: 20,
            textAlign: 0.5
        }
    });
    Phone.controls.text.composePanel.cursor.shown = false; // Hidden by default
    
    // Conversation Panel
    Phone.controls.text.conversationPanel = {
        title: Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "", styles.titleText),
        messages: [],
        visible: false
    };
    
    // NOTE: List onClick disabled - using individual player buttons instead for reliability
    // Phone.controls.text.playerListPanel.list.onClick removed
    
    // Create player buttons container - same pattern as home screen apps
    Phone.controls.text.playerListPanel.buttons = [];
    
    // Setup input callback
    Phone.controls.text.composePanel.input.onChange = function(text) {
        var next = String(text || "");
        if (next.length > Phone.config.messageCharLimit) {
            next = next.slice(0, Phone.config.messageCharLimit);
            Phone.controls.text.composePanel.input.text = next;
        }
        Phone.textState.messageInput = next;
        Phone.textState.isTyping = next.length > 0;
        if (Phone.controls.text.composePanel.charCount) {
            Phone.controls.text.composePanel.charCount.text = String(next.length) + "/" + String(Phone.config.messageCharLimit);
        }
        updateKeyboardContext();
        updateInputCursor(); // Update cursor position on text change
    };
    
    // NOTE: Player buttons are created on-demand when text panel opens
    // Do NOT load player list here - it will be loaded when text app is opened
    
    // Start cursor blink timer
    startCursorBlink();
}

// Text messaging core functions
function loadPlayerList() {
    debugLog("[Phone] Loading player list...");
    
    // Prefer server-provided authenticated player list if available
    if (Phone.textState.serverPlayerList && Array.isArray(Phone.textState.serverPlayerList)) {
        debugLog("[Phone] Using server player list: " + JSON.stringify(Phone.textState.serverPlayerList));
        Phone.textState.playerList = Phone.textState.serverPlayerList;
        // Buttons are built ON-DEMAND when text panel opens
        return;
    }

    debugLog("[Phone] No server player list available, falling back to local API");
    // Test both APIs to see which works
    var players = [];
    var clients = [];
    var localName = null;
    var localId = null;

    try {
        if (typeof localPlayer !== "undefined" && localPlayer) {
            if (localPlayer.id !== undefined && localPlayer.id !== null) {
                localId = localPlayer.id;
            }
            if (typeof localPlayer.name === "function") {
                localName = localPlayer.name();
            } else if (typeof localPlayer.name === "string") {
                localName = localPlayer.name;
            }
        }
        debugLog("[Phone] Local player: id=" + localId + ", name=" + localName);
    } catch (e) {
        debugLog("[Phone] Failed to resolve local player identity: " + String(e));
    }
    
    try {
        // Test getClients() first
        if (typeof getClients === "function") {
            clients = getClients();
            debugLog("[Phone] getClients() returned: " + JSON.stringify(clients));
            debugLog("[Phone] getClients() type: " + typeof clients);
            debugLog("[Phone] getClients() isArray: " + Array.isArray(clients));
            debugLog("[Phone] getClients() length: " + (clients ? clients.length : "null"));
            if (clients && Array.isArray(clients)) {
                players = clients;
            }
        }
    } catch (e) {
        debugLog("[Phone] getClients() failed: " + String(e));
    }
    
    try {
        // Test getPlayers() as fallback
        if (players.length === 0 && typeof getPlayers === "function") {
            var playerList = getPlayers();
            debugLog("[Phone] getPlayers() returned: " + JSON.stringify(playerList));
            debugLog("[Phone] getPlayers() type: " + typeof playerList);
            debugLog("[Phone] getPlayers() isArray: " + Array.isArray(playerList));
            debugLog("[Phone] getPlayers() length: " + (playerList ? playerList.length : "null"));
            if (playerList && Array.isArray(playerList)) {
                players = playerList;
            }
        }
    } catch (e) {
        debugLog("[Phone] getPlayers() failed: " + String(e));
    }
    
    // Use whichever API returned data
    var playerList = players;
    
    if (playerList && Array.isArray(playerList)) {
        debugLog("[Phone] Processing player list with " + playerList.length + " entries");
        
        var allPlayers = [];
        
        for (var i = 0; i < playerList.length; i++) {
            var player = playerList[i];
            debugLog("[Phone] Processing player " + i + ": " + JSON.stringify(player));
            
            // Check if player is valid and has required properties
            if (player && typeof player === "object") {
                var playerName = null;
                var playerId = null;
                
                // Try different ways to get player name
                if (player.name) {
                    playerName = String(player.name);
                } else if (typeof player.getName === "function") {
                    playerName = String(player.getName());
                } else if (typeof player.toString === "function") {
                    playerName = String(player.toString());
                }
                
                // Try different ways to get player ID
                if (player.id !== undefined && player.id !== null) {
                    playerId = player.id;
                } else if (player.index !== undefined && player.index !== null) {
                    playerId = player.index;
                }
                
                debugLog("[Phone] Extracted: id=" + playerId + ", name=" + playerName);
                
                // Skip local player (commented out for testing)
                var cleanedName = playerName ? playerName.replace(/#\d+$/, "") : "";
                var isLocal = false;
                
                if (localId !== null && playerId !== null && playerId === localId) {
                    isLocal = true;
                } else if (localName && cleanedName === localName) {
                    isLocal = true;
                } else if (playerName && playerName.includes("#")) {
                    isLocal = true;
                }
                
                debugLog("[Phone] Player is local: " + isLocal);
                
                if (playerName && playerId !== null && !isLocal) {
                    allPlayers.push({
                        id: playerId,
                        name: cleanedName,
                        data: player
                    });
                    debugLog("[Phone] Added player to list: " + cleanedName);
                }
            }
        }
        
        Phone.textState.playerList = allPlayers;
        debugLog("[Phone] Final player list: " + JSON.stringify(allPlayers));
        // Buttons will be built on-demand when text panel opens
    } else {
        debugLog("[Phone] No valid player list available");
        Phone.textState.playerList = [];
    }
}

// Update player buttons text (buttons already exist, just update text and visibility)
function updatePlayerButtons() {
    if (!Phone.controls || !Phone.controls.styles || !Phone.controls.text || !Phone.controls.text.playerListPanel) {
        return;
    }
    var styles = Phone.controls.styles;
    var pad = Phone.config.padding;
    var top = Phone.config.headerHeight + pad;
    var startY = top + 40;
    var buttonHeight = 40;
    var buttonSpacing = 5;
    var buttons = Phone.controls.text.playerListPanel.buttons;
    if (!buttons) {
        return;
    }
    
    // Hide the list control - we're using buttons instead
    if (Phone.controls.text.playerListPanel.list) {
        Phone.controls.text.playerListPanel.list.shown = false;
    }
    
    // Check if no players online
    if (!Phone.textState.playerList || Phone.textState.playerList.length === 0) {
        // Show "No players online" message
        if (Phone.controls.text.playerListPanel.noPlayersText) {
            Phone.controls.text.playerListPanel.noPlayersText.shown = true;
            Phone.controls.text.playerListPanel.noPlayersText.text = "No other players online";
        }
        // Hide all buttons
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i]) buttons[i].shown = false;
        }
        return;
    } else {
        // Hide "No players" message when players exist
        if (Phone.controls.text.playerListPanel.noPlayersText) {
            Phone.controls.text.playerListPanel.noPlayersText.shown = false;
        }
    }
    
    // First, hide all existing buttons
    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i]) buttons[i].shown = false;
    }
    
    // Update/show buttons for current player list
    debugLog("[Phone] Updating " + Phone.textState.playerList.length + " player buttons");
    
    for (var i = 0; i < Phone.textState.playerList.length; i++) {
        var player = Phone.textState.playerList[i];
        
        if (i < buttons.length) {
            // Update existing button
            buttons[i].text = player.name;
            buttons[i].shown = true;
            debugLog("[Phone] Updated player button " + i + ": " + player.name);
        } else {
            // Create new button if needed
            var buttonY = startY + (i * (buttonHeight + buttonSpacing));
            (function(playerData, btnIndex) {
                var playerButton = Phone.window.button(
                    pad, 
                    buttonY, 
                    Phone.config.width - pad * 2, 
                    buttonHeight, 
                    playerData.name, 
                    styles.button, 
                    function() {
                        debugLog("[Phone] Player button clicked: " + playerData.name);
                        Phone.textState.selectedPlayer = playerData;
                        showTextPanel("messageCompose");
                    }
                );
                playerButton.shown = true;
                buttons.push(playerButton);
                debugLog("[Phone] Created player button " + btnIndex + ": " + playerData.name);
            })(player, i);
        }
    }
    
    debugLog("[Phone] Player buttons updated: " + buttons.length + " total, " + Phone.textState.playerList.length + " active");
}

// Hide all player buttons (same pattern as hiding app buttons)
function hidePlayerButtons() {
    if (!Phone.controls || !Phone.controls.text || !Phone.controls.text.playerListPanel) {
        return;
    }
    var buttons = Phone.controls.text.playerListPanel.buttons;
    if (!buttons) {
        return;
    }
    debugLog("[Phone] Hiding " + buttons.length + " player buttons");
    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i]) buttons[i].shown = false;
    }
}

// Cursor blink state
var cursorBlinkInterval = null;
var cursorVisible = false;

// Start cursor blinking timer
function startCursorBlink() {
    if (cursorBlinkInterval) {
        clearInterval(cursorBlinkInterval);
    }
    
    cursorBlinkInterval = setInterval(function() {
        if (Phone.active && Phone.textState.currentPanel === "messageCompose" && Phone.textState.isTyping) {
            cursorVisible = !cursorVisible;
            if (Phone.controls.text.composePanel.cursor) {
                Phone.controls.text.composePanel.cursor.shown = cursorVisible;
            }
        } else {
            // Hide cursor when not typing or not on compose panel
            if (Phone.controls.text.composePanel.cursor) {
                Phone.controls.text.composePanel.cursor.shown = false;
            }
            cursorVisible = false;
        }
    }, 500); // Blink every 500ms (half second)
}

// Update cursor position based on input text
function updateInputCursor() {
    if (!Phone.controls.text.composePanel.input || !Phone.controls.text.composePanel.cursor) {
        return;
    }
    
    var input = Phone.controls.text.composePanel.input;
    var cursor = Phone.controls.text.composePanel.cursor;
    var text = input.text || "";
    var pad = Phone.config.padding;
    var top = Phone.config.headerHeight + pad;
    
    // Calculate cursor X position based on text length (approximate)
    var charWidth = 8; // Approximate width per character
    var inputX = pad + 5;
    var cursorX = inputX + Math.min(text.length * charWidth, input.size.x - 20);
    var cursorY = top + 60 + 10;
    
    // Update cursor position
    cursor.position.x = cursorX;
    cursor.position.y = cursorY;
    
    // Show cursor when typing
    if (Phone.textState.isTyping) {
        cursor.shown = true;
        cursorVisible = true;
    } else {
        cursor.shown = false;
        cursorVisible = false;
    }
}

// Stop cursor blinking
function stopCursorBlink() {
    if (cursorBlinkInterval) {
        clearInterval(cursorBlinkInterval);
        cursorBlinkInterval = null;
    }
    if (Phone.controls.text.composePanel.cursor) {
        Phone.controls.text.composePanel.cursor.shown = false;
    }
}

function showTextPanel(panelName) {
    debugLog("[Phone] Showing text panel: " + panelName);
    Phone.textState.currentPanel = panelName;
    
    debugLog("[Phone] Available text controls: " + JSON.stringify(Object.keys(Phone.controls.text || {})));
    
    // Hide all text panels first
    setControlsVisible(Phone.controls.text.playerListPanel, false);
    setControlsVisible(Phone.controls.text.composePanel, false);
    setControlsVisible(Phone.controls.text.conversationPanel, false);
    
    // Show or hide player buttons based on panel (same pattern as app buttons)
    if (panelName === "playerList") {
        debugLog("[Phone] Showing player buttons for playerList");
        updatePlayerButtons(); // Update and show buttons
    } else {
        debugLog("[Phone] Hiding player buttons for panel: " + panelName);
        hidePlayerButtons(); // Hide buttons when not on playerList
    }
    
    if (panelName === "playerList") {
        debugLog("[Phone] Showing player list panel");
        // Hide cursor and send button when leaving compose panel
        if (Phone.controls.text.composePanel.cursor) {
            Phone.controls.text.composePanel.cursor.shown = false;
        }
        if (Phone.controls.text.composePanel.sendButton) {
            Phone.controls.text.composePanel.sendButton.shown = false;
        }
        setControlsVisible(Phone.controls.text.playerListPanel, true);
    } else if (panelName === "messageCompose") {
        debugLog("[Phone] Showing message compose panel");
        hidePlayerButtons(); // Hide buttons when going to typing screen
        setControlsVisible(Phone.controls.text.composePanel, true);
        if (Phone.textState.selectedPlayer) {
            Phone.controls.text.composePanel.title.text = "Message: " + Phone.textState.selectedPlayer.name;
        }
        if (Phone.controls.text.composePanel.charCount) {
            var existing = Phone.controls.text.composePanel.input && typeof Phone.controls.text.composePanel.input.text === "string"
                ? Phone.controls.text.composePanel.input.text.length
                : 0;
            Phone.controls.text.composePanel.charCount.shown = true;
            Phone.controls.text.composePanel.charCount.text = String(existing) + "/" + String(Phone.config.messageCharLimit);
        }
        // Show send button
        if (Phone.controls.text.composePanel.sendButton) {
            Phone.controls.text.composePanel.sendButton.shown = true;
        }
        // Reset and show cursor when entering compose panel
        updateInputCursor();
        // Hide cursor initially until typing starts
        if (Phone.controls.text.composePanel.cursor) {
            Phone.controls.text.composePanel.cursor.shown = false;
            cursorVisible = false;
        }
        // Focus input for typing
        if (Phone.controls.text.composePanel.input) {
            Phone.controls.text.composePanel.input.focused = true;
            updateKeyboardContext();
        }
    } else if (panelName === "conversation") {
        debugLog("[Phone] Showing conversation panel");
        hidePlayerButtons(); // Hide buttons when viewing conversation
        // Hide cursor and send button when leaving compose panel
        if (Phone.controls.text.composePanel.cursor) {
            Phone.controls.text.composePanel.cursor.shown = false;
        }
        if (Phone.controls.text.composePanel.sendButton) {
            Phone.controls.text.composePanel.sendButton.shown = false;
        }
        setControlsVisible(Phone.controls.text.conversationPanel, true);
        if (Phone.textState.currentConversation) {
            var conversation = Phone.textState.conversations[Phone.textState.currentConversation];
            if (conversation) {
                Phone.controls.text.conversationPanel.title.text = conversation.playerName;
            }
        }
    }
}

function updateKeyboardContext() {
    if (typeof KeyboardService === "undefined" || !KeyboardService) return;
    
    var isTyping = Phone.textState.isTyping && Phone.textState.currentPanel === "messageCompose";
    
    if (isTyping) {
        // Configure for text input - NO delete/backspace handling (removed per request)
        KeyboardService.setConfig({
            isActive: function() { return Phone.active && Phone.textState.isTyping; },
            appendChar: function(ch) { 
                var input = Phone.controls.text.composePanel.input;
                if (input && typeof input.text === "string") {
                    if ((input.text.length + 1) > Phone.config.messageCharLimit) {
                        return;
                    }
                    input.text = input.text + ch;
                    Phone.textState.messageInput = input.text;
                    if (Phone.controls.text.composePanel.charCount) {
                        Phone.controls.text.composePanel.charCount.text = String(input.text.length) + "/" + String(Phone.config.messageCharLimit);
                    }
                }
            },
            // deleteChar REMOVED - no backspace handling in phone
            spaceChar: function() {
                var input = Phone.controls.text.composePanel.input;
                if (input && typeof input.text === "string") {
                    if ((input.text.length + 1) > Phone.config.messageCharLimit) {
                        return;
                    }
                    input.text = input.text + " ";
                    Phone.textState.messageInput = input.text;
                    if (Phone.controls.text.composePanel.charCount) {
                        Phone.controls.text.composePanel.charCount.text = String(input.text.length) + "/" + String(Phone.config.messageCharLimit);
                    }
                }
            }
        });
    } else {
        // Disable keyboard when not typing
        KeyboardService.setConfig({
            isActive: function() { return false; },
            appendChar: function() {},
            // deleteChar REMOVED
            spaceChar: function() {}
        });
    }
    
    debugLog("[Phone] Keyboard context updated - typing: " + isTyping);
}

function sendMessage() {
    if (!Phone.textState.selectedPlayer || !Phone.textState.messageInput.trim()) {
        debugLog("[Phone] Cannot send message - no player or empty message");
        return;
    }
    
    var content = Phone.textState.messageInput.trim();
    if (content.length > Phone.config.messageCharLimit) {
        content = content.slice(0, Phone.config.messageCharLimit);
    }
    if (!content) {
        return;
    }

    var message = {
        id: Date.now().toString(),
        sender: "local",
        recipient: Phone.textState.selectedPlayer.name,
        content: content,
        timestamp: Date.now(),
        status: "sending",
        type: "sent"
    };
    
    // Add to conversation immediately (greyed out)
    addMessageToConversation(Phone.textState.selectedPlayer.id, message);
    
    // Send via server using proper UI network event
    Utils.triggerNetworkEventSafe("phone.sendMessage", {
        recipientId: Phone.textState.selectedPlayer.id,
        recipientName: Phone.textState.selectedPlayer.name,
        content: message.content,
        messageId: message.id
    });
    
    // Clear input
    Phone.controls.text.composePanel.input.text = "";
    Phone.textState.messageInput = "";
    Phone.textState.isTyping = false;
    if (Phone.controls.text.composePanel.charCount) {
        Phone.controls.text.composePanel.charCount.text = "0/" + String(Phone.config.messageCharLimit);
    }
    updateKeyboardContext();
    
    debugLog("[Phone] Message sent to " + Phone.textState.selectedPlayer.name);
}

function addMessageToConversation(playerId, message) {
    if (!Phone.textState.conversations[playerId]) {
        Phone.textState.conversations[playerId] = {
            playerId: playerId,
            playerName: getConversationName(playerId),
            messages: [],
            lastActivity: Date.now()
        };
    }
    
    var conversation = Phone.textState.conversations[playerId];
    conversation.messages.push(message);
    
    // Limit message history
    if (conversation.messages.length > Phone.config.messageHistoryLimit) {
        conversation.messages = conversation.messages.slice(-Phone.config.messageHistoryLimit);
    }
    
    conversation.lastActivity = Date.now();
    
    if (Phone.textState.currentPanel === "conversation" && Phone.textState.currentConversation === playerId) {
        updateConversationDisplay();
    }
}

function updateConversationDisplay() {
    var panel = Phone.controls.text.conversationPanel;
    if (!panel || !Phone.textState.currentConversation) return;
    
    var conversation = Phone.textState.conversations[Phone.textState.currentConversation];
    if (!conversation) return;
    
    panel.title.text = conversation.playerName;
    
    // Clear existing message displays
    for (var i = 0; i < panel.messages.length; i++) {
        if (panel.messages[i] && panel.messages[i].destroy) {
            panel.messages[i].destroy();
        }
    }
    panel.messages = [];
    
    // Create message bubbles
    var y = Phone.config.headerHeight + Phone.config.padding + 40;
    var lineHeight = 16;
    var maxLines = 3;
    var spacing = 8;
    
    for (var j = 0; j < conversation.messages.length; j++) {
        var msg = conversation.messages[j];
        var bubbleWidth = Math.min(200, Phone.config.width - Phone.config.padding * 4);
        var maxCharsPerLine = Math.max(10, Math.floor((bubbleWidth - 16) / 7));
        var raw = String(msg.content || "");
        var lines = [];
        var remaining = raw;
        while (remaining.length > 0 && lines.length < maxLines) {
            lines.push(remaining.slice(0, maxCharsPerLine));
            remaining = remaining.slice(maxCharsPerLine);
        }
        var textBody = lines.join("\n");
        var messageHeight = Math.max(30, (lines.length * lineHeight) + 14);
        var bubbleX = msg.type === "sent" ? 
            Phone.config.width - Phone.config.padding - bubbleWidth : 
            Phone.config.padding;
        
        // Message bubble background
        var bubbleColor = msg.type === "sent" ? 
            toColour(68, 94, 220, 230) : // Blue for sent
            toColour(240, 240, 240, 255); // White for received
        
        if (msg.status === "sending") {
            bubbleColor = toColour(180, 180, 180, 230); // Grey for sending
        }
        
        var bubble = Phone.window.rectangle(
            bubbleX, y, bubbleWidth, messageHeight,
            { main: { backgroundColour: bubbleColor, borderSize: 1, borderColour: toColour(200, 200, 200, 255) } }
        );
        
        // Message text
        var textColor = msg.type === "sent" ? 
            toColour(255, 255, 255, 255) : // White text on blue
            toColour(0, 0, 0, 255); // Black text on white
        
        if (msg.status === "sending") {
            textColor = toColour(150, 150, 150, 255); // Grey text
        }
        
        var text = Phone.window.text(
            bubbleX + 8, y + 6, bubbleWidth - 16, messageHeight - 12,
            textBody,
            { main: { textColour: textColor, textIndent: 0 } }
        );
        
        panel.messages.push(bubble, text);
        y += messageHeight + spacing;
    }
}

function setControlsVisible(group, visible) {
    if (!group) {
        debugLog("[Phone] setControlsVisible: group is null");
        return;
    }
    
    debugLog("[Phone] setControlsVisible: " + (visible ? "SHOWING" : "HIDING") + " group");
    
    // Helper function to set visibility on a control
    function setVisibility(control) {
        if (control && typeof control === "object" && control.shown !== undefined) {
            control.shown = visible;
            debugLog("[Phone] Set control visibility to: " + visible);
        } else {
            debugLog("[Phone] Control has no shown property or is invalid");
        }
    }
    
    // Handle nested controls and buttons
    for (var key in group) {
        if (group.hasOwnProperty(key)) {
            var control = group[key];
            if (control && typeof control === "object") {
                debugLog("[Phone] Processing control: " + key);
                // Handle panels with visible property
                if (control.visible !== undefined) {
                    debugLog("[Phone] Panel found: " + key);
                    setVisibility(control.title);
                    setVisibility(control.list);
                    setVisibility(control.input);
                    setVisibility(control.sendButton);
                    setVisibility(control.cursor);
                    setVisibility(control.charCount);
                    setVisibility(control.noPlayersText);
                    control.visible = visible;
                } else {
                    setVisibility(control);
                }
                // Handle buttons array (may contain images and labels)
                if (control.buttons && Array.isArray(control.buttons)) {
                    debugLog("[Phone] Processing buttons array: " + control.buttons.length + " items");
                    for (var i = 0; i < control.buttons.length; i++) {
                        setVisibility(control.buttons[i]);
                    }
                }
            }
        }
    }
    
    // Handle top-level buttons array (may contain images and labels)
    if (group.buttons && Array.isArray(group.buttons)) {
        debugLog("[Phone] Processing top-level buttons array: " + group.buttons.length + " items");
        for (var j = 0; j < group.buttons.length; j++) {
            setVisibility(group.buttons[j]);
        }
    }
    
    // NOTE: playerButtons array is managed directly by buildPlayerButtons/clearPlayerButtons
    // Do NOT process here to avoid conflicts with on-demand creation
}

function ensureHomeControlsReady() {
    if (!Phone.controls.home || !Array.isArray(Phone.controls.home.buttons) || Phone.controls.home.buttons.length === 0) {
        debugLog("[Phone] Home controls missing, rebuilding");
        buildHome();
    }
}

function forceShowHomeControls() {
    ensureHomeControlsReady();
    setControlsVisible(Phone.controls.home, true);
    if (Phone.controls.home && Array.isArray(Phone.controls.home.buttons)) {
        for (var i = 0; i < Phone.controls.home.buttons.length; i++) {
            if (Phone.controls.home.buttons[i] && Phone.controls.home.buttons[i].shown !== undefined) {
                Phone.controls.home.buttons[i].shown = true;
            }
        }
    }
}

function showApp(appId) {
    // Input validation using shared utility
    appId = Utils.validateInput(appId, "string", "home", ["home", "jobs", "text", "cars", "bank"]);
    
    debugLog("[Phone] Showing app: " + appId);
    Phone.currentApp = appId;

    // Hide all apps first
    debugLog("[Phone] Hiding all apps...");
    setControlsVisible(Phone.controls.home, false);
    setControlsVisible(Phone.controls.jobs, false);
    setControlsVisible(Phone.controls.cars, false);
    setControlsVisible(Phone.controls.bank, false);
    
    // Explicitly hide all text panels and player buttons
    if (Phone.controls.text) {
        setControlsVisible(Phone.controls.text.playerListPanel, false);
        setControlsVisible(Phone.controls.text.composePanel, false);
        setControlsVisible(Phone.controls.text.conversationPanel, false);
        // Hide player buttons when leaving text app (same pattern as apps)
        hidePlayerButtons();
    }

    // Show selected app
    debugLog("[Phone] Showing app: " + appId);
    if (appId === "home") {
        debugLog("[Phone] Showing home controls");
        forceShowHomeControls();
        // Hide player buttons when on home screen
        hidePlayerButtons();
    } else if (appId === "jobs") {
        debugLog("[Phone] Showing jobs controls");
        hidePlayerButtons(); // Hide player buttons when leaving text app
        setControlsVisible(Phone.controls.jobs, true);
    } else if (appId === "text") {
        debugLog("[Phone] Text app clicked - showing text controls");
        setControlsVisible(Phone.controls.text, true);
        // Request player list from server first, then show panel (buttons built on-demand)
        Utils.triggerNetworkEventSafe("phone.requestPlayerList");
        showTextPanel("playerList");
    } else if (appId === "cars") {
        debugLog("[Phone] Showing cars controls");
        hidePlayerButtons(); // Hide player buttons when leaving text app
        if (Phone.controls.cars) {
            setControlsVisible(Phone.controls.cars, true);
        } else {
            debugLog("[Phone] Cars controls missing, falling back to home");
            appId = "home";
            forceShowHomeControls();
        }
    } else if (appId === "bank") {
        debugLog("[Phone] Showing bank controls");
        hidePlayerButtons(); // Hide player buttons when leaving text app
        if (Phone.controls.bank) {
            setControlsVisible(Phone.controls.bank, true);
        } else {
            debugLog("[Phone] Bank controls missing, falling back to home");
            appId = "home";
            forceShowHomeControls();
        }
    }

    if (Phone.controls.back) {
        Phone.controls.back.shown = (appId !== "home");
    }
    if (Phone.controls.title) {
        Phone.controls.title.text = (appId === "home") ? "PHONE" : String(appId).toUpperCase();
        debugLog("[Phone] Title updated to: " + Phone.controls.title.text);
    }
    
    // Ensure frame is always visible when phone is active
    if (Phone.frame) {
        Phone.frame.shown = true;
    }
}

Phone.show = function() {
    debugLog("[Phone] Show called, active: " + Phone.active);
    
    if (Phone.active) {
        debugLog("[Phone] Phone already active, showing window and frame");
        if (Phone.window) {
            Phone.window.shown = true;
        }
        if (Phone.frame) {
            Phone.frame.shown = true;
        }
        return;
    }
    
    // Check authentication first
    if (typeof JobsClient !== "undefined" && JobsClient.authState) {
        if (JobsClient.authState.authRequired === true && JobsClient.authState.authenticated !== true) {
            if (JobsClient.UI && typeof JobsClient.UI.showPrompt === "function") {
                JobsClient.UI.showPrompt("Authenticate in the Jobs Auth panel before using phone.", "warn", true);
            }
            return;
        }
    }
    
    debugLog("[Phone] Creating phone window and frame...");
    if (!ensureWindow()) {
        debugLog("[Phone] Failed to ensure window");
        return;
    }
    
    Phone.window.shown = true;
    if (Phone.frame) {
        Phone.frame.shown = true;
    }
    Phone.active = true;
    debugLog("[Phone] Phone window and frame shown, active: " + Phone.active);
    
    // Ensure proper z-order - screen on top of frame
    if (Phone.frame && Phone.frame.setTop) {
        Phone.frame.setTop();
    }
    if (Phone.window && Phone.window.setTop) {
        Phone.window.setTop();
    }
    
    // Start visibility watchdog
    startVisibilityWatchdog();

    // Enable mouse input for phone
    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(true);
        debugLog("[Phone] Mouse input enabled");
    } else {
        debugLog("[Phone] Failed to enable mouse input - ui or ui.setInput not available");
    }

    showApp(Phone.currentApp || "home");
    
    // Debug button positions
    setTimeout(function() {
        if (Phone.controls.back && Phone.controls.back.debug) {
            Phone.controls.back.debug();
        }
    }, 1000);
};

// ... (rest of the code remains the same)
Phone.hide = function() {
    if (!Phone.active) {
        return;
    }
    
    // Stop visibility watchdog
    stopVisibilityWatchdog();
    
    // Hide player buttons when hiding phone
    hidePlayerButtons();
    
    if (Phone.window) {
        Phone.window.shown = false;
    }
    if (Phone.frame) {
        Phone.frame.shown = false;
    }
    Phone.active = false;

    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(false);
    }
};

// Visibility watchdog - ensures phone stays visible and on top when active
var visibilityWatchdogInterval = null;
var lastTopRefreshAt = 0;
function startVisibilityWatchdog() {
    if (visibilityWatchdogInterval) {
        clearInterval(visibilityWatchdogInterval);
    }
    
    visibilityWatchdogInterval = setInterval(function() {
        if (Phone.active) {
            // Validate UI framework is still available
            var ui = getJobsRpUi();
            if (!ui) {
                debugLog("[Phone] Watchdog: UI framework lost, attempting recovery");
                Phone.recoverUI();
                return;
            }
            
            // Ensure both windows are still valid and visible
            if (Phone.window) {
                try {
                    // Test if window is still valid by checking a basic property
                    var isValid = Phone.window.shown !== undefined;
                    if (!isValid) {
                        debugLog("[Phone] Watchdog: Window became invalid, recreating");
                        Phone.recoverUI();
                        return;
                    }
                    
                    if (!Phone.window.shown) {
                        Phone.window.shown = true;
                        debugLog("[Phone] Watchdog: Restored screen window visibility");
                    }
                } catch (e) {
                    debugLog("[Phone] Watchdog: Window validation failed: " + String(e));
                    Phone.recoverUI();
                    return;
                }
            }
            
            if (Phone.frame) {
                try {
                    var isValid = Phone.frame.shown !== undefined;
                    if (!isValid) {
                        debugLog("[Phone] Watchdog: Frame became invalid, recreating");
                        Phone.recoverUI();
                        return;
                    }
                    
                    if (!Phone.frame.shown) {
                        Phone.frame.shown = true;
                        debugLog("[Phone] Watchdog: Restored frame visibility");
                    }
                } catch (e) {
                    debugLog("[Phone] Watchdog: Frame validation failed: " + String(e));
                    Phone.recoverUI();
                    return;
                }
            }
            
            // Ensure screen stays on top
            var now = Date.now ? Date.now() : 0;
            if (Phone.window && Phone.window.setTop && (now - lastTopRefreshAt > 1000)) {
                try {
                    Phone.window.setTop();
                    lastTopRefreshAt = now;
                } catch (e) {
                    debugLog("[Phone] Watchdog: Failed to set window on top: " + String(e));
                }
            }
        }
    }, 400);
}

function stopVisibilityWatchdog() {
    if (visibilityWatchdogInterval) {
        clearInterval(visibilityWatchdogInterval);
        visibilityWatchdogInterval = null;
    }
}

// UI recovery function - recreates phone UI when components become invalid
Phone.recoverUI = function() {
    debugLog("[Phone] Attempting UI recovery...");
    
    try {
        // Save current state
        var wasActive = Phone.active;
        var currentApp = Phone.currentApp;
        
        // Cleanup existing UI
        if (Phone.window) {
            try {
                Phone.window.shown = false;
            } catch (e) {
                debugLog("[Phone] Error hiding window during recovery: " + String(e));
            }
        }
        if (Phone.frame) {
            try {
                Phone.frame.shown = false;
            } catch (e) {
                debugLog("[Phone] Error hiding frame during recovery: " + String(e));
            }
        }
        
        // Reset UI components
        Phone.window = null;
        Phone.frame = null;
        Phone.controls = {};
        Phone.windowCreating = false;
        
        // Wait a moment for cleanup
        setTimeout(function() {
            if (wasActive) {
                debugLog("[Phone] Recreating UI after recovery...");
                if (ensureWindow()) {
                    Phone.window.shown = true;
                    if (Phone.frame) {
                        Phone.frame.shown = true;
                    }
                    Phone.active = true;
                    showApp(currentApp || "home");
                    debugLog("[Phone] UI recovery successful");
                } else {
                    debugLog("[Phone] UI recovery failed - could not recreate window");
                    Phone.active = false;
                }
            }
        }, 100);
        
    } catch (e) {
        debugLog("[Phone] Exception during UI recovery: " + String(e));
        Phone.active = false;
    }
};

// Resource cleanup function
Phone.cleanup = function() {
    debugLog("[Phone] Cleaning up resources...");
    
    // Stop watchdogs
    stopVisibilityWatchdog();
    
    // Hide and destroy window
    if (Phone.window) {
        try {
            Phone.window.shown = false;
        } catch (e) {
            debugLog("[Phone] Error hiding window during cleanup: " + String(e));
        }
        Phone.window = null;
    }
    
    if (Phone.frame) {
        try {
            Phone.frame.shown = false;
        } catch (e) {
            debugLog("[Phone] Error hiding frame during cleanup: " + String(e));
        }
        Phone.frame = null;
    }
    
    // Clear controls
    Phone.controls = {};
    
    // Reset state
    Phone.active = false;
    Phone.currentApp = "home";
    Phone.windowCreating = false;
    
    // Release input
    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(false);
    }
    
    debugLog("[Phone] Cleanup complete");
};

Phone.toggle = function() {
    debugLog("[Phone] Toggle called, active: " + Phone.active);
    if (Phone.active) {
        Phone.hide();
    } else {
        Phone.show();
    }
};

if (typeof addCommandHandler === "function") {
    addCommandHandler("phone", function() {
        debugLog("[Phone] Phone command received");
        Phone.toggle();
    });
}

if (typeof bindKey === "function") {
    if (typeof SDLK_p !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
        bindKey(SDLK_p, KEYSTATE_DOWN, function() {
            debugLog("[Phone] P key pressed");
            Phone.toggle();
        });
    } else if (typeof SDLK_P !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
        bindKey(SDLK_P, KEYSTATE_DOWN, function() {
            Phone.toggle();
        });
    } else {
        bindKey("p", "down", function() {
            Phone.toggle();
        });
    }
}

// Network handlers for text messaging
if (typeof addNetworkHandler === "function") {
    addNetworkHandler("phone.messageReceived", function(data) {
        debugLog("[Phone] Message received: " + JSON.stringify(data));
        
        var message = {
            id: data.messageId,
            sender: data.senderName,
            recipient: "local",
            content: data.content,
            timestamp: data.timestamp || Date.now(),
            status: "delivered",
            type: "received"
        };
        
        addMessageToConversation(data.senderId, message);
        
        // Show notification if not in text app
        if (Phone.currentApp !== "text") {
            // Could add notification here
            debugLog("[Phone] New message from " + data.senderName);
        }
    });
    
    addNetworkHandler("phone.messageDelivered", function(data) {
        debugLog("[Phone] Message delivered: " + JSON.stringify(data));
        
        // Update message status from "sending" to "sent"
        if (Phone.textState.conversations[data.recipientId]) {
            var conversation = Phone.textState.conversations[data.recipientId];
            for (var i = 0; i < conversation.messages.length; i++) {
                if (conversation.messages[i].id === data.messageId) {
                    conversation.messages[i].status = "sent";
                    break;
                }
            }
            
            if (Phone.textState.currentConversation === data.recipientId) {
                updateConversationDisplay();
            }
        }
    });
    
    debugLog("[Phone] Text messaging network handlers registered");

    addNetworkHandler("phone.playerList", function(list) {
        if (Array.isArray(list)) {
            Phone.textState.serverPlayerList = list;
            loadPlayerList();
            // Update buttons if currently on playerList panel
            if (Phone.textState.currentPanel === "playerList" && Phone.active) {
                debugLog("[Phone] Updating player buttons after server update");
                updatePlayerButtons();
            }
        }
    });
}

// Enhanced keyboard handling for Enter key
if (typeof bindKey === "function") {
    try {
        if (typeof SDLK_RETURN !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
            bindKey(SDLK_RETURN, KEYSTATE_DOWN, function() {
                if (Phone.active && Phone.textState.currentPanel === "messageCompose" && Phone.textState.isTyping) {
                    sendMessage();
                }
            });
            debugLog("[Phone] Enter key bound for message sending");
        }
    } catch (e) {
        debugLog("[Phone] Failed to bind Enter key: " + String(e));
    }
}

debugLog("[Phone] Phone UI ready. Use /phone or P.");
