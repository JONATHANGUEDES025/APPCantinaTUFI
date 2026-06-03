const DB_NAME = "cantina_tufi_ipad_db";
const DB_VERSION = 2;
const STORE_NAMES = ["products", "sales", "stock_movements", "house_debtors"];
const DEFAULT_CATEGORIES = ["Salgados", "Bebidas", "Doces"];
const PIX_MAE_MAG = "Pix da Mãe Mag";
const PAYMENT_METHODS = ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito", "Fiado"];
const SETTLEMENT_METHODS = ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito"];
const HOUSE_DEBTOR_SEEDS = [
  "Ana Lu/Jonathan",
  "Ana Ramos",
  "Betinha",
  "Bia",
  "Bina",
  "Camila",
  "Cibele",
  "Cris Curimba",
  "Dorinha",
  "Emília",
  "Família",
  "Giulia",
  "Guilherme",
  "Júlia",
  "Karol",
  "Letícia",
  "Lili",
  "Lis",
  "Mãe Mag/Carlinhos",
  "Márcia",
  "Maria Clara",
  "Maria Flor",
  "Mônica/Alexandre",
  "Monica Mello",
  "Pamela",
  "Paula",
  "Rosangela",
  "Vica",
  "Wellington",
  "Yasmin"
].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
const PRODUCT_SEEDS = [
  { category: "Bebidas", name: "Água com gás", cost: 0, price: 3 },
  { category: "Bebidas", name: "Água sem gás", cost: 0, price: 4 },
  { category: "Doces", name: "Brownie", cost: 7.5, price: 7.5 },
  { category: "Salgados", name: "Cachorro Quente", cost: 0, price: 8 },
  { category: "Bebidas", name: "Café", cost: 0, price: 2 },
  { category: "Salgados", name: "Caldo", cost: 0, price: 8 },
  { category: "Salgados", name: "Cheeseburguer Cheddar", cost: 4.7, price: 8 },
  { category: "Bebidas", name: "Coca Cola Lata 350ml", cost: 0, price: 6.5 },
  { category: "Bebidas", name: "Coca Cola Mini 200ml", cost: 0, price: 4 },
  { category: "Bebidas", name: "Coca Cola Zero Mini 200ml", cost: 0, price: 4 },
  { category: "Doces", name: "Copo Brownie", cost: 15, price: 15 },
  { category: "Salgados", name: "Croissant Peito de Peru c/ requeijão", cost: 3.98, price: 8 },
  { category: "Salgados", name: "Empada de frango", cost: 3.89, price: 8 },
  { category: "Salgados", name: "Empada de palmito", cost: 3.49, price: 8 },
  { category: "Salgados", name: "Enroladinho de salsicha", cost: 2.89, price: 8 },
  { category: "Salgados", name: "Esfirra de Carne", cost: 3.98, price: 8 },
  { category: "Doces", name: "Fatia Bolo", cost: 0, price: 7.5 },
  { category: "Salgados", name: "Folhado Minas com Cebolinha", cost: 3.98, price: 8 },
  { category: "Bebidas", name: "Guaraná Antarctica 350ml", cost: 0, price: 6.5 },
  { category: "Bebidas", name: "Guaraná Antarctica Mini 200ml", cost: 0, price: 4 },
  { category: "Bebidas", name: "Guaravita", cost: 0, price: 3 },
  { category: "Salgados", name: "Integral Pastel cream cheese peito de peru", cost: 4.98, price: 8 },
  { category: "Salgados", name: "Joelho Misto", cost: 3.98, price: 8 },
  { category: "Salgados", name: "Kibe de carne com requeijão", cost: 3.49, price: 8 },
  { category: "Bebidas", name: "Mate Leão Copo 300ml", cost: 0, price: 4.5 },
  { category: "Salgados", name: "Pão de batata frango", cost: 3.59, price: 8 },
  { category: "Bebidas", name: "Sprite Mini 200ml", cost: 0, price: 4 }
].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
const STORAGE_KEYS = {
  operator: "cantina.ipad.operator",
  page: "cantina.ipad.page",
  saleDraft: "cantina.ipad.saleDraft"
};

const main = document.getElementById("main");
const nav = document.getElementById("nav");
const mobileNav = document.getElementById("mobileNav");
const modalRoot = document.getElementById("modalRoot");
const toastEl = document.getElementById("toast");
const operatorButton = document.getElementById("operatorButton");

const pages = [
  ["dashboard", "Inicio"],
  ["sale", "Vender"],
  ["products", "Produtos"],
  ["sales", "Historico"],
  ["fiados", "Devedores"],
  ["stock", "Estoque"],
  ["reports", "Resumo"],
  ["system", "Ajustes"]
];

const state = {
  db: null,
  page: localStorage.getItem(STORAGE_KEYS.page) || "dashboard",
  products: [],
  categories: [],
  cart: readSaleDraft().cart || [],
  fiadoGroups: [],
  operator: (localStorage.getItem(STORAGE_KEYS.operator) || "").trim()
};

function readJsonStorage(key, fallback = {}) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch (_error) {
    return fallback;
  }
}

function readSaleDraft() {
  const draft = readJsonStorage(STORAGE_KEYS.saleDraft, {});
  return {
    cart: Array.isArray(draft.cart) ? draft.cart : [],
    paymentMethod: normalizePaymentMethod(draft.paymentMethod || ""),
    customerName: draft.customerName || "",
    debtorSelect: draft.debtorSelect || "",
    debtorName: draft.debtorName || "",
    receivedValue: draft.receivedValue ?? "0",
    saleNotes: draft.saleNotes || "",
    saleCategory: draft.saleCategory || "",
    saleSearch: draft.saleSearch || ""
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "id", autoIncrement: true });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("category", "category", { unique: false });
      }
      if (!db.objectStoreNames.contains("sales")) {
        const store = db.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("paymentMethod", "paymentMethod", { unique: false });
      }
      if (!db.objectStoreNames.contains("stock_movements")) {
        const store = db.createObjectStore("stock_movements", { keyPath: "id", autoIncrement: true });
        store.createIndex("productId", "productId", { unique: false });
      }
      if (!db.objectStoreNames.contains("house_debtors")) {
        const store = db.createObjectStore("house_debtors", { keyPath: "id", autoIncrement: true });
        store.createIndex("name", "name", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(name, mode = "readonly") {
  return state.db.transaction(name, mode).objectStore(name);
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function all(name) {
  return req(store(name).getAll());
}

function getOne(name, id) {
  return req(store(name).get(Number(id)));
}

function putOne(name, value) {
  return req(store(name, "readwrite").put(value));
}

function addOne(name, value) {
  return req(store(name, "readwrite").add(value));
}

function deleteOne(name, id) {
  return req(store(name, "readwrite").delete(Number(id)));
}

function clearStore(name) {
  return req(store(name, "readwrite").clear());
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[char]));
}

function jsArg(value) {
  return esc(JSON.stringify(String(value ?? "")));
}

function cleanText(value, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function numberValue(value, label, min = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min) throw new Error(`${label} invalido.`);
  return Math.round(parsed * 100) / 100;
}

function intValue(value, label, min = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${label} invalido.`);
  return parsed;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function dateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleString("pt-BR");
}

function shortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString("pt-BR");
}

function sameDate(value, date) {
  return String(value || "").slice(0, 10) === date;
}

function debtorKey(name) {
  return cleanText(name, 100).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizePaymentMethod(method) {
  const key = debtorKey(method);
  if (key.includes("pix da mae mag") || key.includes("pix da mae meg") || key.includes("pix mae mag")) return PIX_MAE_MAG;
  return cleanText(method, 80);
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function modal(html, size = "") {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal ${size}">${html}</div></div>`;
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function title(heading, subtitle, actions = "") {
  return `<div class="topbar"><div class="title"><h1>${heading}</h1><p>${subtitle}</p></div><div class="toolbar">${actions}</div></div>`;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function statusPill(product) {
  if (!product.active) return `<span class="pill bad">Inativo</span>`;
  if (product.quantity <= 0) return `<span class="pill bad">Sem estoque</span>`;
  return `<span class="pill ok">Ativo</span>`;
}

function paymentPill(sale) {
  const label = paymentLabel(sale);
  if (sale.paymentMethod === "Fiado" && sale.settledAt) return `<span class="pill ok">${esc(label)}</span>`;
  if (sale.paymentMethod === "Fiado") return `<span class="pill warn">${esc(label)}</span>`;
  return `<span class="pill info">${esc(label)}</span>`;
}

function paymentLabel(sale) {
  if (sale.paymentMethod === "Fiado" && sale.settledAt) return sale.settlementMethod ? `Pago via ${normalizePaymentMethod(sale.settlementMethod)}` : "Fiado quitado";
  if (sale.paymentMethod === "Fiado") return "Fiado em aberto";
  return normalizePaymentMethod(sale.paymentMethod) || "-";
}

function paymentReportKey(sale) {
  if (sale.paymentMethod === "Fiado") return sale.settledAt ? (normalizePaymentMethod(sale.settlementMethod) || "Fiado quitado") : "Fiado em aberto";
  return normalizePaymentMethod(sale.paymentMethod) || "-";
}

async function refreshData() {
  state.products = (await all("products")).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const customCategories = state.products
    .map(product => product.category)
    .filter(Boolean)
    .filter(category => !DEFAULT_CATEGORIES.some(defaultCategory => debtorKey(defaultCategory) === debtorKey(category)));
  state.categories = [...DEFAULT_CATEGORIES, ...new Set(customCategories)].sort((a, b) => {
    const leftDefault = DEFAULT_CATEGORIES.indexOf(a);
    const rightDefault = DEFAULT_CATEGORIES.indexOf(b);
    if (leftDefault >= 0 && rightDefault >= 0) return leftDefault - rightDefault;
    if (leftDefault >= 0) return -1;
    if (rightDefault >= 0) return 1;
    return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  });
}

async function listHouseDebtors() {
  return (await all("house_debtors")).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

async function seedDefaultData() {
  const now = nowIso();
  const debtors = await all("house_debtors");
  const debtorsByKey = new Map(debtors.map(debtor => [debtorKey(debtor.name), debtor]));
  for (const name of HOUSE_DEBTOR_SEEDS) {
    const existing = debtorsByKey.get(debtorKey(name));
    if (existing) {
      if (existing.name !== name) {
        existing.name = name;
        existing.updatedAt = now;
        await putOne("house_debtors", existing);
      }
    } else {
      await putOne("house_debtors", { name, notes: "", createdAt: now, updatedAt: now });
    }
  }

  const products = await all("products");
  const productsByKey = new Map(products.map(product => [debtorKey(product.name), product]));
  for (const item of PRODUCT_SEEDS) {
    const existing = productsByKey.get(debtorKey(item.name));
    if (existing) {
      existing.name = item.name;
      existing.category = item.category;
      existing.price = item.price;
      existing.cost = item.cost;
      existing.unit = existing.unit || "Unidade";
      existing.minStock = Number.isFinite(Number(existing.minStock)) ? Number(existing.minStock) : 0;
      existing.quantity = Number.isFinite(Number(existing.quantity)) ? Number(existing.quantity) : 0;
      existing.active = existing.active !== false;
      existing.updatedAt = now;
      await putOne("products", existing);
    } else {
      await putOne("products", {
        name: item.name,
        category: item.category,
        price: item.price,
        cost: item.cost,
        unit: "Unidade",
        minStock: 0,
        quantity: 0,
        active: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

function saveSaleDraft() {
  const draft = {
    cart: state.cart.map(item => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      productCost: item.productCost,
      quantity: item.quantity,
      stock: item.stock
    })),
    paymentMethod: normalizePaymentMethod(document.getElementById("paymentMethod")?.value || ""),
    customerName: document.getElementById("customerName")?.value || "",
    debtorSelect: document.getElementById("debtorSelect")?.value || "",
    debtorName: document.getElementById("debtorName")?.value || "",
    receivedValue: document.getElementById("receivedValue")?.value || "0",
    saleNotes: document.getElementById("saleNotes")?.value || "",
    saleCategory: document.getElementById("saleCategory")?.value || "",
    saleSearch: document.getElementById("saleSearch")?.value || ""
  };
  localStorage.setItem(STORAGE_KEYS.saleDraft, JSON.stringify(draft));
}

function clearSaleDraft() {
  localStorage.removeItem(STORAGE_KEYS.saleDraft);
}

function reconcileCartWithStock() {
  const messages = [];
  const nextCart = [];
  state.cart.forEach(item => {
    const product = state.products.find(current => current.id === Number(item.productId));
    if (!product || !product.active || product.quantity <= 0) {
      messages.push(`${item.productName || "Produto"} saiu do carrinho porque nao esta disponivel.`);
      return;
    }
    const requested = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    const quantity = Math.min(requested, product.quantity);
    if (quantity !== requested) messages.push(`${product.name} foi ajustado para ${quantity}, conforme o estoque atual.`);
    nextCart.push({
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      productCost: product.cost,
      quantity,
      stock: product.quantity
    });
  });
  state.cart = nextCart;
  if (messages.length) saveSaleDraft();
  return messages;
}

function setOperator(name) {
  const clean = cleanText(name, 80);
  if (!clean) {
    alert("Informe o nome do operador.");
    return false;
  }
  state.operator = clean;
  localStorage.setItem(STORAGE_KEYS.operator, clean);
  operatorButton.textContent = clean;
  const saleOperator = document.getElementById("saleOperator");
  if (saleOperator) saleOperator.value = clean;
  return true;
}

function showOperatorModal(required = false) {
  modal(`
    <div class="modal-head">
      <h2>Operador</h2>
      ${required ? "" : `<button class="ghost" onclick="closeModal()">Fechar</button>`}
    </div>
    <p class="muted">Informe quem esta usando o caixa. Esse nome fica gravado em vendas e movimentacoes de estoque.</p>
    <div class="field">
      <label>Nome do operador</label>
      <input id="operatorName" value="${esc(state.operator)}" placeholder="Ex.: Jonathan">
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveOperator()">Salvar operador</button>
      ${required ? "" : `<button class="secondary" onclick="closeModal()">Cancelar</button>`}
    </div>
  `, "small");
  setTimeout(() => document.getElementById("operatorName")?.focus(), 30);
}

function saveOperator() {
  if (setOperator(document.getElementById("operatorName").value)) {
    closeModal();
    toast("Operador definido");
  }
}

function requireOperator() {
  if (state.operator) return true;
  showOperatorModal(true);
  return false;
}

function bootNav() {
  nav.innerHTML = pages.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join("");
  mobileNav.innerHTML = pages.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  mobileNav.addEventListener("change", () => showPage(mobileNav.value));
  operatorButton.addEventListener("click", () => showOperatorModal(false));
  operatorButton.textContent = state.operator || "Definir operador";
}

function activate(page) {
  state.page = page;
  localStorage.setItem(STORAGE_KEYS.page, page);
  mobileNav.value = page;
  nav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
}

async function showPage(page) {
  try {
    activate(page);
    if (page === "dashboard") await renderDashboard();
    if (page === "sale") await renderSale();
    if (page === "products") await renderProducts();
    if (page === "sales") await renderSales();
    if (page === "fiados") await renderFiados();
    if (page === "stock") await renderStock();
    if (page === "reports") await renderReports();
    if (page === "system") await renderSystem();
  } catch (error) {
    alert(error.message || "Erro ao carregar tela.");
  }
}

async function renderDashboard() {
  await refreshData();
  const sales = await all("sales");
  const todayText = today();
  const activeToday = sales.filter(sale => sale.status === "ativa" && sameDate(sale.date, todayText));
  const salesTotal = activeToday.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const profit = activeToday.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + ((item.unitPrice - item.productCost) * item.quantity), 0), 0);
  const openFiados = sales.filter(sale => sale.status === "ativa" && sale.paymentMethod === "Fiado" && !sale.settledAt);
  const openDebtors = new Set(openFiados.map(sale => debtorKey(sale.debtorName)));
  const outStock = state.products.filter(product => product.active && product.quantity <= 0);
  const topProducts = [];
  activeToday.forEach(sale => {
    sale.items.forEach(item => {
      let current = topProducts.find(row => row.name === item.productName);
      if (!current) {
        current = { name: item.productName, quantity: 0, total: 0 };
        topProducts.push(current);
      }
      current.quantity += item.quantity;
      current.total += item.subtotal;
    });
  });
  topProducts.sort((a, b) => b.quantity - a.quantity);

  main.innerHTML = title("Inicio", "Resumo rapido da cantina.", `
    <button class="primary" onclick="showPage('sale')">Vender agora</button>
    <button class="secondary" onclick="showPage('products')">Cadastrar produto</button>
  `) + `
    <section class="grid stats">
      <div class="card stat"><div class="label">Vendas hoje</div><div class="value">${activeToday.length}</div><div class="sub">${money(salesTotal)}</div></div>
      <div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(activeToday.length ? salesTotal / activeToday.length : 0)}</div><div class="sub">por venda ativa</div></div>
      <div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(profit)}</div><div class="sub">baseado no custo</div></div>
      <div class="card stat"><div class="label">Dividas abertas</div><div class="value">${openDebtors.size}</div><div class="sub">${money(openFiados.reduce((sum, sale) => sum + sale.total, 0))}</div></div>
      <div class="card stat"><div class="label">Sem estoque</div><div class="value">${outStock.length}</div><div class="sub">precisam reposicao</div></div>
    </section>
    <section class="grid two" style="margin-top:14px">
      <div class="card"><h2>Produtos sem estoque</h2>${table(["Produto", "Categoria", "Qtd"], outStock.slice(0, 8).map(product => `<tr><td>${esc(product.name)}</td><td>${esc(product.category)}</td><td>${product.quantity}</td></tr>`))}</div>
      <div class="card"><h2>Mais vendidos hoje</h2>${table(["Produto", "Qtd", "Total"], topProducts.slice(0, 8).map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
    </section>
  `;
}

async function renderProducts() {
  await refreshData();
  main.innerHTML = title("Produtos", "Cadastre itens, precos e estoque.", `
    <button class="primary" onclick="openProductForm()">Novo produto</button>
  `) + `
    <div class="card">
      <div class="toolbar" style="margin-bottom:12px">
        <input id="productSearch" placeholder="Buscar produto">
        <select id="productStatus">
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="out">Sem estoque</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>
      <div id="productsTable"></div>
    </div>
  `;
  document.getElementById("productSearch").addEventListener("input", renderProductsTable);
  document.getElementById("productStatus").addEventListener("change", renderProductsTable);
  renderProductsTable();
}

function productListFiltered() {
  const search = cleanText(document.getElementById("productSearch")?.value || "", 120).toLowerCase();
  const status = document.getElementById("productStatus")?.value || "all";
  return state.products.filter(product => {
    const textMatch = !search || product.name.toLowerCase().includes(search) || product.category.toLowerCase().includes(search);
    const statusMatch =
      status === "all" ||
      (status === "active" && product.active) ||
      (status === "inactive" && !product.active) ||
      (status === "out" && product.active && product.quantity <= 0);
    return textMatch && statusMatch;
  });
}

function renderProductsTable() {
  const rows = productListFiltered().map(product => `
    <tr>
      <td><strong>${esc(product.name)}</strong></td>
      <td>${money(product.price)}</td>
      <td>${product.quantity} unidades</td>
      <td>${statusPill(product)}</td>
      <td class="actions-cell">
        <button class="secondary" onclick="openStockForm(${product.id})">Estoque</button>
        <button class="primary" onclick="openProductForm(${product.id})">Editar</button>
        <button class="ghost" onclick="toggleProduct(${product.id})">${product.active ? "Desativar" : "Ativar"}</button>
      </td>
    </tr>
  `);
  document.getElementById("productsTable").innerHTML = table(["Produto", "Preço", "Estoque", "Status", "Ações"], rows);
}

function openProductForm(id = null) {
  const product = id ? state.products.find(item => item.id === id) : null;
  const selectedCategory = product?.category || DEFAULT_CATEGORIES[0];
  const categoryOptions = [...new Set([...state.categories, selectedCategory].filter(Boolean))]
    .map(category => `<option value="${esc(category)}" ${category === selectedCategory ? "selected" : ""}>${esc(category)}</option>`)
    .join("");
  modal(`
    <div class="modal-head">
      <h2>${id ? "Editar produto" : "Novo produto"}</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <div class="form-grid">
      <div class="field"><label>Nome</label><input id="pName" value="${esc(product?.name || "")}"></div>
      <div class="field">
        <label>Categoria</label>
        <select id="pCategorySelect" onchange="toggleCustomCategory()">
          ${categoryOptions}
          <option value="__custom__">+ Nova categoria</option>
        </select>
        <small>Use uma categoria pronta ou crie uma nova para organizar o caixa.</small>
      </div>
      <div class="field full hidden" id="customCategoryWrap">
        <label>Nova categoria</label>
        <input id="pCategoryCustom" placeholder="Ex.: Marmitas, Lanches, Sorvetes">
      </div>
      <div class="field"><label>Preco no caixa</label><input id="pPrice" inputmode="decimal" value="${product?.price ?? ""}" oninput="updateProductProfit()"></div>
      <div class="field"><label>Custo</label><input id="pCost" inputmode="decimal" value="${product?.cost ?? "0"}" oninput="updateProductProfit()"></div>
      <div class="field full"><div id="pProfitPreview" class="profit-preview">Lucro: informe preço e custo.</div></div>
      <div class="field"><label>Unidade</label><select id="pUnit">${["Unidade", "Pacote", "Garrafa", "Lata", "Fatia", "Kg", "Litro"].map(unit => `<option ${product?.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></div>
      <div class="field">
        <label>Estoque atual</label>
        <input id="pQty" inputmode="numeric" value="${product?.quantity ?? 0}">
        <small>Coloque quantas unidades existem hoje.</small>
      </div>
      <label class="check-field"><input type="checkbox" id="pActive" ${product?.active === false ? "" : "checked"}><span>Ativo para venda</span></label>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveProduct(${id || "null"})">Salvar produto</button>
      <button class="secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
  toggleCustomCategory();
  updateProductProfit();
}

function toggleCustomCategory() {
  const select = document.getElementById("pCategorySelect");
  const wrap = document.getElementById("customCategoryWrap");
  if (!select || !wrap) return;
  wrap.classList.toggle("hidden", select.value !== "__custom__");
  if (select.value === "__custom__") document.getElementById("pCategoryCustom")?.focus();
}

function updateProductProfit() {
  const preview = document.getElementById("pProfitPreview");
  if (!preview) return;
  const price = Number(String(document.getElementById("pPrice")?.value || "").replace(",", "."));
  const cost = Number(String(document.getElementById("pCost")?.value || "").replace(",", "."));
  if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0 || cost < 0) {
    preview.textContent = "Lucro: informe preço e custo.";
    preview.className = "profit-preview";
    return;
  }
  const profit = price - cost;
  const percent = cost > 0 ? (profit / cost) * 100 : 0;
  preview.textContent = cost > 0
    ? `Lucro: ${money(profit)} (${percent.toFixed(1).replace(".", ",")}% sobre o custo)`
    : `Lucro: ${money(profit)} (custo zerado)`;
  preview.className = `profit-preview ${profit >= 0 ? "positive" : "negative"}`;
}

async function saveProduct(id = null) {
  try {
    const name = cleanText(document.getElementById("pName").value, 100);
    const categorySelect = document.getElementById("pCategorySelect").value;
    const category = cleanText(categorySelect === "__custom__" ? document.getElementById("pCategoryCustom").value : categorySelect, 70);
    if (!name || !category) throw new Error("Preencha nome e categoria.");
    const now = nowIso();
    const product = {
      name,
      category,
      price: numberValue(document.getElementById("pPrice").value, "Preco"),
      cost: numberValue(document.getElementById("pCost").value || "0", "Custo"),
      unit: cleanText(document.getElementById("pUnit").value, 30) || "Unidade",
      minStock: 0,
      quantity: intValue(document.getElementById("pQty").value || "0", "Quantidade"),
      active: document.getElementById("pActive").checked,
      createdAt: id ? (await getOne("products", id)).createdAt : now,
      updatedAt: now
    };
    if (id) product.id = id;
    await putOne("products", product);
    closeModal();
    toast("Produto salvo");
    await renderProducts();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function toggleProduct(id) {
  const product = await getOne("products", id);
  if (!product) return;
  product.active = !product.active;
  product.updatedAt = nowIso();
  await putOne("products", product);
  toast(product.active ? "Produto ativado" : "Produto desativado");
  await renderProducts();
}

function openStockForm(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  modal(`
    <div class="modal-head">
      <h2>Movimentar estoque</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <p><b>${esc(product.name)}</b><br><span class="muted">Estoque atual: ${product.quantity}</span></p>
    <div class="form-grid">
      <div class="field full">
        <label>Tipo de ajuste</label>
        <select id="stockType" onchange="updateStockHelp()">
          <option value="entrada">Adicionar quantidade</option>
          <option value="saida">Retirar quantidade</option>
          <option value="ajuste">Informar saldo correto</option>
        </select>
        <small id="stockHelp" class="muted"></small>
      </div>
      <div class="field"><label id="stockQtyLabel">Quantidade</label><input id="stockQty" inputmode="numeric" value="1"></div>
      <div class="field full"><label>Observacao</label><textarea id="stockNotes" placeholder="Ex.: compra de mercadoria, perda, contagem conferida"></textarea></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveStock(${id})">Salvar ajuste</button>
      <button class="secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
  updateStockHelp();
}

function updateStockHelp() {
  const type = document.getElementById("stockType")?.value;
  const help = document.getElementById("stockHelp");
  const label = document.getElementById("stockQtyLabel");
  if (!help || !label) return;
  if (type === "entrada") {
    help.textContent = "Use quando comprou ou recebeu mais produtos.";
    label.textContent = "Quantidade adicionada";
  } else if (type === "saida") {
    help.textContent = "Use para perda, retirada manual ou produto vencido.";
    label.textContent = "Quantidade retirada";
  } else {
    help.textContent = "Use quando contou o estoque e quer informar o saldo final correto.";
    label.textContent = "Saldo correto";
  }
}

async function saveStock(id) {
  try {
    if (!requireOperator()) return;
    const product = await getOne("products", id);
    if (!product) throw new Error("Produto nao encontrado.");
    const type = document.getElementById("stockType").value;
    const amount = intValue(document.getElementById("stockQty").value, "Quantidade");
    const previous = product.quantity;
    let next = previous;
    if (type === "entrada") next += amount;
    if (type === "saida") {
      if (amount > previous) throw new Error("Saida maior que o estoque atual.");
      next -= amount;
    }
    if (type === "ajuste") next = amount;
    product.quantity = next;
    product.updatedAt = nowIso();
    await putOne("products", product);
    await addOne("stock_movements", {
      productId: product.id,
      productName: product.name,
      date: nowIso(),
      type,
      quantity: amount,
      previousQuantity: previous,
      newQuantity: next,
      notes: cleanText(document.getElementById("stockNotes").value, 240),
      operatorName: state.operator
    });
    closeModal();
    toast("Estoque atualizado");
    await renderProducts();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function renderSale() {
  await refreshData();
  const stockMessages = reconcileCartWithStock();
  const draft = readSaleDraft();
  const available = state.products.filter(product => product.active);
  const houseDebtors = await listHouseDebtors();
  const debtorOptions = houseDebtors.length
    ? `<option value="">Selecione um devedor da TUFI</option>${houseDebtors.map(debtor => `<option value="${esc(debtor.name)}">${esc(debtor.name)}</option>`).join("")}<option value="__custom__">Outro nome</option>`
    : `<option value="__custom__">Digitar nome</option>`;
  main.innerHTML = title("Vender", "Toque nos produtos e finalize o pagamento.", `<button class="secondary" onclick="clearCart()">Limpar venda</button>`) + `
    <div class="sale-layout">
      <section class="sale-panel">
        <div class="card">
          <div class="section-head"><div><h2>Produtos</h2><p class="muted" style="margin:4px 0 0">${available.length} produtos cadastrados</p></div></div>
          <div class="sale-search">
            <input id="saleSearch" placeholder="Buscar produto pelo nome">
            <input type="hidden" id="saleCategory" value="">
            <div id="saleCategories" class="category-strip"></div>
          </div>
        </div>
        <div class="card"><div id="catalog" class="catalog"></div></div>
      </section>
      <aside class="checkout-panel">
        <section class="card">
          <div class="section-head"><h2>Venda atual</h2><button class="ghost" onclick="clearCart()">Limpar</button></div>
          <div id="cartList" class="cart-list"></div>
          <div id="totals" class="total-box"></div>
        </section>
        <section class="card">
          <h2>Pagamento</h2>
          <input type="hidden" id="paymentMethod" value="">
          <div class="payment-methods">${PAYMENT_METHODS.map(method => `<button class="pay-button" data-method="${esc(method)}" onclick="setPayment(${jsArg(method)})">${esc(method)}</button>`).join("")}</div>
          <div class="form-grid" style="margin-top:12px">
            <div class="field"><label>Operador</label><input id="saleOperator" value="${esc(state.operator)}"></div>
            <div class="field"><label>Cliente</label><input id="customerName" placeholder="Opcional"></div>
            <div class="field full hidden" id="debtorWrap">
              <label>Devedor</label>
              <select id="debtorSelect" onchange="toggleDebtorName()">${debtorOptions}</select>
              <small>Cadastre nomes fixos em Devedores > Novo devedor da TUFI.</small>
            </div>
            <div class="field full hidden" id="debtorCustomWrap"><label>Nome do devedor</label><input id="debtorName" placeholder="Digite o nome"></div>
            <div class="field" id="receivedWrap"><label>Recebido</label><input id="receivedValue" inputmode="decimal" value="0" oninput="updateCheckout()"></div>
            <div class="field full"><label>Observacao da venda</label><textarea id="saleNotes" placeholder="Opcional"></textarea></div>
          </div>
          <div class="total-box">
            <div class="line"><span>Troco</span><b id="changeValue">${money(0)}</b></div>
            <button class="primary" onclick="confirmSale()" style="width:100%;margin-top:8px">Confirmar venda</button>
          </div>
        </section>
      </aside>
    </div>
  `;
  document.getElementById("saleSearch").value = draft.saleSearch;
  document.getElementById("saleCategory").value = state.categories.includes(draft.saleCategory) ? draft.saleCategory : "";
  document.getElementById("paymentMethod").value = draft.paymentMethod;
  document.getElementById("customerName").value = draft.customerName;
  document.getElementById("receivedValue").value = draft.receivedValue || "0";
  document.getElementById("saleNotes").value = draft.saleNotes;
  const debtorSelect = document.getElementById("debtorSelect");
  if (draft.debtorSelect && [...debtorSelect.options].some(option => option.value === draft.debtorSelect)) {
    debtorSelect.value = draft.debtorSelect;
  } else if (draft.debtorName) {
    debtorSelect.value = "__custom__";
  }
  document.getElementById("debtorName").value = draft.debtorName;

  document.getElementById("saleSearch").addEventListener("input", () => {
    saveSaleDraft();
    renderCatalog();
  });
  ["customerName", "debtorName", "saleNotes"].forEach(id => document.getElementById(id).addEventListener("input", saveSaleDraft));
  debtorSelect.addEventListener("change", saveSaleDraft);
  renderSaleCategories();
  renderCatalog();
  refreshCart();
  if (stockMessages.length) toast(stockMessages.length === 1 ? stockMessages[0] : "Alguns itens do carrinho foram ajustados pelo estoque atual.");
}

function renderSaleCategories() {
  const selected = document.getElementById("saleCategory")?.value || "";
  const categories = ["", ...state.categories];
  document.getElementById("saleCategories").innerHTML = categories.map(category => `<button class="cat-chip ${selected === category ? "active" : ""}" onclick="setSaleCategory(${jsArg(category)})">${category ? esc(category) : "Todas"}</button>`).join("");
}

function setSaleCategory(category) {
  document.getElementById("saleCategory").value = category;
  saveSaleDraft();
  renderSaleCategories();
  renderCatalog();
}

function renderCatalog() {
  const search = cleanText(document.getElementById("saleSearch")?.value || "", 120).toLowerCase();
  const category = document.getElementById("saleCategory")?.value || "";
  const list = state.products.filter(product =>
    product.active &&
    (!category || product.category === category) &&
    (!search || product.name.toLowerCase().includes(search) || product.category.toLowerCase().includes(search))
  );
  document.getElementById("catalog").innerHTML = list.map(product => `
    <button class="product-card ${product.quantity <= 0 ? "out-of-stock" : ""}" onclick="${product.quantity <= 0 ? "" : `addCart(${product.id})`}" title="${esc(product.name)}" ${product.quantity <= 0 ? "disabled" : ""}>
      <span class="prod-meta">${esc(product.category)} | ${product.quantity > 0 ? `${product.quantity} em estoque` : "Sem estoque"}</span>
      <span class="prod-name">${esc(product.name)}</span>
      <span class="prod-bottom"><span class="prod-price">${money(product.price)}</span><span class="prod-add">${product.quantity > 0 ? "+" : "0"}</span></span>
    </button>
  `).join("") || `<div class="empty">Nenhum produto disponivel.</div>`;
}

function addCart(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  const item = state.cart.find(cartItem => cartItem.productId === id);
  if (item) {
    if (item.quantity >= product.quantity) {
      alert("Nao ha mais estoque disponivel para esse produto.");
      return;
    }
    item.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      productCost: product.cost,
      quantity: 1,
      stock: product.quantity
    });
  }
  refreshCart();
}

function refreshCart() {
  const cartList = document.getElementById("cartList");
  if (!cartList) return;
  cartList.innerHTML = state.cart.map(item => `
    <div class="cart-row">
      <div class="cart-top"><b>${esc(item.productName)}</b><span>${money(item.unitPrice * item.quantity)}</span></div>
      <div class="qty">
        <button class="secondary" onclick="changeQty(${item.productId},-1)">-</button>
        <span class="qty-count">${item.quantity}</span>
        <button class="secondary" onclick="changeQty(${item.productId},1)">+</button>
        <span class="muted">${money(item.unitPrice)} un.</span>
        <button class="ghost" onclick="removeCart(${item.productId})">Remover</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Toque em um produto para adicionar.</div>`;
  updateCheckout();
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = 0;
  const total = subtotal;
  const received = Number(String(document.getElementById("receivedValue")?.value || 0).replace(",", ".")) || 0;
  return { subtotal, discount, total, received, change: Math.max(0, received - total) };
}

function setPayment(method) {
  document.getElementById("paymentMethod").value = normalizePaymentMethod(method);
  updateCheckout();
  saveSaleDraft();
}

function toggleDebtorName() {
  const select = document.getElementById("debtorSelect");
  const wrap = document.getElementById("debtorCustomWrap");
  if (!select || !wrap) return;
  const needsTyping = select.value === "__custom__" || !select.value;
  wrap.classList.toggle("hidden", !needsTyping);
  if (needsTyping) document.getElementById("debtorName")?.focus();
  saveSaleDraft();
}

function selectedDebtorName() {
  const select = document.getElementById("debtorSelect");
  if (select && select.value && select.value !== "__custom__") return cleanText(select.value, 100);
  return cleanText(document.getElementById("debtorName")?.value || "", 100);
}

function updateCheckout() {
  const totals = document.getElementById("totals");
  if (!totals) return;
  const payment = document.getElementById("paymentMethod").value;
  document.getElementById("debtorWrap").classList.toggle("hidden", payment !== "Fiado");
  document.getElementById("receivedWrap").classList.toggle("hidden", payment !== "Dinheiro");
  document.getElementById("debtorCustomWrap")?.classList.toggle("hidden", payment !== "Fiado");
  if (payment === "Fiado") toggleDebtorName();
  document.querySelectorAll(".pay-button").forEach(button => button.classList.toggle("active", button.dataset.method === payment));
  const calc = cartTotals();
  totals.innerHTML = `
    <div class="line"><span>Itens</span><b>${state.cart.reduce((sum, item) => sum + item.quantity, 0)}</b></div>
    <div class="line"><span>Subtotal</span><b>${money(calc.subtotal)}</b></div>
    <div class="summary-main"><div class="line"><span>Total</span><strong>${money(calc.total)}</strong></div></div>
  `;
  const change = document.getElementById("changeValue");
  if (change) change.textContent = money(calc.change);
  saveSaleDraft();
}

function changeQty(id, delta) {
  const item = state.cart.find(cartItem => cartItem.productId === id);
  if (!item) return;
  const next = item.quantity + delta;
  if (next <= 0) state.cart = state.cart.filter(cartItem => cartItem.productId !== id);
  else if (next > item.stock) alert("Quantidade maior que o estoque.");
  else item.quantity = next;
  refreshCart();
}

function removeCart(id) {
  state.cart = state.cart.filter(item => item.productId !== id);
  refreshCart();
}

function clearCart() {
  state.cart = [];
  refreshCart();
}

async function confirmSale() {
  try {
    const operator = cleanText(document.getElementById("saleOperator").value, 80);
    if (!setOperator(operator)) return;
    if (!state.cart.length) throw new Error("Adicione pelo menos um produto.");
    const paymentMethod = normalizePaymentMethod(document.getElementById("paymentMethod").value);
    if (!paymentMethod) throw new Error("Selecione a forma de pagamento.");
    const debtorName = paymentMethod === "Fiado" ? selectedDebtorName() : "";
    if (paymentMethod === "Fiado" && !debtorName) throw new Error("Informe o nome do devedor.");
    const customerName = cleanText(document.getElementById("customerName").value, 100);
    const notes = cleanText(document.getElementById("saleNotes").value, 240);
    const calc = cartTotals();
    if (paymentMethod === "Dinheiro" && calc.received && calc.received < calc.total) throw new Error("Valor recebido menor que o total.");

    const saleItems = [];
    for (const cartItem of state.cart) {
      const product = await getOne("products", cartItem.productId);
      if (!product || !product.active) throw new Error(`Produto indisponivel: ${cartItem.productName}`);
      if (product.quantity < cartItem.quantity) throw new Error(`Estoque insuficiente para ${cartItem.productName}.`);
      saleItems.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        productCost: product.cost,
        quantity: cartItem.quantity,
        subtotal: product.price * cartItem.quantity
      });
    }

    for (const item of saleItems) {
      const product = await getOne("products", item.productId);
      product.quantity -= item.quantity;
      product.updatedAt = nowIso();
      await putOne("products", product);
    }

    const sale = {
      date: nowIso(),
      grossTotal: calc.subtotal,
      total: calc.total,
      discount: calc.discount,
      amountReceived: paymentMethod === "Dinheiro" ? (calc.received || calc.total) : null,
      changeAmount: paymentMethod === "Dinheiro" ? Math.max(0, (calc.received || calc.total) - calc.total) : 0,
      paymentMethod,
      debtorName: paymentMethod === "Fiado" ? debtorName : "",
      customerName,
      notes,
      operatorName: state.operator,
      status: "ativa",
      settledAt: null,
      settlementMethod: null,
      canceledAt: null,
      items: saleItems
    };
    const id = await addOne("sales", sale);
    sale.id = id;
    state.cart = [];
    clearSaleDraft();
    await refreshData();
    await renderSale();
    showSaleSuccess(sale);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function showSaleSuccess(sale) {
  modal(`
    <div class="sale-done">
      <h2>Venda concluída</h2>
      <p>A venda foi registrada com sucesso.</p>
      <strong>${money(sale.total)}</strong>
    </div>
  `, "small");
  toast("Venda concluída");
  setTimeout(() => closeModal(), 1800);
}

function showReceipt(sale, backIndex = null) {
  const backButton = backIndex === null ? "" : `<button class="secondary" onclick="fiadoGroupDetails(${backIndex})">Voltar</button>`;
  modal(`
    <div class="receipt">
    <div class="modal-head"><h2>Venda #${sale.id}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p><b>Data:</b> ${dateTime(sale.date)}<br><b>Operador:</b> ${esc(sale.operatorName)}<br><b>Pagamento:</b> ${esc(paymentLabel(sale))}<br><b>Cliente:</b> ${esc(sale.customerName || sale.debtorName || "-")}</p>
    ${table(["Produto", "Qtd", "Unitario", "Subtotal"], sale.items.map(item => `<tr><td>${esc(item.productName)}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.subtotal)}</td></tr>`))}
    <div class="total-box">
      <div class="line"><span>Total</span><strong>${money(sale.total)}</strong></div>
      <div class="line"><span>Troco</span><b>${money(sale.changeAmount)}</b></div>
    </div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      ${backButton}
      <button class="secondary" onclick="closeModal()">Fechar</button>
    </div>
  `);
}

async function renderSales() {
  const sales = (await all("sales")).sort((a, b) => new Date(b.date) - new Date(a.date));
  main.innerHTML = title("Historico", "Vendas salvas neste aparelho.", "") + `
    <div class="card">
      <div class="toolbar" style="margin-bottom:12px">
        <input id="saleFilter" placeholder="Buscar por cliente, operador ou numero">
        <input id="saleFrom" type="date">
        <input id="saleTo" type="date">
        <select id="saleStatus"><option value="all">Todas</option><option value="ativa">Ativas</option><option value="cancelada">Canceladas</option></select>
      </div>
      <div id="salesTable"></div>
    </div>
  `;
  document.getElementById("saleFrom").value = "";
  document.getElementById("saleTo").value = "";
  ["saleFilter", "saleFrom", "saleTo", "saleStatus"].forEach(id => document.getElementById(id).addEventListener("input", () => renderSalesTable(sales)));
  renderSalesTable(sales);
}

function renderSalesTable(sales) {
  const search = cleanText(document.getElementById("saleFilter").value, 120).toLowerCase();
  const from = document.getElementById("saleFrom").value;
  const to = document.getElementById("saleTo").value;
  const status = document.getElementById("saleStatus").value;
  const rows = sales.filter(sale => {
    const date = sale.date.slice(0, 10);
    const searchMatch = !search || [sale.id, sale.customerName, sale.debtorName, sale.operatorName, paymentLabel(sale)].join(" ").toLowerCase().includes(search);
    return searchMatch && (!from || date >= from) && (!to || date <= to) && (status === "all" || sale.status === status);
  }).map(sale => `
    <tr>
      <td>#${sale.id}</td>
      <td>${dateTime(sale.date)}</td>
      <td>${money(sale.total)}</td>
      <td>${paymentPill(sale)}</td>
      <td>${esc(sale.customerName || sale.debtorName || "-")}</td>
      <td>${esc(sale.operatorName)}</td>
      <td>${sale.status === "ativa" ? `<span class="pill ok">Ativa</span>` : `<span class="pill bad">Cancelada</span>`}</td>
      <td class="right">
        <button class="primary" onclick="saleDetail(${sale.id})">Ver</button>
        ${sale.status === "ativa" ? `<button class="danger" onclick="cancelSale(${sale.id})">Cancelar</button>` : ""}
      </td>
    </tr>
  `);
  document.getElementById("salesTable").innerHTML = table(["ID", "Data", "Total", "Pagamento", "Cliente", "Operador", "Status", ""], rows);
}

async function saleDetail(id, backIndex = null) {
  const sale = await getOne("sales", id);
  if (!sale) return;
  showReceipt(sale, backIndex);
}

async function cancelSale(id) {
  try {
    if (!requireOperator()) return;
    if (!confirm("Cancelar esta venda? O estoque sera devolvido.")) return;
    const sale = await getOne("sales", id);
    if (!sale || sale.status === "cancelada") throw new Error("Venda nao encontrada ou ja cancelada.");
    for (const item of sale.items) {
      const product = await getOne("products", item.productId);
      if (!product) continue;
      const previous = product.quantity;
      product.quantity += item.quantity;
      product.updatedAt = nowIso();
      await putOne("products", product);
      await addOne("stock_movements", {
        productId: product.id,
        productName: product.name,
        date: nowIso(),
        type: "cancelamento",
        quantity: item.quantity,
        previousQuantity: previous,
        newQuantity: product.quantity,
        notes: `Cancelamento da venda #${sale.id}`,
        operatorName: state.operator
      });
    }
    sale.status = "cancelada";
    sale.canceledAt = nowIso();
    await putOne("sales", sale);
    toast("Venda cancelada");
    await renderSales();
  } catch (error) {
    alert(error.message);
  }
}

async function renderFiados() {
  const sales = (await all("sales")).filter(sale => sale.paymentMethod === "Fiado" && sale.status === "ativa");
  const houseDebtors = await listHouseDebtors();
  const groups = new Map();
  sales.filter(sale => !sale.settledAt).forEach(sale => {
    const key = debtorKey(sale.debtorName);
    if (!groups.has(key)) groups.set(key, { debtorName: sale.debtorName, sales: [], total: 0 });
    const group = groups.get(key);
    group.sales.push(sale);
    group.total += sale.total;
  });
  state.fiadoGroups = [...groups.values()].sort((a, b) => a.debtorName.localeCompare(b.debtorName));
  const settled = sales.filter(sale => sale.settledAt).sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
  const houseRows = houseDebtors.map(debtor => {
    const group = groups.get(debtorKey(debtor.name));
    return `<tr><td>${esc(debtor.name)}</td><td>${group ? money(group.total) : money(0)}</td><td class="right"><button class="primary" onclick="openHouseDebtorForm(${debtor.id})">Editar</button><button class="ghost" onclick="deleteHouseDebtor(${debtor.id})">Excluir</button></td></tr>`;
  });
  main.innerHTML = title("Devedores da TUFI", "Nomes fixos e compras fiadas organizadas por cliente.", `<button class="primary" onclick="openHouseDebtorForm()">Novo devedor da TUFI</button>`) + `
    <section class="grid two">
      <div class="card"><h2>Devedores da TUFI</h2><p class="muted">Lista fixa que aparece no caixa quando a venda for fiada.</p>${table(["Nome", "Dívida atual", ""], houseRows)}</div>
      <div class="card"><h2>Dívidas abertas</h2><p class="muted">Compras fiadas que ainda precisam ser quitadas.</p>${table(["Cliente", "Compras", "Total", ""], state.fiadoGroups.map((group, index) => `<tr><td>${esc(group.debtorName)}</td><td>${group.sales.length}</td><td>${money(group.total)}</td><td class="right"><button class="primary" onclick="fiadoGroupDetails(${index})">Ver compras</button><button class="success" onclick="settleFiadoGroup(${index})">Quitar todas</button></td></tr>`))}</div>
    </section>
    <section class="card" style="margin-top:14px"><h2>Pagamentos quitados</h2>${table(["Data", "Cliente", "Forma", "Total"], settled.slice(0, 12).map(sale => `<tr><td>${shortDate(sale.settledAt)}</td><td>${esc(sale.debtorName)}</td><td>${esc(sale.settlementMethod || "-")}</td><td>${money(sale.total)}</td></tr>`))}</section>
  `;
}

async function openHouseDebtorForm(id = null) {
  const debtor = id ? await getOne("house_debtors", id) : null;
  modal(`
    <div class="modal-head">
      <h2>${id ? "Editar devedor da TUFI" : "Novo devedor da TUFI"}</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <p class="muted">Cadastre nomes usados com frequencia nas vendas fiadas.</p>
    <div class="form-grid">
      <div class="field full"><label>Nome</label><input id="houseDebtorName" value="${esc(debtor?.name || "")}" placeholder="Ex.: Funcionario, Aluno, Cliente"></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveHouseDebtor(${id || "null"})">Salvar devedor</button>
      <button class="secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `, "small");
  setTimeout(() => document.getElementById("houseDebtorName")?.focus(), 30);
}

async function saveHouseDebtor(id = null) {
  try {
    const name = cleanText(document.getElementById("houseDebtorName").value, 100);
    if (!name) throw new Error("Informe o nome do devedor.");
    const alreadyExists = (await listHouseDebtors()).some(debtor => debtor.id !== id && debtorKey(debtor.name) === debtorKey(name));
    if (alreadyExists) throw new Error("Este devedor ja esta na lista da TUFI.");
    const current = id ? await getOne("house_debtors", id) : null;
    const now = nowIso();
    const debtor = {
      name,
      notes: current?.notes || "",
      createdAt: current?.createdAt || now,
      updatedAt: now
    };
    if (id) debtor.id = id;
    await putOne("house_debtors", debtor);
    closeModal();
    toast("Devedor da TUFI salvo");
    await renderFiados();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteHouseDebtor(id) {
  const debtor = await getOne("house_debtors", id);
  if (!debtor) return;
  if (!confirm(`Excluir ${debtor.name} da lista fixa da TUFI? As vendas ja registradas continuam salvas.`)) return;
  await deleteOne("house_debtors", id);
  toast("Devedor removido da lista fixa");
  await renderFiados();
}

function saleItemsSummary(sale) {
  return sale.items.map(item => `${item.quantity}x ${esc(item.productName)} - ${money(item.subtotal)}`).join("<br>");
}

function fiadoGroupDetails(index) {
  const group = state.fiadoGroups[index];
  if (!group) return;
  const rows = group.sales.map(sale => `
    <tr>
      <td><input class="fiado-sale-check" type="checkbox" value="${sale.id}"></td>
      <td>#${sale.id}</td>
      <td>${dateTime(sale.date)}</td>
      <td>${saleItemsSummary(sale)}</td>
      <td>${money(sale.total)}</td>
      <td>${esc(sale.notes || "-")}</td>
      <td><button class="secondary" onclick="saleDetail(${sale.id}, ${index})">Ver venda</button></td>
    </tr>
  `);
  modal(`
    <div class="modal-head"><h2>Compras de ${esc(group.debtorName)}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p class="muted">Marque as compras que o cliente vai pagar agora.</p>
    ${table(["Marcar", "Venda", "Data", "Produtos", "Total", "Obs.", ""], rows)}
    <div class="total-box"><div class="line"><span>Total em aberto</span><strong>${money(group.total)}</strong></div></div>
    <div class="field" style="margin-top:14px"><label>Forma de pagamento</label><select id="selectedSettleMethod">${SETTLEMENT_METHODS.map(method => `<option>${esc(method)}</option>`).join("")}</select></div>
    <div class="toolbar" style="margin-top:14px">
      <button class="success" onclick="settleSelectedFiados(${index})">Quitar marcadas</button>
      <button class="success" onclick="settleFiadoGroup(${index})">Quitar todas</button>
      <button class="secondary" onclick="closeModal()">Fechar</button>
    </div>
  `);
}

async function settleSelectedFiados(index) {
  try {
    const group = state.fiadoGroups[index];
    if (!group) return;
    const ids = [...document.querySelectorAll(".fiado-sale-check:checked")].map(input => Number(input.value));
    if (!ids.length) throw new Error("Marque pelo menos uma compra para quitar.");
    const method = normalizePaymentMethod(document.getElementById("selectedSettleMethod")?.value || "Dinheiro");
    const now = nowIso();
    for (const sale of group.sales.filter(item => ids.includes(item.id))) {
      sale.settledAt = now;
      sale.settlementMethod = method;
      await putOne("sales", sale);
    }
    closeModal();
    toast("Compras marcadas quitadas");
    await renderFiados();
  } catch (error) {
    alert(error.message);
  }
}

function settleFiadoGroup(index) {
  const group = state.fiadoGroups[index];
  if (!group) return;
  modal(`
    <div class="modal-head"><h2>Quitar todas as compras</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p>Vai quitar <b>${money(group.total)}</b> em ${group.sales.length} compra(s) de <b>${esc(group.debtorName)}</b>.</p>
    <div class="field"><label>Forma de pagamento</label><select id="settleMethod">${SETTLEMENT_METHODS.map(method => `<option>${esc(method)}</option>`).join("")}</select></div>
    <div class="toolbar" style="margin-top:14px"><button class="success" onclick="saveSettlement(${index})">Confirmar pagamento</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>
  `, "small");
}

async function saveSettlement(index) {
  try {
    const group = state.fiadoGroups[index];
    if (!group) return;
    const method = normalizePaymentMethod(document.getElementById("settleMethod").value);
    for (const sale of group.sales) {
      sale.settledAt = nowIso();
      sale.settlementMethod = method;
      await putOne("sales", sale);
    }
    closeModal();
    toast("Divida quitada");
    await renderFiados();
  } catch (error) {
    alert(error.message);
  }
}

async function renderStock() {
  const movements = (await all("stock_movements")).sort((a, b) => b.id - a.id);
  main.innerHTML = title("Estoque", "Entradas, retiradas e correcoes.", `<button class="primary" onclick="showPage('products')">Ir para produtos</button>`) + `
    <div class="card">
      ${table(["Data", "Produto", "Movimento", "Qtd", "Antes", "Depois", "Operador", "Obs", ""], movements.map(move => `<tr><td>${dateTime(move.date)}</td><td>${esc(move.productName)}</td><td>${stockTypeName(move.type)}</td><td>${move.quantity}</td><td>${move.previousQuantity}</td><td>${move.newQuantity}</td><td>${esc(move.operatorName)}</td><td>${esc(move.notes || "-")}</td><td>${canUndoStock(move, movements) ? `<button class="danger" onclick="undoStock(${move.id})">Desfazer</button>` : "-"}</td></tr>`))}
    </div>
  `;
}

function stockTypeName(type) {
  return { entrada: "Adicionado", saida: "Retirado", ajuste: "Saldo corrigido", cancelamento: "Cancelamento" }[type] || type;
}

function canUndoStock(move, movements) {
  if (!["entrada", "saida", "ajuste"].includes(move.type)) return false;
  const latest = movements.filter(item => item.productId === move.productId).sort((a, b) => b.id - a.id)[0];
  return latest && latest.id === move.id;
}

async function undoStock(id) {
  try {
    const movements = await all("stock_movements");
    const move = movements.find(item => item.id === id);
    if (!move || !canUndoStock(move, movements)) throw new Error("So e possivel desfazer a ultima movimentacao deste produto.");
    if (!confirm("Desfazer esta movimentacao? O estoque voltara ao valor anterior.")) return;
    const product = await getOne("products", move.productId);
    if (!product) throw new Error("Produto nao encontrado.");
    product.quantity = move.previousQuantity;
    product.updatedAt = nowIso();
    await putOne("products", product);
    await deleteOne("stock_movements", id);
    toast("Movimentacao desfeita");
    await renderStock();
  } catch (error) {
    alert(error.message);
  }
}

async function renderReports() {
  main.innerHTML = title("Resumo", "Faturamento, lucro e produtos vendidos.", "") + `
    <div class="toolbar" style="margin-bottom:14px">
      <input id="reportFrom" type="date" value="${today()}">
      <input id="reportTo" type="date" value="${today()}">
    </div>
    <div id="reportBox"></div>
  `;
  document.getElementById("reportFrom").addEventListener("input", loadReport);
  document.getElementById("reportTo").addEventListener("input", loadReport);
  await loadReport();
}

async function loadReport() {
  const from = document.getElementById("reportFrom").value;
  const to = document.getElementById("reportTo").value;
  const sales = (await all("sales")).filter(sale => {
    const date = sale.date.slice(0, 10);
    return sale.status === "ativa" && (!from || date >= from) && (!to || date <= to);
  });
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const profit = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + ((item.unitPrice - item.productCost) * item.quantity), 0), 0);
  const payments = {};
  const products = {};
  const paymentOrder = ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito", "Fiado em aberto"];
  sales.forEach(sale => {
    const method = paymentReportKey(sale);
    if (!payments[method]) payments[method] = { method, count: 0, total: 0 };
    payments[method].count += 1;
    payments[method].total += sale.total;
    sale.items.forEach(item => {
      if (!products[item.productName]) products[item.productName] = { name: item.productName, quantity: 0, total: 0 };
      products[item.productName].quantity += item.quantity;
      products[item.productName].total += item.subtotal;
    });
  });
  const paymentRows = paymentOrder.map(method => payments[method] || { method, count: 0, total: 0 })
    .concat(Object.values(payments).filter(row => !paymentOrder.includes(row.method)).sort((a, b) => b.total - a.total));
  const productRows = Object.values(products).sort((a, b) => b.quantity - a.quantity);
  document.getElementById("reportBox").innerHTML = `
    <section class="grid stats">
      <div class="card stat"><div class="label">Vendas</div><div class="value">${sales.length}</div><div class="sub">período</div></div>
      <div class="card stat"><div class="label">Faturamento</div><div class="value">${money(total)}</div><div class="sub">vendas ativas</div></div>
      <div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(profit)}</div><div class="sub">preço menos custo</div></div>
      <div class="card stat"><div class="label">Ticket médio</div><div class="value">${money(sales.length ? total / sales.length : 0)}</div><div class="sub">por venda</div></div>
    </section>
    <section class="grid two" style="margin-top:14px">
      <div class="card"><h2>Formas de pagamento</h2>${table(["Forma", "Vendas", "Total"], paymentRows.map(row => `<tr><td>${esc(row.method)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`))}</div>
      <div class="card"><h2>Produtos mais vendidos</h2>${table(["Produto", "Qtd", "Total"], productRows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
    </section>
  `;
}

async function renderSystem() {
  const products = await all("products");
  const sales = await all("sales");
  const stock = await all("stock_movements");
  const houseDebtors = await all("house_debtors");
  main.innerHTML = title("Ajustes", "Backup, dados e limpeza do aplicativo.", "") + `
    <section class="grid two">
      <div class="card">
        <h2>Dados neste aparelho</h2>
        <p>Produtos: <b>${products.length}</b><br>Vendas: <b>${sales.length}</b><br>Devedores da TUFI: <b>${houseDebtors.length}</b><br>Movimentos de estoque: <b>${stock.length}</b></p>
      </div>
      <div class="card">
        <h2>Backup</h2>
        <p class="muted">Como os dados ficam neste iPad, exporte backup com frequência.</p>
        <div class="backup-actions">
          <button class="primary" onclick="exportBackup()">Exportar backup</button>
          <label class="secondary file-input">Importar backup<input type="file" accept="application/json" onchange="importBackupFile(event)"></label>
        </div>
      </div>
    </section>
    <section class="grid two" style="margin-top:14px">
      <div class="card">
        <h2>Zerar sistema</h2>
        <p class="muted">Use antes de entregar o app limpo. Exporte um backup antes de apagar.</p>
        <button class="danger" onclick="resetSystem()">Zerar tudo neste iPad</button>
      </div>
    </section>
  `;
}

async function exportBackup() {
  const data = {
    app: "Cantina TUFI iPad",
    version: 1,
    exportedAt: nowIso(),
    operator: state.operator,
    products: await all("products"),
    sales: await all("sales"),
    stock_movements: await all("stock_movements"),
    house_debtors: await all("house_debtors")
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-cantina-tufi-ipad-${today()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado");
}

function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.products) || !Array.isArray(data.sales)) throw new Error("Arquivo de backup invalido.");
      if (!confirm("Importar este backup? Os dados atuais deste iPad serao substituidos.")) return;
      for (const name of STORE_NAMES) await clearStore(name);
      for (const product of data.products) await putOne("products", product);
      for (const sale of data.sales) await putOne("sales", sale);
      for (const move of data.stock_movements || []) await putOne("stock_movements", move);
      for (const debtor of data.house_debtors || []) await putOne("house_debtors", debtor);
      if (data.operator) setOperator(data.operator);
      state.cart = [];
      clearSaleDraft();
      toast("Backup importado");
      await showPage("dashboard");
    } catch (error) {
      alert(error.message || "Nao foi possivel importar o backup.");
    }
  };
  reader.readAsText(file);
}

async function resetSystem() {
  if (!confirm("Zerar vendas, fiados e estoque deste iPad? Os produtos e devedores padrão voltam com quantidade zero.")) return;
  const code = prompt("Digite ZERAR para confirmar:", "");
  if (String(code || "").trim().toUpperCase() !== "ZERAR") {
    alert("Operação cancelada.");
    return;
  }
  for (const name of STORE_NAMES) await clearStore(name);
  state.cart = [];
  clearSaleDraft();
  await seedDefaultData();
  toast("Sistema zerado");
  await showPage("dashboard");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const protocol = window.location.protocol;
  if (protocol !== "https:" && protocol !== "http:") return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (_error) {
    // O app continua funcionando; apenas a instalacao offline pode ficar indisponivel.
  }
}

async function boot() {
  state.db = await openDatabase();
  bootNav();
  await registerServiceWorker();
  await seedDefaultData();
  const savedPage = pages.some(([id]) => id === state.page) ? state.page : "dashboard";
  await showPage(savedPage);
  if (!state.operator) showOperatorModal(true);
}

boot().catch(error => {
  main.innerHTML = `<div class="card"><h2>Erro ao iniciar</h2><p>${esc(error.message || "Erro desconhecido.")}</p></div>`;
});
