      <div class="card"><h2>Formas de pagamento</h2>${table(["Forma", "Qtd", "Total"], paymentRows.map(row => `<tr><td>${esc(row.method)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`))}</div>
      <div class="card"><h2>Produtos mais vendidos</h2>${table(["Produto", "Qtd", "Total"], productRows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
    </section>
  `;
}

async function renderSystem() {
  const products = await all("products");
  const sales = await all("sales");
  const stock = await all("stock_movements");
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
        <p>Produtos: <b>${products.length}</b><br>Vendas: <b>${sales.length}</b><br>Movimentos de estoque: <b>${stock.length}</b></p>
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
    stock_movements: await all("stock_movements")
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
