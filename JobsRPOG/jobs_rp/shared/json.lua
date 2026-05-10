JobsRP = JobsRP or {}
JobsRP.Json = JobsRP.Json or {}

local Json = JobsRP.Json

local escapeMap = {
    ["\\"] = "\\\\",
    ["\""] = "\\\"",
    ["\b"] = "\\b",
    ["\f"] = "\\f",
    ["\n"] = "\\n",
    ["\r"] = "\\r",
    ["\t"] = "\\t"
}

local function escapeString(value)
    return value:gsub("[%z\1-\31\\\"]", function(ch)
        return escapeMap[ch] or string.format("\\u%04x", string.byte(ch))
    end)
end

local function isArray(tbl)
    local maxIndex = 0
    local count = 0
    for key, _ in pairs(tbl) do
        if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
            return false
        end
        if key > maxIndex then
            maxIndex = key
        end
        count = count + 1
    end
    return maxIndex == count
end

local function encodeValue(value)
    local valueType = type(value)
    if valueType == "nil" then
        return "null"
    end
    if valueType == "boolean" then
        return value and "true" or "false"
    end
    if valueType == "number" then
        if value ~= value or value == math.huge or value == -math.huge then
            return "null"
        end
        return tostring(value)
    end
    if valueType == "string" then
        return "\"" .. escapeString(value) .. "\""
    end
    if valueType == "table" then
        if isArray(value) then
            local parts = {}
            for i = 1, #value do
                parts[#parts + 1] = encodeValue(value[i])
            end
            return "[" .. table.concat(parts, ",") .. "]"
        end

        local parts = {}
        for key, item in pairs(value) do
            local encodedKey = "\"" .. escapeString(tostring(key)) .. "\""
            parts[#parts + 1] = encodedKey .. ":" .. encodeValue(item)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end

    error("Unsupported JSON value type: " .. valueType)
end

function Json.encode(value)
    return encodeValue(value)
end

local function parseError(index, reason)
    error("JSON parse error at index " .. tostring(index) .. ": " .. tostring(reason))
end

local function decodeValue(text, index)
    local function skipWhitespace(i)
        while true do
            local ch = string.sub(text, i, i)
            if ch == " " or ch == "\n" or ch == "\r" or ch == "\t" then
                i = i + 1
            else
                break
            end
        end
        return i
    end

    local function parseString(i)
        local parts = {}
        i = i + 1
        while i <= #text do
            local ch = string.sub(text, i, i)
            if ch == "\"" then
                return table.concat(parts), i + 1
            end
            if ch == "\\" then
                local esc = string.sub(text, i + 1, i + 1)
                if esc == "\"" or esc == "\\" or esc == "/" then
                    parts[#parts + 1] = esc
                elseif esc == "b" then
                    parts[#parts + 1] = "\b"
                elseif esc == "f" then
                    parts[#parts + 1] = "\f"
                elseif esc == "n" then
                    parts[#parts + 1] = "\n"
                elseif esc == "r" then
                    parts[#parts + 1] = "\r"
                elseif esc == "t" then
                    parts[#parts + 1] = "\t"
                elseif esc == "u" then
                    local hex = string.sub(text, i + 2, i + 5)
                    local code = tonumber(hex, 16)
                    if not code then
                        parseError(i, "Invalid unicode escape")
                    end
                    if code <= 255 then
                        parts[#parts + 1] = string.char(code)
                    else
                        parts[#parts + 1] = "?"
                    end
                    i = i + 4
                else
                    parseError(i, "Invalid escape sequence")
                end
                i = i + 2
            else
                parts[#parts + 1] = ch
                i = i + 1
            end
        end
        parseError(i, "Unterminated string")
    end

    local function parseNumber(i)
        local startIndex = i
        local ch = string.sub(text, i, i)
        if ch == "-" then
            i = i + 1
        end
        while string.match(string.sub(text, i, i), "%d") do
            i = i + 1
        end
        if string.sub(text, i, i) == "." then
            i = i + 1
            while string.match(string.sub(text, i, i), "%d") do
                i = i + 1
            end
        end
        local exp = string.sub(text, i, i)
        if exp == "e" or exp == "E" then
            i = i + 1
            local sign = string.sub(text, i, i)
            if sign == "+" or sign == "-" then
                i = i + 1
            end
            while string.match(string.sub(text, i, i), "%d") do
                i = i + 1
            end
        end
        local numberText = string.sub(text, startIndex, i - 1)
        local numberValue = tonumber(numberText)
        if numberValue == nil then
            parseError(startIndex, "Invalid number")
        end
        return numberValue, i
    end

    local function parseLiteral(i, literal, value)
        if string.sub(text, i, i + #literal - 1) ~= literal then
            parseError(i, "Invalid literal")
        end
        return value, i + #literal
    end

    local function parseArray(i)
        local arr = {}
        i = skipWhitespace(i + 1)
        if string.sub(text, i, i) == "]" then
            return arr, i + 1
        end

        local indexCounter = 1
        while true do
            local item
            item, i = decodeValue(text, i)
            arr[indexCounter] = item
            indexCounter = indexCounter + 1
            i = skipWhitespace(i)
            local ch = string.sub(text, i, i)
            if ch == "]" then
                return arr, i + 1
            end
            if ch ~= "," then
                parseError(i, "Expected ',' or ']' in array")
            end
            i = skipWhitespace(i + 1)
        end
    end

    local function parseObject(i)
        local obj = {}
        i = skipWhitespace(i + 1)
        if string.sub(text, i, i) == "}" then
            return obj, i + 1
        end

        while true do
            if string.sub(text, i, i) ~= "\"" then
                parseError(i, "Expected string key")
            end
            local key
            key, i = parseString(i)
            i = skipWhitespace(i)
            if string.sub(text, i, i) ~= ":" then
                parseError(i, "Expected ':' after key")
            end
            i = skipWhitespace(i + 1)
            local value
            value, i = decodeValue(text, i)
            obj[key] = value
            i = skipWhitespace(i)
            local ch = string.sub(text, i, i)
            if ch == "}" then
                return obj, i + 1
            end
            if ch ~= "," then
                parseError(i, "Expected ',' or '}' in object")
            end
            i = skipWhitespace(i + 1)
        end
    end

    index = skipWhitespace(index)
    local char = string.sub(text, index, index)
    if char == "\"" then
        return parseString(index)
    end
    if char == "{" then
        return parseObject(index)
    end
    if char == "[" then
        return parseArray(index)
    end
    if char == "-" or string.match(char, "%d") then
        return parseNumber(index)
    end
    if char == "t" then
        return parseLiteral(index, "true", true)
    end
    if char == "f" then
        return parseLiteral(index, "false", false)
    end
    if char == "n" then
        return parseLiteral(index, "null", nil)
    end

    parseError(index, "Unexpected token")
end

function Json.decode(text)
    if type(text) ~= "string" then
        error("JSON decode expects string input")
    end
    local value, index = decodeValue(text, 1)
    while index <= #text do
        local ch = string.sub(text, index, index)
        if ch ~= " " and ch ~= "\t" and ch ~= "\n" and ch ~= "\r" then
            parseError(index, "Trailing data")
        end
        index = index + 1
    end
    return value
end
