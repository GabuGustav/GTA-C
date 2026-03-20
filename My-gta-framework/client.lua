addEventHandler("onResourceStart", function()
    bindKey("f6", "down", function()
        triggerServerEvent("toggleDuty")
    end)

    bindKey("f4", "down", function()
        if localPlayer:getSharedData("onDuty") then
            triggerServerEvent("acceptCall", localPlayer)
        end
    end)

    bindKey("f5", "down", function()
        if localPlayer:getSharedData("onDuty") then
            local closest = nil
            local minDist = math.huge
            local maxSearchDistance = 5.0

            for i, ped in ipairs(getElementsByType("ped")) do
                if ped:getSharedData("suspect") then
                    local px, py, pz = getElementPosition(localPlayer)
                    local ex, ey, ez = getElementPosition(ped)
                    local dist = getDistanceBetweenPoints3D(px, py, pz, ex, ey, ez)

                    if dist < minDist and dist < maxSearchDistance then
                        closest = ped
                        minDist = dist
                    end
                end
            end

            if closest then
                triggerServerEvent("attemptArrest", localPlayer, closest)
            end
        end
    end)
end)
