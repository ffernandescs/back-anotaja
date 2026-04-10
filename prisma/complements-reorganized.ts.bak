// ✅ ESTRUTURA REORGANIZADA DE COMPLEMENTOS POR CATEGORIA
// Copie este conteúdo e substitua a const complementsData no seed.ts (linha ~3317)

import { BusinessSegment, ComplementsBySegment } from './seed';

const complementsData: ComplementsBySegment = {
  // ========== HAMBURGUERIA ==========
  [BusinessSegment.HAMBURGUERIA]: {
    // Complementos para Hambúrgueres
    hamburgers: [
      {
        name: 'Tamanho do Pão',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Pão Tradicional', price: 0 },
          { name: 'Pão Australiano', price: 2.0 },
          { name: 'Pão Brioche', price: 3.0 },
          { name: 'Pão Integral', price: 2.5 },
        ],
      },
      {
        name: 'Ponto da Carne',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Mal Passado', price: 0 },
          { name: 'Ao Ponto', price: 0 },
          { name: 'Bem Passado', price: 0 },
        ],
      },
      {
        name: 'Adicionais',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 8,
        options: [
          { name: 'Bacon', price: 4.0 },
          { name: 'Queijo Extra', price: 3.0 },
          { name: 'Ovo', price: 2.5 },
          { name: 'Cebola Caramelizada', price: 2.5 },
          { name: 'Picles', price: 1.5 },
          { name: 'Catupiry', price: 4.0 },
          { name: 'Cheddar', price: 3.5 },
          { name: 'Jalapeño', price: 2.0 },
        ],
      },
      {
        name: 'Molhos Extras',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Barbecue', price: 1.5 },
          { name: 'Mostarda e Mel', price: 1.5 },
          { name: 'Maionese Temperada', price: 1.0 },
          { name: 'Molho Picante', price: 1.5 },
        ],
      },
      {
        name: 'Retirar Ingredientes',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 5,
        options: [
          { name: 'Sem Alface', price: 0 },
          { name: 'Sem Tomate', price: 0 },
          { name: 'Sem Cebola', price: 0 },
          { name: 'Sem Picles', price: 0 },
          { name: 'Sem Molho', price: 0 },
        ],
      },
    ],

    // Complementos para Acompanhamentos
    acompanhamentos: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Pequeno', price: 0 },
          { name: 'Médio', price: 3.0 },
          { name: 'Grande', price: 6.0 },
        ],
      },
      {
        name: 'Adicionais',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Cheddar', price: 4.0 },
          { name: 'Bacon', price: 4.0 },
          { name: 'Catupiry', price: 4.0 },
        ],
      },
    ],

    // Complementos para Bebidas
    bebidas: [
      {
        name: 'Tamanho',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: '350ml', price: 0 },
          { name: '500ml', price: 2.0 },
          { name: '1L', price: 4.0 },
        ],
      },
      {
        name: 'Gelo',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Com Gelo', price: 0 },
          { name: 'Sem Gelo', price: 0 },
          { name: 'Pouco Gelo', price: 0 },
        ],
      },
    ],

    // Complementos para Sobremesas
    sobremesas: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '300ml', price: 0 },
          { name: '500ml', price: 4.0 },
        ],
      },
      {
        name: 'Adicionais',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Chantilly', price: 2.0 },
          { name: 'Calda Extra', price: 2.0 },
          { name: 'Granulado', price: 1.5 },
        ],
      },
    ],
  },

  // ========== PIZZARIA ==========
  [BusinessSegment.PIZZARIA]: {
    // Complementos para Pizzas
    pizzas: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Pequena (4 fatias)', price: 0 },
          { name: 'Média (6 fatias)', price: 10.0 },
          { name: 'Grande (8 fatias)', price: 18.0 },
          { name: 'Família (12 fatias)', price: 30.0 },
        ],
      },
      {
        name: 'Borda',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Borda Normal', price: 0 },
          { name: 'Borda Recheada Catupiry', price: 6.0 },
          { name: 'Borda Recheada Cheddar', price: 6.0 },
          { name: 'Borda Recheada Chocolate', price: 7.0 },
        ],
      },
      {
        name: 'Massa',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Massa Tradicional', price: 0 },
          { name: 'Massa Fina', price: 0 },
          { name: 'Massa Integral', price: 3.0 },
        ],
      },
      {
        name: 'Extras',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 5,
        options: [
          { name: 'Bacon Extra', price: 5.0 },
          { name: 'Queijo Extra', price: 4.0 },
          { name: 'Azeitona', price: 3.0 },
          { name: 'Orégano', price: 0 },
          { name: 'Pimenta Calabresa', price: 1.0 },
        ],
      },
      {
        name: 'Dividir Sabores',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: '2 Sabores', price: 0 },
          { name: '3 Sabores (só família)', price: 5.0 },
        ],
      },
      {
        name: 'Adicionais Doces',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Chocolate Extra', price: 4.0 },
          { name: 'Leite Condensado', price: 3.0 },
          { name: 'Frutas', price: 5.0 },
        ],
      },
    ],

    // Complementos para Calzones
    calzones: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Individual', price: 0 },
          { name: 'Grande', price: 8.0 },
        ],
      },
      {
        name: 'Extras',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Queijo Extra', price: 4.0 },
          { name: 'Bacon', price: 5.0 },
          { name: 'Catupiry Extra', price: 4.0 },
        ],
      },
    ],
  },

  // ========== RESTAURANTE ==========
  [BusinessSegment.RESTAURANTE]: {
    // Complementos para Pratos Principais
    pratosPrincipais: [
      {
        name: 'Acompanhamentos',
        required: true,
        allowRepeat: false,
        minOptions: 2,
        maxOptions: 3,
        options: [
          { name: 'Arroz Branco', price: 0 },
          { name: 'Arroz Integral', price: 2.0 },
          { name: 'Feijão', price: 0 },
          { name: 'Feijão Verde', price: 2.0 },
          { name: 'Farofa', price: 0 },
          { name: 'Salada Verde', price: 0 },
          { name: 'Vinagrete', price: 0 },
        ],
      },
      {
        name: 'Extras',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 4,
        options: [
          { name: 'Arroz Extra', price: 3.0 },
          { name: 'Feijão Extra', price: 3.0 },
          { name: 'Farofa Extra', price: 2.0 },
          { name: 'Salada Extra', price: 4.0 },
          { name: 'Macaxeira Frita', price: 5.0 },
        ],
      },
      {
        name: 'Ponto da Carne',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Mal Passado', price: 0 },
          { name: 'Ao Ponto', price: 0 },
          { name: 'Bem Passado', price: 0 },
        ],
      },
    ],

    // Complementos para Entradas
    entradas: [
      {
        name: 'Porção',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Individual', price: 0 },
          { name: 'Para 2 pessoas', price: 8.0 },
          { name: 'Para 4 pessoas', price: 15.0 },
        ],
      },
      {
        name: 'Molhos',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 2,
        options: [
          { name: 'Molho Tártaro', price: 2.0 },
          { name: 'Molho Barbecue', price: 2.0 },
          { name: 'Molho Picante', price: 2.0 },
        ],
      },
    ],
  },

  // ========== DEPÓSITO DE BEBIDAS ==========
  [BusinessSegment.DEPOSITO_BEBIDAS]: {
    // Complementos para Cervejas
    cervejas: [
      {
        name: 'Temperatura',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Gelada', price: 0 },
          { name: 'Natural', price: 0 },
        ],
      },
      {
        name: 'Quantidade',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: '1 unidade', price: 0 },
          { name: 'Pack 6 unidades', price: -2.0 },
          { name: 'Pack 12 unidades', price: -5.0 },
          { name: 'Caixa 24 unidades', price: -12.0 },
        ],
      },
    ],

    // Complementos para Refrigerantes
    refrigerantes: [
      {
        name: 'Temperatura',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Gelado', price: 0 },
          { name: 'Natural', price: 0 },
        ],
      },
      {
        name: 'Quantidade',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: '1 unidade', price: 0 },
          { name: 'Pack 6 unidades', price: -1.5 },
          { name: 'Pack 12 unidades', price: -4.0 },
        ],
      },
    ],

    // Complementos para Sucos
    sucos: [
      {
        name: 'Temperatura',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Gelado', price: 0 },
          { name: 'Natural', price: 0 },
        ],
      },
    ],

    // Complementos para Águas
    aguas: [
      {
        name: 'Temperatura',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Gelada', price: 0 },
          { name: 'Natural', price: 0 },
        ],
      },
      {
        name: 'Quantidade',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: '1 unidade', price: 0 },
          { name: 'Pack 6 unidades', price: -1.0 },
          { name: 'Pack 12 unidades', price: -3.0 },
        ],
      },
    ],

    // Complementos para Energéticos
    energeticos: [
      {
        name: 'Temperatura',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Gelado', price: 0 },
          { name: 'Natural', price: 0 },
        ],
      },
    ],
  },

  // ========== PERFUMARIA ==========
  [BusinessSegment.PERFUMARIA]: {
    // Complementos para Perfumes
    perfumes: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '30ml', price: 0 },
          { name: '50ml', price: 25.0 },
          { name: '100ml', price: 55.0 },
        ],
      },
      {
        name: 'Tipo de Fragrância',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'EDT (Eau de Toilette)', price: 0 },
          { name: 'EDP (Eau de Parfum)', price: 20.0 },
          { name: 'Perfume', price: 40.0 },
        ],
      },
      {
        name: 'Embalagem Presente',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Sem Embalagem', price: 0 },
          { name: 'Caixa Presente', price: 5.0 },
          { name: 'Embrulho Premium', price: 8.0 },
        ],
      },
    ],

    // Complementos para Natura
    natura: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '30ml', price: 0 },
          { name: '50ml', price: 20.0 },
          { name: '100ml', price: 45.0 },
        ],
      },
      {
        name: 'Embalagem Presente',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Sem Embalagem', price: 0 },
          { name: 'Caixa Presente', price: 5.0 },
        ],
      },
    ],

    // Complementos para Avon
    avon: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '30ml', price: 0 },
          { name: '50ml', price: 18.0 },
          { name: '100ml', price: 40.0 },
        ],
      },
    ],

    // Complementos para O Boticário
    oBoticario: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '30ml', price: 0 },
          { name: '50ml', price: 28.0 },
          { name: '100ml', price: 60.0 },
        ],
      },
      {
        name: 'Embalagem Presente',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Sem Embalagem', price: 0 },
          { name: 'Caixa Presente O Boticário', price: 8.0 },
          { name: 'Embrulho Luxo', price: 12.0 },
        ],
      },
    ],

    // Complementos para Maquiagem
    maquiagem: [
      {
        name: 'Cor/Tom',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Tom Claro', price: 0 },
          { name: 'Tom Médio', price: 0 },
          { name: 'Tom Escuro', price: 0 },
        ],
      },
    ],

    // Complementos para Cuidados Pessoais
    cuidadosPessoais: [],
  },

  // ========== CANOZES ==========
  [BusinessSegment.CANOZES]: {
    // Complementos para Pizzas
    pizzas: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Pequena (4 fatias)', price: 0 },
          { name: 'Média (6 fatias)', price: 10.0 },
          { name: 'Grande (8 fatias)', price: 18.0 },
        ],
      },
      {
        name: 'Borda',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Borda Normal', price: 0 },
          { name: 'Borda Recheada', price: 6.0 },
        ],
      },
    ],

    // Complementos para Calzones
    calzones: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Individual', price: 0 },
          { name: 'Grande', price: 8.0 },
        ],
      },
    ],

    // Complementos para Canecas (Caldos)
    canecas: [
      {
        name: 'Tamanho',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Copo 300ml', price: 0 },
          { name: 'Caneca 500ml', price: 4.0 },
          { name: 'Tigela 700ml', price: 8.0 },
        ],
      },
      {
        name: 'Nível de Tempero',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Pouco Temperado', price: 0 },
          { name: 'Tempero Normal', price: 0 },
          { name: 'Bem Temperado', price: 0 },
        ],
      },
      {
        name: 'Pimenta',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 1,
        options: [
          { name: 'Sem Pimenta', price: 0 },
          { name: 'Pouca Pimenta', price: 0 },
          { name: 'Pimenta Normal', price: 0 },
          { name: 'Muita Pimenta', price: 0 },
        ],
      },
      {
        name: 'Adicionais',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 3,
        options: [
          { name: 'Limão', price: 0.5 },
          { name: 'Coentro Extra', price: 1.0 },
          { name: 'Pimenta de Cheiro', price: 1.0 },
        ],
      },
    ],
  },
};

export default complementsData;
