# Formato de Impressão - Estrutura Aninhada

## Estrutura de Dados Enviada

O `printer.service.ts` envia os dados no seguinte formato:

```json
{
  "order": {
    "number": "0001",
    "items": [
      {
        "name": "X-Bacon",
        "qty": 2,
        "price": 2500,
        "complements": [
          {
            "name": "Ponto da Carne",
            "options": [
              {
                "name": "Mal Passado",
                "qty": 1,
                "price": 0
              }
            ]
          },
          {
            "name": "Adicionais",
            "options": [
              {
                "name": "Bacon Extra",
                "qty": 2,
                "price": 300
              },
              {
                "name": "Queijo Extra",
                "qty": 1,
                "price": 200
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Formato de Impressão Esperado

O servidor de impressão deve renderizar assim:

```
1. 2x X-Bacon .................. R$ 25,00
    Ponto da Carne:
      + 1x Mal Passado .......... R$ 0,00
    Adicionais:
      + 2x Bacon Extra .......... R$ 3,00
      + 1x Queijo Extra ......... R$ 2,00

2. 1x Batata Frita ............. R$ 8,00
    Tamanho:
      + 1x Grande ............... R$ 0,00
```

## Regras de Indentação

1. **Produto** (nível 0): `1. 2x Nome do Produto`
2. **Complemento** (nível 1): `    Nome do Complemento:` (4 espaços)
3. **Opção** (nível 2): `      + 1x Nome da Opção` (6 espaços + símbolo +)

## Implementação no Servidor de Impressão

```javascript
function formatOrderItems(items) {
  let output = '';
  const lineWidth = 48; // Largura total da linha
  
  items.forEach((item, index) => {
    // Linha do produto (nível 0)
    const itemLine = `${index + 1}. ${item.qty}x ${item.name}`;
    const itemPrice = `R$ ${(item.price / 100).toFixed(2)}`;
    const dotsCount = lineWidth - itemLine.length - itemPrice.length;
    output += itemLine + ' '.repeat(Math.max(1, dotsCount)) + itemPrice + '\n';
    
    // Complementos (nível 1)
    if (item.complements && item.complements.length > 0) {
      item.complements.forEach(complement => {
        output += `    ${complement.name}:\n`;
        
        // Opções (nível 2)
        complement.options.forEach(option => {
          const optionLine = `      + ${option.qty}x ${option.name}`;
          const optionPrice = `R$ ${(option.price / 100).toFixed(2)}`;
          const optionDotsCount = lineWidth - optionLine.length - optionPrice.length;
          output += optionLine + ' '.repeat(Math.max(1, optionDotsCount)) + optionPrice + '\n';
        });
      });
    }
    
    output += '\n'; // Linha em branco entre produtos
  });
  
  return output;
}
```

## ⚠️ IMPORTANTE: Correção de Espaçamento

**ERRO COMUM:**
```
1.     2x X-Bacon ..................... R$ 25,00
   ^^^^^ espaços extras aqui
```

**CORRETO:**
```
1. 2x X-Bacon ..................... R$ 25,00
   ^ apenas 1 espaço após o ponto
```

### Causa do Problema

O erro acontece quando você usa padding/repeat ANTES de adicionar o preço. O correto é:

1. Montar a linha do item: `"1. 2x X-Bacon"`
2. Montar o preço: `"R$ 25,00"`
3. Calcular quantos espaços faltam: `lineWidth - itemLine.length - itemPrice.length`
4. Adicionar os espaços no meio: `itemLine + spaces + itemPrice`

**NÃO faça:**
```javascript
// ❌ ERRADO - adiciona espaços baseado no tamanho da string atual
output += `${index + 1}. ${item.qty}x ${item.name}`;
output += ' '.repeat(40 - output.length); // Isso causa espaços extras!
```

**Faça:**
```javascript
// ✅ CORRETO - calcula o espaçamento entre item e preço
const itemLine = `${index + 1}. ${item.qty}x ${item.name}`;
const itemPrice = `R$ ${(item.price / 100).toFixed(2)}`;
const spaces = lineWidth - itemLine.length - itemPrice.length;
output += itemLine + ' '.repeat(Math.max(1, spaces)) + itemPrice + '\n';
```

## Exemplo de Saída Completa

```
================================================
           RESTAURANTE EXEMPLO
================================================
Pedido: #0001                    Mesa: 5
Data: 09/04/2026 10:45

------------------------------------------------
              ITENS DO PEDIDO
------------------------------------------------

1. 2x X-Bacon ..................... R$ 25,00
    Ponto da Carne:
      + 1x Mal Passado ............ R$ 0,00
    Adicionais:
      + 2x Bacon Extra ............ R$ 3,00
      + 1x Queijo Extra ........... R$ 2,00

2. 1x Batata Frita ................ R$ 8,00
    Tamanho:
      + 1x Grande ................. R$ 0,00

3. 1x Coca-Cola 350ml ............. R$ 5,00

------------------------------------------------
Subtotal: ......................... R$ 38,00
Desconto: ......................... R$ 0,00
------------------------------------------------
TOTAL: ............................ R$ 38,00
------------------------------------------------

Pagamento: PIX
Obrigado pela preferência!
================================================
```

## Notas Importantes

- A indentação usa **espaços**, não tabs
- Produto: sem indentação
- Complemento: 4 espaços
- Opção: 6 espaços + símbolo "+"
- Os pontos (...) são opcionais para preencher o espaço
- Preços sempre com 2 casas decimais
- Linha em branco entre produtos para melhor legibilidade
