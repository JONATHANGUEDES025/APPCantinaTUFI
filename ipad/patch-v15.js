(function applyCantinaTufiV15Patch() {
  const css = `
    .profit-preview {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--soft);
      color: var(--brand);
      font-weight: 900;
      padding: 11px 12px;
    }
    .profit-preview.positive { color: var(--green); }
    .profit-preview.negative { color: var(--red); }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function numberFromInput(id) {
    const raw = document.getElementById(id)?.value || "";
    return Number(String(raw).replace(",", "."));
  }

  window.updateProductProfit = function updateProductProfit() {
    const preview = document.getElementById("pProfitPreview");
    if (!preview) return;
    const price = numberFromInput("pPrice");
    const cost = numberFromInput("pCost");
    if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0 || cost < 0) {
      preview.textContent = "Lucro: informe preco e custo.";
      preview.className = "profit-preview";
      return;
    }
    const profit = price - cost;
    const percent = cost > 0 ? (profit / cost) * 100 : 0;
    preview.textContent = cost > 0
      ? `Lucro: ${formatMoney(profit)} (${percent.toFixed(1).replace(".", ",")}% sobre o custo)`
      : `Lucro: ${formatMoney(profit)} (custo zerado)`;
    preview.className = `profit-preview ${profit >= 0 ? "positive" : "negative"}`;
  };

  function patchProductForm() {
    const minInput = document.getElementById("pMin");
    if (minInput) {
      minInput.value = "0";
      const minField = minInput.closest(".field");
      if (minField) minField.classList.add("hidden");
    }
    const price = document.getElementById("pPrice");
    const cost = document.getElementById("pCost");
    if (cost && !document.getElementById("pProfitPreview")) {
      const wrap = document.createElement("div");
      wrap.className = "field full";
      wrap.innerHTML = '<div id="pProfitPreview" class="profit-preview">Lucro: informe preco e custo.</div>';
      cost.closest(".field")?.after(wrap);
    }
    price?.addEventListener("input", window.updateProductProfit);
    cost?.addEventListener("input", window.updateProductProfit);
    window.updateProductProfit();
  }

  function normalizeProductsTable() {
    document.querySelector("#productStatus option[value='low']")?.remove();
    const table = document.getElementById("productsTable");
    table?.querySelectorAll("tbody tr").forEach(row => {
      const stockCell = row.children[3];
      if (stockCell) stockCell.textContent = stockCell.textContent.replace(/(\d+)\s+atual\s+\/\s+alerta\s+\d+/i, "$1 unidades");
    });
  }

  function applyPatch() {
    if (typeof state === "undefined" || typeof renderDashboard !== "function" || typeof openProductForm !== "function") return false;

    statusPill = function statusPill(product) {
      if (!product.active) return '<span class="pill warn">Inativo</span>';
      if (product.quantity <= 0) return '<span class="pill bad">Sem estoque</span>';
      return '<span class="pill ok">Ativo</span>';
    };

    const originalOpenProductForm = openProductForm;
    openProductForm = function patchedOpenProductForm(id = null) {
      originalOpenProductForm(id);
      setTimeout(patchProductForm, 0);
    };

    if (typeof renderProductsTable === "function") {
      const originalRenderProductsTable = renderProductsTable;
      renderProductsTable = function patchedRenderProductsTable() {
        originalRenderProductsTable();
        normalizeProductsTable();
      };
    }

    if (typeof renderProducts === "function") {
      const originalRenderProducts = renderProducts;
      renderProducts = async function patchedRenderProducts() {
        await originalRenderProducts();
        normalizeProductsTable();
      };
    }

    renderDashboard = async function patchedRenderDashboard() {
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
    };

    if (state.page === "dashboard") renderDashboard();
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (applyPatch()) clearInterval(timer);
    } catch (error) {
      console.warn("Patch v15 nao aplicado ainda", error);
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 8000);
})();
