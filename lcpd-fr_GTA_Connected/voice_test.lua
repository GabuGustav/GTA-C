-- Voice Dispatch Module Test Script for LCPDFR
-- This script tests our voice_dispatch_sdk module

-- Test function to verify voice module is loaded
function testVoiceModule()
    print("[VOICE_TEST] Testing voice dispatch module...")
    
    -- Check if module is available
    if not module.voice then
        print("[VOICE_TEST] ERROR: module.voice not found - voice_dispatch.dll not loaded")
        return false
    end
    
    print("[VOICE_TEST] ✓ voice module found")
    
    -- Test basic functions
    local success = true
    
    -- Test 1: Create channels
    local policeChannel = module.voice.createChannel("Police", "public")
    local dispatchChannel = module.voice.createChannel("Dispatch", "public")
    local emsChannel = module.voice.createChannel("EMS", "public")
    
    if policeChannel and dispatchChannel and emsChannel then
        print("[VOICE_TEST] ✓ Channels created successfully")
    else
        print("[VOICE_TEST] ✗ Channel creation failed")
        success = false
    end
    
    -- Test 2: Get channels list
    local channels = module.voice.getChannels()
    if channels then
        if type(channels) == "table" then
            print("[VOICE_TEST] ✓ Channel listing works - found " .. #channels .. " channels")
        else
            print("[VOICE_TEST] ✓ Channel listing works - returned success")
        end
    else
        print("[VOICE_TEST] ✗ Channel listing failed")
        success = false
    end
    
    return success
end

-- Integration with LCPDFR events
addNetworkHandler("toggleDuty", function(player)
    local p = personas[player]
    p.duty = not p.duty
    player:setVariable("onDuty", p.duty)
    
    if p.duty then
        -- Join police voice channel when going on duty
        if module.voice then
            local joined = module.voice.joinChannel(player.id, 1) -- Police channel
            if joined then
                print("[VOICE_TEST] " .. player.name .. " joined police voice channel")
                
                -- Set up radio status
                module.voice.setVolume(player.id, 80)
                module.voice.playRadioBeep()
                
                -- Get and display radio status
                local status = module.voice.getRadioStatus(player.id)
                if status then
                    print("[VOICE_TEST] Radio status for " .. player.name .. ": " .. tostring(status))
                end
            else
                print("[VOICE_TEST] Failed to join " .. player.name .. " to voice channel")
            end
        end
        
        startScanner(player)
        broadcastToCops(player.name .. " is now ON DUTY!")
    else
        -- Leave voice channel when going off duty
        if module.voice then
            local left = module.voice.leaveChannel(player.id, 1)
            if left then
                print("[VOICE_TEST] " .. player.name .. " left police voice channel")
            end
        end
        
        stopScanner(player)
        broadcastToCops(player.name .. " is now off duty.")
    end
end)

-- Enhanced callout system with voice integration
addNetworkHandler("acceptCall", function(player)
    local call = player:getVariable("activeCall")
    if not call then return end
    
    -- Play dispatch sound when accepting call
    if module.voice and call.audio then
        module.voice.playDispatchSound(call.audio)
        print("[VOICE_TEST] Playing dispatch sound: " .. call.audio)
    end
    
    spawnScene(player, call)
    spawnBackup(player, call)
    broadcastToCops(player.name .. " responding!")
    
    -- Get transmitting units (mock data from our module)
    if module.voice then
        local units = module.voice.getTransmittingUnits()
        if units then
            if type(units) == "table" then
                print("[VOICE_TEST] Current transmitting units: " .. #units)
            else
                print("[VOICE_TEST] Current transmitting units: success")
            end
        end
    end
end)

-- Test voice functions periodically
setInterval(function()
    if module.voice then
        -- Test getting channel participants
        for _, player in ipairs(getPlayers()) do
            if player:getVariable("onDuty") then
                local participants = module.voice.getChannelParticipants(player.id)
                if participants then
                    if type(participants) == "table" then
                        print("[VOICE_TEST] " .. player.name .. " channel participants: " .. #participants)
                    else
                        print("[VOICE_TEST] " .. player.name .. " channel participants: success")
                    end
                end
            end
        end
    end
end, 30000) -- Every 30 seconds

-- Initial test when resource starts
addEventHandler("onResourceStart", function()
    -- Test voice module immediately after resource loads
    testVoiceModule()
end)

print("[VOICE_TEST] Voice dispatch test script loaded")
