      <button class="secondary" onclick="closeModal()">Fechar</button>
    </div>
  `);
}

async function renderSales() {
  const sales = (await all("sales")).sort((a, b) => new Date(b.date) - new Date(a.date));
  main.innerHTML = title("Vendas", "Historico salvo neste iPad.", `<button class="secondary" onclick="renderSales()">Atualizar</button>`) + `
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
    const searchMatch = !search || [sale.id, sale.customerName, sale.debtorName, sale.operatorName].join(" ").toLowerCase().includes(search);
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
  main.innerHTML = title("Fiados", "Compras em aberto somadas pelo mesmo devedor.", `<button class="primary" onclick="openHouseDebtorForm()">Novo devedor da TUFI</button><button class="secondary" onclick="renderFiados()">Atualizar</button>`) + `
    <section class="grid two">
      <div class="card"><h2>Em aberto</h2>${table(["Devedor", "Compras", "Total", ""], state.fiadoGroups.map((group, index) => `<tr><td>${esc(group.debtorName)}</td><td>${group.sales.length}</td><td>${money(group.total)}</td><td class="right"><button class="primary" onclick="fiadoGroupDetails(${index})">Detalhes</button><button class="success" onclick="settleFiadoGroup(${index})">Quitar tudo</button></td></tr>`))}</div>
      <div class="card"><h2>Devedores da TUFI</h2><p class="muted">Nomes fixos da casa para aparecerem no caixa quando vender fiado.</p>${table(["Nome", "Divida atual", ""], houseRows)}</div>
    </section>
    <section class="card" style="margin-top:14px"><h2>Quitados</h2>${table(["Data", "Devedor", "Total"], settled.slice(0, 12).map(sale => `<tr><td>${shortDate(sale.settledAt)}</td><td>${esc(sale.debtorName)}</td><td>${money(sale.total)}</td></tr>`))}</section>
  `;
}

async function openHouseDebtorForm(id = null) {
  const debtor = id ? await getOne("house_debtors", id) : null;
  modal(`
    <div class="modal-head">
      <h2>${id ? "Editar devedor da TUFI" : "Novo devedor da TUFI"}</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <p class="muted">Cadastre aqui os nomes fixos da casa. Eles aparecem no caixa quando a venda for fiada.</p>
    <div class="form-grid">
      <div class="field full"><label>Nome</label><input id="houseDebtorName" value="${esc(debtor?.name || "")}" placeholder="Ex.: Funcionario, Aluno, Cliente fixo"></div>
      <div class="field full"><label>Observacao</label><textarea id="houseDebtorNotes" placeholder="Opcional">${esc(debtor?.notes || "")}</textarea></div>
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
    const notes = cleanText(document.getElementById("houseDebtorNotes").value, 220);
    const now = nowIso();
    const debtor = {
      name,
      notes,
      createdAt: id ? (await getOne("house_debtors", id)).createdAt : now,
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

