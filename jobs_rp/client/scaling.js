var JobsClient = JobsClient || {};
JobsClient.Scaling = JobsClient.Scaling || {};

var Scaling = JobsClient.Scaling;

Scaling.cache = Scaling.cache || {
    width: 0,
    height: 0,
    scale: 1.0,
    aspectRatio: 1.0,
    lastUpdate: 0,
    configLoaded: false
};

function getConfig() {
    try {
        if (typeof JobsRP !== "undefined" && JobsRP && JobsRP.Config) {
            Scaling.cache.configLoaded = true;
            return JobsRP.Config;
        }
    } catch (e) {
        // Silently fail if JobsRP not available yet
    }
    return {};
}

function getScalingConfig() {
    var config = getConfig();
    return {
        enabled: config.ui_scaling_enabled !== false,
        minScale: config.ui_min_scale || 0.5,
        maxScale: config.ui_max_scale || 3.0,
        refWidth: config.ui_reference_width || 1280,
        refHeight: config.ui_reference_height || 720,
        adaptiveText: config.ui_adaptive_text_scaling !== false
    };
}

function getScreenSize() {
    var width = 1280;
    var height = 720;

    try {
        if (gta && gta.width) {
            width = Number(gta.width) || width;
        }
        if (gta && gta.height) {
            height = Number(gta.height) || height;
        }
    } catch (e) {
    }

    if (width <= 0) {
        width = 1280;
    }
    if (height <= 0) {
        height = 720;
    }

    return {
        width: width,
        height: height
    };
}

function updateScalingCache() {
    var screen = getScreenSize();
    var now = Date.now ? Date.now() : 0;
    var cfg = getScalingConfig();
    
    if (!cfg.enabled) {
        Scaling.cache.scale = 1.0;
        Scaling.cache.width = screen.width;
        Scaling.cache.height = screen.height;
        Scaling.cache.lastUpdate = now;
        return;
    }
    
    if (screen.width === Scaling.cache.width && 
        screen.height === Scaling.cache.height && 
        (now - Scaling.cache.lastUpdate) < 5000) {
        return;
    }

    var scale = Math.min(screen.width / cfg.refWidth, screen.height / cfg.refHeight);
    scale = Math.max(cfg.minScale, Math.min(cfg.maxScale, scale));
    
    var aspectRatio = screen.width / screen.height;
    var refAspectRatio = cfg.refWidth / cfg.refHeight;
    var aspectCompensation = refAspectRatio / aspectRatio;

    Scaling.cache.width = screen.width;
    Scaling.cache.height = screen.height;
    Scaling.cache.scale = scale;
    Scaling.cache.aspectRatio = aspectRatio;
    Scaling.cache.aspectCompensation = aspectCompensation;
    Scaling.cache.lastUpdate = now;
}

Scaling.getScale = function() {
    updateScalingCache();
    return Scaling.cache.scale;
};

Scaling.getScreenSize = function() {
    updateScalingCache();
    return {
        width: Scaling.cache.width,
        height: Scaling.cache.height
    };
};

Scaling.getAspectRatio = function() {
    updateScalingCache();
    return Scaling.cache.aspectRatio;
};

Scaling.scalePixel = function(value) {
    return Math.max(1, Math.floor(value * Scaling.getScale()));
};

Scaling.scaleFloat = function(value) {
    return value * Scaling.getScale();
};

Scaling.scaleText = function(baseSize) {
    var scale = Scaling.getScale();
    var cfg = getScalingConfig();
    var scaled = Math.max(12, Math.floor(baseSize * scale));
    
    if (cfg.adaptiveText) {
        if (scale < 0.8) {
            scaled = Math.max(10, scaled - 2);
        } else if (scale > 1.5) {
            scaled = Math.min(48, scaled + 4);
        }
    }
    
    return scaled;
};

Scaling.scaleNativeText = function(baseScale) {
    var scale = Scaling.getScale();
    var adjusted = baseScale;
    
    if (scale < 0.8) {
        adjusted = baseScale * 0.8;
    } else if (scale > 1.5) {
        adjusted = baseScale * 1.2;
    }
    
    return Math.max(0.1, Math.min(1.0, adjusted));
};

Scaling.normalizeToScreen = function(normX, normY) {
    var screen = Scaling.getScreenSize();
    return {
        x: normX * screen.width,
        y: normY * screen.height
    };
};

Scaling.screenToNormalized = function(screenX, screenY) {
    var screen = Scaling.getScreenSize();
    return {
        x: screenX / screen.width,
        y: screenY / screen.height
    };
};

Scaling.getSafeArea = function() {
    var scale = Scaling.getScale();
    var aspectRatio = Scaling.getAspectRatio();
    
    var safeMargin = Scaling.scalePixel(20);
    var safeWidth = Scaling.cache.width - (safeMargin * 2);
    var safeHeight = Scaling.cache.height - (safeMargin * 2);
    
    return {
        x: safeMargin,
        y: safeMargin,
        width: safeWidth,
        height: safeHeight
    };
};

Scaling.createResponsiveLayout = function(options) {
    options = options || {};
    var screen = Scaling.getScreenSize();
    var scale = Scaling.getScale();
    
    var layout = {
        panel: {
            width: Scaling.scalePixel(options.panelWidth || 780),
            height: Scaling.scalePixel(options.panelHeight || 400)
        },
        margins: Scaling.scalePixel(options.margin || 20),
        padding: Scaling.scalePixel(options.padding || 10),
        lineHeight: Scaling.scalePixel(options.lineHeight || 40),
        buttonHeight: Scaling.scalePixel(options.buttonHeight || 36),
        inputHeight: Scaling.scalePixel(options.inputHeight || 36)
    };
    
    layout.panel.x = (screen.width - layout.panel.width) / 2;
    layout.panel.y = (screen.height - layout.panel.height) / 2;
    
    if (options.centerVertical) {
        layout.panel.y = screen.height * 0.5 - layout.panel.height / 2;
    }
    
    if (options.anchorBottom) {
        layout.panel.y = screen.height - layout.panel.height - layout.margins;
    }
    
    return layout;
};

Scaling.applyNativeTextStyle = function(baseScale) {
    try {
        if (!natives) {
            return;
        }

        var textScale = Scaling.scaleNativeText(baseScale || 0.20);
        
        if (natives.setTextScale) {
            natives.setTextScale(textScale, textScale);
        }
        if (natives.setTextFont) {
            natives.setTextFont(0);
        }
        if (natives.setTextColour) {
            natives.setTextColour(255, 255, 255, 255);
        }
        if (natives.setTextCentre) {
            natives.setTextCentre(false);
        }
        if (natives.setTextProportional) {
            natives.setTextProportional(true);
        }
        if (natives.setTextDropshadow) {
            natives.setTextDropshadow(false, 0, 0, 0, 255);
        }
    } catch (e) {
    }
};

Scaling.debugInfo = function() {
    updateScalingCache();
    var cfg = getScalingConfig();
    return {
        screen: {
            width: Scaling.cache.width,
            height: Scaling.cache.height
        },
        scale: Scaling.cache.scale,
        aspectRatio: Scaling.cache.aspectRatio,
        aspectCompensation: Scaling.cache.aspectCompensation,
        config: cfg,
        configLoaded: Scaling.cache.configLoaded,
        refSize: {
            width: cfg.refWidth,
            height: cfg.refHeight
        }
    };
};
