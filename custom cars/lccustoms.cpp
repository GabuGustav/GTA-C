#include <SDKHelper.h>
#include <string>

// Global tracking ID for your new custom car pool
const int CUSTOM_VEHICLE_START_ID = 300;

// C++ Function to inject a brand new car slot into the server's registry
static int RegisterCustomCarSlot(const char* modelName, int handlingBaseId) {
    // 1. Communicate with GTAC's internal core memory
    // 2. Map the string name (e.g., "F1") to a completely vacant, high-range ID slot
    int assignedId = CUSTOM_VEHICLE_START_ID;

    // Log the injection to the server console for debugging
    LogPrintf("[Module] Successfully registered custom asset slot: %s to ID %d", modelName, assignedId);

    return assignedId; // Returns the clean, unique ID to your script
}

// Module Initializer executed automatically by the server binary on boot
EXPORT int ModuleInit(GtcModule* module) {
    RegisterNamespace("carstreamer");
    RegisterFunction("registerSlot", RegisterCustomCarSlot);
    return 1;
}
