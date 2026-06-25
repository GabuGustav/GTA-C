
"use strict";

// ===========================================================================

// Configuration
let textColour = toColour(0, 0, 0, 255); // Colour of text
let renderPosition = new Vec2(50, 5); // Percentage of screen size (for scaling)
let renderSize = new Vec2(10, 9); // Percentage of screen size (for scaling)
let maxRange = 15; // How far the player can see a license plate

let mainTextMargin = new Vec2(0.0, 0.02);
let subTextMargin = new Vec2(0.0, 0.07);

// ===========================================================================

// Don't touch this unless you know what you're doing
let backgroundImage = null;
let mainFont = null;
let subFont = null;
let closestVehicle = undefined;

let zeroPosition = new Vec2(0, 0);
let screenWidth = new Vec2(game.width, 0.0);
let screenHeight = new Vec2(0.0, game.height);

let size = new Vec2(
	new Vec2(zeroPosition.x + (screenWidth.x - zeroPosition.x) * renderSize.x/100, zeroPosition.y + (screenWidth.y - zeroPosition.y) * renderSize.x/100).x,
	new Vec2(zeroPosition.y + (screenHeight.y - zeroPosition.y) * renderSize.y/100, zeroPosition.y + (screenHeight.y - zeroPosition.y) * renderSize.y/100).y
);

let position = new Vec2(
	new Vec2(zeroPosition.x + (screenWidth.x - zeroPosition.x) * renderPosition.x/100, zeroPosition.y + (screenWidth.y - zeroPosition.y) * renderPosition.x/100).x,
	new Vec2(zeroPosition.y + (screenHeight.y - zeroPosition.y) * renderPosition.y/100, zeroPosition.y + (screenHeight.y - zeroPosition.y) * renderPosition.y/100).y
);

let playerPosition = new Vec3(0.0, 0.0, 0.0);

// ===========================================================================

bindEventHandler("OnResourceStart", thisResource, function(event, resource) {
});

// ===========================================================================

bindEventHandler("OnResourceReady", thisResource, function(event, resource) {
	let imageFile = openFile("background.png");
	if (imageFile != null) {
		console.log(`[${thisResource.name}] Loading PNG image (Path: "background.png")`);
		backgroundImage = drawing.loadPNG(imageFile);
		imageFile.close();
	}

	let fontFile = openFile("font.ttf");
	if (fontFile != null) {
		mainFont = lucasFont.createFont(fontFile, size.y/2);
		fontFile.close();
	}

	let subFontFile = openFile("font.ttf");
	if (subFontFile != null) {
		subFont = lucasFont.createFont(subFontFile, size.y/6);
		subFontFile.close();
	}
});

// ===========================================================================

addEventHandler("OnProcess", function(event, deltaTime) {
	if(localPlayer == null) {
		return false;
	}

	playerPosition = (localPlayer.vehicle == null) ? localPlayer.position : localPlayer.vehicle.position;
	let vehicles = getElementsByType(ELEMENT_VEHICLE);
	if(vehicles.length == 0) {
		closestVehicle = null;
		return false;
	}

	if(localPlayer.vehicle != null) {
		vehicles = vehicles.filter(veh => veh != localPlayer.vehicle);
	}

	closestVehicle = vehicles.reduce((prev, curr) => curr.position.distance(playerPosition) < prev.position.distance(playerPosition) ? curr : prev) || null;

	if(screenWidth.x != game.width || screenHeight.y != game.height) {
		thisResource.restart();
	}
});

// ===========================================================================

addEventHandler("OnDrawnHUD", function(event) {
	if(localPlayer == null) {
		return false;
	}

	if(backgroundImage == null) {
		return false;
	}

	if(mainFont == null) {
		return false;
	}

	if(subFont == null) {
		return false;
	}

	if(localClient.getData("v.licensePlates") == null) {
		return false;
	}

	if(closestVehicle != undefined) {
		if(closestVehicle.getData("v.licensePlate") == null) {
			return false;
		}

		if(closestVehicle.position.distance(playerPosition) <= maxRange) {
			graphics.drawRectangle(null, [position.x - (size.x / 2), position.y - (size.y / 2) - 1], [size.x, size.y], toColour(0, 0, 0, 120), toColour(0, 0, 0, 120), toColour(0, 0, 0, 120), toColour(0, 0, 0, 120));

			graphics.drawRectangle(backgroundImage, [position.x - (size.x / 2), position.y - (size.y / 2) - 1], [size.x, size.y]);

			let mainTextPosition = new Vec2(position.x - size.x / 2 + ((mainTextMargin.x == 0) ? 0 : size.x*mainTextMargin.x), position.y - size.y / 2 + ((mainTextMargin.y == 0) ? 0 : size.x*mainTextMargin.y));
			mainFont.render(closestVehicle.getData("v.licensePlate"), mainTextPosition, size.x, 0.5, 0.5, mainFont.size, textColour, false, true, false, true);
			if(closestVehicle.getData("v.licensePlateSubText") != null) {
				subFont.render(closestVehicle.getData("v.licensePlateSubText"), [mainTextPosition.x, mainTextPosition.y+mainFont.size+(size.x*subTextMargin.y)], size.x, 0.5, 0.5, subFont.size, textColour, false, true, false, true);
			}
		}
	}
});

// ===========================================================================