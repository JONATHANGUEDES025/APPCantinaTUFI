import errno
import threading
import time
import traceback
import webbrowser

from .config import HOST, OPEN_BROWSER, PORT, URL
from .database import init_db
from .logger import log
from .server import CantinaServer, Handler


def open_browser_later():
    time.sleep(0.7)
    webbrowser.open(URL)


def main():
    try:
        init_db()
        server = CantinaServer((HOST, PORT), Handler)
        if OPEN_BROWSER:
            threading.Thread(target=open_browser_later, daemon=True).start()
        log(f"Cantina TUFI rodando em {URL}")
        server.serve_forever()
    except OSError as exc:
        if getattr(exc, "errno", None) == errno.EADDRINUSE or getattr(exc, "winerror", None) == 10048:
            log(f"A porta {PORT} ja esta em uso. Abrindo o aplicativo existente em {URL}")
            webbrowser.open(URL)
            return
        log("Erro ao iniciar Cantina TUFI:\n" + traceback.format_exc())
        raise
    except Exception:
        log("Erro ao iniciar Cantina TUFI:\n" + traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
