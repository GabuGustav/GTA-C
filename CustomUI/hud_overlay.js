/**
 * hud_overlay.js  --  CSS-driven health bar HUD  (v2)
 *
 * Changes from v1:
 *   - All visual properties defined in css/hud.css
 *   - Script calls module.ui.loadCSS() then module.ui.applyStyle()
 *   - Script only manages: fill logic, colour class selection, event binding
 *   - DLL owns: CSS parsing, DRAW_RECT calls, border-radius approximation
 *
 * ARCHITECTURE RULE (unchanged):
 *   Script owns: fill maths, style class selection, event binding
 *   DLL owns:    CSS parsing, DRAW_RECT, SET_TEXT_* native calls
 *   Script NEVER calls natives directly
 */

"use strict";

const ANCHOR_TOP      = 0x01;
const ANCHOR_LEFT     = 0x04;
const STYLE_CLAMP_SCREEN = 0x02;

let hud = {
    bg: null, accent: null, bar: null, label: null,
    fill: 1.0,
    BAR_LEFT: 0.014, BAR_MAX_W: 0.21, BAR_TOP: 0.016, BAR_H: 0.03,
};

function create_hud() {
    let loaded = module.ui.loadCSS("css/hud.css");
    if (!loaded) {
        hud.bg = module.ui.createRect(0.01, 0.01, 0.22, 0.042, 10, 10, 10, 200);
    } else {
        hud.bg = module.ui.createRect(0, 0, 0, 0, 0, 0, 0, 0);
        module.ui.applyStyle(hud.bg, "hud-bg");
    }
    module.ui.setAnchor(hud.bg, ANCHOR_TOP | ANCHOR_LEFT);
    module.ui.setStyle(hud.bg, STYLE_CLAMP_SCREEN);

    hud.accent = module.ui.createRect(0, 0, 0, 0, 0, 0, 0, 0);
    module.ui.applyStyle(hud.accent, "hud-accent");
    module.ui.setAnchor(hud.accent, ANCHOR_TOP | ANCHOR_LEFT);
    module.ui.setStyle(hud.accent, STYLE_CLAMP_SCREEN);

    hud.bar = module.ui.createRect(hud.BAR_LEFT, hud.BAR_TOP, hud.BAR_MAX_W, hud.BAR_H, 80, 220, 80, 230);
    module.ui.applyStyle(hud.bar, "hud-bar-full");
    module.ui.setAnchor(hud.bar, ANCHOR_TOP | ANCHOR_LEFT);
    module.ui.setStyle(hud.bar, STYLE_CLAMP_SCREEN);

    hud.label = module.ui.createText(0, 0, 0.28, 255, 255, 255, 255, 0, "HEALTH 100%");
    module.ui.applyStyle(hud.label, "hud-label");
    module.ui.setAnchor(hud.label, ANCHOR_TOP | ANCHOR_LEFT);
    module.ui.setStyle(hud.label, STYLE_CLAMP_SCREEN);
}

function update_bar(newFill) {
    newFill = Math.max(0.0, Math.min(1.0, newFill));
    if (Math.abs(newFill - hud.fill) < 0.001) return;
    hud.fill = newFill;

    module.ui.setSize(hud.bar, hud.BAR_MAX_W * hud.fill, hud.BAR_H);

    if (hud.fill > 0.5)       module.ui.applyStyle(hud.bar, "hud-bar-full");
    else if (hud.fill > 0.25) module.ui.applyStyle(hud.bar, "hud-bar-mid");
    else                      module.ui.applyStyle(hud.bar, "hud-bar-low");

    module.ui.setText(hud.label, "HEALTH  " + Math.round(hud.fill * 100) + "%");
}

addEventHandler("onClientResourceStart", function(resourceName) {
    if (resourceName !== getResourceName()) return;
    create_hud();
});

addEventHandler("onClientResourceStop", function(resourceName) {
    if (resourceName !== getResourceName()) return;
    module.ui.destroyAll();
});

addEventHandler("onClientRender", function() {
    let player = gta.getLocalPlayer();
    if (!player) return;
    let ped = player.ped;
    if (!ped) return;
    let health = natives.getCharHealth(ped);
    update_bar(Math.max(0, health - 100) / 100.0);
});

let hudVisible = true;
addEventHandler("onClientKey", function(key, state) {
    if (key === 118 && state === false) {
        hudVisible = !hudVisible;
        [hud.bg, hud.accent, hud.bar, hud.label].forEach(function(h) {
            module.ui.setVisible(h, hudVisible);
        });
    }
    // F8 = hot-reload CSS without restarting the resource
    if (key === 119 && state === false) {
        module.ui.loadCSS("css/hud.css");
        module.ui.applyStyle(hud.bg,     "hud-bg");
        module.ui.applyStyle(hud.accent, "hud-accent");
        module.ui.applyStyle(hud.label,  "hud-label");
    }
});