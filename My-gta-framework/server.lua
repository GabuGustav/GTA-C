-- LCPDFR MP - SERVER

local Callouts = {
    {text="[10-31] Armed Robbery at Vespucci Bank", coords={-50,-100,30}, suspects=2},
    {text="[10-50] Traffic Accident on Del Perro", coords={0,200,20}},
    {text="[10-66] Suspicious Vehicle near Grove St", coords={100,50,25}, suspects=1},
}

local personas = {}
local suspects = {}

------------------------------------------------
-- UTIL
------------------------------------------------
local function randomCallout()
    return Callouts[math.random(#Callouts)]
end

local function getDistance(a, b)
    local ax, ay, az = a:getPosition()
    local bx, by, bz = b:getPosition()
    return getDistanceBetweenPoints3D(ax, ay, az, bx, by, bz)
end

------------------------------------------------
-- PLAYER JOIN / QUIT
------------------------------------------------
addEventHandler("onPlayerJoined", function(player)
    personas[player] = {duty=false, arrests=0}
    outputChatBox("LCPDFR MP Loaded – F6 Duty | F4 Accept | F5 Arrest", player, 0, 150, 255)
end)

addEventHandler("onPlayerQuit", function(player)
    personas[player] = nil
end)

------------------------------------------------
-- NETWORK EVENTS
------------------------------------------------
addNetworkHandler("toggleDuty", function(player)
    local p = personas[player]
    if not p then return end

    p.duty = not p.duty
    player:setVariable("onDuty", p.duty)

    if p.duty then
        startScanner(player)
        broadcastToCops(player.name .. " is now ON DUTY")
    else
        stopScanner(player)
        broadcastToCops(player.name .. " is now OFF DUTY")
    end
end)

addNetworkHandler("acceptCall", function(player)
    local call = player:getVariable("activeCall")
    if not call then return end

    spawnScene(player, call)
    spawnBackup(player, call.coords)
    broadcastToCops(player.name .. " responding to call")
end)

addNetworkHandler("attemptArrest", function(player, ped)
    if not personas[player] or not personas[player].duty then return end
    if not ped or not isElement(ped) then return end
    if not ped:getVariable("suspect") then return end

    if getDistance(player, ped) > 3.0 then return end

    ped:destroy()
    suspects[ped] = nil

    personas[player].arrests = personas[player].arrests + 1
    broadcastToCops(player.name .. " made an ARREST! (" .. personas[player].arrests .. ")")
end)

------------------------------------------------
-- SCANNER
------------------------------------------------
function startScanner(player)
    stopScanner(player)

    player.scannerTimer = setInterval(function()
        if not isElement(player) or not player:getVariable("onDuty") then return end
        local call = randomCallout()
        player:setVariable("activeCall", call)
        triggerClientEvent(player, "showCall", player, call)
    end, 30000)
end

function stopScanner(player)
    if player.scannerTimer then
        clearInterval(player.scannerTimer)
        player.scannerTimer = nil
    end
end

------------------------------------------------
-- SCENE SPAWNING
------------------------------------------------
function spawnScene(player, call)
    local base = vector3(call.coords[1], call.coords[2], call.coords[3])
    local count = call.suspects or 1

    for i = 1, count do
        local pos = base + vector3(math.random(-15,15), math.random(-15,15), 0)
        local ped = createPed(0x6F46F0DC, pos, 0)
        ped:setVariable("suspect", true)
        ped:taskFleeFrom(player)
        suspects[ped] = true
    end
end

function spawnBackup(player, coords)
    local base = vector3(coords[1], coords[2], coords[3])

    for i = 1, 2 do
        local pos = base + vector3(math.random(-60,60), math.random(-60,60), 0)
        local cop = createPed(0x5E3DA4C9, pos, 0)
        local car = createVehicle(0x45A00F6D, pos + vector3(0,0,1), 0)
        cop:warpIntoVehicle(car, 0)
        cop:taskVehicleDriveToCoord(
            car,
            player:getPosition()
        )
    end
end

------------------------------------------------
-- BROADCAST
------------------------------------------------
function broadcastToCops(msg)
    for _, p in ipairs(getPlayers()) do
        if p:getVariable("onDuty") then
            outputChatBox(msg, p, 0, 150, 255)
        end
    end
end

print("LCPDFR MP Server Script Loaded – CLEAN")
