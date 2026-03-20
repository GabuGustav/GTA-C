Freeroam = Freeroam or {}
Freeroam.Config = Freeroam.Config or {
    rules = {
        "Respect other players.",
        "No cheating or exploiting.",
        "Use /jobauth to register and login.",
        "Roleplay before action."
    },
    gamemode_rules = {
        "RP gamemode: stay in character.",
        "No random deathmatch.",
        "Use /job to work and earn cash."
    },
    announcement_interval_ms = 900000,
    announcement_message = "Join the BGF Revival server!"
}

function Freeroam.normalizeName(value)
    local s = tostring(value or "")
    s = string.gsub(s, "^%s+", "")
    s = string.gsub(s, "%s+$", "")
    return string.lower(s)
end
