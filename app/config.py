import os
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
DATA_DIR = Path(os.environ.get("CANTINA_DATA_DIR", PROJECT_DIR / "dados"))
LOG_DIR = DATA_DIR / "logs"
BACKUP_DIR = DATA_DIR / "backups"
TEMPLATE_DIR = APP_DIR / "templates"
STATIC_DIR = APP_DIR / "static"
INDEX_HTML_PATH = TEMPLATE_DIR / "index.html"

for folder in (DATA_DIR, LOG_DIR, BACKUP_DIR):
    folder.mkdir(parents=True, exist_ok=True)

DB_PATH = str(DATA_DIR / "cantina_tufi.db")
LOG_FILE = str(LOG_DIR / "cantina_pro_log.txt")
HOST = os.environ.get("CANTINA_HOST", "0.0.0.0")
LOCAL_BROWSER_HOST = os.environ.get("CANTINA_LOCAL_BROWSER_HOST", "127.0.0.1")


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


PORT = _env_int("CANTINA_PORT", 8767)
URL = f"http://{LOCAL_BROWSER_HOST}:{PORT}/"
OPEN_BROWSER = os.environ.get("CANTINA_OPEN_BROWSER", "1").strip().lower() not in {"0", "false", "no", "nao"}
