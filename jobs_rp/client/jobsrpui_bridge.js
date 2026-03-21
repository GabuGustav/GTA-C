"use strict";

(function() {
    try {
        if (typeof JobsRP === "undefined") {
            JobsRP = {};
        }
    } catch (e) {
    }

    try {
        if (typeof mexui !== "undefined") {
            if (!JobsRP.ui) {
                JobsRP.ui = mexui;
            }
        }
    } catch (e2) {
    }

    function toVec2(x, y) {
        if (typeof Vec2 === "undefined") {
            return null;
        }
        return new Vec2(x, y);
    }

    function getWindowSize() {
        var w = 1280;
        var h = 720;
        try {
            if (typeof gta !== "undefined") {
                w = Number(gta.width) || w;
                h = Number(gta.height) || h;
            }
        } catch (e) {
        }
        return { width: w, height: h };
    }

    function updateCursorPos(x, y) {
        if (typeof mexui === "undefined") {
            return;
        }
        if (typeof x === "number" && typeof y === "number") {
            mexui._jobsrpCursor = { x: x, y: y };
        }
    }

    function getCursorPos() {
        if (typeof mexui !== "undefined" && mexui._jobsrpCursor) {
            var cx = mexui._jobsrpCursor.x;
            var cy = mexui._jobsrpCursor.y;
            if (typeof cx === "number" && typeof cy === "number") {
                if (cx <= 1.0 && cy <= 1.0) {
                    var size = getWindowSize();
                    cx = cx * size.width;
                    cy = cy * size.height;
                }
                return toVec2(cx, cy);
            }
        }

        try {
            if (typeof gui !== "undefined" && gui) {
                var pos = null;
                if (typeof gui.cursorPosition === "function") {
                    pos = gui.cursorPosition();
                } else if (gui.cursorPosition) {
                    pos = gui.cursorPosition;
                }
                if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
                    var px = pos.x;
                    var py = pos.y;
                    if (px <= 1.0 && py <= 1.0) {
                        var size2 = getWindowSize();
                        px = px * size2.width;
                        py = py * size2.height;
                    }
                    return toVec2(px, py);
                }
            }
        } catch (e3) {
        }
        return toVec2(0, 0);
    }

    function patchHitTest() {
        if (typeof mexui === "undefined" || !mexui.util) {
            return;
        }
        if (mexui.util._jobsrpPatched) {
            return;
        }
        mexui.util._jobsrpPatched = true;
        mexui.util.getCursorPos = getCursorPos;
        mexui.util.isCursorInRectangle = function(position, size) {
            return mexui.util.isPointInRectangle(getCursorPos(), position, size);
        };
    }

    function hookCursorEvents() {
        if (typeof addEventHandler !== "function" || typeof mexui === "undefined") {
            return;
        }

        addEventHandler("OnCursorDown", function(ev, x, y, button) {
            updateCursorPos(x, y);
            patchHitTest();
            var btn = (button === undefined || button === null) ? 0 : button;
            var e = mexui.triggerEvent("onMouseDown", { button: btn });
            if (!e.clickedAControl) {
                mexui.focusedControl = null;
            }
        });

        addEventHandler("OnCursorUp", function(ev, x, y, button) {
            updateCursorPos(x, y);
            patchHitTest();
            var btn = (button === undefined || button === null) ? 0 : button;
            mexui.triggerEvent("onMouseUp", { button: btn });
        });

        addEventHandler("OnCursorMove", function(ev, x, y) {
            updateCursorPos(x, y);
            patchHitTest();
            var pos = getCursorPos();
            if (pos) {
                mexui.triggerEvent("onMouseMove", pos, true);
            }
        });

        addEventHandler("onCursorDown", function(ev, x, y, button) {
            updateCursorPos(x, y);
            patchHitTest();
            var btn = (button === undefined || button === null) ? 0 : button;
            var e = mexui.triggerEvent("onMouseDown", { button: btn });
            if (!e.clickedAControl) {
                mexui.focusedControl = null;
            }
        });

        addEventHandler("onCursorUp", function(ev, x, y, button) {
            updateCursorPos(x, y);
            patchHitTest();
            var btn = (button === undefined || button === null) ? 0 : button;
            mexui.triggerEvent("onMouseUp", { button: btn });
        });

        addEventHandler("onCursorMove", function(ev, x, y) {
            updateCursorPos(x, y);
            patchHitTest();
            var pos = getCursorPos();
            if (pos) {
                mexui.triggerEvent("onMouseMove", pos, true);
            }
        });
    }

    function ensureInputHooks() {
        try {
            if (mexui && typeof mexui.unbindEvents === "function" && !mexui._jobsrpNormalizedBindings) {
                mexui._jobsrpNormalizedBindings = true;
                try {
                    mexui.unbindEvents();
                } catch (eUnbind) {
                }
            }
            if (mexui && typeof mexui.bindEvents === "function") {
                if (!mexui._jobsrpBindEventsWrapped) {
                    mexui._jobsrpBindEventsWrapped = true;
                    var originalBind = mexui.bindEvents;
                    mexui.bindEvents = function() {
                        if (mexui._jobsrpBoundEvents) {
                            return;
                        }
                        mexui._jobsrpBoundEvents = true;
                        return originalBind.apply(mexui, arguments);
                    };
                }
                mexui.bindEvents();
            }
            if (mexui && typeof mexui.startTimers === "function") {
                if (!mexui._jobsrpStartTimersWrapped) {
                    mexui._jobsrpStartTimersWrapped = true;
                    var originalTimers = mexui.startTimers;
                    mexui.startTimers = function() {
                        if (mexui._jobsrpStartedTimers) {
                            return;
                        }
                        mexui._jobsrpStartedTimers = true;
                        return originalTimers.apply(mexui, arguments);
                    };
                }
                mexui.startTimers();
            }
        } catch (e) {
        }
    }

    patchHitTest();
    hookCursorEvents();
    ensureInputHooks();
})();
