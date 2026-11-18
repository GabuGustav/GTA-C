"use strict";
//Detect if player's gun is aiming at NPC/Polic ad if there are peds around who report
console.log ("[Weapon System] Weapon detection loading");
//Create Namespac(I think!)
var Test = Test || {};
Test.API = Test.API || {};

//Global vars
var weaponName = [

];

//Detect weapon client is using
function detectWeapon(){
var currentWeapon = null;
var playerWeapon = myPed.weapon;

currentWeapon = playerWeapon;
return currentWeapon;
};

//Output player name + weapon using
function outputName(){
    if (currentWeapon != null){
message (clientName + "is using a" + currentWeapon , COLOUR_WHITE);}
};

setTimeout(function(){
    outputName()
}, 1000);

setTimeout( function(){
console.log ("[Weapon System] Loaded...")
}, 10000);