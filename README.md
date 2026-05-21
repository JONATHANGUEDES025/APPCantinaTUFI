# Cantina TUFI

Sistema local de vendas e estoque para cantina/loja, feito em Python com servidor web local e banco SQLite.

## Como abrir

No Windows, use um destes arquivos:

- `Cantina TUFI.vbs`: use este no dia a dia. Ele abre o sistema sem deixar a tela preta do terminal aberta.
- `ABRIR CANTINA TUFI.bat`: use quando quiser testar ou quando o app nao abrir. Ele mostra mensagens e salva erros em `dados/logs/erro_cantina.txt`.

Depois acesse:

```text
http://127.0.0.1:8767/
```

## Como acessar pelo iPad ou celular na mesma rede

1. Abra o aplicativo no computador Windows.
2. Deixe o computador ligado e conectado ao mesmo Wi-Fi do iPad.
3. Descubra o IPv4 do computador. No Windows, abra o Prompt de Comando e digite `ipconfig`.
4. No iPad, abra o Safari e acesse `http://IP-DO-COMPUTADOR:8767/`.

Exemplo:

```text
http://192.168.0.105:8767/
```

Se nao abrir, confira se o Windows pediu permissao no firewall e permita o Python em redes privadas.

## Como baixar em outro computador

1. Clique em **Code** no GitHub.
2. Clique em **Download ZIP**.
3. Extraia a pasta ZIP.
4. Abra `Cantina TUFI.vbs` ou `ABRIR CANTINA TUFI.bat`.

## Funcionalidades

- Cadastro de produtos
- Caixa/PDV
- Carrinho de venda
- Pagamento em dinheiro, Pix, debito, credito e fiado
- Controle de fiados agrupados por devedor
- Controle de estoque
- Desfazer ultima movimentacao manual de estoque
- Historico de vendas
- Relatorios
- Botao para zerar sistema antes da entrega

## Organizacao do projeto

- `cantina_pro.py`: entrada principal do aplicativo.
- `iniciar_cantina.py`: inicializador com tratamento de erro.
- `app/config.py`: caminhos, porta, logs e configuracoes.
- `app/database.py`: conexao SQLite e criacao das tabelas.
- `app/validators.py`: validacao de entradas, numeros, datas, pagamentos e estoque.
- `app/services.py`: regras de negocio de produtos, vendas, fiados, estoque e relatorios.
- `app/server.py`: rotas web e entrega de arquivos da tela.
- `app/templates/index.html`: estrutura da tela.
- `app/static/styles.css`: visual do aplicativo.
- `app/static/app.js`: inicializacao da tela.
- `app/static/js/core.js`: navegacao, chamadas internas e componentes reutilizaveis.
- `app/static/js/products.js`: tela de produtos e cadastro.
- `app/static/js/checkout.js`: caixa, carrinho e pagamento.
- `app/static/js/history_fiados.js`: historico de vendas e fiados.
- `app/static/js/stock_reports_system.js`: estoque, relatorios e configuracoes do sistema.
- `dados/`: banco local, logs e backups gerados no computador do cliente.

O banco `dados/cantina_tufi.db` e os backups sao dados locais do cliente e nao precisam ir para o GitHub.
