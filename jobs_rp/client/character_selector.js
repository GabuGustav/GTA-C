// Character Selector UI for GTAC Roleplay
// Visual character selection interface using MEXUI framework

"use strict";

var CharacterSelector = CharacterSelector || {};

CharacterSelector.visible = false;
CharacterSelector.window = null;
CharacterSelector.models = [];
CharacterSelector.categories = [];
CharacterSelector.currentModel = null;
CharacterSelector.selectedCategory = null;
CharacterSelector.selectedIndex = 0;
CharacterSelector.context = "freeroam";
CharacterSelector.initialized = false;

// Initialize character selector
CharacterSelector.init = function() {
    if (CharacterSelector.initialized) {
        return;
    }
    
    debugLog("[CharacterSelector] Initializing character selector");
    
    // Register network event handlers for server-to-client communication
    if (typeof addNetworkHandler !== "undefined") {
        addNetworkHandler("characterSelector_open", function(data) {
            CharacterSelector.onOpenSelector(null, data);
        });
        
        addNetworkHandler("characterSelector_close", function() {
            CharacterSelector.onCloseSelector();
        });
        
        addNetworkHandler("characterSelector_select", function(data) {
            CharacterSelector.onCharacterSelected(null, data);
        });
        
        debugLog("[CharacterSelector] Network handlers registered");
    } else {
        debugLog("[CharacterSelector] addNetworkHandler not available");
    }
    
    CharacterSelector.initialized = true;
    debugLog("[CharacterSelector] Character selector initialized");
};

// Open character selector UI
CharacterSelector.onOpenSelector = function(client, data) {
    if (CharacterSelector.visible) {
        return;
    }
    
    debugLog("[CharacterSelector] Opening character selector");
    
    CharacterSelector.models = data.models || [];
    CharacterSelector.categories = data.categories || [];
    CharacterSelector.currentModel = data.current;
    CharacterSelector.context = data.context || "freeroam";
    CharacterSelector.selectedCategory = CharacterSelector.categories[0];
    CharacterSelector.selectedIndex = 0;
    
    CharacterSelector.createUI();
    CharacterSelector.visible = true;
};

// Close character selector
CharacterSelector.onCloseSelector = function(client) {
    if (!CharacterSelector.visible) {
        return;
    }
    
    debugLog("[CharacterSelector] Closing character selector");
    
    if (CharacterSelector.window) {
        CharacterSelector.window.destroy();
        CharacterSelector.window = null;
    }
    
    CharacterSelector.visible = false;
};

// Handle character selection from server
CharacterSelector.onCharacterSelected = function(client, data) {
    debugLog("[CharacterSelector] Applying character: " + data.modelName);
    
    // Apply the character model
    if (typeof natives !== "undefined" && natives.changePlayerModel) {
        try {
            natives.changePlayerModel(localPlayer, data.modelHash);
            showMessage("Character changed to: " + data.modelName);
        } catch (e) {
            debugLog("[CharacterSelector] Error changing model: " + e.message);
            showMessage("Failed to change character model");
        }
    }
    
    CharacterSelector.onCloseSelector();
};

// Create the character selector UI
CharacterSelector.createUI = function() {
    if (typeof mexui === "undefined") {
        debugLog("[CharacterSelector] MEXUI not available");
        return;
    }
    
    var styles = {
        window: {
            background: "rgba(0, 0, 0, 0.9)",
            border: "2px solid #333",
            borderRadius: "8px"
        },
        title: {
            color: "#fff",
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
            padding: "10px"
        },
        category: {
            background: "rgba(50, 50, 50, 0.8)",
            border: "1px solid #555",
            color: "#fff",
            padding: "8px",
            margin: "2px",
            borderRadius: "4px",
            cursor: "pointer"
        },
        categorySelected: {
            background: "rgba(100, 150, 200, 0.8)",
            border: "1px solid #4a90e2"
        },
        character: {
            background: "rgba(40, 40, 40, 0.8)",
            border: "1px solid #666",
            color: "#fff",
            padding: "10px",
            margin: "2px",
            borderRadius: "4px",
            cursor: "pointer",
            textAlign: "center"
        },
        characterSelected: {
            background: "rgba(100, 200, 100, 0.8)",
            border: "1px solid #4caf50"
        },
        button: {
            background: "rgba(70, 130, 180, 0.8)",
            border: "1px solid #4682b4",
            color: "#fff",
            padding: "10px 20px",
            margin: "5px",
            borderRadius: "4px",
            cursor: "pointer"
        },
        buttonHover: {
            background: "rgba(100, 150, 200, 0.8)"
        }
    };
    
    // Create main window
    CharacterSelector.window = mexui.window(
        200, 100, 600, 500,
        "Character Selector - " + CharacterSelector.context,
        styles.window
    );
    
    // Title
    CharacterSelector.window.addText(
        10, 10, 580, 30,
        "Choose Your Character",
        styles.title
    );
    
    // Category buttons
    var categoryY = 50;
    var categoryWidth = 140;
    CharacterSelector.categoryButtons = [];
    
    for (var i = 0; i < CharacterSelector.categories.length; i++) {
        var category = CharacterSelector.categories[i];
        var categoryX = 10 + (i % 4) * categoryWidth;
        
        var button = CharacterSelector.window.addButton(
            categoryX, categoryY + Math.floor(i / 4) * 35,
            categoryWidth - 5, 30,
            category.icon + " " + category.name,
            CharacterSelector.createCategoryClickHandler(category, i),
            i === 0 ? styles.categorySelected : styles.category
        );
        
        CharacterSelector.categoryButtons.push(button);
    }
    
    // Character grid
    CharacterSelector.characterGridY = categoryY + Math.ceil(CharacterSelector.categories.length / 4) * 35 + 10;
    CharacterSelector.createCharacterGrid(styles);
    
    // Action buttons
    var buttonY = 450;
    CharacterSelector.window.addButton(
        200, buttonY, 80, 30,
        "Select",
        CharacterSelector.onSelectClick,
        styles.button
    );
    
    CharacterSelector.window.addButton(
        320, buttonY, 80, 30,
        "Cancel",
        CharacterSelector.onCancelClick,
        styles.button
    );
};

// Create character grid
CharacterSelector.createCharacterGrid = function(styles) {
    if (!CharacterSelector.window || !CharacterSelector.selectedCategory) {
        return;
    }
    
    // Clear existing character buttons
    if (CharacterSelector.characterButtons) {
        for (var i = 0; i < CharacterSelector.characterButtons.length; i++) {
            CharacterSelector.window.removeControl(CharacterSelector.characterButtons[i]);
        }
    }
    CharacterSelector.characterButtons = [];
    
    // Get models for selected category
    var categoryModels = CharacterSelector.getModelsForCategory(CharacterSelector.selectedCategory.id);
    
    // Create grid
    var gridStartY = CharacterSelector.characterGridY;
    var gridCols = 4;
    var cardWidth = 140;
    var cardHeight = 80;
    var cardSpacing = 5;
    
    for (var i = 0; i < categoryModels.length; i++) {
        var model = categoryModels[i];
        var col = i % gridCols;
        var row = Math.floor(i / gridCols);
        var x = 10 + col * (cardWidth + cardSpacing);
        var y = gridStartY + row * (cardHeight + cardSpacing);
        
        var isSelected = (CharacterSelector.currentModel === model.id);
        var cardStyles = isSelected ? styles.characterSelected : styles.character;
        
        var card = CharacterSelector.window.addText(
            x, y, cardWidth, cardHeight,
            CharacterSelector.formatCharacterCard(model),
            CharacterSelector.createCharacterClickHandler(model, i),
            cardStyles
        );
        
        CharacterSelector.characterButtons.push(card);
    }
};

// Get models for category
CharacterSelector.getModelsForCategory = function(categoryId) {
    if (typeof JobsRP !== "undefined" && JobsRP.CharacterDefs) {
        return JobsRP.CharacterDefs.getModelsByCategory(categoryId);
    }
    
    // Fallback to local models
    return CharacterSelector.models.filter(function(model) {
        return model.category === categoryId;
    });
};

// Format character card text
CharacterSelector.formatCharacterCard = function(model) {
    var lines = [];
    lines.push(model.name);
    if (model.description) {
        lines.push(model.description.substring(0, 30) + (model.description.length > 30 ? "..." : ""));
    }
    if (model.required) {
        lines.push("[Required for job]");
    }
    return lines.join("\\n");
};

// Create category click handler
CharacterSelector.createCategoryClickHandler = function(category, index) {
    return function() {
        CharacterSelector.selectedCategory = category;
        CharacterSelector.selectedIndex = index;
        
        // Update button styles
        for (var i = 0; i < CharacterSelector.categoryButtons.length; i++) {
            var button = CharacterSelector.categoryButtons[i];
            if (i === index) {
                button.setStyle(CharacterSelector.styles.categorySelected);
            } else {
                button.setStyle(CharacterSelector.styles.category);
            }
        }
        
        // Refresh character grid
        CharacterSelector.createCharacterGrid(CharacterSelector.styles);
    };
};

// Create character click handler
CharacterSelector.createCharacterClickHandler = function(model, index) {
    return function() {
        CharacterSelector.currentModel = model.id;
        
        // Update button styles
        for (var i = 0; i < CharacterSelector.characterButtons.length; i++) {
            var button = CharacterSelector.characterButtons[i];
            if (i === index) {
                button.setStyle(CharacterSelector.styles.characterSelected);
            } else {
                button.setStyle(CharacterSelector.styles.character);
            }
        }
    };
};

// Handle select button click
CharacterSelector.onSelectClick = function() {
    if (!CharacterSelector.currentModel) {
        showMessage("Please select a character first");
        return;
    }
    
    debugLog("[CharacterSelector] Requesting character: " + CharacterSelector.currentModel);
    
    // Send selection request to server
    if (typeof triggerServerEvent !== "undefined") {
        triggerServerEvent("characterSelector_requestSelect", localPlayer, CharacterSelector.currentModel);
    } else if (typeof triggerNetworkEvent !== "undefined") {
        triggerNetworkEvent("characterSelector_requestSelect", CharacterSelector.currentModel);
    }
};

// Handle cancel button click
CharacterSelector.onCancelClick = function() {
    // Send cancel request to server
    if (typeof triggerServerEvent !== "undefined") {
        triggerServerEvent("characterSelector_requestClose", localPlayer);
    } else if (typeof triggerNetworkEvent !== "undefined") {
        triggerNetworkEvent("characterSelector_requestClose");
    }
    CharacterSelector.onCloseSelector();
};

// Utility functions
function debugLog(message) {
    if (typeof console !== "undefined" && console.log) {
        console.log(message);
    }
}

function showMessage(text) {
    try {
        if (typeof natives !== "undefined" && natives.printStringWithLiteralStringNow) {
            natives.printStringWithLiteralStringNow('STRING', text, 3000, true);
        }
    } catch (e) {
        // Silent error handling
    }
}

// Initialize when ready
if (typeof mexui !== "undefined") {
    CharacterSelector.init();
} else {
    // Wait for MEXUI to load
    setTimeout(CharacterSelector.init, 1000);
}

debugLog("[CharacterSelector] Character selector script loaded");
