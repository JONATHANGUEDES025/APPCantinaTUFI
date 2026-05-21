      <td>${money(sale.total)}</td>
      <td>${paymentPill(sale)}</td>
      <td>${esc(sale.customerName || sale.debtorName || "-")}</td>
      <td>${esc(sale.operatorName)}</td>
      <td>${sale.status === "ativa" ? `<span class="pill ok">Ativa</span>` : `<span class="pill bad">Cancelada</span>`}</td>
      <td class="right">
        <button class="primary" onclick="saleDetail(${sale.id})">Detalhes</button>
        ${sale.status === "ativa" ? `<button class="danger" onclick="cancelSale(${sale.id})">Cancelar</button>` : ""}
      </td>
    </tr>
  `);
  document.getElementById("salesTable").innerHTML = table(["ID", "Data", "Total", "Pagamento", "Cliente", "Operador", "Status", ""], rows);
}

async function saleDetail(id) {
  const sale = await getOne("sales", id);
  if (!sale) return;
  showReceipt(sale);
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
  main.innerHTML = title("Fiados", "Compras em aberto somadas pelo mesmo devedor.", `<button class="secondary" onclick="renderFiados()">Atualizar</button>`) + `
    <section class="grid two">
      <div class="card"><h2>Em aberto</h2>${table(["Devedor", "Compras", "Total", ""], state.fiadoGroups.map((group, index) => `<tr><td>${esc(group.debtorName)}</td><td>${group.sales.length}</td><td>${money(group.total)}</td><td class="right"><button class="primary" onclick="fiadoGroupDetails(${index})">Detalhes</button><button class="success" onclick="settleFiadoGroup(${index})">Quitar tudo</button></td></tr>`))}</div>
      <div class="card"><h2>Quitados</h2>${table(["Data", "Devedor", "Total"], settled.slice(0, 12).map(sale => `<tr><td>${shortDate(sale.settledAt)}</td><td>${esc(sale.debtorName)}</td><td>${money(sale.total)}</td></tr>`))}</div>
    </section>
  `;
}

function fiadoGroupDetails(index) {
  const group = state.fiadoGroups[index];
  if (!group) return;
  modal(`
    <div class="modal-head"><h2>Compras de ${esc(group.debtorName)}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p class="muted">${group.sales.length} compra(s) em aberto somadas para este devedor.</p>
    ${table(["Venda", "Data", "Total", "Observacao", ""], group.sales.map(sale => `<tr><td>#${sale.id}</td><td>${dateTime(sale.date)}</td><td>${money(sale.total)}</td><td>${esc(sale.notes || "-")}</td><td><button class="secondary" onclick="saleDetail(${sale.id})">Ver venda</button></td></tr>`))}
    <div class="total-box"><div class="line"><span>Total em aberto</span><strong>${money(group.total)}</strong></div></div>
    <div class="toolbar" style="margin-top:14px"><button class="success" onclick="settleFiadoGroup(${index})">Quitar tudo</button><button class="secondary" onclick="closeModal()">Fechar</button></div>
  `);
}

function settleFiadoGroup(index) {
  const group = state.fiadoGroups[index];
  if (!group) return;
  modal(`
    <div class="modal-head"><h2>Quitar fiados</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p>Sera quitado o total de <b>${money(group.total)}</b> em ${group.sales.length} compra(s) de <b>${esc(group.debtorName)}</b>.</p>
    <div class="field"><label>Forma de pagamento</label><select id="settleMethod"><option>Dinheiro</option><option>Pix</option><option>Debito</option><option>Credito</option></select></div>
    <div class="toolbar" style="margin-top:14px"><button class="success" onclick="saveSettlement(${index})">Salvar quitacao</button><button class="secondary" onclick="closeModal()">Cancelar</button></div>
  `, "small");
}

async function saveSettlement(index) {
  try {
    const group = state.fiadoGroups[index];
    if (!group) return;
    const method = document.getElementById("settleMethod").value;
    for (const sale of group.sales) {
      sale.settledAt = nowIso();
      sale.settlementMethod = method;
      await putOne("sales", sale);
    }
    closeModal();
    toast("Fiados quitados");
    await renderFiados();
  } catch (error) {
    alert(error.message);
  }
}

async function renderStock() {
  const movements = (await all("stock_movements")).sort((a, b) => b.id - a.id);
  main.innerHTML = title("Estoque", "Historico de entradas, retiradas e correcoes.", `<button class="primary" onclick="showPage('products')">Ajustar produto</button>`) + `
    <div class="card">
      ${table(["Data", "Produto", "Acao", "Qtd", "Antes", "Depois", "Operador", "Obs", ""], movements.map(move => `<tr><td>${dateTime(move.date)}</td><td>${esc(move.productName)}</td><td>${stockTypeName(move.type)}</td><td>${move.quantity}</td><td>${move.previousQuantity}</td><td>${move.newQuantity}</td><td>${esc(move.operatorName)}</td><td>${esc(move.notes || "-")}</td><td>${canUndoStock(move, movements) ? `<button class="danger" onclick="undoStock(${move.id})">Desfazer</button>` : "-"}</td></tr>`))}
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
  main.innerHTML = title("Relatorios", "Faturamento, lucro estimado e produtos vendidos.", `<button class="secondary" onclick="loadReport()">Atualizar</button>`) + `
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
  const discounts = sales.reduce((sum, sale) => sum + sale.discount, 0);
  const profit = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + ((item.unitPrice - item.productCost) * item.quantity), 0), 0);
  const payments = {};
  const products = {};
  sales.forEach(sale => {
    if (!payments[sale.paymentMethod]) payments[sale.paymentMethod] = { method: sale.paymentMethod, count: 0, total: 0 };
    payments[sale.paymentMethod].count += 1;
    payments[sale.paymentMethod].total += sale.total;
    sale.items.forEach(item => {
      if (!products[item.productName]) products[item.productName] = { name: item.productName, quantity: 0, total: 0 };
      products[item.productName].quantity += item.quantity;
      products[item.productName].total += item.subtotal;
    });
  });
  const paymentRows = Object.values(payments).sort((a, b) => b.total - a.total);
  const productRows = Object.values(products).sort((a, b) => b.quantity - a.quantity);
  document.getElementById("reportBox").innerHTML = `
    <section class="grid stats">
      <div class="card stat"><div class="label">Vendas</div><div class="value">${sales.length}</div><div class="sub">periodo</div></div>
      <div class="card stat"><div class="label">Faturamento</div><div class="value">${money(total)}</div><div class="sub">vendas ativas</div></div>
      <div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(profit)}</div><div class="sub">preco menos custo</div></div>
      <div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(sales.length ? total / sales.length : 0)}</div><div class="sub">por venda</div></div>
      <div class="card stat"><div class="label">Descontos</div><div class="value">${money(discounts)}</div><div class="sub">concedidos</div></div>
    </section>
    <section class="grid two" style="margin-top:14px">