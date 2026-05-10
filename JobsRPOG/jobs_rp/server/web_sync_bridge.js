"use strict";

var JobsRP = JobsRP || {};

(function() {
    var config = (JobsRP && JobsRP.Config) || {};
    var queueFile = config.web_bridge_queue_file || "data/web_api_queue.json";
    var statusFile = config.web_bridge_status_file || "data/web_sync_status.json";
    var apiBaseUrl = config.website_api_url || "https://bgfr-gta-connected.netlify.app/.netlify/functions";
    var apiKey = config.api_secret_key || "gta-server-api-key";
    var pollMs = 6000;
    var isProcessing = false;

    function nowIso() {
        return new Date().toISOString();
    }

    function readText(path) {
        if (typeof loadTextFile === "function") {
            try {
                return loadTextFile(path);
            } catch (error) {
                console.log("[WebSyncBridge] loadTextFile failed for " + path + ": " + error.message);
            }
        }
        return null;
    }

    function writeText(path, content) {
        if (typeof saveTextFile === "function") {
            try {
                saveTextFile(path, content);
                return true;
            } catch (error) {
                console.log("[WebSyncBridge] saveTextFile failed for " + path + ": " + error.message);
            }
        }
        return false;
    }

    function readJson(path, fallback) {
        var raw = readText(path);
        if (!raw) {
            return fallback;
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.log("[WebSyncBridge] Failed to parse " + path + ": " + error.message);
            return fallback;
        }
    }

    function writeJson(path, value) {
        return writeText(path, JSON.stringify(value, null, 2));
    }

    function readQueue() {
        var queue = readJson(queueFile, { requests: [] }) || { requests: [] };
        if (!Array.isArray(queue.requests)) {
            queue.requests = [];
        }
        return queue;
    }

    function writeQueue(queue) {
        return writeJson(queueFile, queue);
    }

    function readStatus() {
        return readJson(statusFile, {
            isProcessing: false,
            processedCount: 0,
            failedCount: 0,
            lastAttemptAt: null,
            lastSuccessAt: null,
            lastError: null,
            lastResponseCode: null
        }) || {};
    }

    function writeStatus(status) {
        writeJson(statusFile, status);
    }

    function buildUrl(request) {
        if (request.method === "GET") {
            return apiBaseUrl + request.endpoint;
        }

        var separator = request.endpoint.indexOf("?") === -1 ? "?" : "&";
        return apiBaseUrl + request.endpoint + separator + "payload=" + encodeURIComponent(JSON.stringify(request.data || {})) + "&api_key=" + encodeURIComponent(apiKey);
    }

    function arrayBufferToString(buffer) {
        if (!buffer) {
            return "";
        }
        try {
            return String.fromCharCode.apply(null, new Uint8Array(buffer));
        } catch (error) {
            return "";
        }
    }

    function requestViaHttpGet(url, done) {
        var responseBody = "";

        try {
            httpGet(url, "", function(receivedData) {
                responseBody += arrayBufferToString(receivedData);
            }, function(curlErrorCode, httpResponseCode) {
                done({
                    ok: curlErrorCode === 0 && httpResponseCode >= 200 && httpResponseCode < 300,
                    curlErrorCode: curlErrorCode,
                    statusCode: httpResponseCode,
                    body: responseBody
                });
            });
        } catch (error) {
            done({
                ok: false,
                curlErrorCode: -1,
                statusCode: 0,
                body: "",
                error: error.message
            });
        }
    }

    function processNextRequest() {
        if (isProcessing) {
            return;
        }

        var queue = readQueue();
        if (!queue.requests.length) {
            return;
        }

        var request = queue.requests[0];
        var status = readStatus();
        var url = buildUrl(request);

        isProcessing = true;
        status.isProcessing = true;
        status.lastAttemptAt = nowIso();
        status.lastError = null;
        writeStatus(status);

        console.log("[WebSyncBridge] Sending " + request.method + " " + request.endpoint);
        console.log("[WebSyncBridge] URL " + url);

        requestViaHttpGet(url, function(result) {
            var currentStatus = readStatus();
            currentStatus.isProcessing = false;
            currentStatus.lastAttemptAt = nowIso();
            currentStatus.lastResponseCode = result.statusCode || 0;

            if (result.ok) {
                queue.requests.shift();
                writeQueue(queue);
                currentStatus.processedCount = (currentStatus.processedCount || 0) + 1;
                currentStatus.lastSuccessAt = nowIso();
                currentStatus.lastError = null;
                console.log("[WebSyncBridge] Request succeeded with HTTP " + result.statusCode);
            } else {
                currentStatus.failedCount = (currentStatus.failedCount || 0) + 1;
                currentStatus.lastError = result.error || ("curl=" + result.curlErrorCode + " http=" + result.statusCode);
                console.log("[WebSyncBridge] Request failed: " + currentStatus.lastError);
            }

            writeStatus(currentStatus);
            isProcessing = false;
        });
    }

    function ensureBridgeFiles() {
        if (!readText(queueFile)) {
            writeQueue({ requests: [] });
        }
        if (!readText(statusFile)) {
            writeStatus({
                isProcessing: false,
                processedCount: 0,
                failedCount: 0,
                lastAttemptAt: null,
                lastSuccessAt: null,
                lastError: null,
                lastResponseCode: null
            });
        }
    }

    function startBridge() {
        if (config.web_bridge_enabled === false) {
            console.log("[WebSyncBridge] Bridge disabled by config");
            return;
        }

        if (typeof httpGet !== "function") {
            console.log("[WebSyncBridge] httpGet is not available in this build");
            return;
        }

        ensureBridgeFiles();
        console.log("[WebSyncBridge] Bridge started with API base " + apiBaseUrl);

        if (typeof setInterval === "function") {
            setInterval(processNextRequest, pollMs);
        }

        if (typeof setTimeout === "function") {
            setTimeout(processNextRequest, 2500);
        }
    }

    if (typeof addEventHandler === "function") {
        addEventHandler("OnResourceStart", function(event, resource) {
            if (typeof thisResource !== "undefined" && resource === thisResource) {
                startBridge();
            }
        });
    }

    startBridge();
})();
