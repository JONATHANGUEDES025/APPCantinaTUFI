(function applyCantinaTufiV23Fixes() {
  if (window.__cantinaTufiV23Applied) return;
  window.__cantinaTufiV23Applied = true;

  const FREE_PAYMENT_V23 = "Gratuidade";

  function dateKeyV23(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function saleDateKeyV23(value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return dateKeyV23(parsed);
    return String(value || "").slice(0, 10);
  }

  function isFreeSaleV23(saleOrMethod) {
    const method = typeof saleOrMethod === "string" ? saleOrMethod : saleOrMethod?.paymentMethod;
    return normalizePaymentMethod(method) === FREE_PAYMENT_V23;
  }

  function paymentFilterOptionsV23() {
    return ["Dinheiro", "Pix", PIX_MAE_MAG, "Debito", "Credito", FREE_PAYMENT_V23, "Fiado em aberto"];
  }

  today = function todayV23() {
    return dateKeyV23(new Date());
  };

  sameDate = function sameDateV23(value, date) {
    return saleDateKeyV23(value) === date;
  };

  const normalizePaymentMethodBaseV23 = normalizePaymentMethod;
  normalizePaymentMethod = function normalizePaymentMethodV23(method) {
    const key = debtorKey(method);
    if (key.includes("gratuidade") || key.includes("gratis") || key.includes("cortesia")) return FREE_PAYMENT_V23;
    return normalizePaymentMethodBaseV23(method);
  };

  paymentReportKey = function paymentReportKeyV23(sale) {
    if (sale.paymentMethod === "Fiado") return sale.settledAt ? (normalizePaymentMethod(sale.settlementMethod) || "Fiado quitado") : "Fiado em aberto";
    return normalizePaymentMethod(sale.paymentMethod) || "-";
  };

  function addFreePaymentButtonV23() {
    const methods = document.querySelector(".payment-methods");
    if (!methods || methods.querySelector(`[data-method="${FREE_PAYMENT_V23}"]`)) return;
    const button = document.createElement("button");
    button.className = "pay-button";
    button.dataset.method = FREE_PAYMENT_V23;
    button.type = "button";
    button.textContent = FREE_PAYMENT_V23;
    button.addEventListener("click", () => setPayment(FREE_PAYMENT_V23));
    const fiado = methods.querySelector('[data-method="Fiado"]');
    if (fiado) methods.insertBefore(button, fiado);
    else methods.appendChild(button);
  }

  const renderSaleBaseV23 = renderSale;
  renderSale = async function renderSaleV23() {
    await renderSaleBaseV23();
    addFreePaymentButtonV23();
    updateCheckout();
  };

  updateCheckout = function updateCheckoutV23() {
    const totals = document.getElementById("totals");
    if (!totals) return;
    const payment = document.getElementById("paymentMethod").value;
    document.getElementById("debtorWrap").classList.toggle("hidden", payment !== "Fiado");
    document.getElementById("receivedWrap").classList.toggle("hidden", payment !== "Dinheiro");
    document.getElementById("debtorCustomWrap")?.classList.toggle("hidden", payment !== "Fiado");
    if (payment === "Fiado") toggleDebtorName();
    document.querySelectorAll(".pay-button").forEach(button => button.classList.toggle("active", button.dataset.method === payment));
    const calc = cartTotals();
    const freeSale = isFreeSaleV23(payment);
    totals.innerHTML = `
      <div class="line"><span>Itens</span><b>${state.cart.reduce((sum, item) => sum + item.quantity, 0)}</b></div>
      <div class="line"><span>Subtotal</span><b>${money(calc.subtotal)}</b></div>
      ${freeSale ? `<div class="line"><span>Gratuidade</span><b>-${money(calc.subtotal)}</b></div>` : ""}
      <div class="summary-main"><div class="line"><span>Total</span><strong>${money(freeSale ? 0 : calc.total)}</strong></div></div>
    `;
    const change = document.getElementById("changeValue");
    if (change) change.textContent = money(freeSale ? 0 : calc.change);
    saveSaleDraft();
  };

  confirmSale = async function confirmSaleV23() {
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
      const financialTotal = isFreeSaleV23(paymentMethod) ? 0 : calc.total;

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
        total: financialTotal,
        discount: calc.discount,
        amountReceived: paymentMethod === "Dinheiro" ? (calc.received || financialTotal) : null,
        changeAmount: paymentMethod === "Dinheiro" ? Math.max(0, (calc.received || financialTotal) - financialTotal) : 0,
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
  };

  renderSales = async function renderSalesV23() {
    const sales = (await all("sales")).sort((a, b) => new Date(b.date) - new Date(a.date));
    main.innerHTML = title("Historico", "Vendas salvas neste aparelho. Use a data apenas quando quiser ver um dia especifico.", "") + `
      <div class="card">
        <div class="toolbar" style="margin-bottom:12px">
          <input id="saleFilter" placeholder="Buscar por cliente, operador ou numero">
          <input id="saleDate" type="date" title="Filtrar por um dia">
          <select id="salePayment"><option value="all">Todos pagamentos</option>${paymentFilterOptionsV23().map(method => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select>
          <select id="saleStatus"><option value="all">Todas</option><option value="ativa">Ativas</option><option value="cancelada">Canceladas</option></select>
          <button class="secondary" id="clearSaleDate" type="button">Todas as datas</button>
        </div>
        <p class="muted" id="salesFilterInfo" style="margin-top:-4px"></p>
        <div id="salesTable"></div>
      </div>
    `;
    document.getElementById("saleDate").value = "";
    document.getElementById("clearSaleDate").addEventListener("click", () => {
      document.getElementById("saleDate").value = "";
      renderSalesTable(sales);
    });
    ["saleFilter", "saleDate", "salePayment", "saleStatus"].forEach(id => document.getElementById(id).addEventListener("input", () => renderSalesTable(sales)));
    renderSalesTable(sales);
  };

  renderSalesTable = function renderSalesTableV23(sales) {
    const search = cleanText(document.getElementById("saleFilter").value, 120).toLowerCase();
    const selectedDate = document.getElementById("saleDate").value;
    const payment = document.getElementById("salePayment").value;
    const status = document.getElementById("saleStatus").value;
    const rows = sales.filter(sale => {
      const date = saleDateKeyV23(sale.date);
      const searchMatch = !search || [sale.id, sale.customerName, sale.debtorName, sale.operatorName, paymentLabel(sale)].join(" ").toLowerCase().includes(search);
      const paymentMatch = payment === "all" || paymentReportKey(sale) === payment;
      return searchMatch && paymentMatch && (!selectedDate || date === selectedDate) && (status === "all" || sale.status === status);
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
    const info = document.getElementById("salesFilterInfo");
    if (info) info.textContent = selectedDate ? `Mostrando vendas de ${shortDate(`${selectedDate}T12:00:00`)}.` : "Mostrando vendas de todas as datas.";
    document.getElementById("salesTable").innerHTML = table(["ID", "Data", "Total", "Pagamento", "Cliente", "Operador", "Status", ""], rows);
  };

  renderStock = async function renderStockV23() {
    const products = await all("products");
    const movements = (await all("stock_movements")).sort((a, b) => b.id - a.id);
    const activeProducts = products.filter(product => product.active !== false);
    const totalUnits = activeProducts.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    const stockedProducts = activeProducts.filter(product => Number(product.quantity || 0) > 0).length;
    const stockSaleValue = activeProducts.reduce((sum, product) => sum + Number(product.quantity || 0) * Number(product.price || 0), 0);
    const stockCostValue = activeProducts.reduce((sum, product) => sum + Number(product.quantity || 0) * Number(product.cost || 0), 0);
    main.innerHTML = title("Estoque", "Entradas, retiradas e correcoes.", `<button class="primary" onclick="showPage('products')">Ir para produtos</button>`) + `
      <section class="grid stats">
        <div class="card stat"><div class="label">Estoque total</div><div class="value">${totalUnits}</div><div class="sub">unidades ativas</div></div>
        <div class="card stat"><div class="label">Produtos com estoque</div><div class="value">${stockedProducts}</div><div class="sub">itens disponiveis</div></div>
        <div class="card stat"><div class="label">Valor em venda</div><div class="value">${money(stockSaleValue)}</div><div class="sub">estimativa do estoque</div></div>
        <div class="card stat"><div class="label">Custo do estoque</div><div class="value">${money(stockCostValue)}</div><div class="sub">custo estimado</div></div>
      </section>
      <div class="card">
        <h2>Movimentacoes de estoque</h2>
        ${table(["Data", "Produto", "Movimento", "Qtd", "Antes", "Depois", "Operador", "Obs", ""], movements.map(move => `<tr><td>${dateTime(move.date)}</td><td>${esc(move.productName)}</td><td>${stockTypeName(move.type)}</td><td>${move.quantity}</td><td>${move.previousQuantity}</td><td>${move.newQuantity}</td><td>${esc(move.operatorName)}</td><td>${esc(move.notes || "-")}</td><td>${canUndoStock(move, movements) ? `<button class="danger" onclick="undoStock(${move.id})">Desfazer</button>` : "-"}</td></tr>`))}
      </div>
    `;
  };

  renderReports = async function renderReportsV23() {
    main.innerHTML = title("Resumo", "Fechamento do dia selecionado, com filtro por pagamento.", "") + `
      <div class="toolbar" style="margin-bottom:14px">
        <input id="reportDate" type="date" value="${today()}" title="Dia do resumo">
        <select id="reportPayment"><option value="all">Todos pagamentos</option>${paymentFilterOptionsV23().map(method => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select>
      </div>
      <div id="reportBox"></div>
    `;
    document.getElementById("reportDate").addEventListener("input", loadReport);
    document.getElementById("reportPayment").addEventListener("input", loadReport);
    await loadReport();
  };

  loadReport = async function loadReportV23() {
    const selectedDate = document.getElementById("reportDate").value || today();
    const payment = document.getElementById("reportPayment").value;
    const sales = (await all("sales")).filter(sale => {
      const date = saleDateKeyV23(sale.date);
      const paymentMatch = payment === "all" || paymentReportKey(sale) === payment;
      return sale.status === "ativa" && paymentMatch && date === selectedDate;
    });
    const total = sales.reduce((sum, sale) => sum + sale.total, 0);
    const paidSales = sales.filter(sale => !isFreeSaleV23(sale));
    const profit = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => {
      const unitRevenue = isFreeSaleV23(sale) ? 0 : item.unitPrice;
      return itemSum + ((unitRevenue - item.productCost) * item.quantity);
    }, 0), 0);
    const payments = {};
    const products = {};
    const paymentOrder = paymentFilterOptionsV23();
    sales.forEach(sale => {
      const method = paymentReportKey(sale);
      if (!payments[method]) payments[method] = { method, count: 0, total: 0 };
      payments[method].count += 1;
      payments[method].total += sale.total;
      sale.items.forEach(item => {
        if (!products[item.productName]) products[item.productName] = { name: item.productName, quantity: 0, total: 0 };
        products[item.productName].quantity += item.quantity;
        products[item.productName].total += isFreeSaleV23(sale) ? 0 : item.subtotal;
      });
    });
    const paymentRows = paymentOrder.map(method => payments[method] || { method, count: 0, total: 0 })
      .concat(Object.values(payments).filter(row => !paymentOrder.includes(row.method)).sort((a, b) => b.total - a.total));
    const productRows = Object.values(products).sort((a, b) => b.quantity - a.quantity);
    document.getElementById("reportBox").innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h2>Resumo de ${shortDate(`${selectedDate}T12:00:00`)}</h2>
        <p class="muted">Somente vendas ativas deste dia. Gratuidade baixa o estoque, mas entra com valor financeiro zerado.</p>
      </div>
      <section class="grid stats">
        <div class="card stat"><div class="label">Vendas</div><div class="value">${sales.length}</div><div class="sub">dia selecionado</div></div>
        <div class="card stat"><div class="label">Faturamento</div><div class="value">${money(total)}</div><div class="sub">vendas ativas</div></div>
        <div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(profit)}</div><div class="sub">preco menos custo</div></div>
        <div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(paidSales.length ? total / paidSales.length : 0)}</div><div class="sub">vendas pagas</div></div>
      </section>
      <section class="grid two" style="margin-top:14px">
        <div class="card"><h2>Formas de pagamento</h2>${table(["Forma", "Vendas", "Total"], paymentRows.map(row => `<tr><td>${esc(row.method)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`))}</div>
        <div class="card"><h2>Produtos mais vendidos</h2>${table(["Produto", "Qtd", "Total"], productRows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
      </section>
    `;
  };

  function refreshVisiblePageV23() {
    if (!state?.db) return false;
    showPage(state.page || "dashboard").catch(error => console.error(error));
    return true;
  }

  setTimeout(() => refreshVisiblePageV23(), 300);
  setTimeout(() => refreshVisiblePageV23(), 1200);
})();
