"use strict";

var JobsClient = JobsClient || {};
JobsClient.ScalingTest = JobsClient.ScalingTest || {};

var ScalingTest = JobsClient.ScalingTest;

ScalingTest.enabled = false;
ScalingTest.drawEventName = "";

function startScalingTest() {
    if (ScalingTest.enabled) {
        return;
    }
    
    ScalingTest.enabled = true;
    ScalingTest.drawEventName = attachFirstHandler(
        ["OnDrawnHUD", "onDrawnHUD", "OnDrawHUD", "onDrawHUD", "OnRender", "onRender"],
        onScalingTestDraw
    );
    
    if (ScalingTest.drawEventName === "") {
        if (typeof console !== "undefined" && console && typeof console.log === "function") {
            console.log("[jobs_rp] Scaling test: HUD draw hook unavailable.");
        }
    } else {
        if (typeof console !== "undefined" && console && typeof console.log === "function") {
            console.log("[jobs_rp] Scaling test started. Use /scalingtest stop to end.");
        }
    }
}

function stopScalingTest() {
    if (!ScalingTest.enabled) {
        return;
    }
    
    detachHandler(ScalingTest.drawEventName, onScalingTestDraw);
    ScalingTest.drawEventName = "";
    ScalingTest.enabled = false;
    
    if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log("[jobs_rp] Scaling test stopped.");
    }
}

function onScalingTestDraw() {
    if (!ScalingTest.enabled) {
        return;
    }
    
    try {
        drawScalingTest();
    } catch (e) {
        if (typeof console !== "undefined" && console && typeof console.log === "function") {
            console.log("[jobs_rp] Scaling test draw error: " + String(e));
        }
    }
}

function drawScalingTest() {
    var screen = Scaling.getScreenSize();
    var scale = Scaling.getScale();
    var debugInfo = Scaling.debugInfo();
    
    // Background
    drawRectNorm(0.5, 0.5, 1.0, 1.0, 0, 0, 0, 180);
    
    // Test panels at different positions
    var panelSize = Scaling.scalePixel(100);
    
    // Top-left corner
    drawRectNorm(0.1, 0.1, Scaling.scaleFloat(0.15), Scaling.scaleFloat(0.15), 255, 0, 0, 200);
    
    // Top-right corner
    drawRectNorm(0.9, 0.1, Scaling.scaleFloat(0.15), Scaling.scaleFloat(0.15), 0, 255, 0, 200);
    
    // Bottom-left corner
    drawRectNorm(0.1, 0.9, Scaling.scaleFloat(0.15), Scaling.scaleFloat(0.15), 0, 0, 255, 200);
    
    // Bottom-right corner
    drawRectNorm(0.9, 0.9, Scaling.scaleFloat(0.15), Scaling.scaleFloat(0.15), 255, 255, 0, 200);
    
    // Center panel
    drawRectNorm(0.5, 0.5, Scaling.scaleFloat(0.3), Scaling.scaleFloat(0.2), 255, 255, 255, 200);
    
    // Text information
    var textX = Scaling.scalePixel(50);
    var textY = Scaling.scalePixel(50);
    var lineHeight = Scaling.scalePixel(25);
    
    try {
        renderText("SCALING TEST", textX, textY, Scaling.scaleText(24), 0xFFFFFFFF, 0.0);
        renderText("Screen: " + screen.width + "x" + screen.height, textX, textY + lineHeight, Scaling.scaleText(18), 0xFFFFFFFF, 0.0);
        renderText("Scale: " + scale.toFixed(3), textX, textY + lineHeight * 2, Scaling.scaleText(18), 0xFFFFFFFF, 0.0);
        renderText("Aspect: " + debugInfo.aspectRatio.toFixed(2), textX, textY + lineHeight * 3, Scaling.scaleText(18), 0xFFFFFFFF, 0.0);
        renderText("Config: " + (debugInfo.configLoaded ? "Loaded" : "Not loaded"), textX, textY + lineHeight * 4, Scaling.scaleText(18), 0xFFFFFFFF, 0.0);
        
        if (debugInfo.config) {
            renderText("Min Scale: " + debugInfo.config.minScale, textX, textY + lineHeight * 5, Scaling.scaleText(16), 0xCCCCCCCC, 0.0);
            renderText("Max Scale: " + debugInfo.config.maxScale, textX, textY + lineHeight * 6, Scaling.scaleText(16), 0xCCCCCCCC, 0.0);
            renderText("Ref: " + debugInfo.refSize.width + "x" + debugInfo.refSize.height, textX, textY + lineHeight * 7, Scaling.scaleText(16), 0xCCCCCCCC, 0.0);
        }
        
        renderText("Use /scalingtest stop to end test", textX, textY + lineHeight * 9, Scaling.scaleText(16), 0xFFFFAA00, 0.0);
    } catch (e) {
        if (typeof console !== "undefined" && console && typeof console.log === "function") {
            console.log("[jobs_rp] Scaling test text error: " + String(e));
        }
    }
}

// Command handlers (these would need to be connected to your command system)
ScalingTest.start = startScalingTest;
ScalingTest.stop = stopScalingTest;
ScalingTest.toggle = function() {
    if (ScalingTest.enabled) {
        stopScalingTest();
    } else {
        startScalingTest();
    }
};
