  const saleOperator = document.getElementById("saleOperator");
  if (saleOperator) saleOperator.value = clean;
  return true;
}

function showOperatorModal(required = false) {
  modal(`
    <div class="modal-head">
      <h2>Operador</h2>
      ${required ? "" : `<button class="ghost" onclick="closeModal()">Fechar</button>`}
    </div>
    <p class="muted">Informe quem esta usando o caixa. Esse nome fica gravado em vendas e movimentacoes de estoque.</p>
    <div class="field">
      <label>Nome do operador</label>
      <input id="operatorName" value="${esc(state.operator)}" placeholder="Ex.: Jonathan">
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveOperator()">Salvar operador</button>
      ${required ? "" : `<button class="secondary" onclick="closeModal()">Cancelar</button>`}
    </div>
  `, "small");
  setTimeout(() => document.getElementById("operatorName")?.focus(), 30);
}

function saveOperator() {
  if (setOperator(document.getElementById("operatorName").value)) {
    closeModal();
    toast("Operador definido");
  }
}

function requireOperator() {
  if (state.operator) return true;
  showOperatorModal(true);
  return false;
}

function bootNav() {
  nav.innerHTML = pages.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join("");
  mobileNav.innerHTML = pages.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  mobileNav.addEventListener("change", () => showPage(mobileNav.value));
  operatorButton.addEventListener("click", () => showOperatorModal(false));
  operatorButton.textContent = state.operator || "Definir operador";
}

function activate(page) {
  state.page = page;
  mobileNav.value = page;
  nav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
}

async function showPage(page) {
  try {
    activate(page);
    if (page === "dashboard") await renderDashboard();
    if (page === "sale") await renderSale();
    if (page === "products") await renderProducts();
    if (page === "sales") await renderSales();
    if (page === "fiados") await renderFiados();
    if (page === "stock") await renderStock();
    if (page === "reports") await renderReports();
    if (page === "system") await renderSystem();
  } catch (error) {
    alert(error.message || "Erro ao carregar tela.");
  }
}

async function renderDashboard() {
  await refreshData();
  const sales = await all("sales");
  const todayText = today();
  const activeToday = sales.filter(sale => sale.status === "ativa" && sameDate(sale.date, todayText));
  const salesTotal = activeToday.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const profit = activeToday.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + ((item.unitPrice - item.productCost) * item.quantity), 0), 0);
  const openFiados = sales.filter(sale => sale.status === "ativa" && sale.paymentMethod === "Fiado" && !sale.settledAt);
  const openDebtors = new Set(openFiados.map(sale => debtorKey(sale.debtorName)));
  const lowProducts = state.products.filter(product => product.active && product.quantity <= product.minStock);
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

  main.innerHTML = title("Dashboard", "Resumo da operacao salva neste iPad.", `
    <button class="primary" onclick="showPage('sale')">Nova venda</button>
    <button class="secondary" onclick="showPage('products')">Produto</button>
  `) + `
    <section class="grid stats">
      <div class="card stat"><div class="label">Vendas hoje</div><div class="value">${activeToday.length}</div><div class="sub">${money(salesTotal)}</div></div>
      <div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(activeToday.length ? salesTotal / activeToday.length : 0)}</div><div class="sub">por venda ativa</div></div>
      <div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(profit)}</div><div class="sub">baseado no custo</div></div>
      <div class="card stat"><div class="label">Fiados abertos</div><div class="value">${openDebtors.size}</div><div class="sub">${money(openFiados.reduce((sum, sale) => sum + sale.total, 0))}</div></div>
      <div class="card stat"><div class="label">Alertas estoque</div><div class="value">${lowProducts.length}</div><div class="sub">${outStock.length} sem estoque</div></div>
    </section>
    <section class="grid two" style="margin-top:14px">
      <div class="card"><h2>Produtos que precisam de atencao</h2>${table(["Produto", "Categoria", "Qtd", "Min"], lowProducts.slice(0, 8).map(product => `<tr><td>${esc(product.name)}</td><td>${esc(product.category)}</td><td>${product.quantity}</td><td>${product.minStock}</td></tr>`))}</div>
      <div class="card"><h2>Mais vendidos hoje</h2>${table(["Produto", "Qtd", "Total"], topProducts.slice(0, 8).map(row => `<tr><td>${esc(row.name)}</td><td>${row.quantity}</td><td>${money(row.total)}</td></tr>`))}</div>
    </section>
  `;
}

async function renderProducts() {
  await refreshData();
  main.innerHTML = title("Produtos", "Cadastro, preco e estoque dos itens vendidos.", `
    <button class="primary" onclick="openProductForm()">Novo produto</button>
  `) + `
    <div class="card">
      <div class="toolbar" style="margin-bottom:12px">
        <input id="productSearch" placeholder="Buscar produto">
        <select id="productStatus">
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="low">Estoque baixo</option>
          <option value="out">Sem estoque</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>
      <div id="productsTable"></div>
    </div>
  `;
  document.getElementById("productSearch").addEventListener("input", renderProductsTable);
  document.getElementById("productStatus").addEventListener("change", renderProductsTable);
  renderProductsTable();
}

function productListFiltered() {
  const search = cleanText(document.getElementById("productSearch")?.value || "", 120).toLowerCase();
  const status = document.getElementById("productStatus")?.value || "all";
  return state.products.filter(product => {
    const textMatch = !search || product.name.toLowerCase().includes(search) || product.category.toLowerCase().includes(search);
    const statusMatch =
      status === "all" ||
      (status === "active" && product.active) ||
      (status === "inactive" && !product.active) ||
      (status === "low" && product.active && product.quantity <= product.minStock) ||
      (status === "out" && product.active && product.quantity <= 0);
    return textMatch && statusMatch;
  });
}

function renderProductsTable() {
  const rows = productListFiltered().map(product => `
    <tr>
      <td>${esc(product.name)}</td>
      <td>${esc(product.category)}</td>
      <td>${money(product.price)}</td>
      <td>${product.quantity} / min ${product.minStock}</td>
      <td>${statusPill(product)}</td>
      <td class="right">
        <button class="secondary" onclick="openStockForm(${product.id})">Estoque</button>
        <button class="primary" onclick="openProductForm(${product.id})">Editar</button>
        <button class="ghost" onclick="toggleProduct(${product.id})">${product.active ? "Desativar" : "Ativar"}</button>
      </td>
    </tr>
  `);
  document.getElementById("productsTable").innerHTML = table(["Produto", "Categoria", "Preco", "Estoque", "Status", ""], rows);
}

function openProductForm(id = null) {
  const product = id ? state.products.find(item => item.id === id) : null;
  modal(`
    <div class="modal-head">
      <h2>${id ? "Editar produto" : "Novo produto"}</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <div class="form-grid">
      <div class="field"><label>Nome</label><input id="pName" value="${esc(product?.name || "")}"></div>
      <div class="field"><label>Categoria</label><input id="pCategory" value="${esc(product?.category || "")}"></div>
      <div class="field"><label>Preco de venda</label><input id="pPrice" inputmode="decimal" value="${product?.price ?? ""}"></div>
      <div class="field"><label>Custo</label><input id="pCost" inputmode="decimal" value="${product?.cost ?? "0"}"></div>
      <div class="field"><label>Unidade</label><select id="pUnit">${["Unidade", "Pacote", "Garrafa", "Lata", "Fatia", "Kg", "Litro"].map(unit => `<option ${product?.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></div>
      <div class="field"><label>Estoque minimo</label><input id="pMin" inputmode="numeric" value="${product?.minStock ?? 0}"></div>
      <div class="field"><label>Quantidade</label><input id="pQty" inputmode="numeric" value="${product?.quantity ?? 0}"></div>
      <label class="check-field"><input type="checkbox" id="pActive" ${product?.active === false ? "" : "checked"}><span>Ativo para venda</span></label>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveProduct(${id || "null"})">Salvar produto</button>
      <button class="secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveProduct(id = null) {
  try {
    const name = cleanText(document.getElementById("pName").value, 100);
    const category = cleanText(document.getElementById("pCategory").value, 70);
    if (!name || !category) throw new Error("Preencha nome e categoria.");
    const now = nowIso();
    const product = {
      id: id || undefined,