# v-license-plate
License plate display for GTAC/MafiaC  
*The original background and font are designed as vintage plates for Mafia 1 (1930's), but you can swap the image and font with whatever theme you want*

## Usage
This resource is meant to be used alongside your own resource (like a vehicle resource or RP gamemode), and that resource can set the license plate info.

* Attach data to a vehicle with "v.licensePlate" as the main number/letters and optionally "v.licensePlateSubText" as a sub-text (i.e. "Liberty City").
* To make a player see plates, attach data to their client with name "v.licensePlates" and remove the data when going off duty. Usually used for police players.

```js
vehicle.setData("v.licensePlate", "ABC123", true);
vehicle.setData("v.licensePlateSubText", "Liberty City", true);

client.setData("v.licensePlates", true, true);
client.removeData("v.licensePlates");
```

# Screenshots
![Game_YszMFo7D2n](https://github.com/user-attachments/assets/177ee3d5-39a6-47c6-8fef-dfc6ad52405d)

<img width="1600" height="900" alt="gta3_o6xCG58TYe" src="https://github.com/user-attachments/assets/8034682f-3520-477f-a191-33667c1c01dd" />
