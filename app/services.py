import os
import shutil
from datetime import datetime

from .config import BACKUP_DIR, DB_PATH
from .database import db_connection, row_to_dict, rows_to_list
from .logger import log
from .utils import now_text, today_text
from .validators import (
    FIADO_VIEWS,
    PAYMENT_METHODS,
    SALE_STATUS,
    clamp_int,
    clean_date,
    clean_text,
    date_filter_sql,
    debtor_key,
    parse_float,
    parse_int,
    validate_cancel_sale,
    validate_debtor_update,
    validate_id,
    validate_product,
    validate_reset_confirmation,
    validate_sale_payload,
    validate_settlement,
    validate_stock_movement,
)


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
    search = clean_text(query.get("search", [""])[0], "", 120)
    category = clean_text(query.get("category", [""])[0], "", 80)
    status = clean_text(query.get("status", ["all"])[0], "all", 20)
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
    saved_id = validate_id(product_id, "produto") if product_id else None
    current = now_text()
    with db_connection() as conn:
        if saved_id:
            exists = conn.execute("SELECT id FROM products WHERE id=?", (saved_id,)).fetchone()
            if not exists:
                raise ValueError("Produto nao encontrado para edicao.")
            conn.execute(
                """
                UPDATE products
                SET name=?, category=?, price=?, cost=?, unit=?, min_stock=?, quantity=?, active=?, image_path=?, updated_at=?
                WHERE id=?
                """,
                (
                    product["name"], product["category"], product["price"], product["cost"], product["unit"],
                    product["min_stock"], product["quantity"], product["active"], product["image_path"], current, saved_id,
                ),
            )
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
    product_id = validate_id(product_id, "produto")
    with db_connection() as conn:
        sale_links = conn.execute("SELECT COUNT(*) FROM sale_items WHERE product_id=?", (product_id,)).fetchone()[0]
        stock_links = conn.execute("SELECT COUNT(*) FROM stock_movements WHERE product_id=?", (product_id,)).fetchone()[0]
        if sale_links or stock_links:
            raise ValueError("Este produto ja possui historico. Desative em vez de excluir.")
        deleted = conn.execute("DELETE FROM products WHERE id=?", (product_id,)).rowcount
        if not deleted:
            raise ValueError("Produto nao encontrado.")
        conn.commit()
    return {"ok": True}

def api_stock_movement(data):
    movement = validate_stock_movement(data)
    product_id = movement["product_id"]
    movement_type = movement["movement_type"]
    amount = movement["quantity"]
    operator = movement["operator_name"]
    notes = movement["notes"]
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
        else:
            new_quantity = amount
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
    limit = clamp_int(query.get("limit", ["80"])[0], 80, min_value=1, max_value=300)
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
    movement_id = validate_id(data.get("id"), "movimentacao de estoque")
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
    sale_data = validate_sale_payload(data)
    items = sale_data["items"]
    payment = sale_data["payment_method"]
    debtor = sale_data["debtor_name"]
    customer = sale_data["customer_name"]
    notes = sale_data["notes"]
    operator = sale_data["operator_name"]
    discount = sale_data["discount"]
    amount_received = sale_data["amount_received"]

    current = now_text()
    with db_connection() as conn:
        prepared = []
        for raw in items:
            product_id = raw["product_id"]
            qty = raw["quantity"]
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
    status = clean_text(query.get("status", ["all"])[0], "all", 20)
    payment = clean_text(query.get("payment", [""])[0], "", 40)
    search = clean_text(query.get("search", [""])[0], "", 120)
    start = clean_date(query.get("date_from", [""])[0])
    end = clean_date(query.get("date_to", [""])[0])
    if status not in SALE_STATUS:
        status = "all"
    if payment and payment not in PAYMENT_METHODS:
        payment = ""
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
    sale_id = validate_id(sale_id, "venda")
    with db_connection() as conn:
        sale = row_to_dict(conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone())
        items = rows_to_list(conn.execute("SELECT * FROM sale_items WHERE sale_id=?", (sale_id,)).fetchall())
    if not sale:
        raise ValueError("Venda nao encontrada.")
    return {"sale": sale, "items": items}

def api_cancel_sale(data):
    cancel_data = validate_cancel_sale(data)
    sale_id = cancel_data["id"]
    operator = cancel_data["operator_name"]
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
    view = clean_text(query.get("view", ["open"])[0], "open", 20)
    if view not in FIADO_VIEWS:
        view = "open"
    sql = "SELECT * FROM sales WHERE payment_method='Fiado'"
    if view == "open":
        sql += " AND status='ativa' AND settled_at IS NULL"
    elif view == "settled":
        sql += " AND settled_at IS NOT NULL"
    sql += " ORDER BY sale_datetime DESC"
    with db_connection() as conn:
        return rows_to_list(conn.execute(sql).fetchall())

def api_settle_fiado(data):
    settlement = validate_settlement(data)
    sale_id = settlement["id"]
    method = settlement["settlement_method"]
    current = now_text()
    with db_connection() as conn:
        sale = conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        if not sale or sale["payment_method"] != "Fiado":
            raise ValueError("Fiado nao encontrado.")
        if sale["status"] == "cancelada":
            raise ValueError("Venda cancelada nao pode ser quitada.")
        if sale["settled_at"]:
            raise ValueError("Este fiado ja foi quitado.")
        conn.execute("UPDATE sales SET settlement_method=?, settled_at=? WHERE id=?", (method, current, sale_id))
        conn.commit()
    return {"ok": True}

def api_update_debtor(data):
    update = validate_debtor_update(data)
    sale_id = update["id"]
    debtor = update["debtor_name"]
    with db_connection() as conn:
        sale = conn.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        if not sale or sale["payment_method"] != "Fiado":
            raise ValueError("Fiado nao encontrado.")
        if sale["status"] == "cancelada":
            raise ValueError("Nao e possivel editar uma venda cancelada.")
        conn.execute("UPDATE sales SET debtor_name=? WHERE id=?", (debtor, sale_id))
        conn.commit()
    return {"ok": True}

def api_reports(query):
    start = clean_date(query.get("date_from", [today_text()])[0], today_text()) or today_text()
    end = clean_date(query.get("date_to", [today_text()])[0], today_text()) or today_text()
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
    validate_reset_confirmation(data)
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

