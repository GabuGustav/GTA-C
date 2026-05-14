"use strict";

<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
// ============================================================================
// JOBSRP POLICE SCANNER AUDIO SYSTEM - COMPLETE OVERHAUL
// ============================================================================
// Upgrades implemented:
// - All 92+ Liberty City zones (precise coordinate mapping)
// - Vehicle color descriptions (22 colors)
// - Vehicle manufacturers (34 brands)
// - Vehicle models & categories (already working, expanded)
// - Speech fillers/conjunctives for natural radio chatter
// - Background scanner noise (resident noise loops)
// - Expanded dispatch unit types (NOOSE, SWAT, FIB, boats, air, coastguard)
// - All crime types mapped to audio
// - Pursuit dynamics (speed, foot chase, vehicle switches)
// - Fire/medical emergency support
// - Callout resolution announcements
// - Cuff/taser immersion sounds
// ============================================================================

var PoliceScanner = PoliceScanner || {};

=======
var PoliceScanner = PoliceScanner || {};

// Police Scanner Audio System
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
PoliceScanner.Manager = {
    sounds: {},
    _streams: [],
    active: false,
    volume: 0.8,
    enabled: true,
    _autoEnableTimer: null,
    structuredMode: true,
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
    structuredMaxClips: 5,
========
    structuredMaxClips: 10,
    _isPlaying: false,
    _currentSequence: null,
    _sequenceTimers: [],
    _noiseLoop: null,
    _noiseTimer: null,
    
    // ========================================================================
    // INITIALIZATION
    // ========================================================================
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
    
    init: function() {
        console.log("[PoliceScanner] Initializing police scanner audio system (v2.0)");
        this.loadAudioFiles();
        this.setupAudioSystem();
=======
    structuredMaxClips: 5,
    
    init: function() {
        console.log("[PoliceScanner] Initializing police scanner audio system");
        
        // Load audio files
        this.loadAudioFiles();
        
        // Setup audio system
        this.setupAudioSystem();
        
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        console.log("[PoliceScanner] Audio system initialized");
    },
    
    loadAudioFiles: function() {
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
        var audioFiles = {
            // === DISPATCH INTROS ===
            dispatch: {
                "ALL_UNITS": "ALL_UNITS.wav",
                "ATTENTION_ALL_UNITS": "ATTENTION_ALL_UNITS.wav",
                "DISPATCHING_TO": "DISPATCHING_TO.wav",
                "THIS_IS_CONTROL": "THIS_IS_CONTROL.wav",
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
                "UNITS_PLEASE_BE_ADVISED": "UNITS_PLEASE_BE_ADVISED.wav",
                "ALL_UNITS_PLEASE_RESPOND": "ALL_UNITS_PLEASE_RESPOND.wav",
                "SUSPECT_APPREHENDED": "SUSPECT_APPREHENDED.wav"
========
                "ALL_UNITS_ALL_UNITS": "ALL_UNITS_ALL_UNITS.wav",
                "ALL_UNITS_PLEASE_RESPOND": "ALL_UNITS_PLEASE_RESPOND.wav",
                "UNITS_PLEASE_BE_ADVISED": "UNITS_PLEASE_BE_ADVISED.wav",
                "DISPATCH_TO": "DISPATCH_TO.wav",
                "I_REPEAT": "I_REPEAT.wav",
                "REPEAT": "REPEAT.wav"
            },
            
            // === DISPATCH REPORT PHRASES ===
            dispatchReports: {
                "INS_THIS_IS_CONTROL_WE_HAVE": "INS_THIS_IS_CONTROL_WE_HAVE.wav",
                "INS_CIVILIANS_REPORT": "INS_CIVILIANS_REPORT.wav",
                "INS_AVAILABLE_UNITS_RESPOND_TO": "INS_AVAILABLE_UNITS_RESPOND_TO.wav",
                "INS_ALL_HANDS_TO": "INS_ALL_HANDS_TO.wav",
                "INS_ATTENTION_ALL_UNITS_WE_HAVE": "INS_ATTENTION_ALL_UNITS_WE_HAVE.wav",
                "INS_UNITS_REPORT": "INS_UNITS_REPORT.wav",
                "INS_WE_HAVE": "INS_WE_HAVE.wav",
                "INS_WEVE_GOT": "INS_WEVE_GOT.wav",
                "INS_WE_HAVE_A_REPORT_OF_ERRR": "INS_WE_HAVE_A_REPORT_OF_ERRR.wav",
                "INS_I_NEED_A_UNIT_FOR": "INS_I_NEED_A_UNIT_FOR.wav",
                "INS_TRAFFIC_ALERT_FOR": "INS_TRAFFIC_ALERT_FOR.wav"
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
            },
            
            // === CRIMINAL ACTIVITIES ===
=======
        // Define audio categories and files
        var audioFiles = {
            // Dispatch messages
            dispatch: {
                "ALL_UNITS": "ALL_UNITS.wav",
                "ATTENTION_ALL_UNITS": "ATTENTION_ALL_UNITS.wav", 
                "DISPATCHING_TO": "DISPATCHING_TO.wav",
                "THIS_IS_CONTROL": "THIS_IS_CONTROL.wav",
                "UNITS_PLEASE_BE_ADVISED": "UNITS_PLEASE_BE_ADVISED.wav",
                "ALL_UNITS_PLEASE_RESPOND": "ALL_UNITS_PLEASE_RESPOND.wav",
                "SUSPECT_APPREHENDED": "SUSPECT_APPREHENDED.wav"
            },
            
            // Criminal activities
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            criminal: {
                "ARMED_AND_DANGEROUS": "ARMED_AND_DANGEROUS.wav",
                "ASSISTANCE_REQUIRED": "ASSISTANCE_REQUIRED.wav",
                "CRIMINAL_RESISTING_ARREST": "CRIM_A_CRIMINAL_RESISTING_ARREST.wav",
                "DOMESTIC_DISTURBANCE": "CRIM_A_DOMESTIC_DISTURBANCE.wav",
                "DRUNKEN_DISTURBANCE": "CRIM_A_DRUNKEN_DISTURBANCE.wav",
                "GRAND_THEFT_AUTO": "CRIM_A_GRAND_THEFT_AUTO.wav",
                "MEDICAL_EMERGENCY": "CRIM_A_MEDICAL_EMERGENCY.wav",
                "MUGGING": "CRIM_A_MUGGING.wav",
                "RECKLESS_DRIVER": "CRIM_A_RECKLESS_DRIVER.wav",
                "SHOOTING": "CRIM_A_SHOOTING.wav",
                "SHOTS_FIRED": "CRIM_SHOTS_FIRED.wav",
                "SUSPICIOUS_ACTIVITY": "CRIM_SUSPICIOUS_ACTIVITY.wav",
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
                "STOLEN_VEHICLE": "CRIM_A_STOLEN_VEHICLE.wav",
                "SHOOT_OUT": "CRIM_A_SHOOT_OUT.wav",
                "DRUG_DEAL": "CRIM_A_DRUG_DEAL.wav",
                "FIRE": "CRIM_A_FIRE.wav",
                "TRAFFIC_FELONY": "CRIM_A_TRAFFIC_FELONY.wav",
                "DRIVEBY": "CRIM_A_CRIMINAL_PERFORMING_DRIVEBY_ACTIVITY.wav",
                "CIVILIAN_CAUSING_TROUBLE": "CRIM_A_CIVILIAN_CAUSING_TROUBLE.wav",
                "CIVILIAN_DOWN": "CRIM_A_CIVILIAN_DOWN.wav",
                "CRIMINAL_FLEEING": "CRIM_A_CRIMINAL_FLEEING_A_CRIME_SCENE.wav",
                "CRIMINAL_IN_STOLEN_CAR": "CRIM_A_CRIMINAL_IN_A_STOLEN_CAR.wav",
                "CRIMINAL_IN_STOLEN_VEHICLE": "CRIM_A_CRIMINAL_IN_A_STOLEN_VEHICLE.wav",
                "DANGEROUS_DRIVING": "CRIM_DANGEROUS_DRIVING.wav",
                "DRUNKEN_BRAWL": "CRIM_A_DRUNKEN_BRAWL.wav",
                "FIREARM_ATTACK_ON_OFFICER": "CRIM_A_FIREARM_ATTACK_ON_AN_OFFICER.wav",
                "SHOTS_FIRED_AT_OFFICER": "CRIM_SHOTS_FIRED_AT_AN_OFFICER.wav",
                "SUSPECT_ARMED_AND_DANGEROUS": "CRIM_A_SUSPECT_ARMED_AND_DANGEROUS.wav",
                "SUSPECT_RESISTING_ARREST": "CRIM_A_SUSPECT_RESISTING_ARREST.wav",
                "DRIVEBY_ACTIVITY": "CRIM_CRIMINALS_PERFORMING_DRIVEBY_ACTIVITY.wav",
                "DISTURBING_THE_PEACE": "CRIM_CRIMINALS_DISTURBING_THE_PEACE.wav",
                "UNCONSCIOUS_CIVILIAN": "CRIM_AN_UNCONCIOUS_CIVILIAN.wav"
            },
            
            // === OFFICER STATUS ===
            officer: {
                "OFFICER_DOWN": "CRIM_AN_OFFICER_DOWN.wav",
                "OFFICER_IN_DANGER": "CRIM_AN_OFFICER_IN_DANGER.wav",
                "OFFICER_ASSAULT": "CRIM_AN_ASSAULT_ON_AN_OFFICER.wav",
                "OFFICER_STRUCK": "CRIM_AN_OFFICER_STRUCK.wav",
                "OFFICER_NEEDS_ASSISTANCE": "CRIM_AN_OFFICER_IN_NEED_OF_ASSISTANCE.wav",
                "ATTACK_ON_OFFICER": "CRIM_AN_ATTACK_ON_AN_OFFICER.wav",
                "OFFICER_ASSAULT_ALT": "CRIM_AN_OFFICER_ASSAULT.wav",
                "AIR_UNIT_DOWN_01": "CRIM_AN_AIR_UNIT_DOWN_01.wav",
                "AIR_UNIT_DOWN_02": "CRIM_AN_AIR_UNIT_DOWN_02.wav"
            },
            
            // === TRAFFIC ===
=======
                "STOLEN_VEHICLE": "CRIM_A_STOLEN_VEHICLE.wav"
            },
            
            // Officer status
            officer: {
                "OFFICER_DOWN": "CRIM_AN_OFFICER_DOWN.wav",
                "OFFICER_IN_DANGER": "CRIM_AN_OFFICER_IN_DANGER.wav",
                "OFFICER_ASSAULT": "CRIM_AN_ASSAULT_ON_AN_OFFICER.wav"
            },
            
            // Traffic
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            traffic: {
                "TRAFFIC_VIOLATION": "CRIM_A_TRAFFIC_VIOLATION.wav",
                "TRAFFIC_ALERT": "CRIM_A_TRAFFIC_ALERT.wav",
                "RECKLESS_DRIVING": "CRIM_DANGEROUS_DRIVING.wav"
            },
            
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
            // === FIRE/MEDICAL ===
            emergency: {
                "DISPATCH_MEDIC_TO": "INS_DISPATCH_A_MEDIC_TO.wav",
                "DISPATCH_MEDICAL_TEAM_FOR": "INS_DISPATCH_A_MEDICAL_TEAM_FOR.wav",
                "DISPATCH_MEDICAL_TEAM_FOR_ERR": "INS_DISPATCH_A_MEDICAL_TEAM_FOR_ERRR.wav",
                "DISPATCH_PARAMEDIC_TEAM_TO": "INS_DISPATCH_A_PARAMEDIC_TEAM_TO.wav",
                "DISPATCH_PARAMEDIC_TEAM_TO_ERR": "INS_DISPATCH_A_PARAMEDIC_TEAM_TO_ERR.wav",
                "DISPATCH_AMBULANCE_FOR": "INS_DISPATCH_AN_AMBULANCE_FOR.wav",
                "DISPATCH_AMBULANCE_FOR_ERR": "INS_DISPATCH_AN_AMBULANCE_FOR_ERR.wav",
                "AVAILABLE_FIREFIGHTERS_RESPOND": "INS_AVAILABLE_FIREFIGHTERS_RESPOND_TO.wav",
                "AVAILABLE_FIREFIGHTERS_RESPOND_ERR": "INS_AVAILABLE_FIREFIGHTERS_RESPOND_TO_ERR.wav",
                "DISPATCH_FIRETRUCKS_FOR": "INS_DISPATCH_AVAILABLE_FIRETRUCKS_FOR.wav",
                "FIREMEN_REQUIRED_FOR": "INS_FIREMEN_REQUIRED_FOR.wav",
                "I_NEED_FIREFIGHTING_TEAM_FOR": "INS_I_NEED_A_FIREFIGHTING_TEAM_FOR.wav",
                "I_NEED_A_MEDIC_FOR": "INS_I_NEED_A_MEDIC_FOR.wav",
                "I_NEED_MEDICAL_TEAM_FOR": "INS_I_NEED_A_MEDICAL_TEAM_FOR.wav",
                "I_NEED_MEDICAL_TEAM_FOR_ERR": "INS_I_NEED_A_MEDICAL_TEAM_FOR_ERRR.wav",
                "I_NEED_MEDICAL_TEAM_INVESTIGATE": "INS_I_NEED_A_MEDICAL_TEAM_TO_INVESTIGATE.wav",
                "I_NEED_MEDICAL_TEAM_RESPOND": "INS_I_NEED_A_MEDICAL_TEAM_TO_RESPOND_TO.wav",
                "I_NEED_MEDICAL_TEAM_RESPOND_ERR": "INS_I_NEED_A_MEDICAL_TEAM_TO_RESPOND_TO_ERRR.wav",
                "DISPATCH_FIRE_FIGHTERS_RESPONSE": "INS_DISPATCH_FIRE_FIGHTERS_IN_RESPONSE_TO.wav",
                "MEDEVAC_TEAM_REQUIRED": "INS_MEDEVAC_TEAM_REQUIRED_FOR.wav",
                "CONTROL_NEEDS_ASSISTANCE": "INS_THIS_IS_CONTROL_I_NEED_ASSISTANCE_FOR.wav",
                "DISPATCH_FIREMEN_RESPOND_TO": "INS_I_NEED_A_FIREFIGHTING_TEAM_FOR.wav"
            },
            
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
            // Location areas
            areas: {
                "ALGONQUIN": "Areas/ALGONQUIN.wav",
                "BOHAN": "Areas/SOUTH_BOHAN.wav",
                "DUKES": "Areas/ALGONQUIN_DUKES.wav",
                "ALDERNEY": "Areas/ALDERNEY_CITY.wav",
                "CHARGE_ISLAND": "Areas/CHARGE_ISLAND.wav"
            },
            
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            // Directions
            directions: {
                "HEADING_NORTH": "SUSPECT_HEADED_NORTH.wav",
                "HEADING_SOUTH": "SUSPECT_HEADING_SOUTH.wav", 
                "HEADING_EAST": "SUSPECT_HEADED_EAST.wav",
                "HEADING_WEST": "SUSPECT_HEADED_WEST.wav"
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
            // === UNIT DISPATCH VARIANTS ===
            unitDispatch: {
                "DFROM_2_UNITS": "DFROM_DISPATCH_2_UNITS_FROM.wav",
                "DFROM_3_UNITS": "DFROM_DISPATCH_3_UNITS_FROM.wav",
                "DFROM_4_UNITS": "DFROM_DISPATCH_4_UNITS_FROM.wav",
                "DFROM_5_UNITS": "DFROM_DISPATCH_5_UNITS_FROM.wav",
                "DFROM_6_UNITS": "DFROM_DISPATCH_6_UNITS_FROM.wav",
                "DFROM_7_UNITS": "DFROM_DISPATCH_7_UNITS_FROM.wav",
                "DFROM_A_UNIT": "DFROM_DISPATCH_A_UNIT_FROM.wav",
                "DFROM_AIR_UNIT": "DFROM_DISPATCH_AIR_UNIT_FROM.wav",
                "DFROM_AIR_UNITS": "DFROM_DISPATCH_AIR_UNITS_FROM.wav",
                "DFROM_AIR_SQUAD": "DFROM_DISPATCH_AIR_SQUAD_FROM.wav",
                "DFROM_NOOSE_TEAM": "DFROM_DISPATCH_NOOSE_TEAM_FROM.wav",
                "DFROM_A_NOOSE_TEAM": "DFROM_DISPATCH_A_NOOSE_TEAM_FROM.wav",
                "DFROM_A_NOOSE_WATER": "DFROM_DISPATCH_A_NOOSE_WATER_UNIT.wav",
                "DFROM_SWAT_TEAM": "DFROM_DISPATCH_SWAT_TEAM_FROM.wav",
                "DFROM_FIB_TEAM": "DFROM_DISPATCH_FIB_TEAM_FROM.wav",
                "DFROM_FIB_TEAM_ERR": "DFROM_DISPATCH_FIB_TEAM_FROM_ERR.wav",
                "DFROM_AN_FIB_TEAM_ERR": "DFROM_DISPATCH_AN_FIB_TEAM_FROM_ERR.wav",
                "DFROM_ERR_FIB_TEAM": "DFROM_DISPATCH_ERR_FIB_TEAM_FROM.wav",
                "DFROM_POLICE_BOAT": "DFROM_DISPATCH_A_POLICE_BOAT.wav",
                "DFROM_POLICE_BOAT_ERR": "DFROM_DISPATCH_A_POLICE_BOAT_FROM_ERR.wav",
                "DFROM_POLICE_BOATS_ERR": "DFROM_DISPATCH_POLICE_BOATS_FROM_ERR.wav",
                "DFROM_PATROL_BOAT_ERR": "DFROM_DISPATCH_A_PATROL_BOAT_FROM_ERR.wav",
                "DFROM_WATER_UNIT": "DFROM_DISPATCH_A_WATER_UNIT_FROM.wav",
                "DFROM_WATER_PATROL_ERR": "DFROM_DISPATCH_WATER_PATROL_UNITS_FROM_ERR.wav",
                "DFROM_COASTGUARD_ERR": "DFROM_DISPATCH_A_COASTGUARD_UNIT_FROM_ERR.wav"
            },
            
            // === LIBERTY CITY AREAS (92+ zones) ===
            areas: {
                "ACTER": "Areas/ACTER.wav",
                "ACTER_INDUSTRIAL_PARK": "Areas/ACTER_INDUSTRIAL_PARK.wav",
                "ALDERNEY_CITY": "Areas/ALDERNEY_CITY.wav",
                "ALGONQUIN": "Areas/ALGONQUIN.wav",
                "ALGONQUIN_BRIDGE": "Areas/ALGONQUIN_BRIDGE.wav",
                "ALGONQUIN_DUKES": "Areas/ALGONQUIN_DUKES.wav",
                "ASAHARA_RD": "Areas/ASAHARA_RD.wav",
                "BEECHWOOD_CITY": "Areas/BEECHWOOD_CITY.wav",
                "BERCHEM": "Areas/BERCHEM.wav",
                "BOABO": "Areas/BOABO.wav",
                "BOULEVARD": "Areas/BOULEVARD.wav",
                "BROKER": "Areas/BROKER.wav",
                "BROKER_BAY": "Areas/BROKER_BAY.wav",
                "BROKER_BRIDGE": "Areas/BROKER_BRIDGE.wav",
                "CASTLE_GARDEN_CITY": "Areas/CASTLE_GARDEN_CITY.wav",
                "CASTLE_GARDENS": "Areas/CASTLE_GARDENS.wav",
                "CERVAZA_HEIGHTS": "Areas/CERVAZA_HEIGHTS.wav",
                "CERVEZA_HEIGHTS": "Areas/CERVEZA_HEIGHTS.wav",
                "CHARGE_ISLAND": "Areas/CHARGE_ISLAND.wav",
                "CHASE_POINT": "Areas/CHASE_POINT.wav",
                "CHINATOWN": "Areas/CHINATOWN.wav",
                "CITY_HALL": "Areas/CITY_HALL.wav",
                "COLONY_ISLAND": "Areas/COLONY_ISLAND.wav",
                "DOWNTOWN": "Areas/DOWNTOWN.wav",
                "EAST_ALDERNEY_CITY": "Areas/EAST_ALDERNEY_CITY.wav",
                "EAST_HOLLAND": "Areas/EAST_HOLLAND.wav",
                "EAST_HOOK": "Areas/EAST_HOOK.wav",
                "EAST_ISLAND_CITY": "Areas/EAST_ISLAND_CITY.wav",
                "EAST_LEFTWOOD": "Areas/EAST_LEFTWOOD.wav",
                "EASTERN_ACTER": "Areas/EASTERN_ACTER.wav",
                "EASTERN_ACTER_INDUSTRIAL_PARK": "Areas/EASTERN_ACTER_INDUSTRIAL_PARK.wav",
                "EASTERN_FRANCIS_INTERNATIONAL": "Areas/EASTERN_FRANCIS_INTERNATIONAL.wav",
                "EASTON": "Areas/EASTON.wav",
                "FIREFLY_ISLAND": "Areas/FIREFLY_ISLAND.wav",
                "FIREFLY_PROJECTS": "Areas/FIREFLY_PROJECTS.wav",
                "FISH_MARKET_NORTH": "Areas/FISH_MARKET_NORTH.wav",
                "FISHMARKET_SOUTH": "Areas/FISHMARKET_SOUTH.wav",
                "FORTSIDE": "Areas/FORTSIDE.wav",
                "FRANCIS_INTERNATIONAL": "Areas/FRANCIS_INTERNATIONAL.wav",
                "GOLF_COURSE": "Areas/GOLF_COURSE.wav",
                "HAPPINESS_ISLAND": "Areas/HAPPINESS_ISLAND.wav",
                "HATTON_GARDENS": "Areas/HATTON_GARDENS.wav",
                "HOVE_BEACH": "Areas/HOVE_BEACH.wav",
                "HOVE_GARDEN_01": "Areas/HOVE_GARDEN_01.wav",
                "INDUSTRIAL": "Areas/INDUSTRIAL.wav",
                "LANCASTER": "Areas/LANCASTER.wav",
                "LANCET": "Areas/LANCET.wav",
                "LEFTWOOD": "Areas/LEFTWOOD.wav",
                "LITTLE_BAY": "Areas/LITTLE_BAY.wav",
                "LITTLE_ITALY": "Areas/LITTLE_ITALY.wav",
                "LOWER_EASTON": "Areas/LOWER_EASTON.wav",
                "MEADOW_HILLS": "Areas/MEADOW_HILLS.wav",
                "MEADOWS_PARK": "Areas/MEADOWS_PARK.wav",
                "MIDDLE_PARK": "Areas/MIDDLE_PARK.wav",
                "MIDDLE_PARK_EAST": "Areas/MIDDLE_PARK_EAST.wav",
                "MIDDLE_PARK_WEST": "Areas/MIDDLE_PARK_WEST.wav",
                "NORMANDY": "Areas/NORMANDY.wav",
                "NORTH_HOLLAND": "Areas/NORTH_HOLLAND.wav",
                "NORTHERN_FRANCIS_INTERNATIONAL": "Areas/NORTHERN_FRANCIS_INTERNATIONAL.wav",
                "NORTHERN_GARDENS": "Areas/NORTHERN_GARDENS.wav",
                "NORTHWOOD": "Areas/NORTHWOOD.wav",
                "OUTLOOK": "Areas/OUTLOOK.wav",
                "OUTLOOK_PARK": "Areas/OUTLOOK_PARK.wav",
                "PORT_TUDOR": "Areas/PORT_TUDOR.wav",
                "PRESIDENTS_CITY": "Areas/PRESIDENTS_CITY.wav",
                "PURGATORY": "Areas/PURGATORY.wav",
                "ROTTERDAM_HILL": "Areas/ROTTERDAM_HILL.wav",
                "SCHOTTLER": "Areas/SCHOTTLER.wav",
                "SOUTH_BOHAN": "Areas/SOUTH_BOHAN.wav",
                "SOUTH_SLOPES": "Areas/SOUTH_SLOPES.wav",
                "SOUTHERN_FRANCIS_INTERNATIONAL": "Areas/SOUTHERN_FRANCIS_INTERNATIONAL.wav",
                "STAR_JUNCTION": "Areas/STAR_JUNCTION.wav",
                "STEIN_WAY": "Areas/STEIN_WAY.wav",
                "SUFFOLK": "Areas/SUFFOLK.wav",
                "THE_EXCHANGE": "Areas/THE_EXCHANGE.wav",
                "THE_MEAT_QUARTER": "Areas/THE_MEAT_QUARTER.wav",
                "THE_TRIANGLE": "Areas/THE_TRIANGLE.wav",
                "TRIANGLE": "Areas/TRIANGLE.wav",
                "TUDOR": "Areas/TUDOR.wav",
                "VARSITY_HEIGHTS": "Areas/VARSITY_HEIGHTS.wav",
                "WEST_ALDERNEY_CITY": "Areas/WEST_ALDERNEY_CITY.wav",
                "WEST_LEFTWOOD": "Areas/WEST_LEFTWOOD.wav",
                "WESTDYK": "Areas/WESTDYK.wav",
                "WESTERN_ACTER": "Areas/WESTERN_ACTER.wav",
                "WESTERN_ACTER_INDUSTRIAL_PARK": "Areas/WESTERN_ACTER_INDUSTRIAL_PARK.wav",
                "WESTERN_FRANCIS_INTERNATIONAL": "Areas/WESTERN_FRANCIS_INTERNATIONAL.wav",
                "WESTMINSTER": "Areas/WESTMINSTER.wav",
                "WILLIS": "Areas/WILLIS.wav"
            },
            
            // === STREETS ===
            streets: {
                "ALBANY_AVE": "Streets/ALBANY_AVE.wav",
                "ALGONQUIN_BRIDGE": "Streets/ALGONQUIN_BRIDGE.wav",
                "COLUMBUS_AVE": "Streets/COLUMBUS_AVE.wav",
                "FRANKLIN_DRIVE": "Streets/FRANKLIN_DRIVE.wav",
                "HARRISON_ST": "Streets/HARRISON_ST.wav",
                "IVY_RD": "Streets/IVY_RD.wav",
                "SARATOGA_AVE": "Streets/SARATOGA_AVE.wav",
                "UNION_DRIVE_WEST": "Streets/UNION_DRIVE_WEST.wav"
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
            },
            
            // === DIRECTIONS (standalone) ===
            directions: {
                "NORTH": "Directions/NORTH.wav",
                "SOUTH": "Directions/SOUTH.wav",
                "EAST": "Directions/EAST.wav",
                "WEST": "Directions/WEST.wav",
                "NORTHBOUND": "Directions/NORTHBOUND.wav",
                "SOUTHBOUND": "Directions/SOUTHBOUND.wav",
                "EASTBOUND": "Directions/EASTBOUND.wav",
                "WESTBOUND": "Directions/WESTBOUND.wav"
            },
            
            // === DIRECTION PHRASES ===
            directionPhrases: {
                "HEADING_NORTH": "SUSPECT_HEADED_NORTH.wav",
                "HEADING_SOUTH": "SUSPECT_HEADING_SOUTH.wav",
                "HEADING_EAST": "SUSPECT_HEADED_EAST.wav",
                "HEADING_WEST": "SUSPECT_HEADED_WEST.wav",
                "LOOKS_LIKE_HES_HEADING": "LOOKS_LIKE_HES_HEADING.wav",
                "LOOKS_LIKE_HES_GOING": "LOOKS_LIKE_HES_GOING.wav",
                "ON_FOOT": "ON_FOOT.wav",
                "LAST_SEEN": "LAST_SEEN.wav",
                "LAST_SEEN_IN": "SUSPECT_LAST_SEEN_IN.wav",
                "LAST_SEEN_ON": "SUSPECT_LAST_SEEN_ON.wav",
                "SUSPECT": "SUSPECT.wav"
            },
            
            // === PURSUIT STATUS ===
            pursuit: {
                "DOING_50": "DOING_50.wav",
                "DOING_60": "DOING_60.wav",
                "DOING_70": "DOING_70.wav",
                "DOING_80": "DOING_80.wav",
                "DOING_90": "DOING_90.wav",
                "ABANDONED_VEHICLE_FOOT": "HAS_ABANDONED_VEHICLE_AND_IS_CONTINUING_ON_FOOT.wav",
                "FLED_VEHICLE_FOOT": "HAS_FLED_VEHICLE_AND_IS_CONTINUING_ON_FOOT.wav",
                "HES_STILL_IN": "HES_STILL_IN.wav",
                "HES_STILL_ON": "HES_STILL_ON.wav",
                "IS_NOW_DRIVING_ERR": "IS_NOW_DRIVING_A_ERR.wav",
                "THE_SEA": "THE_SEA.wav",
                "AT_SEA": "AT_SEA.wav"
            },
            
            // === VEHICLE COLORS ===
            colours: {
                "BLACK": "Colour/BLACK.wav",
                "BLUE": "Colour/BLUE.wav",
                "BROWN": "Colour/BROWN.wav",
                "GREEN": "Colour/GREEN.wav",
                "GREY": "Colour/GREY.wav",
                "GOLD": "Colour/GOLD.wav",
                "ORANGE": "Colour/ORANGE.wav",
                "PINK": "Colour/PINK.wav",
                "RED": "Colour/RED.wav",
                "SILVER": "Colour/SILVER.wav",
                "WHITE": "Colour/WHITE.wav",
                "YELLOW": "Colour/YELLOW.wav",
                "BEIGE": "Colour/BEIGE.wav",
                "BEAT_UP": "Colour/BEAT_UP.wav",
                "BEATEN_UP": "Colour/BEATEN_UP.wav",
                "BRIGHT": "Colour/BRIGHT.wav",
                "DARK": "Colour/DARK.wav",
                "LIGHT": "Colour/LIGHT.wav",
                "WRECKED": "Colour/WRECKED.wav",
                "DEWBAUCHEE_GREEN": "Colour/DEWBAUCHEE_GREEN.wav",
                "GROTTI_RED": "Colour/GROTTI_RED.wav",
                "GRAPHITE": "Colour/GRAPHITE.wav"
            },
            
            // === VEHICLE MANUFACTURERS ===
            manufacturer: {
                "ALBANY": "Manufacturer/MAN_ALBANY.wav",
                "ANNIS": "Manufacturer/MAN_ANNIS.wav",
                "BENEFACTOR": "Manufacturer/MAN_BENEFACTOR.wav",
                "BRAVADO": "Manufacturer/MAN_BRAVADO.wav",
                "BRUTE": "Manufacturer/MAN_BRUTE.wav",
                "CABLE_CAR": "Manufacturer/MAN_CABLE_CAR.wav",
                "CLASSIQUE": "Manufacturer/MAN_CLASSIQUE.wav",
                "CUSTOM": "Manufacturer/MAN_CUSTOM.wav",
                "DECLASSE": "Manufacturer/MAN_DECLASSE.wav",
                "DEWBAUCHEE": "Manufacturer/MAN_DEWBAUCHEE.wav",
                "DINKA": "Manufacturer/MAN_DINKA.wav",
                "DUNDREARY": "Manufacturer/MAN_DUNDREARY.wav",
                "EMPEROR": "Manufacturer/MAN_EMPEROR.wav",
                "ENUS": "Manufacturer/MAN_ENUS.wav",
                "GROTTI": "Manufacturer/MAN_GROTTI.wav",
                "HVY": "Manufacturer/MAN_HVY.wav",
                "IMPONTE": "Manufacturer/MAN_IMPONTE.wav",
                "INVETERO": "Manufacturer/MAN_INVETERO.wav",
                "JOEBUILT": "Manufacturer/MAN_JOEBUILT.wav",
                "KARIN": "Manufacturer/MAN_KARIN.wav",
                "MAIBATSU": "Manufacturer/MAN_MAIBATSU.wav",
                "MAMMOTH": "Manufacturer/MAN_MAMMOTH.wav",
                "MOTORCYCLE_CO": "Manufacturer/MAN_MOTORCYCLE_W_COMPANY.wav",
                "MTL": "Manufacturer/MAN_MTL.wav",
                "PEGASI": "Manufacturer/MAN_PEGASI.wav",
                "PFISTER": "Manufacturer/MAN_PFISTER.wav",
                "SCHYSTER": "Manufacturer/MAN_SCHYSTER.wav",
                "SHITZU": "Manufacturer/MAN_SHITZU.wav",
                "STEEL_HORSE": "Manufacturer/MAN_STEEL_HORSE.wav",
                "UBERMACHT": "Manufacturer/MAN_UBERMACHT.wav",
                "VAPID": "Manufacturer/MAN_VAPID.wav",
                "VULCAR": "Manufacturer/MAN_VULCAR.wav",
                "WESTERN": "Manufacturer/MAN_WESTERN_COMPANY.wav",
                "WILLARD": "Manufacturer/MAN_WILLARD.wav",
                "ZIREONIUM": "Manufacturer/MAN_ZIREONIUM.wav"
            },
            
            // === VEHICLE CATEGORIES ===
=======
            },
            
            // Vehicle categories
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            vehicleCategory: {
                "SEDAN": "VehicleCategory/SEDAN.wav",
                "SPORTS_CAR": "VehicleCategory/SPORTS_CAR.wav",
                "SUV": "VehicleCategory/SUV.wav",
                "TRUCK": "VehicleCategory/TRUCK.wav"
            },
            
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
            // === VEHICLE MODELS ===
=======
            // Vehicle models
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            model: {
                "ADMIRAL": "Model/MOD_ADMIRAL.wav",
                "BANSHEE": "Model/MOD_BANSHEE.wav",
                "BLISTA": "Model/MOD_BLISTA.wav",
                "FUTO": "Model/MOD_FUTO.wav",
                "INGOT": "Model/MOD_INGOT.wav",
                "FACTION": "Model/MOD_FACTION.wav",
                "LANDSTALKER": "Model/MOD_LANDSTALKER.wav",
                "ORACLE": "Model/MOD_ORACLE.wav",
                "SENTINEL": "Model/MOD_SENTINEL.wav"
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
            },
            
            // === CALLOUT RESOLUTION ===
            resolution: {
                "SUSPECT_APPREHENDED": "SUSPECT_APPREHENDED.wav",
                "SUSPECT_NEUTRALIZED": "SUSPECT_NEUTRALIZED.wav",
                "SUSPECT_TAKEN_DOWN": "SUSPECT_TAKEN_DOWN.wav",
                "SUSPECT_PACIFIED": "SUSPECT_PACIFIED.wav",
                "SUSPECT_IS_BAGGED_AND_TAGGED": "SUSPECT_IS_BAGGED_AND_TAGGED.wav",
                "SUSPECT_IS_DOWN": "SUSPECT_IS_DOWN.wav",
                "WE_HAVE_SUSPECT_IN_CUSTODY": "WE_HAVE_THE_SUSPECT_IN_CUSTODY.wav"
            },
            
            // === SPEECH FILLERS / CONJUNCTIVES ===
            fillers: {
                "A_05": "Conjunctives/A_05.wav",
                "A_AH": "Conjunctives/A_AH.wav",
                "A_ERR": "Conjunctives/A_ERR.wav",
                "A_LONGER": "Conjunctives/A_LONGER.wav",
                "A_NEW_01": "Conjunctives/A_NEW_01.wav",
                "A_NEW_02": "Conjunctives/A_NEW_02.wav",
                "A_NEW_03": "Conjunctives/A_NEW_03.wav",
                "DOING": "Conjunctives/DOING.wav",
                "ERR_01": "Conjunctives/ERR_ERRR_01.wav",
                "ERR_02": "Conjunctives/ERR_ERRR_02.wav",
                "ERR_03": "Conjunctives/ERR_ERRR_03.wav",
                "ERR_04": "Conjunctives/ERR_ERRR_04.wav",
                "ERR_05": "Conjunctives/ERR_ERRR_05.wav",
                "ERR_06": "Conjunctives/ERR_ERRR_06.wav",
                "ERR_07": "Conjunctives/ERR_ERRR_07.wav",
                "ERR_08": "Conjunctives/ERR_ERRR_08.wav",
                "ERR_09": "Conjunctives/ERR_ERRR_09.wav",
                "ERR_10": "Conjunctives/ERR_ERRR_10.wav",
                "ERR_11": "Conjunctives/ERR_ERRR_11.wav",
                "ERR_12": "Conjunctives/ERR_ERRR_12.wav",
                "ERR_13": "Conjunctives/ERR_ERRR_13.wav",
                "ERR_14": "Conjunctives/ERR_ERRR_14.wav",
                "ERR_15": "Conjunctives/ERR_ERRR_15.wav",
                "ERR_16": "Conjunctives/ERR_ERRR_16.wav",
                "ERR_17": "Conjunctives/ERR_ERRR_17.wav",
                "FOR": "Conjunctives/FOR.wav",
                "HES": "Conjunctives/HES.wav",
                "IN_01": "Conjunctives/IN_01.wav",
                "IN_IN": "Conjunctives/IN_IN.wav",
                "ON_01": "Conjunctives/ON_01.wav",
                "ON_02": "Conjunctives/ON_02.wav",
                "ON_03": "Conjunctives/ON_03.wav",
                "ON_04": "Conjunctives/ON_04.wav",
                "ON_05": "Conjunctives/ON_05.wav",
                "ON_06": "Conjunctives/ON_06.wav",
                "ON_07": "Conjunctives/ON_07.wav",
                "ON_08": "Conjunctives/ON_08.wav",
                "ON_09": "Conjunctives/ON_09.wav",
                "ON_10": "Conjunctives/ON_10.wav",
                "ON_11": "Conjunctives/ON_11.wav",
                "UMM": "Conjunctives/UMM.wav"
            },
            
            // === BACKGROUND NOISE (Resident Scanner) ===
            noise: {
                "CROSSTALK": "Scanner_Resident/CROSSTALK.wav",
                "IN_01": "Scanner_Resident/IN_01.wav",
                "IN_02": "Scanner_Resident/IN_02.wav",
                "IN_NOISE_01": "Scanner_Resident/IN_NOISE_01.wav",
                "END_NOISE_01": "Scanner_Resident/END_NOISE_01.wav",
                "ENDING_03": "Scanner_Resident/ENDING_03.wav",
                "NOISE_LOOP_A": "Scanner_Resident/NOISE_LOOP_A.wav",
                "NOISE_LOOP_B": "Scanner_Resident/NOISE_LOOP_B.wav"
            },
            
            // === AMBIENT EFFECTS ===
            ambient: {
                "CUFFS_TIGHTEN": "Amb_Resident/CUFFS_TIGHTEN_01.wav",
                "TASER_DEPLOY": "Amb_Resident/TASER_DEPLOY.wav"
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            }
        };
        
        // Load all audio files
        var totalFiles = 0;
        var openedFiles = 0;
        var createdSounds = 0;
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
        
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        for (var category in audioFiles) {
            this.sounds[category] = {};
            for (var file in audioFiles[category]) {
                var path = "Audio/PoliceScanner/" + audioFiles[category][file];
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
                totalFiles++;
                
                var stream = null;
                var sound = null;
                
                try {
                    stream = openFile(path);
                    if (!stream) {
                        continue;
                    }
                    openedFiles++;
                    sound = audio.createSound(stream, false);
                } catch (e) {
                    if (stream && typeof stream.close === "function") {
                        stream.close();
                    }
                    continue;
                }
                
=======
                console.log("[PoliceScanner] Loading audio: " + path);
                totalFiles += 1;
                
                var stream = null;
                var sound = null;

                try {
                    stream = openFile(path);
                    if (!stream) {
                        console.log("[PoliceScanner] Failed to open audio file: " + path);
                        continue;
                    }
                    openedFiles += 1;

                    // GTAC expects a boolean as the 2nd argument (likely loop)
                    sound = audio.createSound(stream, false);
                } catch (e) {
                    console.log("[PoliceScanner] Exception creating sound for " + path + ": " + String(e));
                }

>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
                if (!sound) {
                    if (stream && typeof stream.close === "function") {
                        stream.close();
                    }
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
                    continue;
                }
                
                this._streams.push(stream);
                this.sounds[category][file] = sound;
                createdSounds++;
            }
        }
        
        console.log("[PoliceScanner] Loaded " + Object.keys(audioFiles).length + " audio categories, " + createdSounds + " sounds created");
    },
    
    setupAudioSystem: function() {
=======
                    console.log("[PoliceScanner] Failed to create sound: " + path);
                    continue;
                }

                this._streams.push(stream);
                this.sounds[category][file] = sound;
                createdSounds += 1;
            }
        }
        
        console.log("[PoliceScanner] Loaded " + Object.keys(audioFiles).length + " audio categories");
        console.log("[PoliceScanner] Audio load summary: total=" + totalFiles + ", opened=" + openedFiles + ", sounds=" + createdSounds);
    },
    
    setupAudioSystem: function() {
        // Setup 3D audio positioning
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        this.active = true;
        console.log("[PoliceScanner] 3D audio system ready");
    },
    
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
    // ========================================================================
    // CORE SEQUENCE BUILDING - STRUCTURED MODE
    // ========================================================================
    
    buildStructuredSequence: function(calloutData) {
        // calloutData = { type, position, vehicleColor, vehicleManufacturer, vehicleModel, vehicleCategory, speed, heading, isFoot }
        var sequence = [];
        var self = this;
        
        if (!calloutData) calloutData = {};
        var type = calloutData.type || "shooting";
        var position = calloutData.position || (localPlayer ? localPlayer.position : {x:0,y:0,z:0});
        
        // 1) ATTENTION GRABBER - random dispatch intro
        var intros = ["ATTENTION_ALL_UNITS", "THIS_IS_CONTROL", "INS_THIS_IS_CONTROL_WE_HAVE", "ALL_UNITS"];
        sequence.push({ category: "dispatch", file: intros[Math.floor(Math.random() * intros.length)], delay: 0 });
        
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
    playDispatch: function(calloutType, position) {
        if (!this.enabled) {
            console.log("[PoliceScanner] Playback disabled (playDispatch blocked)");
            return;
        }
        if (!this.active) return;
        
        console.log("[PoliceScanner] Playing dispatch for: " + calloutType);

        // Build structured sequence (short, coherent)
        var sequence = this.structuredMode
            ? this.buildStructuredSequence(calloutType, position)
            : this.buildDispatchSequence(calloutType, position);

        this.playSequence(sequence, position);
    },
    
    buildDispatchSequence: function(calloutType, position) {
        var sequence = [];
        
        // Start with attention
        sequence.push({
            category: "dispatch",
            file: "ATTENTION_ALL_UNITS",
            delay: 0
        });
        
        // Add callout specific message
        switch (calloutType) {
            case "shooting":
                sequence.push({
                    category: "criminal", 
                    file: "SHOTS_FIRED",
                    delay: 1000
                });
                break;
                
            case "pursuit":
                sequence.push({
                    category: "criminal",
                    file: "CRIMINAL_RESISTING_ARREST", 
                    delay: 1000
                });
                break;
                
            case "brawl":
                sequence.push({
                    category: "criminal",
                    file: "DOMESTIC_DISTURBANCE",
                    delay: 1000
                });
                break;
                
            case "traffic":
                sequence.push({
                    category: "traffic",
                    file: "TRAFFIC_VIOLATION",
                    delay: 1000
                });
                break;
        }
        
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        // Add location information
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({
                category: "areas",
                file: area,
                delay: 2000
            });
        }
        
        return sequence;
    },

    buildStructuredSequence: function(calloutType, position) {
        var sequence = [];

        // 1) Attention
        sequence.push({ category: "dispatch", file: "ATTENTION_ALL_UNITS", delay: 0 });

        // 2) Callout type (core meaning)
        var calloutClip = null;
        switch (calloutType) {
            case "shooting":
                calloutClip = { category: "criminal", file: "SHOTS_FIRED", delay: 1000 };
                break;
            case "pursuit":
                calloutClip = { category: "criminal", file: "CRIMINAL_RESISTING_ARREST", delay: 1000 };
                break;
            case "brawl":
                calloutClip = { category: "criminal", file: "DOMESTIC_DISTURBANCE", delay: 1000 };
                break;
            case "traffic":
                calloutClip = { category: "traffic", file: "TRAFFIC_VIOLATION", delay: 1000 };
                break;
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
        // 2) Optional report source phrase (60% chance)
        if (Math.random() < 0.6) {
            var reports = ["INS_CIVILIANS_REPORT", "INS_WE_HAVE", "INS_WEVE_GOT", "INS_UNITS_REPORT"];
            sequence.push({ category: "dispatchReports", file: reports[Math.floor(Math.random() * reports.length)], delay: 900 });
        }
        
        // 3) FILLER PAUSE (speech artifact for realism)
        if (Math.random() < 0.35) {
            var filler = this.pickAvailable("fillers", ["ERR_01","ERR_02","ERR_03","ERR_04","ERR_05","UMM","A_ERR","A_AH","A_05"]);
            if (filler) sequence.push({ category: "fillers", file: filler, delay: 600 });
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
        }
        
        // 4) CORE INCIDENT PHRASE based on crime type
        var calloutClip = this.getCrimeClip(type);
        if (calloutClip) {
            sequence.push(calloutClip);
        }
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js

        // 3) Area
========
        
        // 5) VEHICLE DESCRIPTION (if vehicle info provided)
        if (calloutData.vehicleColor) {
            var colorKey = calloutData.vehicleColor.toUpperCase();
            if (this.hasClip("colours", colorKey)) {
                if (Math.random() < 0.7) {
                    var colorPrefix = ["DARK", "LIGHT", null];
                    var prefix = colorPrefix[Math.floor(Math.random() * colorPrefix.length)];
                    if (prefix && this.hasClip("colours", prefix)) {
                        sequence.push({ category: "colours", file: prefix, delay: 800 });
                    }
                }
                sequence.push({ category: "colours", file: colorKey, delay: 700 });
            }
        }
        
        if (calloutData.vehicleManufacturer) {
            var manKey = calloutData.vehicleManufacturer.toUpperCase();
            if (this.hasClip("manufacturer", manKey)) {
                sequence.push({ category: "manufacturer", file: manKey, delay: 700 });
            }
        }
        
        if (calloutData.vehicleModel) {
            var modelKey = calloutData.vehicleModel.toUpperCase();
            if (this.hasClip("model", modelKey)) {
                sequence.push({ category: "model", file: modelKey, delay: 800 });
            } else if (calloutData.vehicleCategory) {
                var catKey = calloutData.vehicleCategory.toUpperCase();
                if (this.hasClip("vehicleCategory", catKey)) {
                    sequence.push({ category: "vehicleCategory", file: catKey, delay: 800 });
                }
            }
        }
        
        // 6) FILLER for natural break
        if (Math.random() < 0.3) {
            var filler2 = this.pickAvailable("fillers", ["A_NEW_01","A_NEW_02","A_NEW_03","A_LONGER","FOR","IN_01","IN_IN","ON_01","ON_02","ON_03"]);
            if (filler2) sequence.push({ category: "fillers", file: filler2, delay: 500 });
        }
        
        // 7) DISPATCH UNIT INFO
        if (Math.random() < 0.5) {
            var unitTypes = ["DFROM_2_UNITS", "DFROM_3_UNITS", "DFROM_A_UNIT", "DFROM_AIR_UNIT"];
            if (type === "shooting" || type === "officer_down" || type === "firearm_attack") {
                unitTypes = ["DFROM_NOOSE_TEAM", "DFROM_A_NOOSE_TEAM", "DFROM_SWAT_TEAM",
                            "DFROM_4_UNITS", "DFROM_5_UNITS", "DFROM_AIR_UNIT", "DFROM_AIR_UNITS", "DFROM_AIR_SQUAD"];
            } else if (type === "fire" || type === "medical") {
                unitTypes = ["DFROM_2_UNITS", "DFROM_3_UNITS", "DFROM_A_UNIT"];
            }
            var unit = this.pickAvailable("unitDispatch", unitTypes);
            if (unit) {
                sequence.push({ category: "unitDispatch", file: unit, delay: 900 });
            }
        }
        
        // 8) LOCATION (AREA) - USE PRECISE ZONE MAPPING
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
=======
        }
        if (calloutClip) {
            sequence.push(calloutClip);
        }

        // 3) Area
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({ category: "areas", file: area, delay: 1200 });
        }
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js

        // 4) Optional direction (short, not always)
        if (Math.random() < 0.6) {
            var dirs = ["HEADING_NORTH", "HEADING_SOUTH", "HEADING_EAST", "HEADING_WEST"];
            var dir = dirs[Math.floor(Math.random() * dirs.length)];
            sequence.push({ category: "directions", file: dir, delay: 1200 });
        }

        // Enforce max clip count for coherence
        if (sequence.length > this.structuredMaxClips) {
            sequence = sequence.slice(0, this.structuredMaxClips);
        }

        return sequence;
    },
    
    getAreaFromPosition: function(position) {
        // Simple area detection based on Liberty City districts
        var x = position.x;
        var y = position.y;
        
        if (x > 0 && y > 0) return "ALGONQUIN";
        if (x < 0 && y > 0) return "BOHAN";
        if (x < 0 && y < 0) return "ALDERNEY";
        if (x > 0 && y < 0) return "DUKES";
        
        return "ALGONQUIN"; // Default
    },
    
    playSequence: function(sequence, position) {
        if (!this.enabled) {
            console.log("[PoliceScanner] Playback disabled (playSequence blocked)");
            return;
        }
        var delay = 0;
        
        sequence.forEach(function(item) {
            setTimeout(function() {
                PoliceScanner.Manager.playSound(item.category, item.file, position);
            }, delay);
            
            delay += item.delay + 500; // Add pause between clips
        });
    },
    
    playSound: function(category, file, position, force) {
        if (!this.enabled && !force) {
            return;
        }
        if (!this.sounds[category] || !this.sounds[category][file]) {
            console.log("[PoliceScanner] Sound not found: " + category + "/" + file);
            return;
        }
        
        var sound = this.sounds[category][file];
        
        // Set 3D position
        if (position && sound.setPosition) {
            sound.position = position;
            sound.maxDistance = 100; // 100 units range
            sound.referenceDistance = 10; // Reference distance for 3D audio
        }
        
        // Set volume
        if (sound.volume !== undefined) {
            sound.volume = this.volume;
        }
        
        // Play sound
        if (sound.play) {
            sound.play();
            console.log("[PoliceScanner] Playing: " + category + "/" + file + " at " + JSON.stringify(position));
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
        
        // 9) Optional street
        if (Math.random() < 0.4) {
            var street = this.pickAvailable("streets", ["ALBANY_AVE","ALGONQUIN_BRIDGE","COLUMBUS_AVE","FRANKLIN_DRIVE","HARRISON_ST","IVY_RD","SARATOGA_AVE","UNION_DRIVE_WEST"]);
            if (street) {
                sequence.push({ category: "streets", file: street, delay: 900 });
            }
        }
        
        // 10) SPEED if in pursuit
        if (calloutData.speed !== undefined && calloutData.speed > 0) {
            var speedLevel = this.getSpeedLevel(calloutData.speed);
            if (speedLevel) {
                sequence.push({ category: "pursuit", file: speedLevel, delay: 800 });
            }
        }
        
        // 11) DIRECTION/STATUS
        if (calloutData.isFoot || Math.random() < 0.3) {
            // Suspect on foot
            if (calloutData.isFoot && this.hasClip("directionPhrases", "ON_FOOT")) {
                sequence.push({ category: "directionPhrases", file: "LOOKS_LIKE_HES_HEADING", delay: 900 });
                var dirs1 = ["HEADING_NORTH", "HEADING_SOUTH", "HEADING_EAST", "HEADING_WEST"];
                var dir1 = dirs1[Math.floor(Math.random() * dirs1.length)];
                if (this.hasClip("directionPhrases", dir1)) {
                    sequence.push({ category: "directionPhrases", file: dir1, delay: 800 });
                }
                sequence.push({ category: "directionPhrases", file: "ON_FOOT", delay: 700 });
            } else if (!calloutData.isFoot) {
                // Suspect in vehicle direction
                if (Math.random() < 0.5) {
                    sequence.push({ category: "directionPhrases", file: "LOOKS_LIKE_HES_HEADING", delay: 800 });
                }
                var dirs2 = ["HEADING_NORTH", "HEADING_SOUTH", "HEADING_EAST", "HEADING_WEST"];
                var dir2 = dirs2[Math.floor(Math.random() * dirs2.length)];
                if (this.hasClip("directionPhrases", dir2)) {
                    sequence.push({ category: "directionPhrases", file: dir2, delay: 800 });
                }
            }
        }
        
        // 12) CLOSING RESPONSE REQUEST
        if (Math.random() < 0.4) {
            var responses = ["INS_AVAILABLE_UNITS_RESPOND_TO", "ALL_UNITS_PLEASE_RESPOND", null];
            var resp = responses[Math.floor(Math.random() * responses.length)];
            if (resp) {
                sequence.push({ category: "dispatchReports", file: resp, delay: 1000 });
            }
        }
        
        // 13) Final filler if available
        if (Math.random() < 0.2) {
            var filler3 = this.pickAvailable("fillers", ["ERR_10","ERR_11","ERR_12","ERR_13","ERR_14"]);
            if (filler3) sequence.push({ category: "fillers", file: filler3, delay: 400 });
        }
        
        return this.finalizeSequence(sequence);
    },
    
    // ========================================================================
    // CRIME TYPE TO AUDIO CLIP MAPPING
    // ========================================================================
    
    getCrimeClip: function(type) {
        var map = {
            "shooting":           { category: "criminal", file: "SHOTS_FIRED" },
            "pursuit":            { category: "criminal", file: "GRAND_THEFT_AUTO" },
            "brawl":              { category: "criminal", file: "DRUNKEN_DISTURBANCE" },
            "traffic":            { category: "traffic", file: "TRAFFIC_VIOLATION" },
            "domestic":           { category: "criminal", file: "DOMESTIC_DISTURBANCE" },
            "robbery":            { category: "criminal", file: "MUGGING" },
            "shootout":           { category: "criminal", file: "SHOOT_OUT" },
            "drugs":              { category: "criminal", file: "DRUG_DEAL" },
            "fire":               { category: "criminal", file: "FIRE" },
            "medical":            { category: "criminal", file: "MEDICAL_EMERGENCY" },
            "officer_down":       { category: "officer", file: "OFFICER_DOWN" },
            "officer_danger":     { category: "officer", file: "OFFICER_IN_DANGER" },
            "officer_assault":    { category: "officer", file: "OFFICER_ASSAULT" },
            "theft":              { category: "criminal", file: "GRAND_THEFT_AUTO" },
            "stolen_vehicle":     { category: "criminal", file: "STOLEN_VEHICLE" },
            "reckless":           { category: "criminal", file: "RECKLESS_DRIVER" },
            "suspicious":         { category: "criminal", file: "SUSPICIOUS_ACTIVITY" },
            "armed":              { category: "criminal", file: "ARMED_AND_DANGEROUS" },
            "driveby":            { category: "criminal", file: "DRIVEBY" },
            "civilian_down":      { category: "criminal", file: "CIVILIAN_DOWN" },
            "fleeing":            { category: "criminal", file: "CRIMINAL_FLEEING" },
            "firearm_attack":     { category: "criminal", file: "FIREARM_ATTACK_ON_OFFICER" },
            "shots_at_officer":   { category: "criminal", file: "SHOTS_FIRED_AT_OFFICER" },
            "suspect_armed":      { category: "criminal", file: "SUSPECT_ARMED_AND_DANGEROUS" },
            "traffic_felony":     { category: "criminal", file: "TRAFFIC_FELONY" },
            "brawl_drunken":      { category: "criminal", file: "DRUNKEN_BRAWL" },
            "unconscious":        { category: "criminal", file: "UNCONSCIOUS_CIVILIAN" },
            "disturbing_peace":   { category: "criminal", file: "DISTURBING_THE_PEACE" },
            "driveby_criminals":  { category: "criminal", file: "DRIVEBY_ACTIVITY" }
        };
        return map[type] || map["shooting"];
    },
    
    // ========================================================================
    // LIBERTY CITY ZONE DETECTION
    // ========================================================================
    
    getAreaFromPosition: function(position) {
        if (!position || position.x === undefined) return null;
        
        var x = position.x;
        var y = position.y;
        var z = position.z || 0;
        
        // Precise Liberty City zone detection based on GTA IV coordinates
        // Map bounds: x: -4500 to 4500, y: -4500 to 4500
        
        // === ALDERNEY (Island 3, SW quadrant) ===
        if (x < -100 && y < -100) {
            if (x < -600 && y < -250 && y > -600) return "ACTER_INDUSTRIAL_PARK";
            if (x < -600 && y < -600) return "EASTERN_ACTER_INDUSTRIAL_PARK";
            if (x > -200 && x < 100 && y > -600 && y < -100) return "ALDERNEY_CITY";
            if (x < -400 && y > -800 && y < -200 && x > -700) return "WESTERN_ACTER";
            if (x < -700 && y > -800 && y < -100) return "ACTER";
            if (x > -100 && x < 100 && y < -400 && y > -800) return "EAST_ALDERNEY_CITY";
            if (x > -100 && x < 200 && y < -200 && y > -400) return "WEST_ALDERNEY_CITY";
            if (x < 0 && y > 0 && y < 200) return "NORMANDY";
            if (x < -300 && y < 200 && y > 0) return "PORT_TUDOR";
            if (x < -200 && y < 400 && y > 200) return "TUDOR";
            if (x < -100 && y < 200 && y > 0) return "WESTDYK";
            if (x < 200 && x > 0 && y < 400 && y > 200) return "PURGATORY";
            if (x < 0 && y < 200 && y > 100) return "CERVAZA_HEIGHTS";
            if (x < -200 && y < 100 && y > -200) return "CERVEZA_HEIGHTS";
            if (x < 0 && y < -100 && y > -400) return "LEFTWOOD";
            if (x < 100 && x > -100 && y < 0 && y > -200) return "WEST_LEFTWOOD";
            if (x < -100 && y < 0 && y > -200) return "EAST_LEFTWOOD";
            if (x < 100 && x > 0 && y < 200 && y > 0) return "INDUSTRIAL";
            if (x < -100 && y < -400 && y > -600) return "LITTLE_BAY";
            if (x < -200 && y < -600) return "WESTERN_ACTER_INDUSTRIAL_PARK";
            if (x < -100 && x > -200 && y < -400 && y > -500) return "BOULEVARD";
            
            // Fallback Alderney zones
            if (x < -600) return "WESTERN_ACTER";
            if (x > -100 && y > -300 && y < -100) return "ALDERNEY_CITY";
            return "ALDERNEY_CITY";
        }
        
        // === BOHAN (Island 1, NW quadrant) ===
        if (x < 0 && y > 100) {
            if (x > -400 && y > 400) return "BROKER_BAY";
            if (x > -400 && y > 200 && y < 400) return "CHASE_POINT";
            if (x > -400 && y > 100 && y < 300) return "LANCET";
            if (x > -300 && y > 600) return "BROKER_BRIDGE";
            if (x > -200 && y > 500 && y < 700) return "BROKER";
            if (x > -400 && x < -200 && y > 300 && y < 500) return "FORTSIDE";
            if (x > -400 && x < -200 && y > 100 && y < 300) return "LANCASTER";
            if (x > -500 && x < -400 && y > 100 && y < 300) return "SOUTH_BOHAN";
            if (x < -500 && y > 100 && y < 300) return "WESTERN_FRANCIS_INTERNATIONAL";
            if (x > -600 && x < -500 && y > 300) return "NORTHERN_FRANCIS_INTERNATIONAL";
            if (x < -600 && y > 300) return "FRANCIS_INTERNATIONAL";
            if (x < -500 && y > 500) return "EASTERN_FRANCIS_INTERNATIONAL";
            if (x < -300 && x > -600 && y > 500) return "SOUTHERN_FRANCIS_INTERNATIONAL";
            if (x < -300 && y > 300 && y < 500) return "NORTH_HOLLAND";
            if (x < -200 && x > -300 && y > 300 && y < 500) return "EAST_HOLLAND";
            if (x < -200 && x > -300 && y > 100 && y < 300) return "HOVE_BEACH";
            if (x < -300 && x > -400 && y > 100 && y < 200) return "HOVE_GARDEN_01";
            if (x > -500 && x < -300 && y > 400 && y < 600) return "WESTMINSTER";
            if (x < -400 && y > 300 && y < 500) return "NORTHWOOD";
            
            return "SOUTH_BOHAN";
        }
        
        // === ALGONQUIN (Island 2, center/SE quadrant) ===
        if (x > 0 && y > 0) {
            if (x > 200 && x < 500 && y > 500 && y < 800) return "COLONY_ISLAND";
            if (x > 100 && x < 400 && y > 200 && y < 500) return "FIREFLY_ISLAND";
            if (x > 400 && x < 600 && y > 200 && y < 500) return "FIREFLY_PROJECTS";
            if (x > 100 && x < 300 && y > 100 && y < 300) return "EASTON";
            if (x > 300 && x < 600 && y > 100 && y < 300) return "LOWER_EASTON";
            if (x > 600 && y > 200 && y < 500) return "HAPPINESS_ISLAND";
            if (x > 500 && x < 700 && y > 100 && y < 300) return "STEIN_WAY";
            if (x > 100 && x < 500 && y < 100 && y > -100) return "MIDDLE_PARK";
            if (x > 100 && x < 300 && y < 100 && y > -100) return "MIDDLE_PARK_EAST";
            if (x > 300 && x < 500 && y < 100 && y > -100) return "MIDDLE_PARK_WEST";
            if (x > 100 && x < 400 && y < -100 && y > -400) return "THE_EXCHANGE";
            if (x > 400 && x < 700 && y < -100 && y > -400) return "THE_TRIANGLE";
            if (x > 700 && x < 900 && y < -100 && y > -300) return "TRIANGLE";
            if (x > 200 && x < 500 && y < -400 && y > -700) return "CITY_HALL";
            if (x > 500 && x < 800 && y < -400 && y > -700) return "STAR_JUNCTION";
            if (x > 800 && y < -300 && y > -600) return "EAST_ISLAND_CITY";
            if (x > 600 && x < 800 && y < -200 && y > -400) return "SUFFOLK";
            if (x > 500 && x < 700 && y < -700 && y > -1000) return "CASTLE_GARDEN_CITY";
            if (x > 700 && x < 900 && y < -700 && y > -1000) return "CASTLE_GARDENS";
            if (x < 200 && x < 400 && y < -700 && y > -900) return "PRESIDENTS_CITY";
            if (x < 100 && y < -700 && y > -900) return "VARSITY_HEIGHTS";
            if (x > 400 && x < 600 && y < -900 && y > -1100) return "OUTLOOK";
            if (x > 200 && x < 400 && y < -900 && y > -1100) return "OUTLOOK_PARK";
            
            if (x > 100 && x < 400 && y > 500 && y < 800) return "CHINATOWN";
            if (x > 400 && x < 600 && y > 500 && y < 800) return "FISH_MARKET_NORTH";
            if (x > 600 && x < 800 && y > 500 && y < 800) return "FISHMARKET_SOUTH";
            if (y > 800) return "NORTHERN_GARDENS";
            if (x > 800) return "EAST_HOOK";
            if (x > 200 && x < 500 && y < -700 && y > -900) return "THE_MEAT_QUARTER";
            
            return "ALGONQUIN";
        }
        
        // === DUKES (Island 4, SE quadrant) ===
        if (x > 100 && y < 0) {
            if (x > 100 && x < 400 && y > -500 && y < -100) return "HATTON_GARDENS";
            if (x > 100 && x < 400 && y > -800 && y < -500) return "SCHOTTLER";
            if (x > 400 && x < 700 && y > -500 && y < -200) return "LITTLE_ITALY";
            if (x > 700 && x < 1000 && y > -500 && y < -200) return "ROTTERDAM_HILL";
            if (x > 400 && x < 700 && y > -800 && y < -500) return "BOABO";
            if (x > 700 && x < 1000 && y > -800 && y < -500) return "BERCHEM";
            if (x > 100 && x < 400 && y < -800 && y > -1200) return "MEADOW_HILLS";
            if (x > 400 && x < 700 && y < -800 && y > -1200) return "MEADOWS_PARK";
            if (x > 700 && x < 1000 && y < -800 && y > -1200) return "BEECHWOOD_CITY";
            if (x > 0 && x < 200 && y > -500 && y < -200) return "DOWNTOWN";
            if (x > 200 && x < 400 && y < -1200) return "CHARGE_ISLAND";
            if (x > 400 && x < 700 && y < -1200) return "SOUTH_SLOPES";
            if (x > 700 && y < -1200) return "FRANCIS_INTERNATIONAL";
            if (x > 1000) return "EASTERN_ACTER";
            
            return "ALGONQUIN_DUKES";
        }
        
        // Fallback
        return "ALGONQUIN";
    },
    
    // ========================================================================
    // SPEED LEVEL MAPPING
    // ========================================================================
    
    getSpeedLevel: function(speed) {
        // speed in m/s
        var mph = speed * 2.237; // convert m/s to mph approx
        if (mph < 50) return null;
        if (mph < 60) return this.hasClip("pursuit", "DOING_50") ? "DOING_50" : null;
        if (mph < 70) return this.hasClip("pursuit", "DOING_60") ? "DOING_60" : null;
        if (mph < 80) return this.hasClip("pursuit", "DOING_70") ? "DOING_70" : null;
        if (mph < 90) return this.hasClip("pursuit", "DOING_80") ? "DOING_80" : null;
        return this.hasClip("pursuit", "DOING_90") ? "DOING_90" : null;
    },
    
    // ========================================================================
    // PUBLIC INTERFACE
    // ========================================================================
    
    playDispatch: function(type, position, vehicleInfo) {
        if (!this.enabled) return;
        if (!this.active) return;
        
        console.log("[PoliceScanner] Playing dispatch for type: " + type);
        
        var data = {
            type: type,
            position: position || (localPlayer ? localPlayer.position : null),
            vehicleColor: vehicleInfo ? vehicleInfo.color : null,
            vehicleManufacturer: vehicleInfo ? vehicleInfo.manufacturer : null,
            vehicleModel: vehicleInfo ? vehicleInfo.model : null,
            vehicleCategory: vehicleInfo ? vehicleInfo.category : null,
            speed: vehicleInfo ? vehicleInfo.speed : undefined,
            isFoot: vehicleInfo ? vehicleInfo.isFoot : false
        };
        
        var sequence = this.structuredMode
            ? this.buildStructuredSequence(data)
            : this.buildLegacySequence(type, position);
        
        this.playSequence(sequence, position);
    },
    
    // Legacy sequence for backward compatibility
    buildLegacySequence: function(type, position) {
        var sequence = [];
        sequence.push({ category: "dispatch", file: "ATTENTION_ALL_UNITS", delay: 0 });
        
        var clip = this.getCrimeClip(type);
        if (clip) {
            sequence.push(clip);
        }
        
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({ category: "areas", file: area, delay: 2000 });
        }
        
        return sequence;
    },
    
    playPursuitUpdate: function(position, speed, vehicleInfo) {
        if (!this.enabled || !this.active) return;
        
        var sequence = [];
        
        // Brief update: "Suspect is doing X heading Y on Z street"
        if (this.hasClip("pursuit", "HES_STILL_IN") || this.hasClip("pursuit", "HES_STILL_ON")) {
            var still = Math.random() < 0.5 ? "HES_STILL_IN" : "HES_STILL_ON";
            if (this.hasClip("pursuit", still)) {
                sequence.push({ category: "pursuit", file: still, delay: 0 });
            }
        }
        
        if (speed && speed > 0) {
            var speedClip = this.getSpeedLevel(speed);
            if (speedClip) {
                sequence.push({ category: "pursuit", file: speedClip, delay: 700 });
            }
        }
        
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({ category: "areas", file: area, delay: 1000 });
        }
        
        if (sequence.length > 0) {
            this.playSequence(sequence, position);
        }
    },
    
    playFootChase: function(position) {
        if (!this.enabled || !this.active) return;
        
        var sequence = [
            { category: "directionPhrases", file: "LOOKS_LIKE_HES_HEADING", delay: 0 },
            { category: "directionPhrases", file: "ON_FOOT", delay: 1000 }
        ];
        
        var area = this.getAreaFromPosition(position);
        if (area) {
            sequence.push({ category: "areas", file: area, delay: 1500 });
        }
        
        this.playSequence(sequence, position);
    },
    
    playVehicleAbandoned: function(position) {
        if (!this.enabled || !this.active) return;
        
        var clip = Math.random() < 0.5 ? "ABANDONED_VEHICLE_FOOT" : "FLED_VEHICLE_FOOT";
        if (!this.hasClip("pursuit", clip)) return;
        
        var sequence = [
            { category: "pursuit", file: clip, delay: 0 }
        ];
        this.playSequence(sequence, position);
    },
    
    playCalloutComplete: function(result) {
        var file = "SUSPECT_APPREHENDED";
        switch (result) {
            case "neutralized": file = "SUSPECT_NEUTRALIZED"; break;
            case "taken_down": file = "SUSPECT_TAKEN_DOWN"; break;
            case "pacified": file = "SUSPECT_PACIFIED"; break;
            case "bagged": file = "SUSPECT_IS_BAGGED_AND_TAGGED"; break;
            case "down": file = "SUSPECT_IS_DOWN"; break;
            case "custody": file = "WE_HAVE_SUSPECT_IN_CUSTODY"; break;
            default: file = "SUSPECT_APPREHENDED";
        }
        
        if (!this.hasClip("resolution", file)) return;
        
        var sequence = [
            { category: "resolution", file: file, delay: 0 }
        ];
        this.playSequence(sequence);
    },
    
    playBackupRequest: function(priority, position) {
        if (!this.enabled || !this.active) return;
        
        var sequence = [];
        
        if (priority === "emergency" || Math.random() < 0.3) {
            sequence.push({ category: "officer", file: "OFFICER_IN_DANGER", delay: 0 });
            sequence.push({ category: "dispatch", file: "ALL_UNITS_PLEASE_RESPOND", delay: 1200 });
        } else {
            sequence.push({ category: "dispatch", file: "ALL_UNITS_PLEASE_RESPOND", delay: 0 });
            sequence.push({ category: "dispatchReports", file: "INS_AVAILABLE_UNITS_RESPOND_TO", delay: 1000 });
        }
        
        this.playSequence(sequence, position);
    },
    
    playTaserSound: function() {
        if (!this.enabled || !this.active) return;
        if (this.hasClip("ambient", "TASER_DEPLOY")) {
            this.playSound("ambient", "TASER_DEPLOY", null, true);
        }
    },
    
    playCuffSound: function() {
        if (!this.enabled || !this.active) return;
        if (this.hasClip("ambient", "CUFFS_TIGHTEN")) {
            this.playSound("ambient", "CUFFS_TIGHTEN", null, true);
        }
    },
    
    playRandomChatter: function() {
        if (!this.enabled || !this.active) return;
        var chatters = ["RANDOMCHAT_01","RANDOMCHAT_02","RANDOMCHAT_03","RANDOMCHAT_05","RANDOMCHAT_06","RANDOMCHAT_07","RANDOMCHAT_08"];
        var clip = chatters[Math.floor(Math.random() * chatters.length)];
        if (this.hasClip("dispatch", clip)) {
            this.playSound("dispatch", clip, null, true);
        }
    },
    
    // ========================================================================
    // SEQUENCE PLAYBACK
    // ========================================================================
    
    playSequence: function(sequence, position) {
        if (!this.enabled) return;
        
        sequence = this.finalizeSequence(sequence || []);
        if (!sequence.length) return;
        
        this.stopCurrentSequence();
        
        this._isPlaying = true;
        this._currentSequence = sequence;
        var delay = 0;
        var self = this;
        
        console.log("[PoliceScanner] Starting sequence with " + sequence.length + " clips");
        
        sequence.forEach(function(item) {
            var timerId = setTimeout(function() {
                if (self._currentSequence === sequence) {
                    self.playSound(item.category, item.file, position);
                }
            }, delay);
            self._sequenceTimers.push(timerId);
            delay += item.delay + 500;
        });
        
        var finishTimerId = setTimeout(function() {
            if (self._currentSequence === sequence) {
                self._isPlaying = false;
                self._currentSequence = null;
                self._sequenceTimers = [];
                console.log("[PoliceScanner] Sequence finished");
            }
        }, delay);
        this._sequenceTimers.push(finishTimerId);
    },
    
    stopCurrentSequence: function() {
        if (this._sequenceTimers.length > 0) {
            this._sequenceTimers.forEach(function(timerId) {
                clearTimeout(timerId);
            });
            this._sequenceTimers = [];
        }
        this._isPlaying = false;
        this._currentSequence = null;
    },
    
    playSound: function(category, file, position, force) {
        if (!this.enabled && !force) return;
        if (!this.sounds[category] || !this.sounds[category][file]) return;
        
        var sound = this.sounds[category][file];
        
        // Stop any currently playing sound to prevent overlap
        if (this._currentSound && typeof this._currentSound.stop === 'function') {
            this._currentSound.stop();
        }
        this._currentSound = sound;
        
        if (position && typeof sound.position === 'function') {
            sound.position(position);
        }
        if (sound.volume !== undefined && typeof sound.volume === 'function') {
            sound.volume(this.volume);
        }
        if (sound.play) {
            sound.play();
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        }
    },
    
    setVolume: function(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        console.log("[PoliceScanner] Volume set to: " + this.volume);
    },

    setEnabled: function(enabled) {
        this.enabled = !!enabled;
        console.log("[PoliceScanner] Playback " + (this.enabled ? "ENABLED" : "DISABLED"));
    },

<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
    },
    
    setEnabled: function(enabled) {
        this.enabled = !!enabled;
    },
    
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
    scheduleAutoEnable: function(delayMs) {
        if (this._autoEnableTimer) {
            clearTimeout(this._autoEnableTimer);
            this._autoEnableTimer = null;
        }
        var self = this;
        this._autoEnableTimer = setTimeout(function() {
            self.setEnabled(true);
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
            console.log("[PoliceScanner] Auto re-enabled after manual playback");
            self._autoEnableTimer = null;
        }, delayMs);
        console.log("[PoliceScanner] Auto re-enable scheduled in " + delayMs + " ms");
    },

<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
            self._autoEnableTimer = null;
        }, delayMs);
    },
    
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
    shutdown: function() {
        for (var i = 0; i < this._streams.length; i++) {
            var stream = this._streams[i];
            if (stream && typeof stream.close === "function") {
                stream.close();
            }
        }
        this._streams = [];
        this.active = false;
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
<<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
=======
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
        console.log("[PoliceScanner] Audio system shutdown");
    },
    
    playBackupRequest: function(position) {
        var sequence = [
            {
                category: "dispatch",
                file: "ALL_UNITS_PLEASE_RESPOND",
                delay: 0
            },
            {
                category: "officer",
                file: "OFFICER_IN_DANGER", 
                delay: 1000
            }
        ];
        
        this.playSequence(sequence, position);
    },
    
    playCalloutComplete: function() {
        var sequence = [
            {
                category: "dispatch",
                file: "SUSPECT_APPREHENDED",
                delay: 0
            }
        ];
        
        this.playSequence(sequence);
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
========
        this.stopCurrentSequence();
        console.log("[PoliceScanner] Audio system shutdown");
    },
    
    // ========================================================================
    // UTILITY
    // ========================================================================
    
    hasClip: function(category, file) {
        return !!(this.sounds && this.sounds[category] && this.sounds[category][file]);
    },
    
    pickAvailable: function(category, candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        var available = [];
        for (var i = 0; i < candidates.length; i++) {
            if (this.hasClip(category, candidates[i])) {
                available.push(candidates[i]);
            }
        }
        if (available.length === 0) return null;
        return available[Math.floor(Math.random() * available.length)];
    },
    
    pickVariant: function(items) {
        if (!Array.isArray(items) || items.length === 0) return null;
        return items[Math.floor(Math.random() * items.length)];
    },
    
    finalizeSequence: function(sequence) {
        var filtered = [];
        for (var i = 0; i < sequence.length; i++) {
            var item = sequence[i];
            if (item && item.category && item.file && this.hasClip(item.category, item.file)) {
                filtered.push(item);
            }
        }
        if (filtered.length > this.structuredMaxClips) {
            filtered = filtered.slice(0, this.structuredMaxClips);
        }
        return filtered;
>>>>>>>> Stashed changes:resources/jobs_rp/client/police_scanner.js
    }
};

// ========================================================================
// COMMAND HANDLERS
// ========================================================================

if (typeof addCommandHandler === "function") {
    addCommandHandler("testaudio", function() {
        console.log("[TestAudio] Testing police scanner audio...");
        if (PoliceScanner && PoliceScanner.Manager && PoliceScanner.Manager.sounds) {
            var allSounds = [];
            for (var category in PoliceScanner.Manager.sounds) {
                for (var file in PoliceScanner.Manager.sounds[category]) {
                    allSounds.push({ category: category, file: file });
                }
            }
            if (allSounds.length > 0) {
                var randomSound = allSounds[Math.floor(Math.random() * allSounds.length)];
                PoliceScanner.Manager.playSound(randomSound.category, randomSound.file, null, true);
                PoliceScanner.Manager.scheduleAutoEnable(60000);
            }
        }
    });
    
    // Play a structured callout demo using new dispatch system
    addCommandHandler("scannerdemo", function(cmd, type) {
        if (!localPlayer || !localPlayer.position) return;
        var t = type || "shooting";
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playCallout) {
            DispatchAudio.playCallout(t, localPlayer.position);
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    // Test with vehicle description using new dispatch system
    addCommandHandler("scannerveh", function() {
        if (!localPlayer || !localPlayer.position) return;
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playCallout) {
            DispatchAudio.playCallout("vehicle_pursuit", localPlayer.position);
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    // Test foot chase using new dispatch system
    addCommandHandler("scannerfoot", function() {
        if (!localPlayer || !localPlayer.position) return;
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playCallout) {
            DispatchAudio.playCallout("vehicle_pursuit", localPlayer.position);
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    // Test callout completion using new dispatch system
    addCommandHandler("scannercomplete", function(cmd, result) {
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playEffect) {
            DispatchAudio.playEffect(result || "cuffs_tighten");
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    // Test backup request using new dispatch system
    addCommandHandler("scannerbackup", function(cmd, priority) {
        if (!localPlayer || !localPlayer.position) return;
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playAmbient) {
            DispatchAudio.playAmbient();
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    // Play all ambient sounds using new dispatch system
    addCommandHandler("scannerall", function() {
        if (typeof DispatchAudio !== "undefined" && DispatchAudio.playAmbient) {
            // Play multiple ambient sounds for testing
            for (var i = 0; i < 5; i++) {
                setTimeout(function() {
                    DispatchAudio.playAmbient();
                }, i * 2000);
            }
        } else {
            console.log("[PoliceScanner] DispatchAudio system not available");
        }
    });
    
    addCommandHandler("scanneronly", function() {
        PoliceScanner.Manager.setEnabled(false);
    });
    
=======
    }
};

// Test command to play random sound
if (typeof addCommandHandler === "function") {
    addCommandHandler("testaudio", function() {
        console.log("[TestAudio] Testing police scanner audio...");
        
        if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager && PoliceScanner.Manager.sounds) {
            // Get all available sounds
            var allSounds = [];
            for (var category in PoliceScanner.Manager.sounds) {
                for (var file in PoliceScanner.Manager.sounds[category]) {
                    allSounds.push({
                        category: category,
                        file: file,
                        sound: PoliceScanner.Manager.sounds[category][file]
                    });
                }
            }
            
            if (allSounds.length > 0) {
                // Pick random sound
                var randomSound = allSounds[Math.floor(Math.random() * allSounds.length)];
                console.log("[TestAudio] Playing random sound: " + randomSound.category + "/" + randomSound.file);
                
                // Play the loaded sound
                if (randomSound.sound && typeof randomSound.sound.play === "function") {
                    PoliceScanner.Manager.playSound(randomSound.category, randomSound.file, null, true);
                    console.log("[TestAudio] Random sound played");
                    PoliceScanner.Manager.scheduleAutoEnable(60000);
                } else {
                    console.log("[TestAudio] Sound object invalid");
                }
                
                console.log("[TestAudio] Audio testing complete.");
            } else {
                console.log("[TestAudio] No sounds available to test");
                console.log("[TestAudio] Attempting direct file test...");
                try {
                    var testPath = "Audio/PoliceScanner/ATTENTION_ALL_UNITS.wav";
                    var testStreamFile = openFile(testPath);
                    if (!testStreamFile) {
                        console.log("[TestAudio] openFile failed for: " + testPath);
                    } else {
                        console.log("[TestAudio] openFile success for: " + testPath);
                        var testSoundDirect = audio.createSound(testStreamFile, false);
                        if (testSoundDirect && testSoundDirect.play) {
                            testSoundDirect.play();
                            console.log("[TestAudio] Direct createSound SUCCESS");
                        } else {
                            console.log("[TestAudio] Direct createSound failed or invalid");
                        }
                    }
                } catch (eDirect) {
                    console.log("[TestAudio] Direct file test exception: " + String(eDirect));
                }
            }
        } else {
            console.log("[TestAudio] PoliceScanner not initialized");
        }
    });

    addCommandHandler("scannerall", function() {
        console.log("[ScannerAll] Playing all police scanner sounds sequentially...");

        if (!PoliceScanner || !PoliceScanner.Manager || !PoliceScanner.Manager.sounds) {
            console.log("[ScannerAll] PoliceScanner not initialized");
            return;
        }

        var queue = [];
        for (var category in PoliceScanner.Manager.sounds) {
            for (var file in PoliceScanner.Manager.sounds[category]) {
                queue.push({ category: category, file: file });
            }
        }

        if (queue.length === 0) {
            console.log("[ScannerAll] No sounds available to play");
            return;
        }

        var delay = 0;
        queue.forEach(function(item) {
            setTimeout(function() {
                PoliceScanner.Manager.playSound(item.category, item.file, null, true);
                console.log("[ScannerAll] Played: " + item.category + "/" + item.file);
            }, delay);

            delay += 1500;
        });

        console.log("[ScannerAll] Queue length: " + queue.length);

        // Re-enable automatic playback 1 minute after the last clip
        var totalDuration = delay;
        PoliceScanner.Manager.scheduleAutoEnable(totalDuration + 60000);
    });

    addCommandHandler("scanneronly", function() {
        PoliceScanner.Manager.setEnabled(false);
        console.log("[ScannerOnly] Automatic scanner audio disabled. It will auto re-enable 1 minute after manual playback.");
    });

>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
    addCommandHandler("scanneron", function() {
        PoliceScanner.Manager.setEnabled(true);
        if (PoliceScanner.Manager._autoEnableTimer) {
            clearTimeout(PoliceScanner.Manager._autoEnableTimer);
            PoliceScanner.Manager._autoEnableTimer = null;
        }
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
    });
    
=======
        console.log("[ScannerOnly] Automatic scanner audio enabled.");
    });

>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
    addCommandHandler("scannermode", function(cmd, mode) {
        var m = (mode || "").toLowerCase();
        if (m === "structured") {
            PoliceScanner.Manager.structuredMode = true;
        } else if (m === "legacy") {
            PoliceScanner.Manager.structuredMode = false;
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
        }
    });
    
    // Test specific crime types
    addCommandHandler("scannercrime", function(cmd, type) {
        if (!type || !localPlayer || !localPlayer.position) return;
        var valid = ["shooting","shootout","pursuit","brawl","traffic","domestic","robbery",
                     "drugs","fire","medical","officer_down","officer_danger","theft","stolen_vehicle",
                     "reckless","suspicious","armed","driveby","civilian_down","fleeing",
                     "firearm_attack","shots_at_officer","suspect_armed","traffic_felony",
                     "brawl_drunken","unconscious","disturbing_peace","driveby_criminals"];
        if (valid.indexOf(type) === -1) {
            console.log("[ScannerCrime] Invalid type. Valid: " + valid.join(", "));
            return;
        }
        PoliceScanner.Manager.playDispatch(type, localPlayer.position);
    });
    
    // Test area detection
    addCommandHandler("scannerarea", function() {
        if (!localPlayer || !localPlayer.position) return;
        var pos = localPlayer.position;
        var area = PoliceScanner.Manager.getAreaFromPosition(pos);
        console.log("[ScannerArea] Position: " + JSON.stringify(pos) + " -> Area: " + (area || "unknown"));
    });
}

// ========================================================================
// INITIALIZATION
// ========================================================================

=======
        } else {
            console.log("[ScannerMode] Usage: /scannermode structured|legacy");
            return;
        }
        console.log("[ScannerMode] Mode set to: " + (PoliceScanner.Manager.structuredMode ? "structured" : "legacy"));
    });

    addCommandHandler("scannerdemo", function() {
        if (!localPlayer || !localPlayer.position) {
            console.log("[ScannerDemo] localPlayer not ready");
            return;
        }
        console.log("[ScannerDemo] Playing structured demo sequence");
        PoliceScanner.Manager.playDispatch("shooting", localPlayer.position);
    });
}

// Initialize police scanner when resource starts
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
addEventHandler("onResourceStart", function() {
    if (typeof PoliceScanner !== "undefined") {
        setTimeout(function() {
            PoliceScanner.Manager.init();
        }, 3000);
    }
});

addEventHandler("onResourceStop", function() {
    if (typeof PoliceScanner !== "undefined" && PoliceScanner.Manager) {
        PoliceScanner.Manager.shutdown();
    }
<<<<<<< Updated upstream:JobsRPOG/jobs_rp/client/police_scanner.js
});
=======
});
>>>>>>> Stashed changes:resources/JobsRPOG/jobs_rp/client/police_scanner.js
