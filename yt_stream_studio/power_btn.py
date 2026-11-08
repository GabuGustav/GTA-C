"""Circular power-style standby button with state colors (red blink / yellow / green)."""
from __future__ import annotations

import tkinter as tk


class PowerStandbyButton(tk.Canvas):
    """
    States:
      off        — dim ring
      activating — blinking red
      warming    — solid yellow/amber
      ready      — solid green
      disabled   — grey
    """

    COLORS = {
        "off": ("#3a3f4b", "#9aa3b2"),
        "activating": ("#c62828", "#ff8a80"),
        "warming": ("#f9a825", "#fff59d"),
        "ready": ("#2e7d32", "#a5d6a7"),
        "disabled": ("#2a2e38", "#555b66"),
    }

    def __init__(self, master, command=None, size=36, **kw):
        bg = kw.pop("bg", "#12141a")
        super().__init__(
            master, width=size, height=size, highlightthickness=0,
            bg=bg, bd=0, **kw)
        self._command = command
        self._state = "off"
        self._size = size
        self._blink = False
        self._blink_job = None
        self._enabled = True
        self.bind("<Button-1>", self._click)
        self._draw()

    def _click(self, _e=None):
        if self._enabled and self._command:
            self._command()

    def set_enabled(self, on: bool):
        self._enabled = bool(on)
        if not on:
            self._stop_blink()
            self._state = "disabled"
            self._draw()
        elif self._state == "disabled":
            self._state = "off"
            self._draw()

    def set_state(self, state: str):
        state = state if state in self.COLORS else "off"
        if not self._enabled and state != "disabled":
            return
        prev = self._state
        self._state = state if self._enabled else "disabled"
        if self._state == "activating":
            if prev != "activating":
                self._start_blink()
        else:
            self._stop_blink()
            self._draw()

    def _start_blink(self):
        self._stop_blink()
        self._blink = True

        def tick():
            if self._state != "activating":
                return
            self._blink = not self._blink
            self._draw()
            self._blink_job = self.after(400, tick)

        self._blink_job = self.after(50, tick)

    def _stop_blink(self):
        if self._blink_job is not None:
            try:
                self.after_cancel(self._blink_job)
            except Exception:
                pass
            self._blink_job = None
        self._blink = False

    def _draw(self):
        self.delete("all")
        s = self._size
        pad = 3
        ring, glyph = self.COLORS.get(self._state, self.COLORS["off"])
        if self._state == "activating" and not self._blink:
            ring, glyph = "#4a1515", "#882222"
        # Outer circle
        self.create_oval(pad, pad, s - pad, s - pad, outline=ring, width=3, fill="#1a1d26")
        # Power symbol: vertical line + arc
        cx, cy = s / 2, s / 2
        r = s * 0.22
        self.create_arc(
            cx - r, cy - r + 2, cx + r, cy + r + 2,
            start=40, extent=280, style="arc", outline=glyph, width=2,
        )
        self.create_line(cx, cy - r - 1, cx, cy - 1, fill=glyph, width=2, capstyle="round")
