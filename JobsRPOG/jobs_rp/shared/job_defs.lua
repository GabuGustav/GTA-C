JobsRP = JobsRP or {}
JobsRP.JobDefs = JobsRP.JobDefs or {}

local defs = {
    {
        id = "taxi",
        label = "Taxi Driver",
        hub = { -50, -100, 30 },
        payout = 70,
        xp = 25,
        constraints = { role = "civilian" },
        pools = {
            pickups = {
                -- Star Junction (Times Square equivalent) - Central Algonquin
                { -120, -45, 28 },
                -- Hove Beach - Eastern European hub
                { -15, 95, 25 },
                -- Rotterdam Tower area - The Triangle district
                { 70, -160, 32 },
                -- East Hook - Industrial/port area
                { 135, 25, 29 },
                -- Francis International Airport area
                { -210, 110, 26 },
                -- Firefly Island area
                { 240, -70, 31 },
                -- Central Algonquin business district
                { -300, 220, 24 },
                -- Downtown Broker business area
                { 30, 310, 22 },
                -- BOABO area - riverfront
                { 185, -250, 35 },
                -- Schottler mixed cultural area
                { 330, 80, 28 },
                -- Outlook Park area
                { -160, -280, 30 },
                -- Beechwood City commercial
                { 55, -20, 29 }
            },
            dropoffs = {
                -- Star Junction destinations
                { -120, -45, 28 },
                -- Airport terminal dropoffs
                { -210, 110, 26 },
                -- Hotel districts
                { 30, 310, 22 },
                -- Business districts
                { 185, -250, 35 },
                -- Residential areas
                { 330, 80, 28 },
                -- Tourist attractions
                { -160, -280, 30 },
                -- Train stations
                { 55, -20, 29 }
            }
        },
        stages = {
            { id = "pickup", type = "pickup", label = "Pick up passenger", pool = "pickups", distance = 8 },
            { id = "dropoff", type = "dropoff", label = "Drop off passenger", pool = "dropoffs", distance = 8 }
        }
    },
    {
        id = "robbery",
        label = "Crew Robbery",
        hub = { 0, 200, 20 },
        payout = 220,
        xp = 80,
        constraints = { role = "civilian", minPlayers = 2 },
        pools = {
            heist_targets = {
                -- Rotterdam Tower - The Triangle district (tallest building)
                { 5, 210, 20 },
                -- Zirconium Building - Lancet district
                { -8, 195, 19 },
                -- Hatton Gardens - Jewelry district equivalent
                { 16, 188, 20 },
                -- Westminster area - Abandoned train line targets
                { 65, 260, 22 },
                -- Purgatory - Industrial area targets
                { -120, 180, 25 },
                -- Central Algonquin bank district
                { 45, 220, 23 },
                -- Star Junction area high-value targets
                { -30, 190, 21 },
                -- East Hook industrial targets
                { 85, 240, 24 }
            },
            stash_points = {
                -- Near Rotterdam Tower
                { -55, 255, 21 },
                -- Hatton Gardens area
                { 120, 150, 23 },
                -- Westminster escape routes
                { -125, 175, 20 },
                -- Purgatory area
                { 155, 300, 24 },
                -- Central Algonquist stash points
                { -80, 200, 22 },
                -- East Hook stash
                { 100, 180, 21 },
                -- Star Junction area
                { -40, 230, 25 },
                -- Industrial area stash
                { 130, 190, 23 }
            },
            escape = {
                -- BOABO riverfront escape
                { -170, 280, 18 },
                -- Hove Beach escape (Russian Mafia territory)
                { 210, 220, 25 },
                -- East Hook port escape
                { 30, 310, 22 },
                -- Schottler area escape
                { 185, -250, 35 },
                -- Firefly Projects escape
                { -200, 150, 20 },
                -- Rotterdam Tower area escape
                { 80, 280, 24 },
                -- Airport escape
                { 150, 320, 22 },
                -- Industrial escape routes
                { -100, 260, 21 }
            }
        },
        stages = {
            { id = "gather", type = "gather", label = "Wait for crew", pool = "heist_targets", distance = 8 },
            { id = "crack", type = "crack", label = "Hold E to crack safe", usePreviousTarget = true, durationMs = 10000, distance = 8 },
            { id = "bags", type = "bags", label = "Grab bag", pool = "stash_points", distance = 8 },
            { id = "escape", type = "escape", label = "Escape to drop-off", pool = "escape", distance = 8 }
        }
    },
    {
        id = "police",
        label = "Police Patrol",
        hub = { 100, 50, 25 },
        payout = 110,
        xp = 45,
        constraints = { role = "civilian" },
        pools = {
            patrol = {
                -- Hove Beach - Russian Mafia activity area
                { 125, 85, 24 },
                -- Firefly Projects - High crime residential area
                { 80, 140, 26 },
                -- East Hook - Port security patrol
                { 175, 40, 25 },
                -- Schottler - Mixed cultural area patrols
                { 55, -10, 27 },
                -- BOABO - Riverfront/bridge security
                { 220, 95, 24 },
                -- Downtown Broker - Business district policing
                { 95, 45, 25 },
                -- Star Junction - Tourist area patrol
                { 110, 60, 25 },
                -- Rotterdam Tower area - High-value target protection
                { 85, 35, 25 },
                -- Central Algonquin business district
                { 150, 80, 24 },
                -- Airport security patrol
                { -50, 180, 22 },
                -- Industrial area patrol
                { 180, 120, 25 },
                -- Residential area patrols
                { 70, 160, 24 }
            },
            incidents = {
                -- Hove Beach crime incidents
                { 95, 45, 25 },
                -- Firefly Projects disturbances
                { 110, 60, 25 },
                -- East Hook port incidents
                { 85, 35, 25 },
                -- Schottler area calls
                { 125, 90, 24 },
                -- Star Junction disturbances
                { 80, 140, 26 },
                -- Business district incidents
                { 175, 40, 25 },
                -- Airport security incidents
                { 55, -10, 27 },
                -- Industrial area incidents
                { 220, 95, 24 },
                -- Residential area calls
                { 95, 45, 25 },
                -- Bridge security incidents
                { 110, 60, 25 },
                -- High-value target incidents
                { 85, 35, 25 },
                -- Tourist area incidents
                { 150, 80, 24 }
            }
        },
        stages = {
            { id = "patrol", type = "patrol", label = "Patrol area", pool = "patrol", distance = 15 },
            { id = "incident", type = "incident", label = "Respond to incident", pool = "incidents", distance = 10, durationMs = 5000 }
        }
    }
}

local byId = {}
for _, def in ipairs(defs) do
    byId[def.id] = def
end

JobsRP.JobDefs.list = defs
JobsRP.JobDefs.byId = byId
JobsRP.JobDefs.get = function(jobId)
    return byId[jobId]
end
