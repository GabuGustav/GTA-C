--[[
    hud_overlay.lua  –  Client-side GTAC resource script (Lua port)

    Identical behaviour to hud_overlay.js; provided for servers that
    prefer Lua scripting.

    Resource meta.xml:
      <script language="lua" type="client" src="hud_overlay.lua" />

    ARCHITECTURE RULE (same as JS version):
      ✓  Script owns: layout intent, fill logic, colour lerp, event binding
      ✓  DLL owns:    DRAW_RECT calls, anchor resolution, aspect-ratio fix
      ✗  Script NEVER touches: natives.drawRect, natives.getScreenResolution
--]]

-- ── Anchor / style constants (mirror ui_renderer.h) ──────────────────────────

local ANCHOR_TOP      = 0x01
local ANCHOR_BOTTOM   = 0x02
local ANCHOR_LEFT     = 0x04
local ANCHOR_RIGHT    = 0x08
local ANCHOR_CENTER_H = 0x10
local ANCHOR_CENTER_V = 0x20

local STYLE_NONE         = 0x00
local STYLE_CLAMP_SCREEN = 0x02

-- ── UI state table ────────────────────────────────────────────────────────────

local hud = {
    bgHandle     = nil,
    barHandle    = nil,
    accentHandle = nil,
    labelHandle  = nil,
    fill         = 1.0,

    -- Colour themes
    fullColor = { r = 80,  g = 220, b = 80,  a = 230 },
    midColor  = { r = 230, g = 200, b = 30,  a = 230 },
    lowColor  = { r = 220, g = 60,  b = 60,  a = 230 },

    -- Layout (normalised)
    PANEL_X       = 0.01,
    PANEL_Y       = 0.01,
    PANEL_W       = 0.22,
    PANEL_H       = 0.042,
    BAR_PADDING_X = 0.004,
    BAR_PADDING_Y = 0.006,
}

-- ── Colour lerp ───────────────────────────────────────────────────────────────

local function lerp_color(a, b, t)
    return {
        r = math.floor(a.r + (b.r - a.r) * t + 0.5),
        g = math.floor(a.g + (b.g - a.g) * t + 0.5),
        b = math.floor(a.b + (b.b - a.b) * t + 0.5),
        a = math.floor(a.a + (b.a - a.a) * t + 0.5),
    }
end

local function fill_color(fill)
    if fill > 0.5 then
        return lerp_color(hud.midColor, hud.fullColor, (fill - 0.5) * 2.0)
    else
        return lerp_color(hud.lowColor, hud.midColor, fill * 2.0)
    end
end

-- ── Create all HUD elements ───────────────────────────────────────────────────

local function create_hud()
    -- Background panel
    hud.bgHandle = module.ui.createRect(
        hud.PANEL_X, hud.PANEL_Y,
        hud.PANEL_W, hud.PANEL_H,
        10, 10, 10, 200
    )
    module.ui.setAnchor(hud.bgHandle, ANCHOR_TOP + ANCHOR_LEFT)
    module.ui.setStyle (hud.bgHandle, STYLE_CLAMP_SCREEN)

    -- Accent line
    hud.accentHandle = module.ui.createRect(
        hud.PANEL_X, hud.PANEL_Y,
        hud.PANEL_W, 0.003,
        100, 180, 255, 200
    )
    module.ui.setAnchor(hud.accentHandle, ANCHOR_TOP + ANCHOR_LEFT)
    module.ui.setStyle (hud.accentHandle, STYLE_CLAMP_SCREEN)

    -- Fill bar
    local barX = hud.PANEL_X + hud.BAR_PADDING_X
    local barY = hud.PANEL_Y + hud.BAR_PADDING_Y
    local barW = (hud.PANEL_W - hud.BAR_PADDING_X * 2) * hud.fill
    local barH = hud.PANEL_H - hud.BAR_PADDING_Y * 2

    local col  = fill_color(hud.fill)
    hud.barHandle = module.ui.createRect(
        barX, barY, barW, barH,
        col.r, col.g, col.b, col.a
    )
    module.ui.setAnchor(hud.barHandle, ANCHOR_TOP + ANCHOR_LEFT)
    module.ui.setStyle (hud.barHandle, STYLE_CLAMP_SCREEN)

    -- Label
    hud.labelHandle = module.ui.createText(
        hud.PANEL_X + 0.005,
        hud.PANEL_Y + 0.012,
        0.28,
        255, 255, 255, 255,
        0,
        "HEALTH  100%"
    )
    module.ui.setAnchor(hud.labelHandle, ANCHOR_TOP + ANCHOR_LEFT)
    module.ui.setStyle (hud.labelHandle, STYLE_CLAMP_SCREEN)
end

-- ── Update bar width + colour ─────────────────────────────────────────────────

local function update_bar(newFill)
    newFill = math.max(0.0, math.min(1.0, newFill))
    if math.abs(newFill - hud.fill) < 0.0001 then return end
    hud.fill = newFill

    local barW = (hud.PANEL_W - hud.BAR_PADDING_X * 2) * hud.fill
    local barH = hud.PANEL_H - hud.BAR_PADDING_Y * 2
    module.ui.setSize(hud.barHandle, barW, barH)

    local col = fill_color(hud.fill)
    module.ui.setColor(hud.barHandle, col.r, col.g, col.b, col.a)

    local pct = math.floor(hud.fill * 100 + 0.5)
    module.ui.setText(hud.labelHandle, "HEALTH  " .. pct .. "%")
end

-- ── GTAC events ───────────────────────────────────────────────────────────────

addEventHandler("onClientResourceStart", function(resourceName)
    if resourceName ~= getResourceName() then return end
    create_hud()
end)

addEventHandler("onClientResourceStop", function(resourceName)
    if resourceName ~= getResourceName() then return end
    module.ui.destroyAll()
end)

addEventHandler("onClientRender", function()
    local player = gta.getLocalPlayer()
    if not player then return end
    local ped = player.ped
    if not ped then return end

    local health = natives.getCharHealth(ped)   -- 0 – 200 in GTA IV
    local fill   = math.max(0, health - 100) / 100.0
    update_bar(fill)
end)

-- ── F7 toggle ─────────────────────────────────────────────────────────────────

local hudVisible = true

addEventHandler("onClientKey", function(key, state)
    if key == 118 and state == false then   -- 118 = F7
        hudVisible = not hudVisible
        module.ui.setVisible(hud.bgHandle,     hudVisible)
        module.ui.setVisible(hud.barHandle,    hudVisible)
        module.ui.setVisible(hud.accentHandle, hudVisible)
        module.ui.setVisible(hud.labelHandle,  hudVisible)
    end
end)