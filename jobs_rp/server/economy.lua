JobsRP = JobsRP or {}
JobsRP.Economy = JobsRP.Economy or {}

local Economy = JobsRP.Economy

Economy.payoutHistoryById = Economy.payoutHistoryById or {}
Economy.transactions = Economy.transactions or {}

local function getProfile(playerId)
    local profile = JobsRP.Store.getProfileById(playerId)
    if not profile then
        profile = JobsRP.Store.loadProfileById(playerId)
    end
    return profile
end

local function getJobState(profile, jobId)
    profile.jobs = type(profile.jobs) == "table" and profile.jobs or {}
    local jobState = profile.jobs[jobId]
    if type(jobState) ~= "table" then
        jobState = {
            xp = 0,
            grade = 0,
            completedRuns = 0,
            totalEarned = 0
        }
        profile.jobs[jobId] = jobState
    end
    return jobState
end

function Economy.computeGrade(xp)
    local thresholds = JobsRP.Config.grade_thresholds or {}
    local value = JobsRP.toNumber(xp, 0) or 0
    local grade = 0
    for i, threshold in ipairs(thresholds) do
        if value >= threshold then
            grade = i - 1
        end
    end
    return grade
end

function Economy.getPayoutMultiplier(grade)
    local g = JobsRP.toNumber(grade, 0) or 0
    local bonus = JobsRP.toNumber(JobsRP.Config.grade_bonus_per_level, 0) or 0
    return 1 + (g * bonus)
end

local function pruneHistory(playerId, nowSec)
    local history = Economy.payoutHistoryById[playerId]
    if not history then
        history = {}
        Economy.payoutHistoryById[playerId] = history
        return history
    end

    local minTs = nowSec - JobsRP.Config.payout_cap_window_sec
    local kept = {}
    for _, entry in ipairs(history) do
        if entry.at >= minTs then
            kept[#kept + 1] = entry
        end
    end
    Economy.payoutHistoryById[playerId] = kept
    return kept
end

local function getRecentPayoutTotal(playerId, nowSec)
    local total = 0
    local history = pruneHistory(playerId, nowSec)
    for _, entry in ipairs(history) do
        total = total + (entry.amount or 0)
    end
    return total
end

local function recordTransaction(playerId, delta, reason)
    Economy.transactions[#Economy.transactions + 1] = {
        at = JobsRP.nowSeconds(),
        playerId = playerId,
        delta = delta,
        reason = tostring(reason or "")
    }
    if #Economy.transactions > 1000 then
        table.remove(Economy.transactions, 1)
    end
end

function Economy.addCash(playerId, delta, reason, bypassPayoutCap)
    local profile = getProfile(playerId)
    if not profile then
        return false, 0, "profile_missing"
    end

    local change = JobsRP.round(delta or 0)
    if change == 0 then
        return true, profile.cash or 0, "no_change"
    end

    local nowSec = JobsRP.nowSeconds()
    if change > 0 and not bypassPayoutCap then
        local rolling = getRecentPayoutTotal(playerId, nowSec)
        if rolling + change > JobsRP.Config.payout_cap_amount then
            return false, profile.cash or 0, "payout_cap"
        end
    end

    local currentCash = JobsRP.toNumber(profile.cash, 0) or 0
    local nextCash = currentCash + change
    if nextCash < 0 then
        nextCash = 0
    end

    profile.cash = nextCash
    JobsRP.Store.markDirty(playerId)
    recordTransaction(playerId, change, reason)

    if change > 0 then
        local history = pruneHistory(playerId, nowSec)
        history[#history + 1] = {
            at = nowSec,
            amount = change
        }
    end

    return true, nextCash, nil
end

function Economy.applyJobReward(playerId, jobId, basePayout, baseXp, reason)
    local profile = getProfile(playerId)
    if not profile then
        return nil
    end

    local jobState = getJobState(profile, jobId)
    local gradeBefore = JobsRP.toNumber(jobState.grade, 0) or Economy.computeGrade(jobState.xp)
    local payoutMultiplier = Economy.getPayoutMultiplier(gradeBefore)

    local rawPayout = JobsRP.round((JobsRP.toNumber(basePayout, 0) or 0) * payoutMultiplier)
    local xpGain = math.floor(JobsRP.round(JobsRP.toNumber(baseXp, 0) or 0))

    -- Handle XP through dedicated XP module
    if JobsRP.XP then
        JobsRP.XP.addXP(playerId, jobId, xpGain, reason)
    else
        print("[Economy] ERROR: XP module not available")
    end
    
    -- Update job state with XP module result
    local xpInfo = JobsRP.XP and JobsRP.XP.getPlayerXP(playerId, jobId)
    if xpInfo then
        jobState.xp = xpInfo.xp
        jobState.level = xpInfo.level
        jobState.grade = Economy.computeGrade(xpInfo.level)
    end
    jobState.completedRuns = (JobsRP.toNumber(jobState.completedRuns, 0) or 0) + 1

    local paid = 0
    local blocked = false
    if rawPayout > 0 then
        local okCash = Economy.addCash(playerId, rawPayout, reason, false)
        if okCash then
            paid = rawPayout
        else
            blocked = true
        end
    end

    jobState.totalEarned = (JobsRP.toNumber(jobState.totalEarned, 0) or 0) + paid
    profile.stats.totalRuns = (JobsRP.toNumber(profile.stats.totalRuns, 0) or 0) + 1
    profile.stats.totalEarned = (JobsRP.toNumber(profile.stats.totalEarned, 0) or 0) + paid
    JobsRP.Store.markDirty(playerId)

    return {
        payoutRaw = rawPayout,
        payoutGranted = paid,
        xpGranted = xpGain,
        xpTotal = jobState.xp,
        gradeBefore = gradeBefore,
        gradeAfter = jobState.grade,
        payoutBlockedByCap = blocked,
        cashAfter = profile.cash or 0
    }
end

