    }
    item.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      productCost: product.cost,
      quantity: 1,
      stock: product.quantity
    });
  }
  refreshCart();
}

function refreshCart() {
  const cartList = document.getElementById("cartList");
  if (!cartList) return;
  cartList.innerHTML = state.cart.map(item => `
    <div class="cart-row">
      <div class="cart-top"><b>${esc(item.productName)}</b><span>${money(item.unitPrice * item.quantity)}</span></div>
      <div class="qty">
        <button class="secondary" onclick="changeQty(${item.productId},-1)">-</button>
        <span class="qty-count">${item.quantity}</span>
        <button class="secondary" onclick="changeQty(${item.productId},1)">+</button>
        <span class="muted">${money(item.unitPrice)} un.</span>
        <button class="ghost" onclick="removeCart(${item.productId})">Remover</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Toque em um produto para adicionar.</div>`;
  updateCheckout();
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = Math.max(0, Number(String(document.getElementById("discountValue")?.value || 0).replace(",", ".")) || 0);
  const total = Math.max(0, subtotal - discount);
  const received = Number(String(document.getElementById("receivedValue")?.value || 0).replace(",", ".")) || 0;
  return { subtotal, discount, total, received, change: Math.max(0, received - total) };
}

function setPayment(method) {
  document.getElementById("paymentMethod").value = method;
  updateCheckout();
}

function updateCheckout() {
  const totals = document.getElementById("totals");
  if (!totals) return;
  const payment = document.getElementById("paymentMethod").value;
  document.getElementById("debtorWrap").classList.toggle("hidden", payment !== "Fiado");
  document.getElementById("receivedWrap").classList.toggle("hidden", payment !== "Dinheiro");
  document.querySelectorAll(".pay-button").forEach(button => button.classList.toggle("active", button.dataset.method === payment));
  const calc = cartTotals();
  totals.innerHTML = `
    <div class="line"><span>Itens</span><b>${state.cart.reduce((sum, item) => sum + item.quantity, 0)}</b></div>
    <div class="line"><span>Subtotal</span><b>${money(calc.subtotal)}</b></div>
    <div class="line"><span>Desconto</span><b>${money(calc.discount)}</b></div>
    <div class="summary-main"><div class="line"><span>Total</span><strong>${money(calc.total)}</strong></div></div>
  `;
  const change = document.getElementById("changeValue");
  if (change) change.textContent = money(calc.change);
}

function changeQty(id, delta) {
  const item = state.cart.find(cartItem => cartItem.productId === id);
  if (!item) return;
  const next = item.quantity + delta;
  if (next <= 0) state.cart = state.cart.filter(cartItem => cartItem.productId !== id);
  else if (next > item.stock) alert("Quantidade maior que o estoque.");
  else item.quantity = next;
  refreshCart();
}

function removeCart(id) {
  state.cart = state.cart.filter(item => item.productId !== id);
  refreshCart();
}

function clearCart() {
  state.cart = [];
  refreshCart();
}

async function confirmSale() {
  try {
    const operator = cleanText(document.getElementById("saleOperator").value, 80);
    if (!setOperator(operator)) return;
    if (!state.cart.length) throw new Error("Adicione pelo menos um produto.");
    const paymentMethod = document.getElementById("paymentMethod").value;
    if (!paymentMethod) throw new Error("Selecione a forma de pagamento.");
    const debtorName = cleanText(document.getElementById("debtorName").value, 100);
    if (paymentMethod === "Fiado" && !debtorName) throw new Error("Informe o nome do devedor.");
    const customerName = cleanText(document.getElementById("customerName").value, 100);
    const notes = cleanText(document.getElementById("saleNotes").value, 240);
    const calc = cartTotals();
    if (calc.discount > calc.subtotal) throw new Error("Desconto maior que o total.");
    if (paymentMethod === "Dinheiro" && calc.received && calc.received < calc.total) throw new Error("Valor recebido menor que o total.");

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
      total: calc.total,
      discount: calc.discount,
      amountReceived: paymentMethod === "Dinheiro" ? (calc.received || calc.total) : null,
      changeAmount: paymentMethod === "Dinheiro" ? Math.max(0, (calc.received || calc.total) - calc.total) : 0,
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
    toast("Venda registrada");
    showReceipt(sale);
    await refreshData();
    await renderSale();
  } catch (error) {
    alert(error.message);
  }
}

function showReceipt(sale) {
  modal(`
    <div class="modal-head"><h2>Recibo venda #${sale.id}</h2><button class="ghost" onclick="closeModal()">Fechar</button></div>
    <p><b>Data:</b> ${dateTime(sale.date)}<br><b>Operador:</b> ${esc(sale.operatorName)}<br><b>Pagamento:</b> ${esc(sale.paymentMethod)}<br><b>Cliente:</b> ${esc(sale.customerName || sale.debtorName || "-")}</p>
    ${table(["Produto", "Qtd", "Unitario", "Subtotal"], sale.items.map(item => `<tr><td>${esc(item.productName)}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.subtotal)}</td></tr>`))}
    <div class="total-box">
      <div class="line"><span>Desconto</span><b>${money(sale.discount)}</b></div>
      <div class="line"><span>Total</span><strong>${money(sale.total)}</strong></div>
      <div class="line"><span>Troco</span><b>${money(sale.changeAmount)}</b></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="primary" onclick="window.print()">Imprimir</button>
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