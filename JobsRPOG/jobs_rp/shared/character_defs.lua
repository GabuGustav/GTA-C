-- Character Model Definitions for GTAC Roleplay
-- Supports both default GTA IV models and custom models

JobsRP = JobsRP or {}
JobsRP.CharacterDefs = JobsRP.CharacterDefs or {}

local CharacterDefs = JobsRP.CharacterDefs

-- Character model registry with categories and job requirements
CharacterDefs.models = {
    -- Male Civilian Models
    male_civilian = {
        {
            id = "male_business_1",
            hash = 31, -- Actual GTA IV model hash
            name = "Business Executive",
            description = "Professional business attire",
            category = "civilian",
            gender = "male",
            jobs = {"taxi", "civilian"},
            custom = false
        },
        {
            id = "male_casual_1", 
            hash = 32,
            name = "Casual Male",
            description = "Everyday casual clothing",
            category = "civilian",
            gender = "male",
            jobs = {"taxi", "civilian", "robbery"},
            custom = false
        },
        {
            id = "male_worker_1",
            hash = 33,
            name = "Construction Worker",
            description = "Industrial work attire",
            category = "civilian",
            gender = "male", 
            jobs = {"civilian"},
            custom = false
        }
    },
    
    -- Female Civilian Models
    female_civilian = {
        {
            id = "female_business_1",
            hash = 36,
            name = "Business Professional",
            description = "Professional business attire",
            category = "civilian",
            gender = "female",
            jobs = {"taxi", "civilian"},
            custom = false
        },
        {
            id = "female_casual_1",
            hash = 37,
            name = "Casual Female", 
            description = "Everyday casual clothing",
            category = "civilian",
            gender = "female",
            jobs = {"taxi", "civilian"},
            custom = false
        },
        {
            id = "female_student_1",
            hash = 38,
            name = "Student",
            description = "Young adult student attire",
            category = "civilian",
            gender = "female",
            jobs = {"civilian"},
            custom = false
        }
    },
    
    -- Police Models (Job-Specific)
    police = {
        {
            id = "police_male_1",
            hash = 80, -- LCPD officer model
            name = "LCPD Officer",
            description = "Liberty City Police Department officer",
            category = "police",
            gender = "male",
            jobs = {"police"},
            custom = false,
            required = true -- Police job requires this model
        },
        {
            id = "police_female_1", 
            hash = 81,
            name = "LCPD Female Officer",
            description = "Liberty City Police Department female officer",
            category = "police",
            gender = "female",
            jobs = {"police"},
            custom = false,
            required = true
        }
    },
    
    -- Custom Models (for future expansion)
    custom = {
        -- Example custom model structure
        -- {
        --     id = "custom_mechanic_1",
        --     hash = 999, -- Custom model hash
        --     name = "Mechanic",
        --     description = "Automotive repair specialist",
        --     category = "service",
        --     gender = "male",
        --     jobs = {"mechanic"},
        --     custom = true
        -- }
    }
}

-- Character categories for UI organization
CharacterDefs.categories = {
    {
        id = "male_civilian",
        name = "Male Civilians",
        description = "Male civilian character models",
        icon = "👨"
    },
    {
        id = "female_civilian", 
        name = "Female Civilians",
        description = "Female civilian character models",
        icon = "👩"
    },
    {
        id = "police",
        name = "Police",
        description = "Law enforcement character models",
        icon = "👮"
    },
    {
        id = "custom",
        name = "Custom",
        description = "Custom character models",
        icon = "⭐"
    }
}

-- Job character requirements
CharacterDefs.jobRequirements = {
    police = {
        required = true,
        allowed_categories = {"police"},
        message = "Police job requires police character model"
    },
    taxi = {
        required = false,
        allowed_categories = {"male_civilian", "female_civilian"},
        message = "Taxi drivers use civilian character models"
    },
    robbery = {
        required = false,
        allowed_categories = {"male_civilian"},
        message = "Robbery jobs use male civilian models"
    },
    civilian = {
        required = false,
        allowed_categories = {"male_civilian", "female_civilian"},
        message = "Civilians can use any civilian model"
    }
}

-- Helper functions
function CharacterDefs.getModelsByCategory(categoryId)
    return CharacterDefs.models[categoryId] or {}
end

function CharacterDefs.getModelById(modelId)
    for category, models in pairs(CharacterDefs.models) do
        for _, model in ipairs(models) do
            if model.id == modelId then
                return model
            end
        end
    end
    return nil
end

function CharacterDefs.getModelsForJob(jobId)
    local requirements = CharacterDefs.jobRequirements[jobId]
    if not requirements then
        return {}
    end
    
    local validModels = {}
    for _, categoryId in ipairs(requirements.allowed_categories) do
        local categoryModels = CharacterDefs.getModelsByCategory(categoryId)
        for _, model in ipairs(categoryModels) do
            table.insert(validModels, model)
        end
    end
    
    return validModels
end

function CharacterDefs.validateModelForJob(modelId, jobId)
    local model = CharacterDefs.getModelById(modelId)
    if not model then
        return false, "Character model not found"
    end
    
    local requirements = CharacterDefs.jobRequirements[jobId]
    if not requirements then
        return true, "No specific requirements for this job"
    end
    
    -- Check if model is in allowed category
    local categoryAllowed = false
    for _, categoryId in ipairs(requirements.allowed_categories) do
        for _, categoryModel in ipairs(CharacterDefs.getModelsByCategory(categoryId)) do
            if categoryModel.id == modelId then
                categoryAllowed = true
                break
            end
        end
        if categoryAllowed then break end
    end
    
    if not categoryAllowed then
        return false, requirements.message
    end
    
    return true, "Character model valid for job"
end

function CharacterDefs.getAllModels()
    local allModels = {}
    for category, models in pairs(CharacterDefs.models) do
        for _, model in ipairs(models) do
            table.insert(allModels, model)
        end
    end
    return allModels
end

print("[CharacterDefs] Character model definitions loaded")
