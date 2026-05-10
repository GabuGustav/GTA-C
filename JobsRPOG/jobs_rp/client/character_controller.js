// Character Controller for GTAC Roleplay
// Handles character model changes and local state management

"use strict";

var CharacterController = CharacterController || {};

CharacterController.initialized = false;
CharacterController.currentModel = null;
CharacterController.pendingModel = null;

// Initialize character controller
CharacterController.init = function() {
    if (CharacterController.initialized) {
        return;
    }
    
    debugLog("[CharacterController] Initializing character controller");
    
    // No event handlers needed - this controller only provides utility functions
    // The actual character application is handled by characterSelector.js
    
    CharacterController.initialized = true;
    debugLog("[CharacterController] Character controller initialized");
};

// Request character change
CharacterController.requestCharacterChange = function(modelId) {
    if (typeof triggerServerEvent !== "undefined") {
        triggerServerEvent("characterController_requestChange", localPlayer, modelId);
    } else if (typeof triggerNetworkEvent !== "undefined") {
        triggerNetworkEvent("characterController_requestChange", modelId);
    }
};

// Get current character model
CharacterController.getCurrentModel = function() {
    return CharacterController.currentModel;
};

// Check if character change is available
CharacterController.canChangeCharacter = function() {
    return CharacterController.initialized && typeof natives !== "undefined" && natives.changePlayerModel;
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

// Auto-initialize
setTimeout(function() {
    if (!CharacterController.initialized) {
        CharacterController.init();
    }
}, 500);

debugLog("[CharacterController] Character controller script loaded");
