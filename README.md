# Cantina TUFI

Sistema local de vendas e estoque para cantina/loja, feito em Python com servidor web local e banco SQLite.

## Como abrir

No Windows, use um destes arquivos:

- `Cantina TUFI.vbs`: abre o sistema em segundo plano.
- `ABRIR CANTINA TUFI.bat`: abre pelo terminal e mostra mensagens se houver erro.

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

Mantenha `cantina_pro.py` junto com os arquivos `cantina_pro.py.gz.part1`, `cantina_pro.py.gz.part2` e `cantina_pro.py.gz.part3`. Eles fazem parte do aplicativo principal.

## Observacao

O banco `cantina_tufi.db` e os backups nao sao enviados para o GitHub, porque sao dados locais do cliente.
