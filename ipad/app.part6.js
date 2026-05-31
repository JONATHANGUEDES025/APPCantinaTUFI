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
      <div class="card"><h2>Formas de pagamento</h2>${table(["Forma", "Qtd", "Total"], paymentRows.map(row => `<tr><td>${esc(row.method)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`))}</div>
      <div class="card"><h2>Produtos mais vendidos</h2>${table(["Produto", "Qtd", "Total"], productRows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
    </section>
  `;
}

async function renderSystem() {
  const products = await all("products");
  const sales = await all("sales");
  const stock = await all("stock_movements");
  const houseDebtors = await all("house_debtors");
  main.innerHTML = title("Sistema", "Instalacao no iPad, backup e limpeza.", "") + `
    <section class="grid two">
      <div class="card">
        <h2>Instalar no iPad</h2>
        <div class="notice">
          <strong>Safari:</strong> toque no botao Compartilhar e escolha Adicionar a Tela de Inicio. Depois abra pelo icone Cantina TUFI.
          <br><br>
          Apos instalado, o app pode abrir offline. Os dados ficam salvos neste iPad.
        </div>
      </div>
      <div class="card">
        <h2>Dados neste aparelho</h2>
        <p>Produtos: <b>${products.length}</b><br>Vendas: <b>${sales.length}</b><br>Devedores da TUFI: <b>${houseDebtors.length}</b><br>Movimentos de estoque: <b>${stock.length}</b></p>
      </div>
    </section>
    <section class="grid two" style="margin-top:14px">
      <div class="card">
        <h2>Backup</h2>
        <p class="muted">Como os dados ficam neste iPad, exporte backup com frequencia.</p>
        <div class="backup-actions">
          <button class="primary" onclick="exportBackup()">Exportar backup</button>
          <label class="secondary file-input">Importar backup<input type="file" accept="application/json" onchange="importBackupFile(event)"></label>
        </div>
      </div>
      <div class="card">
        <h2>Zerar sistema</h2>
        <p class="muted">Use antes de entregar o app limpo. Exporte um backup antes de apagar.</p>
        <button class="danger" onclick="resetSystem()">Zerar tudo neste iPad</button>
      </div>
    </section>
  `;
}

async function exportBackup() {
  const data = {
    app: "Cantina TUFI iPad",
    version: 1,
    exportedAt: nowIso(),
    operator: state.operator,
    products: await all("products"),
    sales: await all("sales"),
    stock_movements: await all("stock_movements"),
    house_debtors: await all("house_debtors")
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-cantina-tufi-ipad-${today()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado");
}

function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.products) || !Array.isArray(data.sales)) throw new Error("Arquivo de backup invalido.");
      if (!confirm("Importar este backup? Os dados atuais deste iPad serao substituidos.")) return;
      for (const name of STORE_NAMES) await clearStore(name);
      for (const product of data.products) await putOne("products", product);
      for (const sale of data.sales) await putOne("sales", sale);
      for (const move of data.stock_movements || []) await putOne("stock_movements", move);
      for (const debtor of data.house_debtors || []) await putOne("house_debtors", debtor);
      if (data.operator) setOperator(data.operator);
      state.cart = [];
      toast("Backup importado");
      await showPage("dashboard");
    } catch (error) {
      alert(error.message || "Nao foi possivel importar o backup.");
    }
  };
  reader.readAsText(file);
}

async function resetSystem() {
  if (!confirm("Zerar todos os produtos, vendas, fiados e estoque deste iPad?")) return;
  const code = prompt("Digite ZERAR para confirmar:", "");
  if (String(code || "").trim().toUpperCase() !== "ZERAR") {
    alert("Operacao cancelada.");
    return;
  }
  for (const name of STORE_NAMES) await clearStore(name);
  state.cart = [];
  toast("Sistema zerado");
  await showPage("dashboard");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const protocol = window.location.protocol;
  if (protocol !== "https:" && protocol !== "http:") return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (_error) {
    // O app continua funcionando; apenas a instalacao offline pode ficar indisponivel.
  }
}

async function boot() {
  state.db = await openDatabase();
  bootNav();
  await registerServiceWorker();
  await showPage("dashboard");
  if (!state.operator) showOperatorModal(true);
}

boot().catch(error => {
  main.innerHTML = `<div class="card"><h2>Erro ao iniciar</h2><p>${esc(error.message || "Erro desconhecido.")}</p></div>`;
});
