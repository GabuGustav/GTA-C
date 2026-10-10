"use strict";
/* Part 3b: ip/hwid bans, mute/warn, F10 panel keys. Run: node tests/t4.js */
var H = require("./harness");
var T = require("./tiny");
var LN = require("./t3").LN;

console.log("[10] ip + hwid bans");
H.freshService(LN, { password: { iterations: 50, minPasswordLen: 8 } });
LN.Config = { auth: { enabled: true }, admin: { commandLevels: LN.Admin.Roles.DEFAULT.commandLevels } };
LN.Admin.Service.init({});
var adm = H.fakeClient(201);
LN.Auth.Service.register(adm, { username: "bigadmin", password: "longpassword1" });
LN.Auth.Accounts.addRole(LN.Auth.Accounts.getAccount("bigadmin"), "admin", true);
LN.Admin.Bans.banIp("5.6.7.8", { reason: "vpn", by: "Console", until: 0 });
T.ok(LN.Admin.Bans.isIpBanned("5.6.7.8") === true, "ip banned");
T.ok(LN.Admin.Bans.checkJoin(H.fakeClient(204, { ip: "5.6.7.8" }), null).kind === "ip", "join gate refuses ip");
T.ok(LN.Admin.Service.unbanIp(adm, "5.6.7.8").ok === true, "unbanip ok");
var fp = LN.Admin.Bans.fingerprint(H.fakeClient(205, { serial: "S", guid: "G", ip: "1.1.1.1", name: "x" }));
T.ok(typeof fp === "string" && fp.length > 0, "fingerprint derives");
var hb = LN.Admin.Service.hwidBan(adm, H.fakeClient(205, { serial: "S", guid: "G", ip: "1.1.1.1", name: "x" }), "repeat");
T.ok(hb.ok === true, "hwidban ok");
T.ok(LN.Admin.Bans.checkJoin(H.fakeClient(205, { serial: "S", guid: "G", ip: "1.1.1.1", name: "x" }), null).kind === "hwid", "join gate refuses hwid");
T.ok(LN.Admin.Service.hwidUnban(adm, "x").ok === true, "hwidunban ok");

console.log("[11] mute + warn");
var m1 = H.fakeClient(211), m2 = H.fakeClient(212);
LN.Auth.Service.register(m1, { username: "staffa", password: "longpassword1" });
LN.Auth.Service.register(m2, { username: "userb", password: "longpassword1" });
LN.Auth.Accounts.addRole(LN.Auth.Accounts.getAccount("staffa"), "moderator", true);
var mu = LN.Admin.Service.mute(m1, m2, 30);
T.ok(mu.ok === true && mu.until > 0, "mute sets until");
T.ok(LN.Auth.Accounts.isMuted(LN.Auth.Accounts.getAccount("userb")) === true, "muted flag");
T.ok(LN.Admin.Service.unmute(m1, m2).ok === true, "unmute ok");
var w = LN.Admin.Service.warn(m1, m2, "language");
T.ok(w.ok === true && w.warnings === 1, "warn counts");
T.ok(LN.Admin.Service.warn(m1, m2, "").code === "reason_required", "warn needs reason");

console.log("[12] f10 panel keys");
var fs2 = require("fs"), vm2 = require("vm"), path2 = require("path");
var csb = { console: console, addEventHandler: function () {}, addNetworkHandler: function () {}, triggerNetworkEvent: function () {}, message: function () {} };
csb.globalThis = csb;
vm2.createContext(csb);
["Auth/UI.js", "Admin/Panel.js", "Admin/Panel2.js", "Admin/Panel3.js"].forEach(function (f) {
	vm2.runInContext(fs2.readFileSync(path2.join(__dirname, "..", "Core", "Client", f), "utf8"), csb, { filename: f });
});
var P = csb.LN.AdminPanel;
T.ok(P.F10 === 291, "F10 is SDL code 291 (not DOM 0x79)");
P.state.staff = true;
P.state.roster = [{ name: "a", index: 1 }, { name: "b", index: 2 }];
P.show();
T.ok(P.state.visible === true, "f10 panel opens for staff");
P.onKeyDown(291);
T.ok(P.state.visible === false, "SDL F10 (291) toggles closed");
P.onKeyDown(1073741891);
T.ok(P.state.visible === true, "alt F10 (1073741891) toggles open");
P.onKeyDown("down");
T.ok(P.state.sel === 1, "down moves selection");
P.onKeyDown("up");
T.ok(P.state.sel === 0, "up moves selection");
P.onKeyDown("right");
T.ok(P.state.tab === 1, "right switches tab");
P.onKeyDown("left");
T.ok(P.state.tab === 0, "left switches tab");
P.onKeyDown("enter");
T.ok(!!P.state.confirm, "enter opens confirm");
P.onCharacter("x");
T.ok(P.state.reason === "x", "character types reason");
P.onKeyDown("backspace");
T.ok(P.state.reason === "", "backspace deletes");
P.onKeyDown("escape");
T.ok(!P.state.confirm, "esc cancels confirm");
P.onKeyDown("escape");
T.ok(P.state.visible === false, "esc closes panel");
P.state.staff = false;
P.show();
T.ok(P.state.visible === false, "non-staff cannot open");

// Text rendering: shared renderer exported, draw must never throw
// even with no font/natives available (fontless sandbox).
T.ok(typeof csb.LN.AuthUI.drawTextPx === "function", "AuthUI.drawTextPx exported");
P.state.staff = true;
P.state.visible = true;
var drawThrew = null;
try { P.draw(); } catch (eDraw) { drawThrew = eDraw; }
T.ok(drawThrew === null, "panel draw does not throw without font/natives" + (drawThrew ? " (" + drawThrew + ")" : ""));
var textThrew = null;
try { P.text("probe", 0.3, 0.3, 0.45, [255, 255, 255, 255]); } catch (eText) { textThrew = eText; }
T.ok(textThrew === null, "P.text safe without font/natives" + (textThrew ? " (" + textThrew + ")" : ""));
P.state.visible = false;
P.state.staff = false;

T.summary();
