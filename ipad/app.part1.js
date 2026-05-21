const DB_NAME = "cantina_tufi_ipad_db";
const DB_VERSION = 1;
const STORE_NAMES = ["products", "sales", "stock_movements"];

const main = document.getElementById("main");
const nav = document.getElementById("nav");
const mobileNav = document.getElementById("mobileNav");
const modalRoot = document.getElementById("modalRoot");
const toastEl = document.getElementById("toast");
const operatorButton = document.getElementById("operatorButton");

const pages = [
  ["dashboard", "Dashboard"],
  ["sale", "Caixa"],
  ["products", "Produtos"],
  ["sales", "Vendas"],
  ["fiados", "Fiados"],
  ["stock", "Estoque"],
  ["reports", "Relatorios"],
  ["system", "Sistema"]
];

const state = {
  db: null,
  page: "dashboard",
  products: [],
  categories: [],
  cart: [],
  fiadoGroups: [],
  operator: (localStorage.getItem("cantina.ipad.operator") || "").trim()
};

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
  if (product.quantity <= product.minStock) return `<span class="pill warn">Estoque baixo</span>`;
  return `<span class="pill ok">Ativo</span>`;
}

function paymentPill(sale) {
  if (sale.paymentMethod === "Fiado" && sale.settledAt) return `<span class="pill ok">Fiado quitado</span>`;
  if (sale.paymentMethod === "Fiado") return `<span class="pill warn">Fiado</span>`;
  return `<span class="pill info">${esc(sale.paymentMethod)}</span>`;
}

async function refreshData() {
  state.products = (await all("products")).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  state.categories = [...new Set(state.products.map(product => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setOperator(name) {
  const clean = cleanText(name, 80);
  if (!clean) {
    alert("Informe o nome do operador.");
    return false;
  }
  state.operator = clean;
  localStorage.setItem("cantina.ipad.operator", clean);
  operatorButton.textContent = clean;