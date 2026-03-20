"use strict";

var Freeroam = Freeroam || {};

Freeroam.Config = Freeroam.Config || {
    rules: [
        "Respect other players.",
        "No cheating or exploiting.",
        "Use /jobauth to register and login.",
        "Roleplay before action."
    ],
    gamemode_rules: [
        "No random deathmatch."
    ],
    announcement_interval_ms: 900000,
    announcement_message: "Join the BGF Revival server!"
};

Freeroam.normalizeName = function(value) {
    var s = String(value || "");
    s = s.replace(/^\s+/, "");
    s = s.replace(/\s+$/, "");
    return s.toLowerCase();
};
