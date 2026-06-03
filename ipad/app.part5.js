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
