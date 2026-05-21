      name,
      category,
      price: numberValue(document.getElementById("pPrice").value, "Preco"),
      cost: numberValue(document.getElementById("pCost").value || "0", "Custo"),
      unit: cleanText(document.getElementById("pUnit").value, 30) || "Unidade",
      minStock: intValue(document.getElementById("pMin").value || "0", "Estoque minimo"),
      quantity: intValue(document.getElementById("pQty").value || "0", "Quantidade"),
      active: document.getElementById("pActive").checked,
      createdAt: id ? (await getOne("products", id)).createdAt : now,
      updatedAt: now
    };
    await putOne("products", product);
    closeModal();
    toast("Produto salvo");
    await renderProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function toggleProduct(id) {
  const product = await getOne("products", id);
  if (!product) return;
  product.active = !product.active;
  product.updatedAt = nowIso();
  await putOne("products", product);
  toast(product.active ? "Produto ativado" : "Produto desativado");
  await renderProducts();
}

function openStockForm(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  modal(`
    <div class="modal-head">
      <h2>Ajustar estoque</h2>
      <button class="ghost" onclick="closeModal()">Fechar</button>
    </div>
    <p><b>${esc(product.name)}</b><br><span class="muted">Estoque atual: ${product.quantity}</span></p>
    <div class="form-grid">
      <div class="field full">
        <label>Acao</label>
        <select id="stockType" onchange="updateStockHelp()">
          <option value="entrada">Adicionar ao estoque</option>
          <option value="saida">Retirar do estoque</option>
          <option value="ajuste">Corrigir saldo exato</option>
        </select>
        <small id="stockHelp" class="muted"></small>
      </div>
      <div class="field"><label id="stockQtyLabel">Quantidade</label><input id="stockQty" inputmode="numeric" value="1"></div>
      <div class="field full"><label>Observacao</label><textarea id="stockNotes" placeholder="Ex.: compra de mercadoria, perda, contagem conferida"></textarea></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="saveStock(${id})">Salvar estoque</button>
      <button class="secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
  updateStockHelp();
}

function updateStockHelp() {
  const type = document.getElementById("stockType")?.value;
  const help = document.getElementById("stockHelp");
  const label = document.getElementById("stockQtyLabel");
  if (!help || !label) return;
  if (type === "entrada") {
    help.textContent = "Use quando comprou ou recebeu mais produtos.";
    label.textContent = "Quantidade adicionada";
  } else if (type === "saida") {
    help.textContent = "Use para perda, retirada manual ou produto vencido.";
    label.textContent = "Quantidade retirada";
  } else {
    help.textContent = "Use quando contou o estoque e quer informar o saldo final correto.";
    label.textContent = "Saldo correto";
  }
}

async function saveStock(id) {
  try {
    if (!requireOperator()) return;
    const product = await getOne("products", id);
    if (!product) throw new Error("Produto nao encontrado.");
    const type = document.getElementById("stockType").value;
    const amount = intValue(document.getElementById("stockQty").value, "Quantidade");
    const previous = product.quantity;
    let next = previous;
    if (type === "entrada") next += amount;
    if (type === "saida") {
      if (amount > previous) throw new Error("Saida maior que o estoque atual.");
      next -= amount;
    }
    if (type === "ajuste") next = amount;
    product.quantity = next;
    product.updatedAt = nowIso();
    await putOne("products", product);
    await addOne("stock_movements", {
      productId: product.id,
      productName: product.name,
      date: nowIso(),
      type,
      quantity: amount,
      previousQuantity: previous,
      newQuantity: next,
      notes: cleanText(document.getElementById("stockNotes").value, 240),
      operatorName: state.operator
    });
    closeModal();
    toast("Estoque atualizado");
    await renderProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function renderSale() {
  await refreshData();
  const available = state.products.filter(product => product.active && product.quantity > 0);
  main.innerHTML = title("Caixa", "Venda rapida para tocar no produto e fechar pagamento.", `<button class="secondary" onclick="clearCart()">Limpar carrinho</button>`) + `
    <div class="sale-layout">
      <section class="sale-panel">
        <div class="card">
          <div class="section-head"><div><h2>Produtos</h2><p class="muted" style="margin:4px 0 0">${available.length} itens disponiveis</p></div></div>
          <div class="sale-search">
            <input id="saleSearch" placeholder="Buscar produto pelo nome">
            <input type="hidden" id="saleCategory" value="">
            <div id="saleCategories" class="category-strip"></div>
          </div>
        </div>
        <div class="card"><div id="catalog" class="catalog"></div></div>
      </section>
      <aside class="checkout-panel">
        <section class="card">
          <div class="section-head"><h2>Venda atual</h2><button class="ghost" onclick="clearCart()">Limpar</button></div>
          <div id="cartList" class="cart-list"></div>
          <div id="totals" class="total-box"></div>
        </section>
        <section class="card">
          <h2>Pagamento</h2>
          <input type="hidden" id="paymentMethod" value="">
          <div class="payment-methods">${["Dinheiro", "Pix", "Debito", "Credito", "Fiado"].map(method => `<button class="pay-button" data-method="${method}" onclick="setPayment(${jsArg(method)})">${method}</button>`).join("")}</div>
          <div class="form-grid" style="margin-top:12px">
            <div class="field"><label>Operador</label><input id="saleOperator" value="${esc(state.operator)}"></div>
            <div class="field"><label>Cliente</label><input id="customerName" placeholder="Opcional"></div>
            <div class="field full hidden" id="debtorWrap"><label>Nome do devedor</label><input id="debtorName"></div>
            <div class="field"><label>Desconto</label><input id="discountValue" inputmode="decimal" value="0" oninput="updateCheckout()"></div>
            <div class="field" id="receivedWrap"><label>Recebido</label><input id="receivedValue" inputmode="decimal" value="0" oninput="updateCheckout()"></div>
            <div class="field full"><label>Observacao</label><textarea id="saleNotes" placeholder="Opcional"></textarea></div>
          </div>
          <div class="total-box">
            <div class="line"><span>Troco</span><b id="changeValue">${money(0)}</b></div>
            <button class="primary" onclick="confirmSale()" style="width:100%;margin-top:8px">Confirmar venda</button>
          </div>
        </section>
      </aside>
    </div>
  `;
  document.getElementById("saleSearch").addEventListener("input", renderCatalog);
  renderSaleCategories();
  renderCatalog();
  refreshCart();
}

function renderSaleCategories() {
  const selected = document.getElementById("saleCategory")?.value || "";
  const categories = ["", ...state.categories];
  document.getElementById("saleCategories").innerHTML = categories.map(category => `<button class="cat-chip ${selected === category ? "active" : ""}" onclick="setSaleCategory(${jsArg(category)})">${category ? esc(category) : "Todas"}</button>`).join("");
}

function setSaleCategory(category) {
  document.getElementById("saleCategory").value = category;
  renderSaleCategories();
  renderCatalog();
}

function renderCatalog() {
  const search = cleanText(document.getElementById("saleSearch")?.value || "", 120).toLowerCase();
  const category = document.getElementById("saleCategory")?.value || "";
  const list = state.products.filter(product =>
    product.active &&
    product.quantity > 0 &&
    (!category || product.category === category) &&
    (!search || product.name.toLowerCase().includes(search) || product.category.toLowerCase().includes(search))
  );
  document.getElementById("catalog").innerHTML = list.map(product => `
    <button class="product-card" onclick="addCart(${product.id})" title="${esc(product.name)}">
      <span class="prod-meta">${esc(product.category)} | ${product.quantity} em estoque</span>
      <span class="prod-name">${esc(product.name)}</span>
      <span class="prod-bottom"><span class="prod-price">${money(product.price)}</span><span class="prod-add">+</span></span>
    </button>
  `).join("") || `<div class="empty">Nenhum produto disponivel.</div>`;
}

function addCart(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  const item = state.cart.find(cartItem => cartItem.productId === id);
  if (item) {
    if (item.quantity >= product.quantity) {
      alert("Nao ha mais estoque disponivel para esse produto.");
      return;