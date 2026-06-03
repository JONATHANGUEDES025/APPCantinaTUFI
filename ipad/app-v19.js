(async function loadCantinaTufiIpadV21() {
  const chunks = [
    "./app.part1.js",
    "./app.part2.js",
    "./app.part3.js",
    "./app.part4.js",
    "./app.part5.js",
    "./app.part6.js"
  ];

  try {
    const parts = await Promise.all(chunks.map(async path => {
        const response = await fetch(`${path}?v=21`);
        if (!response.ok) throw new Error(`Nao foi possivel carregar ${path}`);
        return response.text();
      }));
    const appSource = parts.join("\n");
    const appAlreadyHasFinalData =
      appSource.includes("const PRODUCT_SEEDS") &&
      appSource.includes("Pix da Mãe Mag") &&
      appSource.includes("Novo devedor da TUFI");
    const [adjustments, catalogFix] = await Promise.all([
      appAlreadyHasFinalData ? Promise.resolve("") : fetch("./final-adjustments-v19.js?v=21").then(response => {
        if (!response.ok) throw new Error("Nao foi possivel carregar os ajustes finais.");
        return response.text();
      }),
      fetch("./catalog-visible-v20.js?v=21").then(response => {
        if (!response.ok) throw new Error("Nao foi possivel carregar a vitrine do caixa.");
        return response.text();
      })
    ]);
    const script = document.createElement("script");
    script.textContent = `${appSource}\n${adjustments}\n${catalogFix}\n//# sourceURL=cantina-tufi-ipad-v21.js`;
    document.head.appendChild(script);
  } catch (error) {
    console.error(error);
    const main = document.getElementById("main");
    if (main) {
      main.innerHTML = `<div class="card"><h2>Erro ao abrir</h2><p>Atualize a pagina ou confira se todos os arquivos do aplicativo foram enviados para o GitHub.</p></div>`;
    }
  }
})();