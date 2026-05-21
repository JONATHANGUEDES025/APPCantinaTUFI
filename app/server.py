import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .config import INDEX_HTML_PATH, STATIC_DIR
from .logger import log
from .services import (
    api_cancel_sale,
    api_categories,
    api_create_sale,
    api_delete_product,
    api_fiados,
    api_products,
    api_reports,
    api_reset_system,
    api_sale_detail,
    api_sales,
    api_save_product,
    api_settle_fiado,
    api_stock_movement,
    api_stock_movements,
    api_summary,
    api_undo_stock_movement,
    api_update_debtor,
)
from .validators import validate_id


CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
}


GET_ROUTES = {
    "/api/summary": lambda query: api_summary(),
    "/api/categories": lambda query: api_categories(),
    "/api/products": api_products,
    "/api/sales": api_sales,
    "/api/sale": lambda query: api_sale_detail(validate_id(query.get("id", ["0"])[0], "venda")),
    "/api/fiados": api_fiados,
    "/api/stock": api_stock_movements,
    "/api/reports": api_reports,
}

POST_ROUTES = {
    "/api/products": api_save_product,
    "/api/stock": api_stock_movement,
    "/api/stock/undo": api_undo_stock_movement,
    "/api/sales": api_create_sale,
    "/api/sales/cancel": api_cancel_sale,
    "/api/fiados/settle": api_settle_fiado,
    "/api/fiados/debtor": api_update_debtor,
    "/api/reset": api_reset_system,
}

DELETE_ROUTES = {
    "/api/products": lambda query: api_delete_product(query.get("id", ["0"])[0]),
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_file(self, path):
        payload = Path(path).read_bytes()
        suffix = Path(path).suffix.lower()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_index(self):
        self.send_file(INDEX_HTML_PATH)

    def send_static(self, requested_path):
        relative = requested_path.removeprefix("/static/").strip("/")
        target = (STATIC_DIR / relative).resolve()
        static_root = STATIC_DIR.resolve()
        if not str(target).startswith(str(static_root)) or not target.is_file():
            self.send_json({"error": "Arquivo nao encontrado."}, 404)
            return
        self.send_file(target)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("JSON invalido na requisicao.") from exc

    def handle_error_response(self, exc):
        if isinstance(exc, ValueError):
            self.send_json({"error": str(exc)}, 400)
            return
        log("Erro interno no servidor:\n" + traceback.format_exc())
        self.send_json({"error": "Erro interno do sistema. Veja os logs para detalhes."}, 500)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path in ("/", "/index.html"):
                self.send_index()
                return
            if parsed.path.startswith("/static/"):
                self.send_static(parsed.path)
                return
            route = GET_ROUTES.get(parsed.path)
            if not route:
                self.send_json({"error": "Rota nao encontrada."}, 404)
                return
            self.send_json(route(parse_qs(parsed.query)))
        except Exception as exc:
            self.handle_error_response(exc)

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            route = POST_ROUTES.get(parsed.path)
            if not route:
                self.send_json({"error": "Rota nao encontrada."}, 404)
                return
            self.send_json(route(self.read_json()))
        except Exception as exc:
            self.handle_error_response(exc)

    def do_DELETE(self):
        try:
            parsed = urlparse(self.path)
            route = DELETE_ROUTES.get(parsed.path)
            if not route:
                self.send_json({"error": "Rota nao encontrada."}, 404)
                return
            self.send_json(route(parse_qs(parsed.query)))
        except Exception as exc:
            self.handle_error_response(exc)


class CantinaServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        log("Erro durante atendimento HTTP:\n" + traceback.format_exc())
