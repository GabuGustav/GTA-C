"use strict";
console.log("[TEST] Script loading...");
/* natives.taskEnterCarAsPassenger(pedHandle: Ped, vehicle: Vehicle, duration: uint, seatIndex: uint) -> null  
natives.taskEnterCarAsPassenger(pedHandle: Ped, vehicle: Vehicle, duration: uint, seatIndex: uint) -> null */
const COLOUR_RED = 0xffff0000;
const COLOUR_GREEN = 0xff007f00;
const COLOUR_BLUE = 0xff0000ff;
const COLOUR_YELLOW = 0xffffff00;
const COLOUR_SILVER = 0xffc3c3c3;
const COLOUR_AQUA = 0xff00ffff;
const COLOUR_WHITE = 0xffffffff;
const COLOUR_BLACK = 0xff000000;

var Test = Test || {};
Test.API = Test.API || {};

const client = localClient;
var clientName = client.name;
const myPed = localPlayer;
var player = client;
const taxiVehicleNames = ["Taxi", "Taxi2", "Cabby"];

function showCars() {
  var isInCar = false;
  // Use the global 'localClient' for the player running the script
  if (myPed.isInVehicle == true) {
    var veh = myPed.vehicle;
    if (veh != null) {
      isInCar = true;
      var driver = veh.getOccupant(0);
      var passenger1 = veh.getOccupant(1);
      var passenger2 = veh.getOccupant(2);
      var passenger3 = veh.getOccupant(3);
      var index = veh.modelIndex;
      var carName = Test.API.getVehicleName(index);
    }
  }
  return { isInCar, carName, passenger1, passenger2, passenger3, driver };
}

function checkIfTaxi(vehicle) {
  var checkifinCar = showCars();
  var playerPos = myPed.position;
  if (playerPos != null) {
    var vehiclesNearBy = getVehicles();
    if (vehiclesNearBy != null) {
      var closestDistance = 5;
      var currentVehName = null;

      for (var i = 0; i < vehiclesNearBy.length; i++) {
        var vehicle = vehiclesNearBy[i];
        var vehiclePos = vehicle.position;
        var distance = playerPos.distance(vehiclePos);

        if (distance < 10 && checkifinCar.isInCar == false) {
          {
            var vehID = vehicle.modelIndex;
            var vehName = Test.API.getVehicleName(vehID);
            if (distance < closestDistance && taxiVehicleNames.includes(vehName)) {
              currentVehName = vehName;
              var closestVehObject = vehicle;
            }
          }
        }
      }
    }
  }
  return { vehName, distance, currentVehName, closestVehObject };
}

function checkSeatIndex() {
  var checkifTaxi = checkIfTaxi();
  var veh = checkifTaxi.closestVehObject;

  var freeSeats = [];

  if (veh != null) {
    for (var i = 2; i <= 3; i++) {
      var pedHandle = veh.getOccupant(i);

      if (pedHandle == null) {
        freeSeats.push(i);

        console.log("Seat " + i + " is free");
      } else {
        console.log("Seat " + i + " is occupied");
      }
    }
  }

  return freeSeats;
}

function enterPassenger() {
  var checkifTaxi = checkIfTaxi();
  var freeSeats = checkSeatIndex();

  if (freeSeats.length > 0) {
    var chosenSeat = freeSeats[0];

    console.log("Chosen seat: " + chosenSeat);

    natives.taskEnterCarAsPassenger(
      myPed,
      checkifTaxi.closestVehObject,
      7000,
      chosenSeat,
    );
  } else {
    console.log("Taxi is full");
  }
}

var wasInCar = false;
var lastVehName = null;
addEventHandler("OnProcess", function (OnProcess, deltaTime) {
  var carState = showCars();
  var nearbyCar = checkIfTaxi();
  if (carState.isInCar && !wasInCar) {
    if (carState.carName != null) {
      console.log("Player is in a vehicle with  the name: " + carState.carName);
      message(
        "Player is in a vehicle with the name: " + carState.carName,
        COLOUR_GREEN,
      );
    }
  }
  if (!carState.isInCar && wasInCar) {
    console.log("Player is no longer in a vehicle");
    message("Player is no longer in a vehicle", COLOUR_RED);
  }
  wasInCar = carState.isInCar;

  if (taxiVehicleNames.includes(nearbyCar.currentVehName) && lastVehName == null) {
    console.log("There is a:" + nearbyCar.currentVehName + " nearby.");
    message(
      "There is a car nearby with the name: " + nearbyCar.currentVehName,
      COLOUR_GREEN,
    );
  }
  lastVehName = nearbyCar.currentVehName;
});

bindKey(SDLK_g, KEYSTATE_DOWN, function () {
  enterPassenger();
});

