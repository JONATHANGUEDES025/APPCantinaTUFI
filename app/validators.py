from datetime import datetime


PAYMENT_METHODS = ("Dinheiro", "Pix", "Pix Mae Mag", "Debito", "Credito", "Fiado")
SETTLEMENT_METHODS = ("Dinheiro", "Pix", "Pix Mae Mag", "Debito", "Credito")
STOCK_MOVEMENT_TYPES = ("entrada", "saida", "ajuste")
SALE_STATUS = ("all", "ativa", "cancelada")
FIADO_VIEWS = ("open", "settled", "all")


def clean_text(value, default="", max_len=160):
    text = " ".join(str(value or default).strip().split())
    if max_len and len(text) > max_len:
        raise ValueError(f"Texto muito longo. Limite de {max_len} caracteres.")
    return text


def parse_float(value, default=0):
    if value is None or value == "":
        return default
    text = str(value).strip().replace("R$", "").replace(" ", "")
    if not text:
        return default
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError("Informe um numero valido.") from exc


def parse_int(value, default=0):
    if value is None or value == "":
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(text)
    except ValueError as exc:
        raise ValueError("Informe um numero inteiro valido.") from exc


def clamp_int(value, default=0, min_value=None, max_value=None):
    number = parse_int(value, default)
    if min_value is not None:
        number = max(min_value, number)
    if max_value is not None:
        number = min(max_value, number)
    return number


def validate_id(value, label="registro"):
    number = parse_int(value)
    if number <= 0:
        raise ValueError(f"ID de {label} invalido.")
    return number


def debtor_key(name):
    normalized = clean_text(name, "Sem nome", 120)
    return normalized.lower() or "sem nome"


def clean_date(value, default=""):
    text = clean_text(value, default, 10)
    if not text:
        return ""
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Data invalida. Use o formato AAAA-MM-DD.") from exc
    return text


def validate_product(data):
    name = clean_text(data.get("name"), max_len=120)
    category = clean_text(data.get("category"), max_len=80)
    unit = clean_text(data.get("unit"), "Unidade", 40) or "Unidade"
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
    if price <= 0:
        raise ValueError("O preco de venda precisa ser maior que zero.")
    if cost < 0 or min_stock < 0 or quantity < 0:
        raise ValueError("Custo, estoque minimo e quantidade nao podem ser negativos.")
    return {
        "name": name,
        "category": category,
        "price": price,
        "cost": cost,
        "unit": unit,
        "min_stock": min_stock,
        "quantity": quantity,
        "active": 1 if data.get("active", 1) else 0,
        "image_path": clean_text(data.get("image_path"), "", 500) or None,
    }


def validate_stock_movement(data):
    product_id = validate_id(data.get("product_id"), "produto")
    movement_type = clean_text(data.get("movement_type", "entrada"), max_len=20)
    if movement_type not in STOCK_MOVEMENT_TYPES:
        raise ValueError("Tipo de movimento de estoque invalido.")
    quantity = parse_int(data.get("quantity"))
    if movement_type in ("entrada", "saida") and quantity <= 0:
        raise ValueError("Informe uma quantidade maior que zero.")
    if movement_type == "ajuste" and quantity < 0:
        raise ValueError("O saldo correto nao pode ser negativo.")
    return {
        "product_id": product_id,
        "movement_type": movement_type,
        "quantity": quantity,
        "notes": clean_text(data.get("notes"), "", 500) or None,
        "operator_name": clean_text(data.get("operator_name"), "Operador", 80) or "Operador",
    }


def validate_sale_payload(data):
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        raise ValueError("Adicione itens a venda.")
    payment = clean_text(data.get("payment_method"), max_len=40)
    if payment not in PAYMENT_METHODS:
        raise ValueError("Selecione uma forma de pagamento valida.")
    debtor = clean_text(data.get("debtor_name"), "", 120)
    if payment == "Fiado" and not debtor:
        raise ValueError("Informe o nome do devedor.")
    prepared_items = []
    for item in items:
        prepared_items.append({
            "product_id": validate_id(item.get("product_id"), "produto"),
            "quantity": parse_int(item.get("quantity")),
        })
        if prepared_items[-1]["quantity"] <= 0:
            raise ValueError("Quantidade de item invalida.")
    discount = parse_float(data.get("discount"), 0)
    amount_received = parse_float(data.get("amount_received"), 0)
    if discount < 0 or amount_received < 0:
        raise ValueError("Desconto e valor recebido nao podem ser negativos.")
    return {
        "items": prepared_items,
        "payment_method": payment,
        "debtor_name": debtor,
        "customer_name": clean_text(data.get("customer_name"), "", 120),
        "notes": clean_text(data.get("notes"), "", 500),
        "operator_name": clean_text(data.get("operator_name"), "Operador", 80) or "Operador",
        "discount": discount,
        "amount_received": amount_received,
    }


def validate_cancel_sale(data):
    return {
        "id": validate_id(data.get("id"), "venda"),
        "operator_name": clean_text(data.get("operator_name"), "Operador", 80) or "Operador",
    }


def validate_settlement(data):
    method = clean_text(data.get("settlement_method"), max_len=40)
    if method not in SETTLEMENT_METHODS:
        raise ValueError("Selecione uma forma de pagamento valida.")
    return {"id": validate_id(data.get("id"), "fiado"), "settlement_method": method}


def validate_debtor_update(data):
    debtor = clean_text(data.get("debtor_name"), max_len=120)
    if not debtor:
        raise ValueError("Informe o nome do devedor.")
    return {"id": validate_id(data.get("id"), "fiado"), "debtor_name": debtor}


def validate_reset_confirmation(data):
    confirmation = clean_text(data.get("confirmation"), max_len=20).upper()
    if confirmation != "ZERAR":
        raise ValueError("Digite ZERAR para confirmar.")


def date_filter_sql(alias, start, end):
    start = clean_date(start)
    end = clean_date(end)
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
