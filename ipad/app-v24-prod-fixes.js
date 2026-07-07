(function applyCantinaTufiV24ProductionFixes() {
  if (window.__cantinaTufiV24ProductionFixes) return;
  window.__cantinaTufiV24ProductionFixes = true;

  function dateKeyV24(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function saleDateKeyV24(value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return dateKeyV24(parsed);
    return String(value || "").slice(0, 10);
  }

  function freePaymentNameV24() {
    return typeof GRATUIDADE !== "undefined" ? GRATUIDADE : "Gratuidade";
  }

  function pixMaeMagNameV24() {
    return typeof PIX_MAE_MAG !== "undefined" ? PIX_MAE_MAG : "Pix da Mae Mag";
  }

  function isFreeSaleV24(saleOrMethod) {
    const method = typeof saleOrMethod === "string" ? saleOrMethod : saleOrMethod?.paymentMethod;
    return normalizePaymentMethod(method) === freePaymentNameV24();
  }

  function paymentFilterOptionsV24() {
    return ["Dinheiro", "Pix", pixMaeMagNameV24(), "Debito", "Credito", freePaymentNameV24(), "Fiado em aberto"];
  }

  function saleItemsTotalV24(items) {
    return (items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  }

  function recalcSaleTotalsV24(sale) {
    const grossTotal = saleItemsTotalV24(sale.items);
    sale.grossTotal = grossTotal;
    sale.discount = Number(sale.discount || 0);
    sale.total = isFreeSaleV24(sale) ? 0 : Math.max(0, grossTotal - sale.discount);
    if (sale.paymentMethod !== "Dinheiro") {
      sale.amountReceived = null;
      sale.changeAmount = 0;
    }
    return sale;
  }

  function saleStatusTextV24(sale) {
    if (sale.status === "cancelada") return "Cancelada";
    if (sale.editedAt) return "Ativa / editada";
    return "Ativa";
  }

  function saleStatusPillV24(sale) {
    if (sale.status === "cancelada") return `<span class="pill bad">Cancelada</span>`;
    if (sale.editedAt) return `<span class="pill warn">Ativa / editada</span>`;
    return `<span class="pill ok">Ativa</span>`;
  }

  today = function todayV24() {
    return dateKeyV24(new Date());
  };

  sameDate = function sameDateV24(value, date) {
    return saleDateKeyV24(value) === date;
  };

  seedDefaultData = async function seedDefaultDataV24() {
    const now = nowIso();
    const debtors = await all("house_debtors");
    const debtorsByKey = new Map(debtors.map(debtor => [debtorKey(debtor.name), debtor]));
    for (const name of HOUSE_DEBTOR_SEEDS) {
      if (!debtorsByKey.get(debtorKey(name))) {
        await putOne("house_debtors", { name, notes: "", createdAt: now, updatedAt: now });
      }
    }

    const products = await all("products");
    const productsByKey = new Map(products.map(product => [debtorKey(product.name), product]));
    for (const item of PRODUCT_SEEDS) {
      const existing = productsByKey.get(debtorKey(item.name));
      if (existing) {
        existing.unit = existing.unit || "Unidade";
        existing.minStock = Number.isFinite(Number(existing.minStock)) ? Number(existing.minStock) : 0;
        existing.quantity = Number.isFinite(Number(existing.quantity)) ? Number(existing.quantity) : 0;
        existing.active = existing.active !== false;
        existing.createdAt = existing.createdAt || now;
        existing.updatedAt = existing.updatedAt || now;
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
  };

  saveProduct = async function saveProductV24(id = null) {
    try {
      const name = cleanText(document.getElementById("pName").value, 100);
      const categorySelect = document.getElementById("pCategorySelect").value;
      const category = cleanText(categorySelect === "__custom__" ? document.getElementById("pCategoryCustom").value : categorySelect, 70);
      if (!name || !category) throw new Error("Preencha nome e categoria.");

      const existingProduct = id ? await getOne("products", id) : null;
      const duplicate = (await all("products")).some(product => product.id !== id && debtorKey(product.name) === debtorKey(name));
      if (duplicate) throw new Error("Ja existe outro produto com esse nome. Edite o produto existente para evitar duplicidade.");

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
        createdAt: existingProduct?.createdAt || now,
        updatedAt: now
      };
      if (id) product.id = id;

      await putOne("products", product);
      if (id && existingProduct && Number(existingProduct.quantity || 0) !== product.quantity) {
        await addOne("stock_movements", {
          productId: product.id,
          productName: product.name,
          date: now,
          type: "ajuste",
          quantity: product.quantity,
          previousQuantity: Number(existingProduct.quantity || 0),
          newQuantity: product.quantity,
          notes: "Saldo corrigido no cadastro do produto",
          operatorName: state.operator || "Operador"
        });
      }

      closeModal();
      toast("Produto salvo");
      await renderProducts();
    } catch (error) {
      alert(error.message);
    }
  };

  showReceipt = function showReceiptV24(sale, backIndex = null) {
    const backButton = backIndex === null ? "" : `<button class="secondary" onclick="fiadoGroupDetails(${backIndex})">Voltar</button>`;
    const editButton = sale.status === "ativa" && sale.paymentMethod === "Fiado" && !sale.settledAt
      ? `<button class="primary" onclick="openEditFiadoSale(${sale.id}, ${backIndex === null ? "null" : backIndex})">Editar fiado</button>`
      : "";
    const cancelButton = sale.status === "ativa" ? `<button class="danger" onclick="cancelSale(${sale.id})">Cancelar venda</button>` : "";
    const auditInfo = `
      ${sale.editedAt ? `<br><b>Editada em:</b> ${dateTime(sale.editedAt)}<br><b>Motivo da edicao:</b> ${esc(sale.editReason || "-")}` : ""}
      ${sale.status === "cancelada" ? `<br><b>Cancelada em:</b> ${dateTime(sale.canceledAt)}<br><b>Motivo do cancelamento:</b> ${esc(sale.cancelReason || "-")}` : ""}
    `;
    modal(`
      <div class="receipt">
        <div class="modal-head"><h2>Venda #${sale.id}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
        <p><b>Data:</b> ${dateTime(sale.date)}<br><b>Operador:</b> ${esc(sale.operatorName)}<br><b>Pagamento:</b> ${esc(paymentLabel(sale))}<br><b>Status:</b> ${esc(saleStatusTextV24(sale))}<br><b>Cliente:</b> ${esc(sale.customerName || sale.debtorName || "-")}${auditInfo}</p>
        ${table(["Produto", "Qtd", "Unitario", "Subtotal"], sale.items.map(item => `<tr><td>${esc(item.productName)}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.subtotal)}</td></tr>`))}
        <div class="total-box">
          <div class="line"><span>Total</span><strong>${money(sale.total)}</strong></div>
          <div class="line"><span>Troco</span><b>${money(sale.changeAmount)}</b></div>
        </div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        ${backButton}
        ${editButton}
        ${cancelButton}
        <button class="secondary" onclick="closeModal()">Fechar</button>
      </div>
    `);
  };

  cancelSale = async function cancelSaleV24(id) {
    try {
      if (!requireOperator()) return;
      if (!confirm("Cancelar esta venda? O estoque sera devolvido.")) return;
      const reasonInput = prompt("Motivo do cancelamento:", "Correcao operacional");
      if (reasonInput === null) return;
      const reason = cleanText(reasonInput || "Correcao operacional", 240);
      const sale = await getOne("sales", id);
      if (!sale || sale.status === "cancelada") throw new Error("Venda nao encontrada ou ja cancelada.");

      const now = nowIso();
      for (const item of sale.items) {
        const product = await getOne("products", item.productId);
        if (!product) continue;
        const previous = Number(product.quantity || 0);
        product.quantity = previous + Number(item.quantity || 0);
        product.updatedAt = now;
        await putOne("products", product);
        await addOne("stock_movements", {
          productId: product.id,
          productName: product.name,
          date: now,
          type: "cancelamento",
          quantity: Number(item.quantity || 0),
          previousQuantity: previous,
          newQuantity: product.quantity,
          notes: `Cancelamento da venda #${sale.id}: ${reason}`,
          operatorName: state.operator
        });
      }

      sale.status = "cancelada";
      sale.canceledAt = now;
      sale.cancelReason = reason;
      sale.cancelOperatorName = state.operator;
      await putOne("sales", sale);
      toast("Venda cancelada");
      closeModal();
      if (state.page === "fiados") await renderFiados();
      else await renderSales();
    } catch (error) {
      alert(error.message);
    }
  };

  renderSales = async function renderSalesV24() {
    const sales = (await all("sales")).sort((a, b) => new Date(b.date) - new Date(a.date));
    main.innerHTML = title("Historico", "Vendas salvas neste aparelho. Use a data apenas quando quiser ver um dia especifico.", "") + `
      <div class="card">
        <div class="toolbar" style="margin-bottom:12px">
          <input id="saleFilter" placeholder="Buscar por cliente, operador ou numero">
          <input id="saleDate" type="date" title="Filtrar por um dia">
          <select id="salePayment"><option value="all">Todos pagamentos</option>${paymentFilterOptionsV24().map(method => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select>
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

  renderSalesTable = function renderSalesTableV24(sales) {
    const search = cleanText(document.getElementById("saleFilter").value, 120).toLowerCase();
    const selectedDate = document.getElementById("saleDate").value;
    const payment = document.getElementById("salePayment").value;
    const status = document.getElementById("saleStatus").value;
    const rows = sales.filter(sale => {
      const date = saleDateKeyV24(sale.date);
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
        <td>${saleStatusPillV24(sale)}</td>
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

  stockTypeName = function stockTypeNameV24(type) {
    return { entrada: "Adicionado", saida: "Retirado", ajuste: "Saldo corrigido", cancelamento: "Cancelamento", correcao_venda: "Correcao de venda" }[type] || type;
  };

  function saleItemsSummaryV24(sale) {
    return sale.items.map(item => `${item.quantity}x ${esc(item.productName)} - ${money(item.subtotal)}`).join("<br>");
  }

  fiadoGroupDetails = function fiadoGroupDetailsV24(index) {
    const group = state.fiadoGroups[index];
    if (!group) return;
    const rows = group.sales.map(sale => `
      <tr>
        <td><input class="fiado-sale-check" type="checkbox" value="${sale.id}"></td>
        <td>#${sale.id}</td>
        <td>${dateTime(sale.date)}</td>
        <td>${saleItemsSummaryV24(sale)}</td>
        <td>${money(sale.total)}</td>
        <td>${esc(sale.notes || "-")}</td>
        <td class="right">
          <button class="secondary" onclick="saleDetail(${sale.id}, ${index})">Ver</button>
          <button class="primary" onclick="openEditFiadoSale(${sale.id}, ${index})">Editar</button>
          <button class="danger" onclick="cancelSale(${sale.id})">Cancelar</button>
        </td>
      </tr>
    `);
    modal(`
      <div class="modal-head"><h2>Compras de ${esc(group.debtorName)}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
      <p class="muted">Marque as compras que o cliente vai pagar agora, ou corrija uma compra lancada errada.</p>
      ${table(["Marcar", "Venda", "Data", "Produtos", "Total", "Obs.", ""], rows)}
      <div class="total-box"><div class="line"><span>Total em aberto</span><strong>${money(group.total)}</strong></div></div>
      <div class="field" style="margin-top:14px"><label>Forma de pagamento</label><select id="selectedSettleMethod">${SETTLEMENT_METHODS.map(method => `<option>${esc(method)}</option>`).join("")}</select></div>
      <div class="toolbar" style="margin-top:14px">
        <button class="success" onclick="settleSelectedFiados(${index})">Quitar marcadas</button>
        <button class="success" onclick="settleFiadoGroup(${index})">Quitar todas</button>
        <button class="secondary" onclick="closeModal()">Fechar</button>
      </div>
    `);
  };

  openEditFiadoSale = async function openEditFiadoSaleV24(saleId, backIndex = null) {
    const sale = await getOne("sales", saleId);
    if (!sale) return alert("Venda nao encontrada.");
    if (sale.status === "cancelada") return alert("Venda cancelada nao pode ser editada.");
    if (sale.paymentMethod !== "Fiado") return alert("A edicao operacional esta liberada somente para vendas fiadas.");
    if (sale.settledAt) return alert("Esta divida ja foi quitada. Cancele e lance novamente somente se for indispensavel.");

    const rows = sale.items.map((item, index) => `
      <tr>
        <td>${esc(item.productName)}</td>
        <td>${money(item.unitPrice)}</td>
        <td>${item.quantity}</td>
        <td><input id="editQty${index}" inputmode="numeric" value="${item.quantity}" style="max-width:90px"></td>
        <td>${money(item.subtotal)}</td>
      </tr>
    `);
    modal(`
      <div class="modal-head">
        <h2>Corrigir venda fiada #${sale.id}</h2>
        <button class="ghost" onclick="closeModal()">Fechar</button>
      </div>
      <p class="muted">Altere a quantidade. Use 0 para remover um item. O estoque sera ajustado automaticamente.</p>
      ${table(["Produto", "Valor un.", "Qtd atual", "Qtd correta", "Subtotal atual"], rows)}
      <div class="field full" style="margin-top:14px">
        <label>Motivo da correcao</label>
        <textarea id="editSaleReason" placeholder="Ex.: produto lancado errado, quantidade corrigida">Correcao operacional</textarea>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="primary" onclick="saveEditFiadoSale(${sale.id}, ${backIndex === null ? "null" : backIndex})">Salvar correcao</button>
        <button class="secondary" onclick="${backIndex === null ? "closeModal()" : `fiadoGroupDetails(${backIndex})`}">Voltar</button>
      </div>
    `);
  };

  saveEditFiadoSale = async function saveEditFiadoSaleV24(saleId, backIndex = null) {
    try {
      if (!requireOperator()) return;
      const sale = await getOne("sales", saleId);
      if (!sale) throw new Error("Venda nao encontrada.");
      if (sale.status === "cancelada") throw new Error("Venda cancelada nao pode ser editada.");
      if (sale.paymentMethod !== "Fiado") throw new Error("Somente vendas fiadas podem ser corrigidas por aqui.");
      if (sale.settledAt) throw new Error("Venda fiada quitada nao pode ser editada.");

      const reason = cleanText(document.getElementById("editSaleReason")?.value || "Correcao operacional", 240);
      const previousItems = sale.items.map(item => ({ ...item }));
      const previousTotal = sale.total;
      const updates = [];
      const nextItems = [];

      for (let index = 0; index < sale.items.length; index += 1) {
        const item = sale.items[index];
        const nextQty = intValue(document.getElementById(`editQty${index}`).value || "0", "Quantidade correta", 0);
        if (nextQty === item.quantity) {
          if (nextQty > 0) nextItems.push({ ...item });
          continue;
        }
        const product = await getOne("products", item.productId);
        if (!product) throw new Error(`Produto nao encontrado para ajustar estoque: ${item.productName}`);
        const quantityDiff = Number(item.quantity || 0) - nextQty;
        if (quantityDiff < 0 && Number(product.quantity || 0) < Math.abs(quantityDiff)) {
          throw new Error(`Estoque insuficiente para aumentar quantidade de ${item.productName}.`);
        }
        updates.push({ product, item, nextQty, quantityDiff });
        if (nextQty > 0) nextItems.push({ ...item, quantity: nextQty, subtotal: Number(item.unitPrice || 0) * nextQty });
      }

      if (!updates.length) throw new Error("Nenhuma quantidade foi alterada.");
      if (!nextItems.length) throw new Error("Para remover todos os itens, use Cancelar venda.");

      const now = nowIso();
      for (const update of updates) {
        const previousQuantity = Number(update.product.quantity || 0);
        update.product.quantity = previousQuantity + update.quantityDiff;
        update.product.updatedAt = now;
        await putOne("products", update.product);
        await addOne("stock_movements", {
          productId: update.product.id,
          productName: update.product.name,
          date: now,
          type: "correcao_venda",
          quantity: Math.abs(update.quantityDiff),
          previousQuantity,
          newQuantity: update.product.quantity,
          notes: `Correcao da venda fiada #${sale.id}: ${reason}`,
          operatorName: state.operator
        });
      }

      sale.items = nextItems;
      recalcSaleTotalsV24(sale);
      sale.editedAt = now;
      sale.editReason = reason;
      sale.editOperatorName = state.operator;
      sale.editHistory = [
        ...(sale.editHistory || []),
        {
          editedAt: now,
          operatorName: state.operator,
          reason,
          previousTotal,
          newTotal: sale.total,
          previousItems,
          newItems: nextItems.map(item => ({ ...item }))
        }
      ];
      await putOne("sales", sale);
      await refreshData();
      toast("Venda fiada corrigida");
      closeModal();
      if (state.page === "fiados") await renderFiados();
      else await renderSales();
    } catch (error) {
      alert(error.message);
    }
  };

  renderReports = async function renderReportsV24() {
    main.innerHTML = title("Resumo", "Fechamento do dia selecionado, com filtro por pagamento.", "") + `
      <div class="toolbar" style="margin-bottom:14px">
        <input id="reportDate" type="date" value="${today()}" title="Dia do resumo">
        <select id="reportPayment"><option value="all">Todos pagamentos</option>${paymentFilterOptionsV24().map(method => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select>
      </div>
      <p class="muted" style="margin-top:-6px">O resumo considera somente vendas ativas do dia escolhido. Vendas canceladas ficam no historico, mas nao entram no faturamento.</p>
      <div id="reportBox"></div>
    `;
    document.getElementById("reportDate").addEventListener("input", loadReport);
    document.getElementById("reportPayment").addEventListener("input", loadReport);
    await loadReport();
  };

  loadReport = async function loadReportV24() {
    const selectedDate = document.getElementById("reportDate").value || today();
    const payment = document.getElementById("reportPayment").value;
    const sales = (await all("sales")).filter(sale => {
      const date = saleDateKeyV24(sale.date);
      const paymentMatch = payment === "all" || paymentReportKey(sale) === payment;
      return sale.status === "ativa" && paymentMatch && date === selectedDate;
    });
    const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const paidSales = sales.filter(sale => !isFreeSaleV24(sale));
    const profit = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => {
      const unitRevenue = isFreeSaleV24(sale) ? 0 : Number(item.unitPrice || 0);
      return itemSum + ((unitRevenue - Number(item.productCost || 0)) * Number(item.quantity || 0));
    }, 0), 0);
    const payments = {};
    const products = {};
    const paymentOrder = paymentFilterOptionsV24();
    sales.forEach(sale => {
      const method = paymentReportKey(sale);
      if (!payments[method]) payments[method] = { method, count: 0, total: 0 };
      payments[method].count += 1;
      payments[method].total += Number(sale.total || 0);
      sale.items.forEach(item => {
        if (!products[item.productName]) products[item.productName] = { name: item.productName, quantity: 0, total: 0 };
        products[item.productName].quantity += Number(item.quantity || 0);
        products[item.productName].total += isFreeSaleV24(sale) ? 0 : Number(item.subtotal || 0);
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

  function refreshVisiblePageV24() {
    if (!state?.db) return false;
    showPage(state.page || "dashboard").catch(error => console.error(error));
    return true;
  }

  setTimeout(() => refreshVisiblePageV24(), 400);
  setTimeout(() => refreshVisiblePageV24(), 1400);
})();
