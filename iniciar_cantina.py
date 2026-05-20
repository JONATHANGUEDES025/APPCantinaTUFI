import os
import runpy
import traceback


APP_DIR = os.path.dirname(os.path.abspath(__file__))
APP_FILE = os.path.join(APP_DIR, "cantina_pro.py")
LOG_FILE = os.path.join(APP_DIR, "erro_cantina.txt")


def show_error(message):
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Cantina TUFI", message)
        root.destroy()
    except Exception:
        pass


try:
    os.chdir(APP_DIR)
    runpy.run_path(APP_FILE, run_name="__main__")
except Exception:
    details = traceback.format_exc()
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as log:
            log.write(details)
    except OSError:
        fallback = os.path.join(APP_DIR, "erro_inicializacao.txt")
        with open(fallback, "w", encoding="utf-8") as log:
            log.write(details)
    show_error("O aplicativo nao conseguiu abrir. O erro foi salvo em erro_cantina.txt.")
