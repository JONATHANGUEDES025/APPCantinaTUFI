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
    .product-card.out-of-stock{opacity:.68;cursor:not-allowed}.product-card.out-of-stock .prod-add{background:#9aa8b2}
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
    if (window.__cantinaTufiFinalSeedPromise) return window.__cantinaTufiFinalSeedPromise;
    window.__cantinaTufiFinalSeedPromise = (async () => {
      const now = nowIso();
      const debtors = await all("house_debtors");
      const debtorsByKey = new Map(debtors.map(debtor => [key(debtor.name), debtor]));
      for (const name of HOUSE_DEBTOR_SEEDS) {
        const currentKey = key(name);
        const existing = debtorsByKey.get(currentKey);
        if (existing) {
          if (existing.name !== name) {
            existing.name = name;
            existing.updatedAt = now;
            await putOne("house_debtors", existing);
          }
        } else {
          const debtor = { name, notes: "", createdAt: now, updatedAt: now };
          debtor.id = await putOne("house_debtors", debtor);
          debtorsByKey.set(currentKey, debtor);
        }
      }

      const products = await all("products");
      const productsByKey = new Map(products.map(product => [key(product.name), product]));
      for (const item of PRODUCT_SEEDS) {
        const currentKey = key(item.name);
        const existing = productsByKey.get(currentKey);
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
          const product = { name: item.name, category: item.category, price: item.price, cost: item.cost, unit: "Unidade", minStock: 0, quantity: 0, active: true, createdAt: now, updatedAt: now };
          product.id = await putOne("products", product);
          productsByKey.set(currentKey, product);
        }
      }
      await refreshData();
      window.__cantinaTufiFinalSeedDone = true;
      window.__cantinaTufiSeedReport = { products: PRODUCT_SEEDS.length, debtors: HOUSE_DEBTOR_SEEDS.length };
    })();
    try {
      await window.__cantinaTufiFinalSeedPromise;
    } catch (error) {
      window.__cantinaTufiFinalSeedPromise = null;
      throw error;
    }
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

  function patchCatalog() {
    renderCatalog = function patchedRenderCatalog() {
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
      `).join("") || `<div class="empty">Nenhum produto cadastrado.</div>`;
    };
  }

  function patchFiadosPage() {
    renderFiados = async function renderFiados() {
      const sales = (await all("sales")).filter(sale => sale.paymentMethod === "Fiado" && sale.status === "ativa");
      const houseDebtors = await listHouseDebtors();
      const groups = new Map();
      sales.filter(sale => !sale.settledAt).forEach(sale => {
        const currentKey = debtorKey(sale.debtorName);
        if (!groups.has(currentKey)) groups.set(currentKey, { debtorName: sale.debtorName, sales: [], total: 0 });
        const group = groups.get(currentKey);
        group.sales.push(sale);
        group.total += sale.total;
      });
      state.fiadoGroups = [...groups.values()].sort((a, b) => a.debtorName.localeCompare(b.debtorName, "pt-BR", { sensitivity: "base" }));
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
        <section class="card" style="margin-top:14px"><h2>Pagamentos quitados</h2>${table(["Data", "Cliente", "Forma", "Total"], settled.slice(0, 12).map(sale => `<tr><td>${shortDate(sale.settledAt)}</td><td>${esc(sale.debtorName)}</td><td>${esc(normalizePayment(sale.settlementMethod) || "-")}</td><td>${money(sale.total)}</td></tr>`))}</section>
      `;
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
    patchCatalog();
    patchFiadosPage();
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
