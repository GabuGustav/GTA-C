"use strict";

console.log("[SharedUtils] Loading shared utilities...");

// Shared utility functions for jobs_rp client scripts
var JobsClient = JobsClient || {};
JobsClient.Utils = JobsClient.Utils || {};

var Utils = JobsClient.Utils;

// Get the appropriate UI framework (JobsRP.ui or mexui)
Utils.getJobsRpUi = function() {
    try {
        if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.ui) {
            return JobsRP.ui;
        }
    } catch (e) {
        console.log("[SharedUtils] Error checking JobsRP.ui: " + String(e));
    }
    if (typeof mexui !== "undefined" && mexui) {
        return mexui;
    }
    return null;
};

// Get screen size with fallbacks
Utils.getScreenSize = function() {
    var width = 1280;
    var height = 720;
    
    try {
        // Try GTAC gta object first
        if (gta && gta.width) {
            width = Number(gta.width) || width;
        }
        if (gta && gta.height) {
            height = Number(gta.height) || height;
        }
    } catch (e) {
        console.log("[SharedUtils] Error getting screen size from gta: " + String(e));
    }
    
    // Note: screen object is not available in GTAC, only gta.width/height
    // Removed screen object fallback as it doesn't exist in GTAC

    return { width: width, height: height };
};

// Safe server communication with error handling
Utils.sendServerSafe = function(eventName, data) {
    try {
        if (JobsClient && typeof JobsClient.sendServer === "function") {
            JobsClient.sendServer(eventName, data);
            return true;
        } else {
            console.log("[SharedUtils] JobsClient.sendServer not available for event: " + eventName);
            return false;
        }
    } catch (e) {
        console.log("[SharedUtils] Error sending server event " + eventName + ": " + String(e));
        return false;
    }
};

// Safe network event triggering with fallbacks
Utils.triggerNetworkEventSafe = function(eventName) {
    try {
        if (typeof triggerNetworkEvent === "function") {
            var args = [eventName];
            for (var i = 1; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
            triggerNetworkEvent.apply(null, args);
            return true;
        } else {
            console.log("[SharedUtils] No network event function available for: " + eventName);
            return false;
        }
    } catch (e) {
        console.log("[SharedUtils] Error triggering network event " + eventName + ": " + String(e));
        return false;
    }
};

// Validate input with type checking and fallback
Utils.validateInput = function(value, type, defaultValue, allowedValues) {
    // Check if value is undefined/null
    if (value === undefined || value === null) {
        console.log("[SharedUtils] Input is undefined/null, using default: " + String(defaultValue));
        return defaultValue;
    }
    
    // Type checking
    if (type && typeof value !== type) {
        console.log("[SharedUtils] Input type mismatch, expected " + type + " got " + typeof value + ", using default");
        return defaultValue;
    }
    
    // Allowed values checking
    if (allowedValues && Array.isArray(allowedValues) && allowedValues.indexOf(value) === -1) {
        console.log("[SharedUtils] Input not in allowed values, using default: " + String(defaultValue));
        return defaultValue;
    }
    
    return value;
};

console.log("[SharedUtils] Shared utilities loaded");
