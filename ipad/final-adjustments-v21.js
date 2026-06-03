(function applyCantinaTufiV21Adjustments() {
  function applyV21Patch() {
    if (window.__cantinaTufiV21Applied) return true;
    if (typeof state === "undefined" || !state.db || typeof renderFiados !== "function" || typeof listHouseDebtors !== "function") return false;
    window.__cantinaTufiV21Applied = true;

    renderFiados = async function renderFiados() {
      const sales = (await all("sales")).filter(sale => sale.paymentMethod === "Fiado" && sale.status === "ativa");
      const houseDebtors = await listHouseDebtors();
      const groups = new Map();

      sales.filter(sale => !sale.settledAt).forEach(sale => {
        const groupKey = debtorKey(sale.debtorName);
        if (!groups.has(groupKey)) groups.set(groupKey, { debtorName: sale.debtorName, sales: [], total: 0 });
        const group = groups.get(groupKey);
        group.sales.push(sale);
        group.total += sale.total;
      });

      state.fiadoGroups = [...groups.values()].sort((a, b) => a.debtorName.localeCompare(b.debtorName, "pt-BR", { sensitivity: "base" }));
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
    };

    if (state.page === "fiados") renderFiados();
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (applyV21Patch()) clearInterval(timer);
    } catch (error) {
      console.warn("Ajustes v21 ainda nao aplicados.", error);
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
})();