"use strict";

console.log("[Phone] Script loading...");

// Load shared utilities
if (typeof require !== "undefined") {
    try {
        require("shared_utils.js");
    } catch (e) {
        console.log("[Phone] Could not load shared utilities: " + String(e));
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
    playerList: []
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
        console.log("[Phone] Window creation already in progress");
        return false;
    }
    
    Phone.windowCreating = true;
    
    try {
        var ui = getJobsRpUi();
        if (!ui) {
            console.log("[Phone] UI framework not available");
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
        console.log("[Phone] Header built");
        buildHome();
        console.log("[Phone] Home built");
        buildJobs();
        console.log("[Phone] Jobs built");
        buildText();
        console.log("[Phone] Text built");
        buildPlaceholder("cars", "Cars");
        buildPlaceholder("bank", "Bank");
        console.log("[Phone] All apps built");

        showApp("home");
        console.log("[Phone] Phone setup complete, showing home");
        return true;
    } catch (e) {
        console.log("[Phone] Error creating window: " + String(e));
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
    var back = Phone.window.button(Phone.config.width - 70, 8, 60, 28, "Back", styles.button);

    back.onClick = function() {
        showApp("home");
    };

    Phone.controls.header = header;
    Phone.controls.title = title;
    Phone.controls.back = back;
}

function buildHome() {
    console.log("[Phone] Building home screen...");
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
    
    console.log("[Phone] Apps to create: " + JSON.stringify(apps));

    for (var i = 0; i < apps.length; i++) {
        var row = Math.floor(i / 2);
        var col = i % 2;
        var x = pad + col * (cellW + Phone.config.gridGap);
        var y = startY + row * (cellH + Phone.config.gridGap);
        
        if (apps[i].icon) {
            // Create container button for click area
            var button = Phone.window.button(x, y, cellW, cellH, "", styles.accentButton);
            button.appId = apps[i].id;
            console.log("[Phone] Created button for app: " + apps[i].id);
            button.onClick = function() {
                console.log("[Phone] Button clicked! App: " + this.appId);
                showApp(this.appId);
            };
            
            // Create image control for icon
            var icon = Phone.window.image(x + 10, y + 10, 30, 30, apps[i].icon, styles);
            icon.shown = true;
            console.log("[Phone] Created icon for: " + apps[i].id);
            
            // Create text label below icon
            var label = Phone.window.text(x, y + 45, cellW, 20, apps[i].label, styles.titleText);
            label.shown = true;
            console.log("[Phone] Created label for: " + apps[i].id);
            
            buttons.push(button, icon, label);
        } else {
            // Regular button for apps without icons
            var button = Phone.window.button(x, y, cellW, cellH, apps[i].label, styles.accentButton);
            button.appId = apps[i].id;
            button.onClick = function() {
                console.log("[Phone] App clicked: " + this.appId);
                showApp(this.appId);
            };
            buttons.push(button);
        }
    }

    Phone.controls.home = { buttons: buttons };
    console.log("[Phone] Home controls created with " + buttons.length + " buttons");
    
    // Test button click directly
    if (buttons.length > 0) {
        console.log("[Phone] Testing first button click...");
        try {
            buttons[0].onClick();
        } catch (e) {
            console.log("[Phone] Button test failed: " + String(e));
        }
    }
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
    console.log("[Phone] Building text messaging app...");
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
    
    // Load player list
    loadPlayerList();
}

// Text messaging core functions
function loadPlayerList() {
    console.log("[Phone] Loading player list...");
    
    // Test both APIs to see which works
    var players = [];
    
    try {
        // Test getClients() first
        if (typeof getClients === "function") {
            var clients = getClients();
            console.log("[Phone] getClients() returned: " + JSON.stringify(clients));
            if (clients && Array.isArray(clients)) {
                players = clients;
            }
        }
    } catch (e) {
        console.log("[Phone] getClients() failed: " + String(e));
    }
    
    try {
        // Test getPlayers() as fallback
        if (players.length === 0 && typeof getPlayers === "function") {
            var playerList = getPlayers();
            console.log("[Phone] getPlayers() returned: " + JSON.stringify(playerList));
            if (playerList && Array.isArray(playerList)) {
                players = playerList;
            }
        }
    } catch (e) {
        console.log("[Phone] getPlayers() failed: " + String(e));
    }
    
    // Filter out local player
    var filteredPlayers = [];
    var localPlayerName = "";
    
    try {
        if (typeof localClient !== "undefined" && localClient && localClient.name) {
            localPlayerName = localClient.name;
        } else if (typeof player !== "undefined" && player && player.name) {
            localPlayerName = player.name;
        }
    } catch (e) {
        console.log("[Phone] Error getting local player name: " + String(e));
    }
    
    for (var i = 0; i < players.length; i++) {
        var p = players[i];
        var playerName = p.name || (p.toString && p.toString()) || "Unknown";
        
        // Remove #0 suffix if present
        playerName = playerName.replace(/#\d+$/, "");
        
        if (playerName !== localPlayerName) {
            filteredPlayers.push({
                id: p.id || i,
                name: playerName,
                data: p
            });
        }
    }
    
    Phone.textState.playerList = filteredPlayers;
    updatePlayerListDisplay();
}

function updatePlayerListDisplay() {
    var list = Phone.controls.text.playerListPanel.list;
    if (!list) return;
    
    // Clear existing entries - try different methods
    try {
        if (list.axis && list.axis.y && list.axis.y.clear) {
            list.axis.y.clear();
        } else if (list.clear) {
            list.clear();
        } else if (list.entries) {
            list.entries = [];
        } else {
            console.log("[Phone] List clear method not found, creating new list");
            // Recreate the list if clear doesn't work
            var styles = Phone.controls.styles;
            var pad = Phone.config.padding;
            var top = Phone.config.headerHeight + pad;
            Phone.controls.text.playerListPanel.list = Phone.window.list(pad, top + 40, Phone.config.width - pad * 2, 320, styles);
            list = Phone.controls.text.playerListPanel.list;
        }
    } catch (e) {
        console.log("[Phone] Error clearing list: " + String(e));
    }
    
    // Add players to list
    for (var i = 0; i < Phone.textState.playerList.length; i++) {
        var player = Phone.textState.playerList[i];
        try {
            if (list.axis && list.axis.y && list.axis.y.addEntry) {
                list.axis.y.addEntry({
                    text: player.name,
                    playerData: player
                });
            } else if (list.addEntry) {
                list.addEntry({
                    text: player.name,
                    playerData: player
                });
            } else {
                console.log("[Phone] List addEntry method not found");
            }
        } catch (e) {
            console.log("[Phone] Error adding player to list: " + String(e));
        }
    }
    
    console.log("[Phone] Player list updated with " + Phone.textState.playerList.length + " players");
}

function showTextPanel(panelName) {
    console.log("[Phone] Showing text panel: " + panelName);
    Phone.textState.currentPanel = panelName;
    
    // Hide all text panels first
    setControlsVisible(Phone.controls.text.playerListPanel, false);
    setControlsVisible(Phone.controls.text.composePanel, false);
    setControlsVisible(Phone.controls.text.conversationPanel, false);
    
    // Show selected panel
    switch (panelName) {
        case "playerList":
            setControlsVisible(Phone.controls.text.playerListPanel, true);
            break;
        case "messageCompose":
            setControlsVisible(Phone.controls.text.composePanel, true);
            if (Phone.textState.selectedPlayer) {
                Phone.controls.text.composePanel.title.text = Phone.textState.selectedPlayer.name;
            }
            break;
        case "conversation":
            setControlsVisible(Phone.controls.text.conversationPanel, true);
            updateConversationDisplay();
            break;
    }
    
    updateKeyboardContext();
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
                if (input && input.text.length < Phone.config.messageCharLimit) {
                    input.text += ch;
                    Phone.textState.messageInput = input.text;
                }
            },
            deleteChar: function() { 
                var input = Phone.controls.text.composePanel.input;
                if (input && input.text.length > 0) {
                    input.text = input.text.slice(0, -1);
                    Phone.textState.messageInput = input.text;
                }
            },
            spaceChar: function() { 
                var input = Phone.controls.text.composePanel.input;
                if (input && input.text.length < Phone.config.messageCharLimit) {
                    input.text += " ";
                    Phone.textState.messageInput = input.text;
                }
            }
        });
    } else {
        // Configure for navigation (Backspace goes back)
        KeyboardService.setConfig({
            isActive: function() { return Phone.active && !Phone.textState.isTyping; },
            appendChar: function() {},
            deleteChar: function() {
                // Backspace goes back when not typing
                if (Phone.textState.currentPanel !== "playerList") {
                    showTextPanel("playerList");
                } else {
                    showApp("home");
                }
            },
            spaceChar: function() {}
        });
    }
    
    console.log("[Phone] Keyboard context updated - typing: " + isTyping);
}

function sendMessage() {
    if (!Phone.textState.selectedPlayer || !Phone.textState.messageInput.trim()) {
        console.log("[Phone] Cannot send message - no player or empty message");
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
    
    console.log("[Phone] Message sent to " + Phone.textState.selectedPlayer.name);
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
        console.log("[Phone] setControlsVisible: group is null");
        return;
    }
    
    console.log("[Phone] setControlsVisible: " + (visible ? "SHOWING" : "HIDING") + " group");
    
    // Helper function to set visibility on a control
    function setVisibility(control) {
        if (control && typeof control === "object" && control.shown !== undefined) {
            control.shown = visible;
            console.log("[Phone] Set control visibility to: " + visible);
        } else {
            console.log("[Phone] Control has no shown property or is invalid");
        }
    }
    
    // Handle nested controls and buttons
    for (var key in group) {
        if (group.hasOwnProperty(key)) {
            var control = group[key];
            if (control && typeof control === "object") {
                console.log("[Phone] Processing control: " + key);
                // Handle panels with visible property
                if (control.visible !== undefined) {
                    console.log("[Phone] Panel found: " + key);
                    setVisibility(control.title);
                    setVisibility(control.list);
                    setVisibility(control.input);
                    control.visible = visible;
                } else {
                    setVisibility(control);
                }
                // Handle buttons array (may contain images and labels)
                if (control.buttons && Array.isArray(control.buttons)) {
                    console.log("[Phone] Processing buttons array: " + control.buttons.length + " items");
                    for (var i = 0; i < control.buttons.length; i++) {
                        setVisibility(control.buttons[i]);
                    }
                }
            }
        }
    }
    
    // Handle top-level buttons array (may contain images and labels)
    if (group.buttons && Array.isArray(group.buttons)) {
        console.log("[Phone] Processing top-level buttons array: " + group.buttons.length + " items");
        for (var j = 0; j < group.buttons.length; j++) {
            setVisibility(group.buttons[j]);
        }
    }
}

function showApp(appId) {
    // Input validation using shared utility
    appId = Utils.validateInput(appId, "string", "home", ["home", "jobs", "text", "cars", "bank"]);
    
    console.log("[Phone] Showing app: " + appId);
    Phone.currentApp = appId;

    // Hide all apps first
    console.log("[Phone] Hiding all apps...");
    setControlsVisible(Phone.controls.home, false);
    setControlsVisible(Phone.controls.jobs, false);
    setControlsVisible(Phone.controls.cars, false);
    setControlsVisible(Phone.controls.bank, false);
    setControlsVisible(Phone.controls.text, false);

    // Show selected app
    console.log("[Phone] Showing app: " + appId);
    if (appId === "home") {
        console.log("[Phone] Showing home controls");
        setControlsVisible(Phone.controls.home, true);
    } else if (appId === "jobs") {
        console.log("[Phone] Showing jobs controls");
        setControlsVisible(Phone.controls.jobs, true);
    } else if (appId === "text") {
        console.log("[Phone] Showing text controls");
        setControlsVisible(Phone.controls.text, true);
        showTextPanel("playerList"); // Show player list when text app opens
    } else if (appId === "cars") {
        console.log("[Phone] Showing cars controls");
        setControlsVisible(Phone.controls.cars, true);
    } else if (appId === "bank") {
        console.log("[Phone] Showing bank controls");
        setControlsVisible(Phone.controls.bank, true);
    }

    if (Phone.controls.back) {
        Phone.controls.back.shown = (appId !== "home");
    }
    if (Phone.controls.title) {
        Phone.controls.title.text = (appId === "home") ? "PHONE" : String(appId).toUpperCase();
        console.log("[Phone] Title updated to: " + Phone.controls.title.text);
    }
}

Phone.show = function() {
    if (Phone.active) {
        return;
    }
    if (!ensureWindow()) {
        return;
    }
    Phone.window.shown = true;
    Phone.active = true;
    showApp(Phone.currentApp || "home");

    var ui = getJobsRpUi();
    if (ui && ui.setInput) {
        ui.setInput(true);
    }
};

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
    console.log("[Phone] Cleaning up resources...");
    
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
    
    console.log("[Phone] Cleanup complete");
};

Phone.toggle = function() {
    console.log("[Phone] Toggle called, active: " + Phone.active);
    if (Phone.active) {
        Phone.hide();
    } else {
        Phone.show();
    }
};

if (typeof addCommandHandler === "function") {
    addCommandHandler("phone", function() {
        console.log("[Phone] Phone command received");
        Phone.toggle();
    });
}

if (typeof bindKey === "function") {
    if (typeof SDLK_p !== "undefined" && typeof KEYSTATE_DOWN !== "undefined") {
        bindKey(SDLK_p, KEYSTATE_DOWN, function() {
            console.log("[Phone] P key pressed");
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
        console.log("[Phone] Message received: " + JSON.stringify(data));
        
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
            console.log("[Phone] New message from " + data.senderName);
        }
    });
    
    addNetworkHandler("phone.messageDelivered", function(data) {
        console.log("[Phone] Message delivered: " + JSON.stringify(data));
        
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
    
    console.log("[Phone] Text messaging network handlers registered");
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
            console.log("[Phone] Enter key bound for message sending");
        }
    } catch (e) {
        console.log("[Phone] Failed to bind Enter key: " + String(e));
    }
}

console.log("[Phone] Phone UI ready. Use /phone or P.");
