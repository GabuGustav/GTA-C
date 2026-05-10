// Character Model Definitions for GTAC Roleplay (JavaScript version)
// Supports both default GTA IV models and custom models

"use strict";

var JobsRP = JobsRP || {};
JobsRP.CharacterDefs = JobsRP.CharacterDefs || {};

// Character model registry with categories and job requirements
JobsRP.CharacterDefs.models = {
    // Male Civilian Models
    male_civilian: [
        {
            id: "male_business_1",
            hash: 31, // Actual GTA IV model hash
            name: "Business Executive",
            description: "Professional business attire",
            category: "civilian",
            gender: "male",
            jobs: ["taxi", "civilian"],
            custom: false
        },
        {
            id: "male_casual_1", 
            hash: 32,
            name: "Casual Male",
            description: "Everyday casual clothing",
            category: "civilian",
            gender: "male",
            jobs: ["taxi", "civilian", "robbery"],
            custom: false
        },
        {
            id: "male_worker_1",
            hash: 33,
            name: "Construction Worker",
            description: "Industrial work attire",
            category: "civilian",
            gender: "male", 
            jobs: ["civilian"],
            custom: false
        }
    ],
    
    // Female Civilian Models
    female_civilian: [
        {
            id: "female_business_1",
            hash: 36,
            name: "Business Professional",
            description: "Professional business attire",
            category: "civilian",
            gender: "female",
            jobs: ["taxi", "civilian"],
            custom: false
        },
        {
            id: "female_casual_1",
            hash: 37,
            name: "Casual Female", 
            description: "Everyday casual clothing",
            category: "civilian",
            gender: "female",
            jobs: ["taxi", "civilian"],
            custom: false
        },
        {
            id: "female_student_1",
            hash: 38,
            name: "Student",
            description: "Young adult student attire",
            category: "civilian",
            gender: "female",
            jobs: ["civilian"],
            custom: false
        }
    ],
    
    // Police Models (Job-Specific)
    police: [
        {
            id: "police_male_1",
            hash: 80, // LCPD officer model
            name: "LCPD Officer",
            description: "Liberty City Police Department officer",
            category: "police",
            gender: "male",
            jobs: ["police"],
            custom: false,
            required: true // Police job requires this model
        },
        {
            id: "police_female_1", 
            hash: 81,
            name: "LCPD Female Officer",
            description: "Liberty City Police Department female officer",
            category: "police",
            gender: "female",
            jobs: ["police"],
            custom: false,
            required: true
        }
    ],
    
    // Custom Models (for future expansion)
    custom: [
        // Example custom model structure
        // {
        //     id: "custom_mechanic_1",
        //     hash: 999, // Custom model hash
        //     name: "Mechanic",
        //     description: "Automotive repair specialist",
        //     category: "service",
        //     gender: "male",
        //     jobs: ["mechanic"],
        //     custom: true
        // }
    ]
};

// Character categories for UI organization
JobsRP.CharacterDefs.categories = [
    {
        id: "male_civilian",
        name: "Male Civilians",
        description: "Male civilian character models",
        icon: "👨"
    },
    {
        id: "female_civilian", 
        name: "Female Civilians",
        description: "Female civilian character models",
        icon: "👩"
    },
    {
        id: "police",
        name: "Police",
        description: "Law enforcement character models",
        icon: "👮"
    },
    {
        id: "custom",
        name: "Custom",
        description: "Custom character models",
        icon: "⭐"
    }
];

// Job character requirements
JobsRP.CharacterDefs.jobRequirements = {
    police: {
        required: true,
        allowed_categories: ["police"],
        message: "Police job requires police character model"
    },
    taxi: {
        required: false,
        allowed_categories: ["male_civilian", "female_civilian"],
        message: "Taxi drivers use civilian character models"
    },
    robbery: {
        required: false,
        allowed_categories: ["male_civilian"],
        message: "Robbery jobs use male civilian models"
    },
    civilian: {
        required: false,
        allowed_categories: ["male_civilian", "female_civilian"],
        message: "Civilians can use any civilian model"
    }
};

// Helper functions
JobsRP.CharacterDefs.getModelsByCategory = function(categoryId) {
    return this.models[categoryId] || [];
};

JobsRP.CharacterDefs.getModelById = function(modelId) {
    for (var category in this.models) {
        var models = this.models[category];
        for (var i = 0; i < models.length; i++) {
            if (models[i].id === modelId) {
                return models[i];
            }
        }
    }
    return null;
};

JobsRP.CharacterDefs.getModelsForJob = function(jobId) {
    var requirements = this.jobRequirements[jobId];
    if (!requirements) {
        return [];
    }
    
    var validModels = [];
    for (var i = 0; i < requirements.allowed_categories.length; i++) {
        var categoryId = requirements.allowed_categories[i];
        var categoryModels = this.getModelsByCategory(categoryId);
        for (var j = 0; j < categoryModels.length; j++) {
            validModels.push(categoryModels[j]);
        }
    }
    
    return validModels;
};

JobsRP.CharacterDefs.validateModelForJob = function(modelId, jobId) {
    var model = this.getModelById(modelId);
    if (!model) {
        return { valid: false, message: "Character model not found" };
    }
    
    var requirements = this.jobRequirements[jobId];
    if (!requirements) {
        return { valid: true, message: "No specific requirements for this job" };
    }
    
    // Check if model is in allowed category
    var categoryAllowed = false;
    for (var i = 0; i < requirements.allowed_categories.length; i++) {
        var categoryId = requirements.allowed_categories[i];
        var categoryModels = this.getModelsByCategory(categoryId);
        for (var j = 0; j < categoryModels.length; j++) {
            if (categoryModels[j].id === modelId) {
                categoryAllowed = true;
                break;
            }
        }
        if (categoryAllowed) break;
    }
    
    if (!categoryAllowed) {
        return { valid: false, message: requirements.message };
    }
    
    return { valid: true, message: "Character model valid for job" };
};

JobsRP.CharacterDefs.getAllModels = function() {
    var allModels = [];
    for (var category in this.models) {
        var models = this.models[category];
        for (var i = 0; i < models.length; i++) {
            allModels.push(models[i]);
        }
    }
    return allModels;
};

console.log("[CharacterDefs] Character model definitions loaded (JavaScript)");
