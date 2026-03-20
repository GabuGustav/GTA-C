"use strict";

var Freeroam = Freeroam || {};
Freeroam.Blips = Freeroam.Blips || {};

var Blips = Freeroam.Blips;

Blips.byKey = Blips.byKey || {};
Blips.colorByKey = Blips.colorByKey || {};
Blips.lastUpdateAt = 0;
Blips.updateMs = 1000;

function nowMs() {
    if (typeof Date !== "undefined" && Date.now) {
        return Date.now();
    }
    return Math.floor(Math.random() * 1000000000);
}

function getPlayerKey(player) {
    if (!player) {
        return null;
    }
    try {
        if (player.index !== undefined) {
            return "idx:" + String(player.index);
        }
    } catch (e1) {
    }
    try {
        if (player.getIndex) {
            return "idx:" + String(player.getIndex());
        }
    } catch (e2) {
    }
    try {
        if (player.name) {
            return "name:" + String(player.name);
        }
    } catch (e3) {
    }
    return null;
}

function getPlayerPos(player) {
    try {
        if (player.getPosition) {
            var pos = player.getPosition();
            if (pos && pos.length >= 3) {
                return [pos[0], pos[1], pos[2]];
            }
        }
    } catch (e1) {
    }
    try {
        if (player.position) {
            var p = player.position;
            if (p.x !== undefined && p.y !== undefined && p.z !== undefined) {
                return [p.x, p.y, p.z];
            }
        }
    } catch (e2) {
    }
    return null;
}

function getColorIndex(player, key) {
    if (!player) {
        return 1;
    }
    try {
        if (player.getData) {
            var idx = player.getData("freeroam.colorIndex");
            if (typeof idx === "number") {
                return idx;
            }
        }
    } catch (e1) {
    }
    return Blips.colorByKey[key] || 1;
}

function ensureBlipFor(player) {
    if (!player || player === localPlayer) {
        return;
    }
    var key = getPlayerKey(player);
    if (!key) {
        return;
    }

    var pos = getPlayerPos(player);
    if (!pos) {
        return;
    }

    var blipId = Blips.byKey[key];
    if (typeof blipId !== "number") {
        try {
            if (natives && natives.addBlipForCoord) {
                blipId = natives.addBlipForCoord([pos[0], pos[1], pos[2]]);
            }
        } catch (e1) {
        }
        if (typeof blipId === "number") {
            Blips.byKey[key] = blipId;
            try {
                if (natives && natives.changeBlipNameFromAscii) {
                    natives.changeBlipNameFromAscii(blipId, String(player.name || "Player"));
                }
            } catch (e2) {
            }
            try {
                if (natives && natives.setBlipAsShortRange) {
                    natives.setBlipAsShortRange(blipId, false);
                }
            } catch (e3) {
            }
        }
    }

    if (typeof blipId === "number") {
        try {
            if (natives && natives.setBlipCoordinates) {
                natives.setBlipCoordinates(blipId, [pos[0], pos[1], pos[2]]);
            }
        } catch (e4) {
        }
        try {
            if (natives && natives.changeBlipColour) {
                var colorIdx = getColorIndex(player, key);
                Blips.colorByKey[key] = colorIdx;
                natives.changeBlipColour(blipId, colorIdx);
            }
        } catch (e5) {
        }
    }
}

function cleanupMissing(players) {
    var seen = {};
    for (var i = 0; i < players.length; i++) {
        var key = getPlayerKey(players[i]);
        if (key) {
            seen[key] = true;
        }
    }
    for (var existing in Blips.byKey) {
        if (!seen[existing]) {
            var blipId = Blips.byKey[existing];
            try {
                if (natives && natives.removeBlipAndClearIndex) {
                    natives.removeBlipAndClearIndex(blipId);
                }
            } catch (e1) {
            }
            delete Blips.byKey[existing];
            delete Blips.colorByKey[existing];
        }
    }
}

function tickBlips() {
    var now = nowMs();
    if (now - Blips.lastUpdateAt < Blips.updateMs) {
        return;
    }
    Blips.lastUpdateAt = now;

    if (typeof getPlayers !== "function") {
        return;
    }

    var players = getPlayers() || [];
    for (var i = 0; i < players.length; i++) {
        ensureBlipFor(players[i]);
    }
    cleanupMissing(players);
}

addEventHandler("OnRender", function() {
    tickBlips();
});
