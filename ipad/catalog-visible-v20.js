(function showZeroStockProductsInCatalog() {
  function applyCatalogPatch() {
    if (typeof state === "undefined" || !state.db || typeof renderCatalog !== "function") return false;
    if (window.__cantinaTufiCatalogV20Applied) return true;
    window.__cantinaTufiCatalogV20Applied = true;

    renderCatalog = function patchedRenderCatalog() {
      const search = cleanText(document.getElementById("saleSearch")?.value || "", 120).toLowerCase();
      const category = document.getElementById("saleCategory")?.value || "";
      const list = state.products.filter(product =>
        product.active &&
        (!category || product.category === category) &&
        (!search || product.name.toLowerCase().includes(search) || product.category.toLowerCase().includes(search))
      );
      document.getElementById("catalog").innerHTML = list.map(product => `
        <button class="product-card ${product.quantity <= 0 ? "out-of-stock" : ""}" onclick="${product.quantity <= 0 ? "" : `addCart(${product.id})`}" title="${esc(product.name)}" ${product.quantity <= 0 ? "disabled" : ""}>
          <span class="prod-meta">${esc(product.category)} | ${product.quantity > 0 ? `${product.quantity} em estoque` : "Sem estoque"}</span>
          <span class="prod-name">${esc(product.name)}</span>
          <span class="prod-bottom"><span class="prod-price">${money(product.price)}</span><span class="prod-add">${product.quantity > 0 ? "+" : "0"}</span></span>
        </button>
      `).join("") || `<div class="empty">Nenhum produto cadastrado.</div>`;
    };

    const style = document.createElement("style");
    style.textContent = ".product-card.out-of-stock{opacity:.68;cursor:not-allowed}.product-card.out-of-stock .prod-add{background:#9aa8b2}";
    document.head.appendChild(style);

    if (state.page === "sale") renderCatalog();
    return true;
  }

  const timer = setInterval(() => {
    try {
      if (applyCatalogPatch()) clearInterval(timer);
    } catch (error) {
      console.warn("Catalogo v20 ainda nao aplicado.", error);
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
})();
