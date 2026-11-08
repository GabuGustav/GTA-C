"""python -m yt_stream_studio"""
import sys
import tkinter as tk
from tkinter import messagebox


def main():
    from .instance import try_acquire
    if not try_acquire("YTStreamStudio"):
        # Show a tiny root so messagebox works, then exit.
        root = tk.Tk()
        root.withdraw()
        messagebox.showwarning(
            "YT Stream Studio",
            "Another copy of YT Stream Studio is already running.\n\n"
            "Use that window, or close it before starting a new one.")
        root.destroy()
        sys.exit(1)

    from .app import App
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
