(function applyCantinaTufiFinalAdjustments() {
  const PIX_MAE_MAG = "Pix da Mãe Mag";
  const PAYMENT_METHODS = ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito", "Fiado"];
  const SETTLEMENT_METHODS = ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito"];
  const HOUSE_DEBTOR_SEEDS = [
    "Ana Lu/Jonathan", "Ana Ramos", "Betinha", "Bia", "Bina", "Camila", "Cibele", "Cris Curimba", "Dorinha", "Emília",
    "Família", "Giulia", "Guilherme", "Júlia", "Karol", "Letícia", "Lili", "Lis", "Mãe Mag/Carlinhos", "Márcia",
    "Maria Clara", "Maria Flor", "Mônica/Alexandre", "Monica Mello", "Pamela", "Paula", "Rosangela", "Vica",
    "Wellington", "Yasmin"
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

  const style = document.createElement("style");
  style.textContent = `
    .sale-done{display:grid;gap:8px;text-align:center;padding:18px 8px 14px}.sale-done h2{margin:0;color:var(--green);font-size:28px}.sale-done p{margin:0;color:var(--muted);font-size:15px}.sale-done strong{color:var(--brand);font-size:26px}
    .actions-cell{min-width:270px;text-align:right;white-space:normal}.actions-cell button{padding:8px 10px;margin:2px}#productsTable table th:last-child{min-width:270px;text-align:right}
  `;
  document.head.appendChild(style);

  function key(value) {
    return String(value || "").trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function normalizePayment(method) {
    const current = key(method);
    if (current.includes("pix da mae mag") || current.includes("pix da mae meg") || current.includes("pix mae mag")) return PIX_MAE_MAG;
    return String(method || "").trim();
  }

  async function seedDefaultData() {
    if (window.__cantinaTufiFinalSeedDone) return;
    window.__cantinaTufiFinalSeedDone = true;
    const now = nowIso();
    const debtors = await all("house_debtors");
    const debtorsByKey = new Map(debtors.map(debtor => [key(debtor.name), debtor]));
    for (const name of HOUSE_DEBTOR_SEEDS) {
      const existing = debtorsByKey.get(key(name));
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
    const productsByKey = new Map(products.map(product => [key(product.name), product]));
    for (const item of PRODUCT_SEEDS) {
      const existing = productsByKey.get(key(item.name));
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
        await putOne("products", { name: item.name, category: item.category, price: item.price, cost: item.cost, unit: "Unidade", minStock: 0, quantity: 0, active: true, createdAt: now, updatedAt: now });
      }
    }
    await refreshData();
  }

  function normalizePaymentUi(root = document) {
    root.querySelectorAll(".pay-button").forEach(button => {
      if (normalizePayment(button.textContent) === PIX_MAE_MAG) {
        button.textContent = PIX_MAE_MAG;
        button.dataset.method = PIX_MAE_MAG;
        button.onclick = () => setPayment(PIX_MAE_MAG);
      }
    });
    root.querySelectorAll("option").forEach(option => {
      if (normalizePayment(option.textContent) === PIX_MAE_MAG) {
        option.textContent = PIX_MAE_MAG;
        option.value = PIX_MAE_MAG;
      }
    });
    const paymentInput = document.getElementById("paymentMethod");
    if (paymentInput) paymentInput.value = normalizePayment(paymentInput.value);
  }

  function patchProductTable() {
    renderProductsTable = function renderProductsTable() {
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
    };
  }

  function patchPayment() {
    const originalSetPayment = setPayment;
    setPayment = function patchedSetPayment(method) {
      originalSetPayment(normalizePayment(method));
      normalizePaymentUi();
    };

    const originalRenderSale = renderSale;
    renderSale = async function patchedRenderSale() {
      await originalRenderSale();
      const container = document.querySelector(".payment-methods");
      if (container) container.innerHTML = PAYMENT_METHODS.map(method => `<button class="pay-button" data-method="${esc(method)}" onclick="setPayment(${jsArg(method)})">${esc(method)}</button>`).join("");
      normalizePaymentUi();
      updateCheckout();
    };

    paymentLabel = function paymentLabel(sale) {
      if (sale.paymentMethod === "Fiado" && sale.settledAt) return sale.settlementMethod ? `Pago via ${normalizePayment(sale.settlementMethod)}` : "Fiado quitado";
      if (sale.paymentMethod === "Fiado") return "Fiado em aberto";
      return normalizePayment(sale.paymentMethod) || "-";
    };

    paymentReportKey = function paymentReportKey(sale) {
      if (sale.paymentMethod === "Fiado") return sale.settledAt ? (normalizePayment(sale.settlementMethod) || "Fiado quitado") : "Fiado em aberto";
      return normalizePayment(sale.paymentMethod) || "-";
    };
  }

  function patchSaleSuccess() {
    showSaleSuccess = function showSaleSuccess(sale) {
      modal(`<div class="sale-done"><h2>Venda concluída</h2><p>A venda foi registrada com sucesso.</p><strong>${money(sale.total)}</strong></div>`, "small");
      toast("Venda concluída");
      setTimeout(() => closeModal(), 1800);
    };
  }

  function patchLists() {
    listHouseDebtors = async function listHouseDebtors() {
      return (await all("house_debtors")).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    };
    const originalRefreshData = refreshData;
    refreshData = async function patchedRefreshData() {
      await originalRefreshData();
      state.products = state.products.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    };
  }

  function applyPatch() {
    if (window.__cantinaTufiFinalApplied) return true;
    if (typeof state === "undefined" || !state.db || typeof renderProductsTable !== "function" || typeof showSaleSuccess !== "function") return false;
    window.__cantinaTufiFinalApplied = true;
    patchLists();
    patchProductTable();
    patchPayment();
    patchSaleSuccess();
    normalizePaymentUi();
    seedDefaultData().then(async () => {
      if (["dashboard", "products", "sale", "fiados", "reports", "system"].includes(state.page)) await showPage(state.page);
    }).catch(error => console.warn("Não foi possível cadastrar os dados padrão.", error));
    const observer = new MutationObserver(() => normalizePaymentUi());
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (applyPatch()) clearInterval(timer);
    } catch (error) {
      console.warn("Ajustes finais ainda não aplicados.", error);
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
})();
