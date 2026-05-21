from datetime import datetime

from .config import LOG_FILE


def log(message):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as file:
            file.write(f"{datetime.now().isoformat(timespec='seconds')} - {message}\n")
    except OSError:
        pass
