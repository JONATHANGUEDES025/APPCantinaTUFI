async function renderDashboard(){const s=await api('/api/summary'); main.innerHTML=title('Dashboard','Resumo rapido da operacao de hoje.',`<button class="primary" onclick="showPage('sale')">Nova venda</button><button class="secondary" onclick="showPage('products')">Produto</button><button class="secondary" onclick="showPage('system')">Sistema</button>`) + `
<section class="grid stats">
<div class="card stat"><div class="label">Vendas hoje</div><div class="value">${s.sales_count}</div><div class="sub">${money(s.sales_total)}</div></div>
<div class="card stat"><div class="label">Ticket medio</div><div class="value">${money(s.average_ticket)}</div><div class="sub">por venda ativa</div></div>
<div class="card stat"><div class="label">Lucro estimado</div><div class="value">${money(s.profit_today)}</div><div class="sub">baseado no custo</div></div>
<div class="card stat"><div class="label">Fiados abertos</div><div class="value">${s.fiados_count}</div><div class="sub">${money(s.fiados_total)}</div></div>
<div class="card stat"><div class="label">Alertas estoque</div><div class="value">${s.stock_low}</div><div class="sub">${s.out_stock} sem estoque</div></div>
</section>
<section class="grid two" style="margin-top:14px">
<div class="card"><h2>Produtos que precisam de atencao</h2>${table(['Produto','Categoria','Qtd','Minimo'],s.low_products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${p.quantity}</td><td>${p.min_stock}</td></tr>`))}</div>
<div class="card"><h2>Mais vendidos hoje</h2>${table(['Produto','Qtd','Total'],s.top_products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.quantity}</td><td>${money(p.total)}</td></tr>`))}</div>
</section>
<section class="card" style="margin-top:14px"><h2>Ultimas vendas</h2>${table(['ID','Data','Total','Pagamento','Status'],s.recent_sales.map(v=>`<tr><td>#${v.id}</td><td>${dt(v.sale_datetime)}</td><td>${money(v.total)}</td><td>${esc(v.payment_method)}</td><td>${esc(v.status)}</td></tr>`))}</section>`}
