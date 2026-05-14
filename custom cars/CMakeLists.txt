cmake_minimum_required(VERSION 3.13)

set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CMAKE_SOURCE_DIR}/cmake/")

project(auth_module C CXX)

# Cross-platform settings
if(WIN32)
    add_definitions(-DWIN32_LEAN_AND_MEAN -DPLATFORM_WINDOWS)
    set(CMAKE_CXX_STANDARD 11)
    set(SOURCE_FILES main_cross_platform.cpp)
else()
    set(CMAKE_CXX_STANDARD 11)
    set(CMAKE_POSITION_INDEPENDENT_CODE ON)
    add_definitions(-DPLATFORM_LINUX)
    set(SOURCE_FILES main_cross_platform.cpp)
    # Link pthread on Linux
    find_package(Threads REQUIRED)
endif()

# Embedded pdb in static libraries
set(EMBEDDED_PDB ON)

# Include directories
include_directories("include")
include_directories("include/Galactic3D")

# Create the module
add_library(lccustoms SHARED ${SOURCE_FILES})

# Platform-specific linking
if(WIN32)
    target_link_libraries(lccustoms user32.lib)
else()
    target_link_libraries(lccustoms pthread)
endif()

# Set output name
set_target_properties(lccustoms PROPERTIES
    OUTPUT_NAME "lccustoms"
    PREFIX ""  # Remove lib prefix on Linux
)

# Install target
install(TARGETS lccustoms DESTINATION .)
