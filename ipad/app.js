(async function loadCantinaTufiIpad() {
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
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Nao foi possivel carregar ${path}`);
      return response.text();
    }));
    const script = document.createElement("script");
    script.textContent = `${parts.join("\n")}\n//# sourceURL=cantina-tufi-ipad-app.js`;
    document.head.appendChild(script);
  } catch (error) {
    console.error(error);
    const main = document.getElementById("main");
    if (main) {
      main.innerHTML = `<div class="card"><h2>Erro ao abrir</h2><p>Atualize a pagina ou confira se todos os arquivos do aplicativo foram enviados para o GitHub.</p></div>`;
    }
  }
})();
