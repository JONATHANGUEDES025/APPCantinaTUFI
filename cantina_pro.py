import json
import os
import shutil
import sqlite3
import threading
import time
import traceback
import webbrowser
from contextlib import contextmanager
from datetime import datetime, date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


APP_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(APP_DIR) if os.path.basename(APP_DIR).lower() == "app" else APP_DIR
DATA_DIR = os.path.join(PROJECT_DIR, "dados")
LOG_DIR = os.path.join(DATA_DIR, "logs")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "cantina_tufi.db")
HOST = "127.0.0.1"
PORT = 8767
URL = f"http://{HOST}:{PORT}/"
LOG_FILE = os.path.join(LOG_DIR, "cantina_pro_log.txt")


def log(message):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as file:
            file.write(f"{datetime.now().isoformat(timespec='seconds')} - {message}\n")
    except OSError:
        pass


def now_text():
    return datetime.now().isoformat(timespec="seconds")


def today_text():
    return date.today().isoformat()


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_connection():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(row) for row in rows]


def debtor_key(name):
    normalized = " ".join((name or "Sem nome").strip().split())
    return normalized.lower() or "sem nome"


def ensure_column(conn, table, column, definition):
    columns = [row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    with db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                cost REAL NOT NULL,
                unit TEXT NOT NULL,
                min_stock INTEGER NOT NULL DEFAULT 0,
                quantity INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                image_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_datetime TEXT NOT NULL,
                total REAL NOT NULL,
                payment_method TEXT NOT NULL,
                debtor_name TEXT,
                notes TEXT,
                operator_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ativa',
                settlement_method TEXT,
                settled_at TEXT,
                canceled_at TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                unit_price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                subtotal REAL NOT NULL,
                FOREIGN KEY(sale_id) REFERENCES sales(id),
                FOREIGN KEY(product_id) REFERENCES products(id)
            )
            """
        )
        ensure_column(conn, "sales", "customer_name", "TEXT")
        ensure_column(conn, "sales", "discount", "REAL NOT NULL DEFAULT 0")
        ensure_column(conn, "sales", "amount_received", "REAL")
        ensure_column(conn, "sales", "change_amount", "REAL")
        ensure_column(conn, "sale_items", "product_cost", "REAL NOT NULL DEFAULT 0")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS stock_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                movement_datetime TEXT NOT NULL,
                movement_type TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                previous_quantity INTEGER NOT NULL,
                new_quantity INTEGER NOT NULL,
                notes TEXT,
                operator_name TEXT NOT NULL,
                FOREIGN KEY(product_id) REFERENCES products(id)
            )
            """
        )
        conn.commit()


def parse_float(value, default=0):
    if value is None or value == "":
        return default
    return float(str(value).replace(",", "."))


def parse_int(value, default=0):
    if value is None or value == "":
        return default
    return int(str(value))


def validate_product(data):
    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip()
    unit = str(data.get("unit", "")).strip() or "Unidade"
    if not name:
        raise ValueError("Informe o nome do produto.")
    if not category:
        raise ValueError("Informe a categoria.")
    try:
        price = parse_float(data.get("price"))
        cost = parse_float(data.get("cost"))
        min_stock = parse_int(data.get("min_stock"))
        quantity = parse_int(data.get("quantity"))
    except ValueError as exc:
        raise ValueError("Confira os campos numericos do produto.") from exc
    if price < 0 or cost < 0 or min_stock < 0 or quantity < 0:
        raise ValueError("Valores numericos nao podem ser negativos.")
    return {
        "name": name,
        "category": category,
        "price": price,
        "cost": cost,
        "unit": unit,
        "min_stock": min_stock,
        "quantity": quantity,
        "active": 1 if data.get("active", 1) else 0,
        "image_path": str(data.get("image_path", "")).strip() or None,
    }


def date_filter_sql(alias, start, end):
    parts = []
    params = []
    field = f"substr({alias},1,10)"
    if start:
        parts.append(f"{field} >= ?")
        params.append(start)
    if end:
        parts.append(f"{field} <= ?")
        params.append(end)
    return parts, params


def api_summary():
    today = today_text()
    with db_connection() as conn:
        sales_today = conn.execute(
            """
            SELECT COUNT(*) count, COALESCE(SUM(total),0) total, COALESCE(AVG(total),0) average_ticket
            FROM sales
            WHERE status='ativa' AND substr(sale_datetime,1,10)=?
            """,
            (today,),
        ).fetchone()
        profit_today = conn.execute(
            """
            SELECT COALESCE(SUM((si.unit_price - si.product_cost) * si.quantity),0) profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.status='ativa' AND substr(s.sale_datetime,1,10)=?
            """,
            (today,),
        ).fetchone()["profit"]
        stock_low = conn.execute(
            "SELECT COUNT(*) FROM products WHERE active=1 AND quantity <= min_stock"
        ).fetchone()[0]
        out_stock = conn.execute(
            "SELECT COUNT(*) FROM products WHERE active=1 AND quantity <= 0"
        ).fetchone()[0]
        open_debts = conn.execute(
            """
            SELECT debtor_name, total
            FROM sales
            WHERE status='ativa' AND payment_method='Fiado' AND settled_at IS NULL
            """
        ).fetchall()
        open_debtors = {debtor_key(row["debtor_name"]) for row in open_debts}
        open_debts_total = sum(row["total"] for row in open_debts)
        products_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        low_products = rows_to_list(
            conn.execute(
                """
                SELECT id, name, category, quantity, min_stock
                FROM products
                WHERE active=1 AND quantity <= min_stock
                ORDER BY quantity ASC, name COLLATE NOCASE
                LIMIT 8
                """
            ).fetchall()
        )
        recent_sales = rows_to_list(
            conn.execute(
                """
                SELECT id, sale_datetime, total, payment_method, debtor_name, status
                FROM sales
                ORDER BY sale_datetime DESC
                LIMIT 8
                """
            ).fetchall()
        )
        top_products = rows_to_list(
            conn.execute(
                """
                SELECT si.product_name name, SUM(si.quantity) quantity, COALESCE(SUM(si.subtotal),0) total
                FROM sale_items si
                JOIN sales s ON s.id = si.sale_id
                WHERE s.status='ativa' AND substr(s.sale_datetime,1,10)=?
                GROUP BY si.product_name
                ORDER BY quantity DESC
                LIMIT 6
                """,
                (today,),
            ).fetchall()
        )
    return {
        "sales_count": sales_today["count"],
        "sales_total": sales_today["total"],
        "average_ticket": sales_today["average_ticket"],
        "profit_today": profit_today,
        "stock_low": stock_low,
        "out_stock": out_stock,
        "fiados_count": len(open_debtors),
        "fiados_total": open_debts_total,
        "products_count": products_count,
        "low_products": low_products,
        "recent_sales": recent_sales,
        "top_products": top_products,
    }


def api_categories():
    with db_connection() as conn:
        return [row["category"] for row in conn.execute(
            "SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category COLLATE NOCASE"
        ).fetchall()]


def api_products(query):
    search = query.get("search", [""])[0].strip()
    category = query.get("category", [""])[0].strip()
    status = query.get("status", ["all"])[0]
    sql = "SELECT * FROM products WHERE 1=1"
    params = []
    if search:
        sql += " AND (name LIKE ? OR category LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    if category:
        sql += " AND category=?"
        params.append(category)
    if status == "active":
        sql += " AND active=1"
    elif status == "inactive":
        sql += " AND active=0"
    elif status == "low":
        sql += " AND active=1 AND quantity <= min_stock"
    elif status == "out":
        sql += " AND active=1 AND quantity <= 0"
    sql += " ORDER BY active DESC, name COLLATE NOCASE"
    with db_connection() as conn:
        return rows_to_list(conn.execute(sql, params).fetchall())


def api_save_product(data):
    product = validate_product(data)
    product_id = data.get("id")
    current = now_text()
    with db_connection() as conn:
        if product_id:
            conn.execute(
                """
                UPDATE products
                SET name=?, category=?, price=?, cost=?, unit=?, min_stock=?, quantity=?, active=?, image_path=?, updated_at=?
                WHERE id=?
                """,
                (
                    product["name"], product["category"], product["price"], product["cost"], product["unit"],
                    product["min_stock"], product["quantity"], product["active"], product["image_path"], current, int(product_id),
                ),
            )
            saved_id = int(product_id)
        else:
            cur = conn.execute(
                """
                INSERT INTO products
                (name, category, price, cost, unit, min_stock, quantity, active, image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product["name"], product["category"], product["price"], product["cost"], product["unit"],
                    product["min_stock"], product["quantity"], product["active"], product["image_path"], current, current,
                ),
            )
            saved_id = cur.lastrowid
        conn.commit()
    return {"ok": True, "id": saved_id}


def api_delete_product(product_id):
    with db_connection() as conn:
        sale_links = conn.execute("SELECT COUNT(*) FROM sale_items WHERE product_id=?", (product_id,)).fetchone()[0]
        stock_links = conn.execute("SELECT COUNT(*) FROM stock_movements WHERE product_id=?", (product_id,)).fetchone()[0]
        if sale_links or stock_links:
            raise ValueError("Este produto ja possui historico. Desative em vez de excluir.")
        conn.execute("DELETE FROM products WHERE id=?", (product_id,))
        conn.commit()
    return {"ok": True}


def api_stock_movement(data):
    product_id = int(data.get("product_id"))
    movement_type = str(data.get("movement_type", "entrada")).strip()
    operator = str(data.get("operator_name", "")).strip() or "Operador"
    notes = str(data.get("notes", "")).strip() or None
    amount = parse_int(data.get("quantity"))
    if amount < 0:
        raise ValueError("Quantidade nao pode ser negativa.")
    with db_connection() as conn:
        product = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        if not product:
            raise ValueError("Produto nao encontrado.")
        previous = int(product["quantity"])
        if movement_type == "entrada":
            new_quantity = previous + amount
        elif movement_type == "saida":
            if amount > previous:
                raise ValueError("Saida maior que o estoque atual.")
            new_quantity = previous - amount
        elif movement_type == "ajuste":
            new_quantity = amount
        else:
            raise ValueError("Tipo de movimento invalido.")
        current = now_text()
        conn.execute(
            "UPDATE products SET quantity=?, updated_at=? WHERE id=?",
            (new_quantity, current, product_id),
        )
        conn.execute(
            """
            INSERT INTO stock_movements
            (product_id, product_name, movement_datetime, movement_type, quantity, previous_quantity, new_quantity, notes, operator_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (product_id, product["name"], current, movement_type, amount, previous, new_quantity, notes, operator),
        )
        conn.commit()
    return {"ok": True, "new_quantity": new_quantity}


def api_stock_movements(query):
    limit = min(parse_int(query.get("limit", ["80"])[0], 80), 300)
    with db_connection() as conn:
        rows = rows_to_list(
            conn.execute(
                """
                SELECT * FROM stock_movements
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        )
        latest = {
            row["product_id"]: row["latest_id"]
            for row in conn.execute(
                "SELECT product_id, MAX(id) latest_id FROM stock_movements GROUP BY product_id"
            ).fetchall()
        }
    for row in rows:
        row["can_undo"] = row["movement_type"] in ("entrada", "saida", "ajuste") and row["id"] == latest.get(row["product_id"])
    return rows


def api_undo_stock_movement(data):
    movement_id = int(data.get("id"))
    current = now_text()
    with db_connection() as conn:
        movement = conn.execute("SELECT * FROM stock_movements WHERE id=?", (movement_id,)).fetchone()
        if not movement:
            raise ValueError("Movimentacao de estoque nao encontrada.")
        if movement["movement_type"] not in ("entrada", "saida", "ajuste"):
            raise ValueError("Esta movimentacao nao pode ser desfeita por aqui.")
        latest = conn.execute(
            "SELECT MAX(id) FROM stock_movements WHERE product_id=?",
            (movement["product_id"],),
        ).fetchone()[0]
        if latest != movement_id:
            raise ValueError("So e possivel desfazer a ultima movimentacao deste produto. Para corrigir agora, use Corrigir saldo exato.")
        product = conn.execute("SELECT id FROM products WHERE id=?", (movement["product_id"],)).fetchone()
        if not product:
            raise ValueError("Produto nao encontrado.")
        conn.execute(
            "UPDATE products SET quantity=?, updated_at=? WHERE id=?",
            (movement["previous_quantity"], current, movement["product_id"]),
        )
        conn.execute("DELETE FROM stock_movements WHERE id=?", (movement_id,))
        conn.commit()
    return {"ok": True, "new_quantity": movement["previous_quantity"]}


def api_create_sale(data):
    items = data.get("items") or []
    if not items:
        raise ValueError("Adicione itens a venda.")
    payment = str(data.get("payment_method", "")).strip()
    debtor = str(data.get("debtor_name", "")).strip()
    customer = str(data.get("customer_name", "")).strip()
    notes = str(data.get("notes", "")).strip()
    operator = str(data.get("operator_name", "")).strip() or "Operador"
    if not payment:
        raise ValueError("Selecione a forma de pagamento.")
    if payment == "Fiado" and not debtor:
        raise ValueError("Informe o nome do devedor.")
    discount = parse_float(data.get("discount"), 0)
    amount_received = parse_float(data.get("amount_received"), 0)
    if discount < 0 or amount_received < 0:
        raise ValueError("Desconto e valor recebido nao podem ser negativos.")

    current = now_text()
    with db_connection() as conn:
        prepared = []
        for raw in items:
            product_id = int(raw["product_id"])
            qty = parse_int(raw.get("quantity"))
            if qty <= 0:
                raise ValueError("Quantidade invalida.")
            product = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
            if not product:
                raise ValueError("Produto nao encontrado.")
            if not product["active"]:
                raise ValueError(f"O produto {product['name']} esta inativo.")
            if product["quantity"] < qty:
                raise ValueError(f"Estoque insuficiente para {product['name']}.")
            subtotal = float(product["price"]) * qty
            prepared.append((product, qty, subtotal))

        gross_total = sum(item[2] for item in prepared)
        if discount > gross_total:
            raise ValueError("Desconto maior que o total da venda.")
        total = gross_total - discount
        change = 0
        if payment == "Dinheiro":
            if not amount_received:
                amount_received = total
            if amount_received < total:
                raise ValueError("Valor recebido menor que o total.")
            change = amount_received - total
        cur = conn.execute(
            """
            INSERT INTO sales
            (sale_datetime, total, payment_method, debtor_name, notes, operator_name, customer_name, discount, amount_received, change_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (current, total, payment, debtor or None, notes or None, operator, customer or None, discount, amount_received or None, change),
        )
        sale_id = cur.lastrowid
        for product, qty, subtotal in prepared:
            conn.execute(
                """
                INSERT INTO sale_items
                (sale_id, product_id, product_name, unit_price, quantity, subtotal, product_cost)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (sale_id, product["id"], product["name"], product["price"], qty, subtotal, product["cost"]),
            )
            conn.execute(
                "UPDATE products SET quantity = quantity - ?, updated_at=? WHERE id=?",
                (qty, current, product["id"]),
            )
        conn.commit()
    return {"ok": True, "id": sale_id, "total": total, "change_amount": change}


def api_sales(query):
    status = query.get("status", ["all"])[0]
    payment = query.get("payment", [""])[0]
    search = query.get("search", [""])[0].strip()
    start = query.get("date_from", [""])[0]
    end = query.get("date_to", [""])[0]
    sql = "SELECT * FROM sales WHERE 1=1"
    params = []
    if status != "all":
        sql += " AND status=?"
        params.append(status)
    if payment:
        sql += " AND payment_method=?"
        params.append(payment)
    filters, filter_params = date_filter_sql("sale_datetime", start, end)
    for item in filters:
        sql += f" AND {item}"
    params.extend(filter_params)
    if search:
        sql += " AND (debtor_name LIKE ? OR customer_name LIKE ? OR operator_name LIKE ? OR CAST(id AS TEXT) LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])
    sql += " ORDER BY sale_datetime DESC"
    with db_connection() as conn:
        return rows_to_list(conn.execute(sql, params).fetchall())


def api_sale_detail(sale_id):
    with db_connection() as conn:
        sale = row_to_dict(conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone())
        items = rows_to_list(conn.execute("SELECT * FROM sale_items WHERE sale_id=?", (sale_id,)).fetchall())
    if not sale:
        raise ValueError("Venda nao encontrada.")
    return {"sale": sale, "items": items}


def api_cancel_sale(data):
    sale_id = int(data.get("id"))
    operator = str(data.get("operator_name", "")).strip() or "Operador"
    current = now_text()
    with db_connection() as conn:
        sale = conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        if not sale:
            raise ValueError("Venda nao encontrada.")
        if sale["status"] == "cancelada":
            raise ValueError("Esta venda ja esta cancelada.")
        items = conn.execute("SELECT product_id, product_name, quantity FROM sale_items WHERE sale_id=?", (sale_id,)).fetchall()
        for item in items:
            product = conn.execute("SELECT quantity FROM products WHERE id=?", (item["product_id"],)).fetchone()
            previous = product["quantity"] if product else 0
            new_quantity = previous + item["quantity"]
            conn.execute("UPDATE products SET quantity=?, updated_at=? WHERE id=?", (new_quantity, current, item["product_id"]))
            conn.execute(
                """
                INSERT INTO stock_movements
                (product_id, product_name, movement_datetime, movement_type, quantity, previous_quantity, new_quantity, notes, operator_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item["product_id"], item["product_name"], current, "cancelamento", item["quantity"], previous, new_quantity, f"Cancelamento da venda #{sale_id}", operator),
            )
        conn.execute("UPDATE sales SET status='cancelada', canceled_at=? WHERE id=?", (current, sale_id))
        conn.commit()
    return {"ok": True}


def api_fiados(query):
    view = query.get("view", ["open"])[0]
    sql = "SELECT * FROM sales WHERE payment_method='Fiado'"
    if view == "open":
        sql += " AND status='ativa' AND settled_at IS NULL"
    elif view == "settled":
        sql += " AND settled_at IS NOT NULL"
    elif view == "all":
        pass
    else:
        sql += " AND status='ativa' AND settled_at IS NULL"
    sql += " ORDER BY sale_datetime DESC"
    with db_connection() as conn:
        return rows_to_list(conn.execute(sql).fetchall())


def api_settle_fiado(data):
    sale_id = int(data.get("id"))
    method = str(data.get("settlement_method", "")).strip()
    if not method:
        raise ValueError("Selecione a forma de pagamento.")
    current = now_text()
    with db_connection() as conn:
        sale = conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        if not sale:
            raise ValueError("Fiado nao encontrado.")
        if sale["status"] == "cancelada":
            raise ValueError("Venda cancelada nao pode ser quitada.")
        if sale["settled_at"]:
            raise ValueError("Este fiado ja foi quitado.")
        conn.execute("UPDATE sales SET settlement_method=?, settled_at=? WHERE id=?", (method, current, sale_id))
        conn.commit()
    return {"ok": True}


def api_update_debtor(data):
    sale_id = int(data.get("id"))
    debtor = str(data.get("debtor_name", "")).strip()
    if not debtor:
        raise ValueError("Informe o nome do devedor.")
    with db_connection() as conn:
        conn.execute("UPDATE sales SET debtor_name=? WHERE id=?", (debtor, sale_id))
        conn.commit()
    return {"ok": True}


def api_reports(query):
    start = query.get("date_from", [today_text()])[0] or today_text()
    end = query.get("date_to", [today_text()])[0] or today_text()
    filters, params = date_filter_sql("s.sale_datetime", start, end)
    where = " AND ".join(["s.status='ativa'"] + filters)
    with db_connection() as conn:
        summary = conn.execute(
            f"""
            SELECT COUNT(*) sales_count, COALESCE(SUM(s.total),0) total, COALESCE(AVG(s.total),0) average_ticket,
                   COALESCE(SUM(s.discount),0) discounts
            FROM sales s
            WHERE {where}
            """,
            params,
        ).fetchone()
        profit = conn.execute(
            f"""
            SELECT COALESCE(SUM((si.unit_price - si.product_cost) * si.quantity),0) profit
            FROM sale_items si
            JOIN sales s ON s.id=si.sale_id
            WHERE {where}
            """,
            params,
        ).fetchone()["profit"]
        payments = rows_to_list(
            conn.execute(
                f"""
                SELECT s.payment_method method, COUNT(*) count, COALESCE(SUM(s.total),0) total
                FROM sales s
                WHERE {where}
                GROUP BY s.payment_method
                ORDER BY total DESC
                """,
                params,
            ).fetchall()
        )
        top_products = rows_to_list(
            conn.execute(
                f"""
                SELECT si.product_name name, SUM(si.quantity) quantity, COALESCE(SUM(si.subtotal),0) total
                FROM sale_items si
                JOIN sales s ON s.id=si.sale_id
                WHERE {where}
                GROUP BY si.product_name
                ORDER BY quantity DESC
                LIMIT 12
                """,
                params,
            ).fetchall()
        )
    return {
        "date_from": start,
        "date_to": end,
        "sales_count": summary["sales_count"],
        "total": summary["total"],
        "average_ticket": summary["average_ticket"],
        "discounts": summary["discounts"],
        "profit": profit,
        "payments": payments,
        "top_products": top_products,
    }


def backup_database():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"cantina_tufi_backup_{timestamp}.db")
    if os.path.exists(DB_PATH):
        shutil.copy2(DB_PATH, backup_path)
    return backup_path


def api_reset_system(data):
    confirmation = str(data.get("confirmation", "")).strip().upper()
    if confirmation != "ZERAR":
        raise ValueError("Digite ZERAR para confirmar.")

    backup_path = backup_database()
    with db_connection() as conn:
        before = {
            "products": conn.execute("SELECT COUNT(*) FROM products").fetchone()[0],
            "sales": conn.execute("SELECT COUNT(*) FROM sales").fetchone()[0],
            "sale_items": conn.execute("SELECT COUNT(*) FROM sale_items").fetchone()[0],
            "stock_movements": conn.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0],
        }
        conn.execute("PRAGMA foreign_keys = OFF")
        for table in ("sale_items", "sales", "stock_movements", "products"):
            conn.execute(f"DELETE FROM {table}")
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('products','sales','sale_items','stock_movements')"
        )
        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()

    log(f"Sistema zerado. Backup: {backup_path}")
    return {"ok": True, "backup_file": os.path.basename(backup_path), "removed": before}


HTML = r"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cantina TUFI Pro</title>
<style>
:root{
  --brand:#0b5f8b; --brand-2:#67b9e8; --ink:#102f43; --muted:#6b8394;
  --bg:#f5f8fb; --panel:#fff; --line:#d9e7ef; --soft:#eaf7fd;
  --green:#2e8b57; --red:#c0392b; --amber:#b7791f; --indigo:#4f46e5;
  --shadow:0 10px 24px rgba(16,47,67,.08);
}
*{box-sizing:border-box}
body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--ink)}
button,input,select,textarea{font:inherit}
button{border:0;border-radius:8px;padding:10px 13px;font-weight:700;cursor:pointer;white-space:nowrap}
input,select,textarea{border:1px solid var(--line);border-radius:8px;padding:10px 11px;background:#fff;color:var(--ink);min-width:0}
textarea{resize:vertical;min-height:76px}
table{width:100%;border-collapse:collapse;background:#fff}
th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:middle}
th{background:#edf6fb;color:var(--brand);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
tr:hover td{background:#f8fcff}
.app{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.sidebar{background:var(--brand);color:#fff;padding:22px 16px;display:flex;flex-direction:column;gap:18px}
.brand{font-size:22px;font-weight:900;line-height:1.1}
.brand small{display:block;color:#d6eefa;font-size:12px;font-weight:600;margin-top:5px}
.operator{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;color:#eef9ff}
.nav{display:grid;gap:6px}
.nav button{background:transparent;color:#fff;text-align:left;padding:12px 14px}
.nav button.active,.nav button:hover{background:rgba(255,255,255,.16)}
.content{padding:22px;min-width:0}
.topbar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:18px}
.title h1{margin:0;color:var(--brand);font-size:28px}
.title p{margin:5px 0 0;color:var(--muted)}
.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.primary{background:var(--brand);color:#fff}.secondary{background:var(--soft);color:var(--brand);border:1px solid var(--line)}
.danger{background:var(--red);color:#fff}.success{background:var(--green);color:#fff}.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.grid{display:grid;gap:14px}.stats{grid-template-columns:repeat(5,minmax(0,1fr))}
.two{grid-template-columns:minmax(0,1fr) 360px}.three{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr) 340px}
.sale-layout{display:grid;grid-template-columns:minmax(520px,1fr) 420px;gap:18px;align-items:start}
.sale-panel,.checkout-panel{display:grid;gap:14px}
.checkout-panel{position:sticky;top:18px}
.sale-search{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.category-strip{display:flex;gap:8px;flex-wrap:wrap}
.cat-chip{background:#fff;color:var(--brand);border:1px solid var(--line);padding:8px 12px}
.cat-chip.active{background:var(--brand);color:#fff;border-color:var(--brand)}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.section-head h2{margin:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;box-shadow:var(--shadow);min-width:0}
.card h2{margin:0 0 12px;font-size:17px;color:var(--brand)}
.stat .label{color:var(--muted);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.stat .value{font-size:27px;font-weight:900;color:var(--brand);margin-top:5px}
.stat .sub{color:var(--muted);font-size:13px;margin-top:4px}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:9px;background:#fff}
.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800}
.pill.ok{background:#e8f6ee;color:var(--green)}.pill.warn{background:#fff6df;color:var(--amber)}
.pill.bad{background:#fdecea;color:var(--red)}.pill.info{background:#eef2ff;color:var(--indigo)}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.full{grid-column:1/-1}
.field{display:grid;gap:5px}.field label{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px;max-height:calc(100vh - 285px);overflow:auto;padding:2px 4px 2px 2px}
.product-card{border:1px solid var(--line);border-radius:10px;background:#fff;padding:14px;display:grid;grid-template-rows:auto 1fr auto;gap:12px;text-align:left;color:var(--ink);font-weight:700;white-space:normal;min-height:142px}
.product-card:hover{border-color:var(--brand-2);box-shadow:0 10px 22px rgba(16,47,67,.10);transform:translateY(-1px)}
.prod-name{font-size:16px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.prod-meta{color:var(--muted);font-size:12px;font-weight:700}
.prod-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px}
.prod-price{color:var(--brand);font-size:20px;font-weight:900}
.prod-add{background:var(--brand);color:#fff;border-radius:999px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:20px}
.cart-list{display:grid;gap:9px;max-height:38vh;overflow:auto;padding-right:2px}
.cart-row{border:1px solid var(--line);border-radius:10px;padding:11px;background:#fff;display:grid;gap:9px}
.cart-top{display:flex;justify-content:space-between;gap:10px}.cart-top b{line-height:1.25}.cart-top span{font-weight:900;color:var(--brand)}
.qty{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.qty button{padding:7px 11px}.qty-count{min-width:26px;text-align:center;font-weight:900}
.payment-methods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.pay-button{background:#fff;color:var(--brand);border:1px solid var(--line);padding:12px 10px}
.pay-button.active{background:var(--brand);color:#fff;border-color:var(--brand)}
.total-box{border-top:1px solid var(--line);margin-top:12px;padding-top:12px;display:grid;gap:8px}
.summary-main{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:4px}.summary-main strong{font-size:28px;color:var(--brand)}
.line{display:flex;justify-content:space-between;gap:10px}.line strong{font-size:22px;color:var(--brand)}
.modal-backdrop{position:fixed;inset:0;background:rgba(8,24,38,.42);display:flex;align-items:center;justify-content:center;padding:18px;z-index:50}
.modal{width:min(860px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.25)}
.modal-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.modal-head h2{margin:0;color:var(--brand)}
.toast{position:fixed;right:18px;bottom:18px;background:var(--brand);color:#fff;border-radius:10px;padding:12px 16px;box-shadow:var(--shadow);opacity:0;transform:translateY(8px);transition:.2s;z-index:70}.toast.show{opacity:1;transform:translateY(0)}
.empty{padding:18px;text-align:center;color:var(--muted)}.right{text-align:right}.muted{color:var(--muted)}
.mobile-nav{display:none}.hidden{display:none!important}
@media print{.sidebar,.topbar button,.toolbar,.modal .ghost,.modal .primary,.modal .danger,.toast{display:none!important}.app{display:block}.content{padding:0}.modal-backdrop{position:static;background:#fff;padding:0}.modal{box-shadow:none;max-height:none;width:100%;border-radius:0}}
@media (max-width:1100px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.three,.two,.sale-layout{grid-template-columns:1fr}.checkout-panel{position:static}.catalog{max-height:420px}.content{padding:16px}}
@media (max-width:760px){.app{grid-template-columns:1fr}.sidebar{position:sticky;top:0;z-index:20;padding:12px}.nav{display:none}.mobile-nav{display:block}.brand{font-size:18px}.operator{font-size:13px}.topbar{display:grid}.stats,.form-grid{grid-template-columns:1fr}.card{padding:12px}.title h1{font-size:23px}.catalog{grid-template-columns:1fr;max-height:none}.payment-methods{grid-template-columns:1fr}button{width:auto}.toolbar input,.toolbar select{width:100%}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">Cantina TUFI<small>Gestao de vendas e estoque</small></div>
    <div class="operator">Operador: <b id="operatorLabel">Operador</b></div>
    <select class="mobile-nav" id="mobileNav"></select>
    <div class="nav" id="nav"></div>
  </aside>
  <main class="content" id="main"></main>
</div>
<div id="modalRoot"></div>
<div id="toast" class="toast"></div>
<script>
const pages=[
  ['dashboard','Dashboard'],['sale','Caixa'],['products','Produtos'],['sales','Vendas'],['fiados','Fiados'],['stock','Estoque'],['reports','Relatorios'],['system','Sistema']
];
const state={page:'dashboard',products:[],categories:[],cart:[],selectedProduct:null,operator:localStorage.getItem('cantina.operator')||'Operador'};
operatorLabel.textContent=state.operator;
if(state.operator==='Operador'){const n=prompt('Nome do operador:','Operador'); if(n&&n.trim()){state.operator=n.trim(); localStorage.setItem('cantina.operator',state.operator); operatorLabel.textContent=state.operator;}}
function bootNav(){nav.innerHTML=pages.map(p=>`<button data-page="${p[0]}">${p[1]}</button>`).join(''); mobileNav.innerHTML=pages.map(p=>`<option value="${p[0]}">${p[1]}</option>`).join(''); nav.querySelectorAll('button').forEach(b=>b.onclick=()=>showPage(b.dataset.page)); mobileNav.onchange=()=>showPage(mobileNav.value)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function jsarg(v){return esc(JSON.stringify(String(v??'')))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function dt(v){if(!v)return'-'; const d=new Date(v); return isNaN(d)?esc(v):d.toLocaleString('pt-BR')}
function today(){return new Date().toISOString().slice(0,10)}
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json(); if(!r.ok||d.error)throw new Error(d.error||'Erro ao processar.'); return d}
async function action(work){try{return await work()}catch(e){alert(e.message||'Erro ao processar.')}}
function toast(msg){const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2400)}
function title(h,s,actions=''){return `<div class="topbar"><div class="title"><h1>${h}</h1><p>${s}</p></div><div class="toolbar">${actions}</div></div>`}
function activate(page){state.page=page; mobileNav.value=page; nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}
async function showPage(page){try{activate(page); if(page==='dashboard')await renderDashboard(); if(page==='sale')await renderSale(); if(page==='products')await renderProducts(); if(page==='sales')await renderSales(); if(page==='fiados')await renderFiados(); if(page==='stock')await renderStock(); if(page==='reports')await renderReports(); if(page==='system')await renderSystem()}catch(e){alert(e.message)}}
function table(headers,rows){if(!rows.length)return '<div class="empty">Nenhum registro encontrado.</div>'; return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
async function refreshMeta(){state.categories=await api('/api/categories')}
function statusPill(p){if(!p.active)return'<span class="pill bad">Inativo</span>'; if(p.quantity<=0)return'<span class="pill bad">Sem estoque</span>'; if(p.quantity<=p.min_stock)return'<span class="pill warn">Estoque baixo</span>'; return'<span class="pill ok">Ativo</span>'}
async function renderDashboard(){const s=await api('/api/summary'); main.innerHTML=title('Dashboard','Resumo rapido da operacao de hoje.',`<button class="primary" onclick="showPage('sale')">Nova venda</button><button class="secondary" onclick="showPage('products')">Produto</button><button class="secondary" onclick="showPage('system')">Sistema</button>`) + `
<section class="grid stats">
<div class="card stat"><div class="label">Vendas hoje</div><div class="value">${s.sales_count}</div><div class="sub">${money(s.sales_total)}</div></div>
<div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(s.average_ticket)}</div><div class="sub">por venda ativa</div></div>
<div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(s.profit_today)}</div><div class="sub">baseado no custo</div></div>
<div class="card stat"><div class="label">Fiados abertos</div><div class="value">${s.fiados_count}</div><div class="sub">${money(s.fiados_total)}</div></div>
<div class="card stat"><div class="label">Alertas estoque</div><div class="value">${s.stock_low}</div><div class="sub">${s.out_stock} sem estoque</div></div>
</section>
<section class="grid two" style="margin-top:14px">
<div class="card"><h2>Produtos que precisam de atencao</h2>${table(['Produto','Categoria','Qtd','Minimo'],s.low_products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${p.quantity}</td><td>${p.min_stock}</td></tr>`))}</div>
<div class="card"><h2>Mais vendidos hoje</h2>${table(['Produto','Qtd','Total'],s.top_products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.quantity}</td><td>${money(p.total)}</td></tr>`))}</div>
</section>
<section class="card" style="margin-top:14px"><h2>Ultimas vendas</h2>${table(['ID','Data','Total','Pagamento','Status'],s.recent_sales.map(v=>`<tr><td>#${v.id}</td><td>${dt(v.sale_datetime)}</td><td>${money(v.total)}</td><td>${esc(v.payment_method)}</td><td>${esc(v.status)}</td></tr>`))}</section>`}
async function renderProducts(){await refreshMeta(); main.innerHTML=title('Produtos','Cadastro, status e reposicao dos itens da loja.',`<button class="primary" onclick="openProductForm()">Novo produto</button>`) + `
<div class="toolbar"><input id="pSearch" placeholder="Buscar por nome ou categoria"><select id="pCategory"><option value="">Todas categorias</option>${state.categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select><select id="pStatus"><option value="all">Todos</option><option value="active">Ativos</option><option value="low">Estoque baixo</option><option value="out">Sem estoque</option><option value="inactive">Inativos</option></select></div>
<div class="grid two"><div class="card"><div id="productsTable"></div></div><div class="card" id="productDetails"><h2>Detalhes</h2><p class="muted">Selecione um produto na tabela.</p></div></div>`;
['pSearch','pCategory','pStatus'].forEach(id=>document.getElementById(id).oninput=loadProducts); await loadProducts()}
async function loadProducts(){const q=new URLSearchParams({search:pSearch.value,category:pCategory.value,status:pStatus.value}); state.products=await api('/api/products?'+q); const rows=state.products.map(p=>`<tr onclick="selectProduct(${p.id})"><td>#${p.id}</td><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.unit)}</span></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${money(p.cost)}</td><td>${p.quantity} / ${p.min_stock}</td><td>${statusPill(p)}</td><td><button class="secondary" onclick="event.stopPropagation();openProductForm(${p.id})">Editar</button></td></tr>`); productsTable.innerHTML=table(['ID','Produto','Categoria','Preco','Custo','Estoque','Status',''],rows)}
function selectProduct(id){const p=state.products.find(x=>x.id===id); if(!p)return; state.selectedProduct=p; productDetails.innerHTML=`<h2>${esc(p.name)}</h2><p>${statusPill(p)}</p><p><b>Categoria:</b> ${esc(p.category)}</p><p><b>Preco:</b> ${money(p.price)}</p><p><b>Custo:</b> ${money(p.cost)}</p><p><b>Lucro unitario:</b> ${money(p.price-p.cost)}</p><p><b>Estoque:</b> ${p.quantity} ${esc(p.unit)} | minimo ${p.min_stock}</p><div class="toolbar"><button class="primary" onclick="openProductForm(${p.id})">Editar</button><button class="secondary" onclick="openStockForm(${p.id})">Ajustar estoque</button><button class="danger" onclick="deleteProduct(${p.id})">Excluir</button></div>`}
function openProductForm(id){const p=id?state.products.find(x=>x.id===id):{}; modal(`<div class="modal-head"><h2>${id?'Editar produto':'Novo produto'}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><div class="form-grid"><div class="field"><label>Nome</label><input id="f_name" value="${esc(p.name||'')}"></div><div class="field"><label>Categoria</label><input id="f_category" value="${esc(p.category||'')}"></div><div class="field"><label>Preco de venda</label><input id="f_price" inputmode="decimal" value="${p.price??''}"></div><div class="field"><label>Custo</label><input id="f_cost" inputmode="decimal" value="${p.cost??''}"></div><div class="field"><label>Unidade</label><select id="f_unit">${['Unidade','Pacote','Garrafa','Lata','Fatia','Kg','Litro'].map(u=>`<option ${p.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div class="field"><label>Estoque minimo</label><input id="f_min" inputmode="numeric" value="${p.min_stock??0}"></div><div class="field"><label>Quantidade</label><input id="f_qty" inputmode="numeric" value="${p.quantity??0}"></div><label class="field"><span>Ativo para venda</span><input type="checkbox" id="f_active" ${p.active===0?'':'checked'}></label></div><div class="toolbar" style="margin-top:14px"><button class="primary" onclick="saveProduct(${id||'null'})">Salvar produto</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>`)}
async function saveProduct(id){return action(async()=>{await api('/api/products',{method:'POST',body:JSON.stringify({id,name:f_name.value,category:f_category.value,price:f_price.value,cost:f_cost.value,unit:f_unit.value,min_stock:f_min.value,quantity:f_qty.value,active:f_active.checked?1:0})}); closeModal(); toast('Produto salvo'); await renderProducts()})}
async function deleteProduct(id){return action(async()=>{if(!confirm('Excluir este produto? Se ele ja tiver historico, desative em vez de excluir.'))return; await api('/api/products?id='+id,{method:'DELETE'}); toast('Produto excluido'); await renderProducts()})}
function openStockForm(id){const p=state.products.find(x=>x.id===id); modal(`<div class="modal-head"><h2>Ajustar estoque</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><p><b>${esc(p.name)}</b> | estoque atual: <b>${p.quantity}</b></p><div class="form-grid"><div class="field full"><label>O que deseja fazer?</label><select id="s_type" onchange="updateStockHelp()"><option value="entrada">Adicionar ao estoque</option><option value="saida">Retirar do estoque</option><option value="ajuste">Corrigir saldo exato</option></select><small class="muted" id="s_help"></small></div><div class="field"><label id="s_qty_label">Quantidade</label><input id="s_qty" inputmode="numeric" value="1"></div><div class="field full"><label>Observacao</label><textarea id="s_notes" placeholder="Ex.: compra de mercadoria, perda, contagem conferida"></textarea></div></div><div class="toolbar" style="margin-top:14px"><button class="primary" onclick="saveStock(${id})">Salvar estoque</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>`); updateStockHelp()}
function updateStockHelp(){if(!document.getElementById('s_type'))return; const type=s_type.value; if(type==='entrada'){s_qty_label.textContent='Quantidade a adicionar'; s_help.textContent='Use quando chegaram mais unidades do produto.'}else if(type==='saida'){s_qty_label.textContent='Quantidade a retirar'; s_help.textContent='Use para perda, quebra, vencimento ou ajuste para menos.'}else{s_qty_label.textContent='Saldo correto em estoque'; s_help.textContent='Use quando voce contou o estoque e quer definir o numero correto.'}}
async function saveStock(id){return action(async()=>{await api('/api/stock',{method:'POST',body:JSON.stringify({product_id:id,movement_type:s_type.value,quantity:s_qty.value,notes:s_notes.value,operator_name:state.operator})}); closeModal(); toast('Estoque atualizado'); await renderProducts()})}
async function renderSale(){await refreshMeta(); const products=await api('/api/products?status=active'); state.products=products; const payMethods=['Dinheiro','Pix','Pix Mae Mag','Debito','Credito','Fiado']; main.innerHTML=title('Caixa','PDV organizado para vender com menos procura e mais clareza.',`<button class="secondary" onclick="clearCart()">Limpar carrinho</button>`) + `<div class="sale-layout"><section class="sale-panel"><div class="card"><div class="section-head"><div><h2>Produtos</h2><p class="muted" style="margin:4px 0 0">${products.filter(p=>p.active&&p.quantity>0).length} itens disponiveis para venda</p></div></div><div class="sale-search"><input id="saleSearch" placeholder="Buscar produto pelo nome"><input type="hidden" id="saleCat" value=""><div class="category-strip" id="saleCategories"></div></div></div><div class="card"><div id="catalog" class="catalog"></div></div></section><aside class="checkout-panel"><section class="card"><div class="section-head"><h2>Venda atual</h2><button class="ghost" onclick="clearCart()">Limpar</button></div><div id="cart" class="cart-list"></div><div class="total-box" id="totals"></div></section><section class="card"><h2>Pagamento</h2><input type="hidden" id="payment" value=""><div class="payment-methods">${payMethods.map(m=>`<button class="pay-button" data-method="${esc(m)}" onclick="setPayment(${jsarg(m)})">${esc(m)}</button>`).join('')}</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Operador</label><input id="saleOp" value="${esc(state.operator)}"></div><div class="field"><label>Cliente</label><input id="customer" placeholder="Opcional"></div><div class="field full hidden" id="debtorWrap"><label>Nome do devedor</label><input id="debtor"></div><div class="field"><label>Desconto</label><input id="discount" inputmode="decimal" value="0" oninput="updateCheckout()"></div><div class="field" id="receivedWrap"><label>Recebido</label><input id="received" inputmode="decimal" value="0" oninput="updateCheckout()"></div><div class="field full"><label>Observacao</label><textarea id="notes" placeholder="Opcional"></textarea></div></div><div class="total-box"><div class="line"><span>Troco</span><b id="change">${money(0)}</b></div><button class="primary" onclick="confirmSale()" style="width:100%;margin-top:8px">Confirmar venda</button></div></section></aside></div>`; saleSearch.oninput=renderCatalog; renderSaleCategories(); renderCatalog(); refreshCart()}
function renderSaleCategories(){if(!document.getElementById('saleCategories'))return; const selected=saleCat.value||''; const cats=['',...state.categories]; saleCategories.innerHTML=cats.map(c=>`<button class="cat-chip ${selected===c?'active':''}" onclick="setSaleCategory(${jsarg(c)})">${c?esc(c):'Todas'}</button>`).join('')}
function setSaleCategory(category){saleCat.value=category; renderSaleCategories(); renderCatalog()}
function renderCatalog(){const search=(saleSearch?.value||'').toLowerCase(); const cat=saleCat?.value||''; const list=state.products.filter(p=>p.active&&p.quantity>0&&(!cat||p.category===cat)&&(!search||(p.name.toLowerCase().includes(search)||p.category.toLowerCase().includes(search)))); catalog.innerHTML=list.map(p=>`<button class="product-card" onclick="addCart(${p.id})" title="${esc(p.name)}"><span class="prod-meta">${esc(p.category)} | ${p.quantity} em estoque</span><span class="prod-name">${esc(p.name)}</span><span class="prod-bottom"><span class="prod-price">${money(p.price)}</span><span class="prod-add">+</span></span></button>`).join('')||'<div class="empty">Nenhum produto disponivel.</div>'}
function addCart(id){const p=state.products.find(x=>x.id===id); if(!p)return; const item=state.cart.find(x=>x.product_id===id); if(item){if(item.quantity>=p.quantity)return alert('Nao ha mais estoque disponivel.'); item.quantity++}else state.cart.push({product_id:p.id,product_name:p.name,unit_price:p.price,quantity:1,stock:p.quantity}); refreshCart()}
function refreshCart(){cart.innerHTML=state.cart.map(i=>`<div class="cart-row"><div class="cart-top"><b>${esc(i.product_name)}</b><span>${money(i.unit_price*i.quantity)}</span></div><div class="qty"><button class="secondary" onclick="changeQty(${i.product_id},-1)">-</button><span class="qty-count">${i.quantity}</span><button class="secondary" onclick="changeQty(${i.product_id},1)">+</button><span class="muted">${money(i.unit_price)} un.</span><button class="ghost" onclick="removeCart(${i.product_id})">Remover</button></div></div>`).join('')||'<div class="empty">Clique em um produto para adicionar.</div>'; updateCheckout()}
function totalsCalc(){const subtotal=state.cart.reduce((s,i)=>s+i.unit_price*i.quantity,0); const disc=Math.max(0,Number(String(discount?.value||0).replace(',','.'))||0); const total=Math.max(0,subtotal-disc); const rec=Number(String(received?.value||0).replace(',','.'))||0; return{subtotal,disc,total,rec,change:Math.max(0,rec-total)}}
function setPayment(method){payment.value=method; updateCheckout()}
function updateCheckout(){if(!document.getElementById('totals'))return; const t=totalsCalc(); debtorWrap?.classList.toggle('hidden',payment.value!=='Fiado'); receivedWrap?.classList.toggle('hidden',payment.value!=='Dinheiro'); document.querySelectorAll('.pay-button').forEach(b=>b.classList.toggle('active',b.dataset.method===payment.value)); totals.innerHTML=`<div class="line"><span>Itens</span><b>${state.cart.reduce((s,i)=>s+i.quantity,0)}</b></div><div class="line"><span>Subtotal</span><b>${money(t.subtotal)}</b></div><div class="line"><span>Desconto</span><b>${money(t.disc)}</b></div><div class="summary-main"><div class="line"><span>Total</span><strong>${money(t.total)}</strong></div></div>`; if(change)change.textContent=money(t.change)}
function changeQty(id,d){const i=state.cart.find(x=>x.product_id===id); if(!i)return; const n=i.quantity+d; if(n<=0)state.cart=state.cart.filter(x=>x.product_id!==id); else if(n>i.stock)alert('Quantidade maior que o estoque.'); else i.quantity=n; refreshCart()}
function removeCart(id){state.cart=state.cart.filter(x=>x.product_id!==id); refreshCart()}
function clearCart(){state.cart=[]; if(document.getElementById('cart'))refreshCart()}
async function confirmSale(){return action(async()=>{const op=saleOp.value.trim()||'Operador'; state.operator=op; localStorage.setItem('cantina.operator',op); operatorLabel.textContent=op; const payload={items:state.cart,payment_method:payment.value,debtor_name:debtor.value,customer_name:customer.value,discount:discount.value,amount_received:received.value,notes:notes.value,operator_name:op}; const result=await api('/api/sales',{method:'POST',body:JSON.stringify(payload)}); toast('Venda registrada'); const detail=await api('/api/sale?id='+result.id); state.cart=[]; showReceipt(detail); await renderSale()})}
function showReceipt(d){const s=d.sale; modal(`<div class="modal-head"><h2>Recibo venda #${s.id}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><p><b>Data:</b> ${dt(s.sale_datetime)}<br><b>Operador:</b> ${esc(s.operator_name)}<br><b>Pagamento:</b> ${esc(s.payment_method)}<br><b>Cliente:</b> ${esc(s.customer_name||s.debtor_name||'-')}</p>${table(['Produto','Qtd','Unitario','Subtotal'],d.items.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.subtotal)}</td></tr>`))}<div class="total-box"><div class="line"><span>Desconto</span><b>${money(s.discount)}</b></div><div class="line"><span>Total</span><strong>${money(s.total)}</strong></div><div class="line"><span>Troco</span><b>${money(s.change_amount)}</b></div></div><div class="toolbar" style="margin-top:14px"><button class="primary" onclick="window.print()">Imprimir</button><button class="secondary" onclick="closeModal()">Fechar</button></div>`)}
async function renderSales(){main.innerHTML=title('Vendas','Historico, filtros, detalhes e cancelamento.',`<button class="secondary" onclick="renderSales()">Atualizar</button>`) + `<div class="toolbar"><input id="saleFilter" placeholder="Buscar ID, cliente, operador"><input id="dateFrom" type="date"><input id="dateTo" type="date"><select id="saleStatus"><option value="all">Todos status</option><option value="ativa">Ativas</option><option value="cancelada">Canceladas</option></select><select id="payFilter"><option value="">Todos pagamentos</option><option>Dinheiro</option><option>Pix</option><option>Pix Mae Mag</option><option>Debito</option><option>Credito</option><option>Fiado</option></select></div><div class="card"><div id="salesTable"></div></div>`; dateFrom.value=today(); dateTo.value=today(); ['saleFilter','dateFrom','dateTo','saleStatus','payFilter'].forEach(id=>document.getElementById(id).oninput=loadSales); await loadSales()}
async function loadSales(){const q=new URLSearchParams({search:saleFilter.value,date_from:dateFrom.value,date_to:dateTo.value,status:saleStatus.value,payment:payFilter.value}); const sales=await api('/api/sales?'+q); salesTable.innerHTML=table(['ID','Data','Total','Pagamento','Cliente/Devedor','Operador','Status',''],sales.map(s=>`<tr><td>#${s.id}</td><td>${dt(s.sale_datetime)}</td><td>${money(s.total)}</td><td>${esc(s.payment_method)}</td><td>${esc(s.customer_name||s.debtor_name||'-')}</td><td>${esc(s.operator_name)}</td><td>${s.status==='ativa'?'<span class="pill ok">Ativa</span>':'<span class="pill bad">Cancelada</span>'}</td><td><button class="primary" onclick="saleDetail(${s.id})">Detalhes</button>${s.status==='ativa'?` <button class="danger" onclick="cancelSale(${s.id})">Cancelar</button>`:''}</td></tr>`))}
async function saleDetail(id){showReceipt(await api('/api/sale?id='+id))}
async function cancelSale(id){return action(async()=>{if(!confirm('Cancelar esta venda? O estoque sera devolvido.'))return; await api('/api/sales/cancel',{method:'POST',body:JSON.stringify({id,operator_name:state.operator})}); toast('Venda cancelada'); if(state.page==='sales')await loadSales(); else await renderDashboard()})}
async function renderFiados(){main.innerHTML=title('Fiados','Controle de devedores e quitacoes. Fiados em aberto sao somados por nome.',`<button class="secondary" onclick="renderFiados()">Atualizar</button>`) + `<div class="toolbar"><select id="fiadoView"><option value="open">Em aberto agrupado por devedor</option><option value="settled">Quitados</option><option value="all">Todos</option></select></div><div class="card"><div id="fiadosTable"></div></div>`; fiadoView.oninput=loadFiados; await loadFiados()}
function debtorKey(name){return String(name||'Sem nome').trim().replace(/\s+/g,' ').toLowerCase()}
function groupFiados(rows){const map=new Map(); rows.forEach(s=>{const name=String(s.debtor_name||'Sem nome').trim().replace(/\s+/g,' ')||'Sem nome'; const key=debtorKey(name); if(!map.has(key))map.set(key,{debtor_name:name,ids:[],sales:[],total:0,last_date:''}); const g=map.get(key); g.ids.push(s.id); g.sales.push(s); g.total+=Number(s.total||0); if(!g.last_date||String(s.sale_datetime)>String(g.last_date))g.last_date=s.sale_datetime}); return Array.from(map.values()).sort((a,b)=>String(b.last_date).localeCompare(String(a.last_date)))}
async function loadFiados(){const rows=await api('/api/fiados?view='+fiadoView.value); if(fiadoView.value==='open'){state.fiadoGroups=groupFiados(rows); fiadosTable.innerHTML=table(['Devedor','Compras','Ultima compra','Total em aberto','Situacao',''],state.fiadoGroups.map((g,i)=>`<tr><td><b>${esc(g.debtor_name)}</b></td><td>${g.sales.length}</td><td>${dt(g.last_date)}</td><td><b>${money(g.total)}</b></td><td><span class="pill warn">Em aberto</span></td><td><button class="primary" onclick="showFiadoGroupDetails(${i})">Compras</button> <button class="secondary" onclick="editDebtorGroup(${i})">Editar nome</button> <button class="success" onclick="settleFiadoGroup(${i})">Quitar tudo</button></td></tr>`)); return} fiadosTable.innerHTML=table(['ID','Data','Devedor','Total','Situacao',''],rows.map(s=>`<tr><td>#${s.id}</td><td>${dt(s.sale_datetime)}</td><td>${esc(s.debtor_name||'-')}</td><td>${money(s.total)}</td><td>${s.settled_at?`Quitado em ${dt(s.settled_at)}`:'Em aberto'}</td><td><button class="primary" onclick="saleDetail(${s.id})">Detalhes</button> <button class="secondary" onclick="editDebtor(${s.id},${jsarg(s.debtor_name||'')})">Editar nome</button>${!s.settled_at&&s.status==='ativa'?` <button class="success" onclick="settleFiado(${s.id})">Quitar</button>`:''}</td></tr>`))}
function showFiadoGroupDetails(index){const g=state.fiadoGroups[index]; if(!g)return; modal(`<div class="modal-head"><h2>Compras de ${esc(g.debtor_name)}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><p class="muted">${g.sales.length} compra(s) em aberto somadas para este devedor.</p>${table(['Venda','Data','Total','Observacao',''],g.sales.map(s=>`<tr><td>#${s.id}</td><td>${dt(s.sale_datetime)}</td><td>${money(s.total)}</td><td>${esc(s.notes||'-')}</td><td><button class="secondary" onclick="saleDetail(${s.id})">Ver venda</button></td></tr>`))}<div class="total-box"><div class="line"><span>Total em aberto</span><strong>${money(g.total)}</strong></div></div><div class="toolbar" style="margin-top:14px"><button class="success" onclick="settleFiadoGroup(${index})">Quitar tudo</button><button class="secondary" onclick="closeModal()">Fechar</button></div>`)}
function editDebtor(id,current){const n=prompt('Nome do devedor:',current); if(!n)return; api('/api/fiados/debtor',{method:'POST',body:JSON.stringify({id,debtor_name:n})}).then(()=>{toast('Nome atualizado');loadFiados()}).catch(e=>alert(e.message))}
function editDebtorGroup(index){const g=state.fiadoGroups[index]; if(!g)return; const n=prompt('Nome do devedor:',g.debtor_name); if(!n)return; Promise.all(g.ids.map(id=>api('/api/fiados/debtor',{method:'POST',body:JSON.stringify({id,debtor_name:n})}))).then(()=>{toast('Nome atualizado nas compras em aberto');loadFiados()}).catch(e=>alert(e.message))}
function settleFiado(id){modal(`<div class="modal-head"><h2>Quitar fiado</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><div class="field"><label>Forma de pagamento</label><select id="settleMethod"><option>Dinheiro</option><option>Pix</option><option>Pix Mae Mag</option><option>Debito</option><option>Credito</option></select></div><div class="toolbar" style="margin-top:14px"><button class="success" onclick="saveSettlement(${id})">Salvar quitacao</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>`)}
function settleFiadoGroup(index){const g=state.fiadoGroups[index]; if(!g)return; modal(`<div class="modal-head"><h2>Quitar fiados de ${esc(g.debtor_name)}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div><p>Sera quitado o total de <b>${money(g.total)}</b> em ${g.sales.length} compra(s).</p><div class="field"><label>Forma de pagamento</label><select id="settleMethod"><option>Dinheiro</option><option>Pix</option><option>Pix Mae Mag</option><option>Debito</option><option>Credito</option></select></div><div class="toolbar" style="margin-top:14px"><button class="success" onclick="saveSettlementGroup(${index})">Quitar tudo</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>`)}
async function saveSettlement(id){return action(async()=>{await api('/api/fiados/settle',{method:'POST',body:JSON.stringify({id,settlement_method:settleMethod.value})}); closeModal(); toast('Fiado quitado'); await loadFiados()})}
async function saveSettlementGroup(index){return action(async()=>{const g=state.fiadoGroups[index]; if(!g)return; const method=settleMethod.value; await Promise.all(g.ids.map(id=>api('/api/fiados/settle',{method:'POST',body:JSON.stringify({id,settlement_method:method})}))); closeModal(); toast('Fiados quitados'); await loadFiados()})}
function stockTypeName(type){return {entrada:'Adicionado',saida:'Retirado',ajuste:'Saldo corrigido',cancelamento:'Cancelamento de venda'}[type]||type}
async function renderStock(){const moves=await api('/api/stock?limit=120'); main.innerHTML=title('Estoque','Historico de entradas, retiradas e correcoes. Se lancou errado, desfaca a ultima movimentacao do produto.',`<button class="primary" onclick="showPage('products')">Ajustar produto</button>`) + `<div class="card">${table(['Data','Produto','Acao','Qtd','Antes','Depois','Operador','Obs',''],moves.map(m=>`<tr><td>${dt(m.movement_datetime)}</td><td>${esc(m.product_name)}</td><td>${esc(stockTypeName(m.movement_type))}</td><td>${m.quantity}</td><td>${m.previous_quantity}</td><td>${m.new_quantity}</td><td>${esc(m.operator_name)}</td><td>${esc(m.notes||'-')}</td><td>${m.can_undo?`<button class="danger" onclick="undoStock(${m.id})">Desfazer</button>`:'-'}</td></tr>`))}</div>`}
async function undoStock(id){return action(async()=>{if(!confirm('Desfazer esta movimentacao? O estoque voltara ao valor anterior.'))return; await api('/api/stock/undo',{method:'POST',body:JSON.stringify({id})}); toast('Movimentacao desfeita'); await renderStock()})}
async function renderReports(){main.innerHTML=title('Relatorios','Analise de vendas, lucro estimado e formas de pagamento.',`<button class="secondary" onclick="loadReport()">Atualizar</button>`) + `<div class="toolbar"><input id="rFrom" type="date"><input id="rTo" type="date"></div><div id="reportBox"></div>`; rFrom.value=today(); rTo.value=today(); rFrom.oninput=loadReport; rTo.oninput=loadReport; await loadReport()}
async function loadReport(){const r=await api('/api/reports?'+new URLSearchParams({date_from:rFrom.value,date_to:rTo.value})); reportBox.innerHTML=`<section class="grid stats"><div class="card stat"><div class="label">Vendas</div><div class="value">${r.sales_count}</div><div class="sub">periodo</div></div><div class="card stat"><div class="label">Faturamento</div><div class="value">${money(r.total)}</div><div class="sub">vendas ativas</div></div><div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(r.profit)}</div><div class="sub">preco menos custo</div></div><div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(r.average_ticket)}</div><div class="sub">por venda</div></div><div class="card stat"><div class="label">Descontos</div><div class="value">${money(r.discounts)}</div><div class="sub">concedidos</div></div></section><section class="grid two" style="margin-top:14px"><div class="card"><h2>Formas de pagamento</h2>${table(['Forma','Qtd','Total'],r.payments.map(p=>`<tr><td>${esc(p.method)}</td><td>${p.count}</td><td>${money(p.total)}</td></tr>`))}</div><div class="card"><h2>Produtos mais vendidos</h2>${table(['Produto','Qtd','Total'],r.top_products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.quantity}</td><td>${money(p.total)}</td></tr>`))}</div></section>`}
async function renderSystem(){main.innerHTML=title('Sistema','Preparacao do aplicativo para testes e entrega.',`<button class="secondary" onclick="showPage('dashboard')">Voltar</button>`) + `<section class="grid two"><div class="card"><h2>Zerar sistema</h2><p class="muted">Use este botao antes de entregar ao cliente. Ele apaga produtos, vendas, itens vendidos, fiados e movimentos de estoque. Uma copia de seguranca do banco e criada antes da limpeza.</p><button class="danger" onclick="resetSystem()">Zerar produtos, vendas e estoque</button></div><div class="card"><h2>O que sera apagado</h2><p>Produtos cadastrados<br>Historico de vendas<br>Fiados abertos e quitados<br>Movimentos de estoque<br>Numeracao de novos registros</p></div></section>`}
async function resetSystem(){return action(async()=>{if(!confirm('Tem certeza que deseja zerar o sistema para entrega?'))return; const code=prompt('Digite ZERAR para confirmar:',''); if(String(code||'').trim().toUpperCase()!=='ZERAR'){alert('Operacao cancelada.');return} const result=await api('/api/reset',{method:'POST',body:JSON.stringify({confirmation:'ZERAR',operator_name:state.operator})}); state.cart=[]; localStorage.removeItem('cantina.operator'); toast('Sistema zerado'); alert('Sistema zerado. Backup criado: '+result.backup_file); location.reload()})}
function modal(html){modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal">${html}</div></div>`}
function closeModal(){modalRoot.innerHTML=''}
bootNav(); showPage('dashboard');
</script>
</body>
</html>"""


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

    def send_html(self):
        payload = HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if parsed.path == "/":
                self.send_html()
            elif parsed.path == "/api/summary":
                self.send_json(api_summary())
            elif parsed.path == "/api/categories":
                self.send_json(api_categories())
            elif parsed.path == "/api/products":
                self.send_json(api_products(query))
            elif parsed.path == "/api/sales":
                self.send_json(api_sales(query))
            elif parsed.path == "/api/sale":
                self.send_json(api_sale_detail(int(query.get("id", ["0"])[0])))
            elif parsed.path == "/api/fiados":
                self.send_json(api_fiados(query))
            elif parsed.path == "/api/stock":
                self.send_json(api_stock_movements(query))
            elif parsed.path == "/api/reports":
                self.send_json(api_reports(query))
            else:
                self.send_json({"error": "Rota nao encontrada."}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            data = self.read_json()
            if parsed.path == "/api/products":
                self.send_json(api_save_product(data))
            elif parsed.path == "/api/stock":
                self.send_json(api_stock_movement(data))
            elif parsed.path == "/api/stock/undo":
                self.send_json(api_undo_stock_movement(data))
            elif parsed.path == "/api/sales":
                self.send_json(api_create_sale(data))
            elif parsed.path == "/api/sales/cancel":
                self.send_json(api_cancel_sale(data))
            elif parsed.path == "/api/fiados/settle":
                self.send_json(api_settle_fiado(data))
            elif parsed.path == "/api/fiados/debtor":
                self.send_json(api_update_debtor(data))
            elif parsed.path == "/api/reset":
                self.send_json(api_reset_system(data))
            else:
                self.send_json({"error": "Rota nao encontrada."}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)

    def do_DELETE(self):
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if parsed.path == "/api/products":
                self.send_json(api_delete_product(int(query.get("id", ["0"])[0])))
            else:
                self.send_json({"error": "Rota nao encontrada."}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)


class CantinaServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        log("Erro durante atendimento HTTP:\n" + traceback.format_exc())


def open_browser_later():
    time.sleep(0.7)
    webbrowser.open(URL)


def main():
    try:
        init_db()
        server = CantinaServer((HOST, PORT), Handler)
        threading.Thread(target=open_browser_later, daemon=True).start()
        log(f"Cantina Pro rodando em {URL}")
        server.serve_forever()
    except Exception:
        log("Erro ao iniciar Cantina Pro:\n" + traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
