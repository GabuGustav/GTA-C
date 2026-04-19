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
    height: 560,
    padding: 16,
    headerHeight: 48,
    buttonHeight: 56,
    buttonSpacing: 12,
    gridGap: 14,
    messageCharLimit: 160,
    messageHistoryLimit: 50
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
    if (Phone.window) {
        return true;
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
        var x = Math.floor(screen.width - Phone.config.width - 30);
        var y = Math.floor((screen.height - Phone.config.height) / 2);

        var styles = makeStyles();
        var win = ui.window(x, y, Phone.config.width, Phone.config.height, "Phone", styles.window);
        win.titleBarShown = false;
        win.shown = false;

        Phone.window = win;
        Phone.controls = {};
        Phone.controls.styles = styles;

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
            
            // Create image control for icon
            var icon = Phone.window.image(x + 10, y + 10, 30, 30, app.icon, styles);
            icon.shown = true;
            debugLog("[Phone] Created icon for: " + app.id);
            
            // Create text label below icon
            var label = Phone.window.text(x, y + 45, cellW, 20, app.label, styles.titleText);
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

    var statusBtn = Phone.window.button(pad, btnY, fullW, Phone.config.buttonHeight, "Refresh Status", styles.button);
    statusBtn.onClick = function() {
        Utils.sendServerSafe("jobs.requestStatus");
    };

    var listBtn = Phone.window.button(pad, btnY + 64, fullW, Phone.config.buttonHeight, "Job List", styles.button);
    listBtn.onClick = function() {
        Utils.sendServerSafe("jobs.requestList");
    };

    var startBtn = Phone.window.button(pad, btnY + 128, fullW, Phone.config.buttonHeight, "Start Job", styles.button);
    startBtn.onClick = function() {
        Utils.sendServerSafe("jobs.requestStart");
    };

    var stopBtn = Phone.window.button(pad, btnY + 192, fullW, Phone.config.buttonHeight, "Stop Job", styles.button);
    stopBtn.onClick = function() {
        Utils.sendServerSafe("jobs.requestStop");
    };

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
        visible: true
    };
    
    // Message Compose Panel
    Phone.controls.text.composePanel = {
        title: Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "", styles.titleText),
        input: Phone.window.textInput(pad, top + 60, Phone.config.width - pad * 2, 80, "Type your message here.....", styles),
        visible: false
    };
    
    // Conversation Panel
    Phone.controls.text.conversationPanel = {
        title: Phone.window.text(pad, top, Phone.config.width - pad * 2, 24, "", styles.titleText),
        messages: [],
        visible: false
    };
    
    // Setup list callback
    Phone.controls.text.playerListPanel.list.onClick = function(selectedRow) {
        if (selectedRow && selectedRow.playerData) {
            Phone.textState.selectedPlayer = selectedRow.playerData;
            showTextPanel("messageCompose");
        }
    };
    
    // Setup input callback
    Phone.controls.text.composePanel.input.onChange = function(text) {
        Phone.textState.messageInput = text;
        Phone.textState.isTyping = text.length > 0;
        updateKeyboardContext();
    };
    
    // Load player list (server-authenticated preferred)
    if (Phone.textState.serverPlayerList == null) {
        Utils.triggerNetworkEventSafe("phone.requestPlayerList");
    }
    loadPlayerList();
}

// Text messaging core functions
function loadPlayerList() {
    debugLog("[Phone] Loading player list...");
    
    // Prefer server-provided authenticated player list if available
    if (Phone.textState.serverPlayerList && Array.isArray(Phone.textState.serverPlayerList)) {
        debugLog("[Phone] Using server player list: " + JSON.stringify(Phone.textState.serverPlayerList));
        Phone.textState.playerList = Phone.textState.serverPlayerList;
        updatePlayerListDisplay();
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
                
                // For testing: Show all players including local player
                if (playerName && playerId !== null) {
                    allPlayers.push({
                        id: playerId,
                        name: cleanedName + (isLocal ? " (You)" : ""), // Add "(You)" to identify local player
                        data: player
                    });
                    debugLog("[Phone] Added player to list: " + cleanedName + (isLocal ? " (You)" : ""));
                }
            }
        }
        
        Phone.textState.playerList = allPlayers;
        debugLog("[Phone] Final player list: " + JSON.stringify(allPlayers));
        updatePlayerListDisplay();
    } else {
        debugLog("[Phone] No valid player list available");
        Phone.textState.playerList = [];
        updatePlayerListDisplay();
    }
}

function updatePlayerListDisplay() {
    var list = Phone.controls.text.playerListPanel.list;
    if (!list) {
        debugLog("[Phone] updatePlayerListDisplay: list is null");
        return;
    }
    
    debugLog("[Phone] updatePlayerListDisplay: list type=" + typeof list);
    debugLog("[Phone] updatePlayerListDisplay: list.axis=" + (list.axis ? "exists" : "null"));
    debugLog("[Phone] updatePlayerListDisplay: list.addEntry=" + (typeof list.addEntry));
    debugLog("[Phone] updatePlayerListDisplay: list.axis.y=" + (list.axis && list.axis.y ? "exists" : "null"));
    
    // Clear existing entries - try different methods
    try {
        if (list.axis && list.axis.y && list.axis.y.clear) {
            list.axis.y.clear();
            debugLog("[Phone] Cleared list using list.axis.y.clear()");
        } else if (list.clear) {
            list.clear();
            debugLog("[Phone] Cleared list using list.clear()");
        } else if (list.entries) {
            list.entries = [];
            debugLog("[Phone] Cleared list using list.entries = []");
        } else {
            debugLog("[Phone] List clear method not found, creating new list");
            // Recreate the list if clear doesn't work
            var styles = Phone.controls.styles;
            var pad = Phone.config.padding;
            var top = Phone.config.headerHeight + pad;
            Phone.controls.text.playerListPanel.list = Phone.window.list(pad, top + 40, Phone.config.width - pad * 2, 320, styles);
            list = Phone.controls.text.playerListPanel.list;
            debugLog("[Phone] Recreated list with new list object");
        }
    } catch (e) {
        debugLog("[Phone] Error clearing list: " + String(e));
    }
    
    // Add players to list
    debugLog("[Phone] About to add " + Phone.textState.playerList.length + " players to list");
    for (var i = 0; i < Phone.textState.playerList.length; i++) {
        var player = Phone.textState.playerList[i];
        debugLog("[Phone] Adding player " + i + ": " + JSON.stringify(player));
        try {
            if (list.axis && list.axis.y && list.axis.y.addEntry) {
                list.axis.y.addEntry({
                    text: player.name,
                    playerData: player,
                    onClick: function() {
                        debugLog("[Phone] Player clicked: " + player.name);
                        Phone.textState.selectedPlayer = player;
                        showTextPanel("messageCompose");
                    }
                });
                debugLog("[Phone] Added using list.axis.y.addEntry()");
            } else if (list.addEntry) {
                list.addEntry({
                    text: player.name,
                    playerData: player,
                    onClick: function() {
                        debugLog("[Phone] Player clicked: " + player.name);
                        Phone.textState.selectedPlayer = player;
                        showTextPanel("messageCompose");
                    }
                });
                debugLog("[Phone] Added using list.addEntry()");
            } else {
                debugLog("[Phone] List addEntry method not found - trying button approach");
                // Try creating individual buttons for each player
                var styles = Phone.controls.styles;
                var pad = Phone.config.padding;
                var top = Phone.config.headerHeight + pad;
                var buttonY = top + 40 + (i * 35); // Position each button
                var playerButton = Phone.window.button(pad, buttonY, Phone.config.width - pad * 2, 30, player.name, styles.button, function() {
                    debugLog("[Phone] Player button clicked: " + player.name);
                    Phone.textState.selectedPlayer = player;
                    showTextPanel("messageCompose");
                });
                playerButton.shown = true;
                debugLog("[Phone] Created player button: " + player.name);
            }
        } catch (e) {
            debugLog("[Phone] Error adding player to list: " + String(e));
        }
    }
    
    debugLog("[Phone] Player list updated with " + Phone.textState.playerList.length + " players");
}

function showTextPanel(panelName) {
    debugLog("[Phone] Showing text panel: " + panelName);
    Phone.textState.currentPanel = panelName;
    
    debugLog("[Phone] Available text controls: " + JSON.stringify(Object.keys(Phone.controls.text || {})));
    
    // Hide all text panels first
    setControlsVisible(Phone.controls.text.playerListPanel, false);
    setControlsVisible(Phone.controls.text.composePanel, false);
    setControlsVisible(Phone.controls.text.conversationPanel, false);
    
    if (panelName === "playerList") {
        debugLog("[Phone] Showing player list panel");
        setControlsVisible(Phone.controls.text.playerListPanel, true);
    } else if (panelName === "messageCompose") {
        debugLog("[Phone] Showing message compose panel");
        setControlsVisible(Phone.controls.text.composePanel, true);
        if (Phone.textState.selectedPlayer) {
            Phone.controls.text.composePanel.title.text = "Message: " + Phone.textState.selectedPlayer.name;
        }
    } else if (panelName === "conversation") {
        debugLog("[Phone] Showing conversation panel");
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
    if (!KeyboardService) return;
    
    var isTyping = Phone.textState.isTyping && Phone.textState.currentPanel === "messageCompose";
    
    if (isTyping) {
        // Configure for text input
        KeyboardService.setConfig({
            isActive: function() { return Phone.active && Phone.textState.isTyping; },
            appendChar: function(ch) { 
                var input = Phone.controls.text.composePanel.input;
                if (input && input.text) {
                    input.text = input.text + ch;
                    Phone.textState.messageInput = input.text;
                }
            },
            deleteChar: function() {
                var input = Phone.controls.text.composePanel.input;
                if (input && input.text && input.text.length > 0) {
                    input.text = input.text.substring(0, input.text.length - 1);
                    Phone.textState.messageInput = input.text;
                }
            },
            spaceChar: function() {
                var input = Phone.controls.text.composePanel.input;
                if (input && input.text) {
                    input.text = input.text + " ";
                    Phone.textState.messageInput = input.text;
                }
            }
        });
    } else {
        // Disable keyboard when not typing - don't interfere with UI navigation
        KeyboardService.setConfig({
            isActive: function() { return false; }, // Disable keyboard completely when not typing
            appendChar: function() {},
            deleteChar: function() {},
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
    
    var message = {
        id: Date.now().toString(),
        sender: "local",
        recipient: Phone.textState.selectedPlayer.name,
        content: Phone.textState.messageInput.trim(),
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
    updateKeyboardContext();
    
    debugLog("[Phone] Message sent to " + Phone.textState.selectedPlayer.name);
}

function addMessageToConversation(playerId, message) {
    if (!Phone.textState.conversations[playerId]) {
        Phone.textState.conversations[playerId] = {
            playerId: playerId,
            playerName: Phone.textState.selectedPlayer ? Phone.textState.selectedPlayer.name : "Unknown",
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
    var messageHeight = 30;
    var spacing = 8;
    
    for (var j = 0; j < conversation.messages.length; j++) {
        var msg = conversation.messages[j];
        var bubbleWidth = Math.min(200, Phone.config.width - Phone.config.padding * 4);
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
            msg.content,
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
    setControlsVisible(Phone.controls.text, false);

    // Show selected app
    debugLog("[Phone] Showing app: " + appId);
    if (appId === "home") {
        debugLog("[Phone] Showing home controls");
        setControlsVisible(Phone.controls.home, true);
    } else if (appId === "jobs") {
        debugLog("[Phone] Showing jobs controls");
        setControlsVisible(Phone.controls.jobs, true);
    } else if (appId === "text") {
        debugLog("[Phone] Text app clicked - showing text controls");
        setControlsVisible(Phone.controls.text, true);
        showTextPanel("playerList"); // Show player list when text app opens
    } else if (appId === "cars") {
        debugLog("[Phone] Showing cars controls");
        setControlsVisible(Phone.controls.cars, true);
    } else if (appId === "bank") {
        debugLog("[Phone] Showing bank controls");
        setControlsVisible(Phone.controls.bank, true);
    }

    if (Phone.controls.back) {
        Phone.controls.back.shown = (appId !== "home");
    }
    if (Phone.controls.title) {
        Phone.controls.title.text = (appId === "home") ? "PHONE" : String(appId).toUpperCase();
        debugLog("[Phone] Title updated to: " + Phone.controls.title.text);
    }
}

Phone.show = function() {
    debugLog("[Phone] Show called, active: " + Phone.active);
    
    if (Phone.active) {
        debugLog("[Phone] Phone already active, showing window");
        if (Phone.window) {
            Phone.window.shown = true;
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
    
    debugLog("[Phone] Creating phone window...");
    if (!ensureWindow()) {
        debugLog("[Phone] Failed to ensure window");
        return;
    }
    
    Phone.window.shown = true;
    Phone.active = true;
    debugLog("[Phone] Phone window shown, active: " + Phone.active);

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
    if (Phone.window) {
        Phone.window.shown = false;
    }
    Phone.active = false;

    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(false);
    }
};

// Resource cleanup function
Phone.cleanup = function() {
    debugLog("[Phone] Cleaning up resources...");
    
    // Hide and destroy window
    if (Phone.window) {
        Phone.window.shown = false;
        Phone.window = null;
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
