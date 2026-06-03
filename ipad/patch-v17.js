(function applyCantinaTufiV17Patch() {
  const PIX_MAE_MAG = "Pix da Mãe Mag";

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

  const css = `
    .sale-done {
      display: grid;
      gap: 8px;
      text-align: center;
      padding: 18px 8px 14px;
    }
    .sale-done h2 {
      margin: 0;
      color: var(--green);
      font-size: 28px;
    }
    .sale-done p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
    }
    .sale-done strong {
      color: var(--brand);
      font-size: 26px;
    }
    .actions-cell {
      min-width: 270px;
      text-align: right;
      white-space: normal;
    }
    .actions-cell button {
      padding: 8px 10px;
      margin: 2px;
    }
    #productsTable table th:last-child {
      min-width: 270px;
      text-align: right;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function normalizeKey(value) {
    const clean = String(value || "").trim().replace(/\s+/g, " ");
    return clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function normalizePaymentMethod(method) {
    const key = normalizeKey(method);
    if (key.includes("pix da mae mag") || key.includes("pix da mae meg") || key.includes("pix mae mag")) {
      return PIX_MAE_MAG;
    }
    return method || "";
  }

  function normalizePaymentUi(root = document) {
    root.querySelectorAll(".pay-button").forEach(button => {
      if (normalizePaymentMethod(button.textContent) === PIX_MAE_MAG) {
        button.textContent = PIX_MAE_MAG;
        button.dataset.method = PIX_MAE_MAG;
        button.onclick = () => setPayment(PIX_MAE_MAG);
      }
    });
    root.querySelectorAll("option").forEach(option => {
      if (normalizePaymentMethod(option.textContent) === PIX_MAE_MAG) {
        option.textContent = PIX_MAE_MAG;
        option.value = PIX_MAE_MAG;
      }
    });
    const paymentInput = document.getElementById("paymentMethod");
    if (paymentInput) paymentInput.value = normalizePaymentMethod(paymentInput.value);
  }

  async function seedDefaultData(force = false) {
    if (window.__cantinaTufiV17SeedDone && !force) return;
    window.__cantinaTufiV17SeedDone = true;
    const now = nowIso();

    const debtors = await all("house_debtors");
    const debtorsByKey = new Map(debtors.map(item => [normalizeKey(item.name), item]));
    for (const name of HOUSE_DEBTOR_SEEDS) {
      const existing = debtorsByKey.get(normalizeKey(name));
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
    const productsByKey = new Map(products.map(item => [normalizeKey(item.name), item]));
    for (const item of PRODUCT_SEEDS) {
      const existing = productsByKey.get(normalizeKey(item.name));
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
    await refreshData();
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
      originalSetPayment(normalizePaymentMethod(method));
      normalizePaymentUi();
    };

    const originalRenderSale = renderSale;
    renderSale = async function patchedRenderSale() {
      await originalRenderSale();
      normalizePaymentUi();
    };

    paymentLabel = function paymentLabel(sale) {
      if (sale.paymentMethod === "Fiado" && sale.settledAt) {
        return sale.settlementMethod ? `Pago via ${normalizePaymentMethod(sale.settlementMethod)}` : "Fiado quitado";
      }
      if (sale.paymentMethod === "Fiado") return "Fiado em aberto";
      return normalizePaymentMethod(sale.paymentMethod) || "-";
    };

    paymentReportKey = function paymentReportKey(sale) {
      if (sale.paymentMethod === "Fiado") {
        return sale.settledAt ? (normalizePaymentMethod(sale.settlementMethod) || "Fiado quitado") : "Fiado em aberto";
      }
      return normalizePaymentMethod(sale.paymentMethod) || "-";
    };

    loadReport = async function patchedLoadReport() {
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
          <div class="card">
            <h3>Formas de pagamento</h3>
            ${table(["Forma", "Vendas", "Total"], paymentRows.map(row => `<tr><td>${esc(row.method)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`))}
          </div>
          <div class="card">
            <h3>Produtos vendidos</h3>
            ${table(["Produto", "Qtd", "Total"], productRows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}
          </div>
        </section>
      `;
    };
  }

  function patchSaleSuccess() {
    showSaleSuccess = function showSaleSuccess(sale) {
      modal(`
        <div class="sale-done">
          <h2>Venda concluída</h2>
          <p>A venda foi registrada com sucesso.</p>
          <strong>${money(sale.total)}</strong>
        </div>
      `, "small");
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

  function patchReset() {
    resetSystem = async function resetSystem() {
      if (!confirm("Zerar vendas, fiados e estoque deste iPad? Os produtos e devedores padrão voltam com quantidade zero.")) return;
      const code = prompt("Digite ZERAR para confirmar:", "");
      if (String(code || "").trim().toUpperCase() !== "ZERAR") {
        alert("Operação cancelada.");
        return;
      }
      for (const name of STORE_NAMES) await clearStore(name);
      state.cart = [];
      clearSaleDraft();
      window.__cantinaTufiV17SeedDone = false;
      await seedDefaultData(true);
      toast("Sistema zerado");
      await showPage("dashboard");
    };
  }

  function applyPatch() {
    if (window.__cantinaTufiV17Applied) return true;
    if (typeof state === "undefined" || !state.db || typeof renderProductsTable !== "function" || typeof showSaleSuccess !== "function") return false;
    window.__cantinaTufiV17Applied = true;

    patchLists();
    patchProductTable();
    patchPayment();
    patchSaleSuccess();
    patchReset();
    normalizePaymentUi();

    seedDefaultData().then(async () => {
      if (["dashboard", "products", "sale", "fiados", "reports"].includes(state.page)) {
        await showPage(state.page);
      }
    }).catch(error => console.warn("Não foi possível cadastrar dados padrão.", error));

    const observer = new MutationObserver(() => normalizePaymentUi());
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (applyPatch()) clearInterval(timer);
    } catch (error) {
      console.warn("Patch v17 ainda não aplicado.", error);
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 8000);
})();