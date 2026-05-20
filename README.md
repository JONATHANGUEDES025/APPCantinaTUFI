# Cantina TUFI

Sistema local de vendas e estoque para cantina/loja, feito em Python com servidor web local e banco SQLite.

## Como baixar em outro computador

1. Clique em **Code** no GitHub.
2. Clique em **Download ZIP**.
3. Extraia a pasta ZIP.
4. No Windows, abra **Cantina TUFI.vbs** ou **ABRIR CANTINA TUFI.bat**.

Depois acesse:

```text
http://127.0.0.1:8767/
```

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

## Arquivos importantes

- `cantina_pro.py`: aplicativo principal completo.
- `iniciar_cantina.py`: inicializador do aplicativo.
- `Cantina TUFI.vbs`: abre o aplicativo sem deixar o terminal aparente.
- `ABRIR CANTINA TUFI.bat`: abre pelo terminal e mostra mensagens caso haja erro.

## Observacao

O banco `dados/cantina_tufi.db`, logs e backups sao dados locais do cliente e sao criados automaticamente no computador onde o aplicativo for aberto.
