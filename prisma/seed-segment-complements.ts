/**
 * Complementos e opções por categoria, alinhados ao segmento de negócio.
 * Chaves = slug da categoria (kebab-case), igual ao Category.slug do seed.
 */

export interface ComplementOptionSeed {
  name: string;
  price: number;
}

export interface ComplementSeed {
  name: string;
  required: boolean;
  allowRepeat: boolean;
  minOptions: number;
  maxOptions?: number;
  options: ComplementOptionSeed[];
}

export type ComplementsByCategory = Record<string, ComplementSeed[]>;
export type ComplementsBySegment = Record<string, ComplementsByCategory>;

// ─── Blocos reutilizáveis ───────────────────────────────────────────────────

const BURGER_BASE: ComplementSeed[] = [
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
    name: 'Tipo de Pão',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Pão Tradicional', price: 0 },
      { name: 'Pão Brioche', price: 3 },
      { name: 'Pão Australiano', price: 2 },
      { name: 'Pão Integral', price: 2.5 },
    ],
  },
  {
    name: 'Adicionais',
    required: false,
    allowRepeat: true,
    minOptions: 0,
    maxOptions: 6,
    options: [
      { name: 'Bacon', price: 4 },
      { name: 'Queijo Extra', price: 3 },
      { name: 'Ovo', price: 2.5 },
      { name: 'Cebola Caramelizada', price: 2.5 },
      { name: 'Cheddar', price: 3.5 },
      { name: 'Catupiry', price: 4 },
    ],
  },
  {
    name: 'Molhos',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Barbecue', price: 1.5 },
      { name: 'Maionese da Casa', price: 0 },
      { name: 'Mostarda e Mel', price: 1.5 },
      { name: 'Molho Picante', price: 1.5 },
    ],
  },
  {
    name: 'Retirar Ingredientes',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 4,
    options: [
      { name: 'Sem Alface', price: 0 },
      { name: 'Sem Tomate', price: 0 },
      { name: 'Sem Cebola', price: 0 },
      { name: 'Sem Molho', price: 0 },
    ],
  },
];

const BURGER_VEGAN: ComplementSeed[] = [
  {
    name: 'Tipo de Pão',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Pão Integral', price: 0 },
      { name: 'Pão Brioche Vegano', price: 3 },
    ],
  },
  {
    name: 'Adicionais Veganos',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 4,
    options: [
      { name: 'Queijo Vegano', price: 4 },
      { name: 'Abacate', price: 3 },
      { name: 'Guacamole', price: 3.5 },
      { name: 'Cebola Roxa', price: 0 },
    ],
  },
];

const SIDE_PORTION: ComplementSeed[] = [
  {
    name: 'Tamanho da Porção',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Individual', price: 0 },
      { name: 'Média', price: 4 },
      { name: 'Família', price: 8 },
    ],
  },
  {
    name: 'Extras na Porção',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 3,
    options: [
      { name: 'Cheddar', price: 4 },
      { name: 'Bacon', price: 4 },
      { name: 'Catupiry', price: 4 },
    ],
  },
];

const DRINK_SIZE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '300ml', price: 0 },
      { name: '500ml', price: 2 },
      { name: '1L', price: 4 },
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
    ],
  },
];

const MILKSHAKE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '300ml', price: 0 },
      { name: '500ml', price: 4 },
    ],
  },
  {
    name: 'Cobertura',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Chantilly', price: 2 },
      { name: 'Calda de Chocolate', price: 2 },
      { name: 'Granulado', price: 1.5 },
    ],
  },
];

const PIZZA_SALGADA: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Broto (4 fatias)', price: 0 },
      { name: 'Média (6 fatias)', price: 10 },
      { name: 'Grande (8 fatias)', price: 18 },
      { name: 'Família (12 fatias)', price: 30 },
    ],
  },
  {
    name: 'Borda',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Tradicional', price: 0 },
      { name: 'Catupiry', price: 6 },
      { name: 'Cheddar', price: 6 },
    ],
  },
  {
    name: 'Massa',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Tradicional', price: 0 },
      { name: 'Fina', price: 0 },
      { name: 'Integral', price: 3 },
    ],
  },
  {
    name: 'Extras',
    required: false,
    allowRepeat: true,
    minOptions: 0,
    maxOptions: 5,
    options: [
      { name: 'Bacon', price: 5 },
      { name: 'Queijo Extra', price: 4 },
      { name: 'Azeitona', price: 3 },
      { name: 'Orégano', price: 0 },
    ],
  },
];

const PIZZA_DOCE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Broto', price: 0 },
      { name: 'Média', price: 8 },
      { name: 'Grande', price: 14 },
    ],
  },
  {
    name: 'Borda Doce',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Sem Borda Recheada', price: 0 },
      { name: 'Chocolate', price: 7 },
      { name: 'Doce de Leite', price: 6 },
    ],
  },
  {
    name: 'Extras Doces',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Leite Condensado', price: 3 },
      { name: 'Granulado', price: 2 },
    ],
  },
];

const CALZONE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Individual', price: 0 },
      { name: 'Grande', price: 8 },
    ],
  },
  {
    name: 'Extras',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 3,
    options: [
      { name: 'Queijo Extra', price: 4 },
      { name: 'Bacon', price: 5 },
      { name: 'Catupiry', price: 4 },
    ],
  },
];

const ESFIHA: ComplementSeed[] = [
  {
    name: 'Quantidade',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '6 unidades', price: 0 },
      { name: '12 unidades', price: 18 },
      { name: '20 unidades', price: 28 },
    ],
  },
];

const RESTAURANT_MAIN: ComplementSeed[] = [
  {
    name: 'Acompanhamentos',
    required: true,
    allowRepeat: false,
    minOptions: 2,
    maxOptions: 3,
    options: [
      { name: 'Arroz Branco', price: 0 },
      { name: 'Feijão', price: 0 },
      { name: 'Farofa', price: 0 },
      { name: 'Salada', price: 0 },
      { name: 'Vinagrete', price: 0 },
    ],
  },
  {
    name: 'Extras',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 3,
    options: [
      { name: 'Arroz Extra', price: 3 },
      { name: 'Feijão Extra', price: 3 },
      { name: 'Ovo Frito', price: 2.5 },
    ],
  },
];

const RESTAURANT_MEAT: ComplementSeed[] = [
  ...RESTAURANT_MAIN,
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
];

const RESTAURANT_REGIONAL: ComplementSeed[] = [
  {
    name: 'Acompanhamentos Regionais',
    required: true,
    allowRepeat: false,
    minOptions: 2,
    maxOptions: 3,
    options: [
      { name: 'Arroz', price: 0 },
      { name: 'Feijão Verde', price: 0 },
      { name: 'Macaxeira', price: 0 },
      { name: 'Farofa', price: 0 },
      { name: 'Pirão', price: 2 },
    ],
  },
  {
    name: 'Extras Regionais',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Queijo Coalho', price: 6 },
      { name: 'Carne de Sol Extra', price: 8 },
    ],
  },
];

const RESTAURANT_FISH: ComplementSeed[] = [
  {
    name: 'Acompanhamentos',
    required: true,
    allowRepeat: false,
    minOptions: 2,
    maxOptions: 3,
    options: [
      { name: 'Arroz', price: 0 },
      { name: 'Pirão', price: 0 },
      { name: 'Legumes', price: 0 },
      { name: 'Salada', price: 0 },
    ],
  },
  {
    name: 'Preparo',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Grelhado', price: 0 },
      { name: 'Frito', price: 0 },
      { name: 'Ensopado', price: 2 },
    ],
  },
];

const RESTAURANT_PASTA: ComplementSeed[] = [
  {
    name: 'Molho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Bolonhesa', price: 0 },
      { name: 'Branco', price: 2 },
      { name: 'Pesto', price: 3 },
      { name: 'Rosé', price: 2 },
    ],
  },
  {
    name: 'Proteína Extra',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Frango', price: 5 },
      { name: 'Camarão', price: 8 },
      { name: 'Bacon', price: 4 },
    ],
  },
];

const RESTAURANT_STARTER: ComplementSeed[] = [
  {
    name: 'Porção',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Individual', price: 0 },
      { name: 'Para 2', price: 6 },
      { name: 'Para 4', price: 12 },
    ],
  },
];

const RESTAURANT_SALAD: ComplementSeed[] = [
  {
    name: 'Proteína',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Sem Proteína', price: 0 },
      { name: 'Frango Grelhado', price: 6 },
      { name: 'Carne', price: 8 },
    ],
  },
  {
    name: 'Molho da Salada',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Mostarda e Mel', price: 0 },
      { name: 'Limão', price: 0 },
      { name: 'Balsâmico', price: 1 },
    ],
  },
];

const BEER: ComplementSeed[] = [
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
      { name: 'Pack 6', price: -2 },
      { name: 'Pack 12', price: -5 },
    ],
  },
];

const WINE: ComplementSeed[] = [
  {
    name: 'Temperatura',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Ambiente', price: 0 },
      { name: 'Gelado', price: 0 },
    ],
  },
];

const SOFT_DRINK: ComplementSeed[] = [
  {
    name: 'Volume',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '350ml', price: 0 },
      { name: '600ml', price: 2 },
      { name: '1L', price: 3.5 },
      { name: '2L', price: 6 },
    ],
  },
];

const ICE_BAG: ComplementSeed[] = [
  {
    name: 'Peso',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '2kg', price: 0 },
      { name: '5kg', price: 10 },
      { name: '10kg', price: 18 },
    ],
  },
];

const PERFUME: ComplementSeed[] = [
  {
    name: 'Volume',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '30ml', price: 0 },
      { name: '50ml', price: 25 },
      { name: '100ml', price: 55 },
    ],
  },
  {
    name: 'Concentração',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'EDT', price: 0 },
      { name: 'EDP', price: 20 },
      { name: 'Parfum', price: 40 },
    ],
  },
  {
    name: 'Embalagem para Presente',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Sem Embalagem', price: 0 },
      { name: 'Caixa Presente', price: 5 },
      { name: 'Embrulho Premium', price: 8 },
    ],
  },
];

const MAKEUP: ComplementSeed[] = [
  {
    name: 'Tom',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Claro', price: 0 },
      { name: 'Médio', price: 0 },
      { name: 'Escuro', price: 0 },
    ],
  },
];

const SKIN_CARE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: '50ml', price: 0 },
      { name: '100ml', price: 15 },
      { name: '200ml', price: 28 },
    ],
  },
];

const CALDO_NE: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Copo 300ml', price: 0 },
      { name: 'Caneca 500ml', price: 4 },
      { name: 'Tigela 700ml', price: 8 },
    ],
  },
  {
    name: 'Tempero',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { name: 'Suave', price: 0 },
      { name: 'Normal', price: 0 },
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
      { name: 'Com Pimenta', price: 0 },
    ],
  },
  {
    name: 'Extras',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Limão', price: 0.5 },
      { name: 'Coentro Extra', price: 1 },
    ],
  },
];

const CANJA: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Copo 300ml', price: 0 },
      { name: 'Caneca 500ml', price: 3 },
      { name: 'Tigela 700ml', price: 6 },
    ],
  },
  {
    name: 'Extras',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Frango Extra', price: 4 },
      { name: 'Arroz Extra', price: 2 },
    ],
  },
];

const CALDO_MAR: ComplementSeed[] = [
  {
    name: 'Tamanho',
    required: true,
    allowRepeat: false,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { name: 'Copo 300ml', price: 0 },
      { name: 'Caneca 500ml', price: 5 },
      { name: 'Tigela 700ml', price: 10 },
    ],
  },
  {
    name: 'Frutos do Mar Extra',
    required: false,
    allowRepeat: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { name: 'Camarão Extra', price: 8 },
      { name: 'Peixe Extra', price: 6 },
    ],
  },
];

// ─── Catálogo por segmento (slug da categoria) ──────────────────────────────

export const segmentComplementsCatalog: ComplementsBySegment = {
  hamburgueria: {
    hamburgueres: BURGER_BASE,
    'hamburgueres-premium': BURGER_BASE,
    'hamburgueres-artesanais': BURGER_BASE,
    'hamburgueres-veganos': BURGER_VEGAN,
    acompanhamentos: SIDE_PORTION,
    porcoes: SIDE_PORTION,
    bebidas: DRINK_SIZE,
    milkshakes: MILKSHAKE,
    sobremesas: [
      {
        name: 'Cobertura',
        required: false,
        allowRepeat: false,
        minOptions: 0,
        maxOptions: 2,
        options: [
          { name: 'Calda de Chocolate', price: 2 },
          { name: 'Morango', price: 3 },
        ],
      },
    ],
    combos: [
      {
        name: 'Bebida do Combo',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Refrigerante', price: 0 },
          { name: 'Suco', price: 1 },
          { name: 'Milkshake', price: 5 },
        ],
      },
      {
        name: 'Acompanhamento do Combo',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: 'Batata Frita', price: 0 },
          { name: 'Onion Rings', price: 3 },
        ],
      },
    ],
  },

  pizzaria: {
    'pizzas-salgadas': PIZZA_SALGADA,
    'pizzas-premium': PIZZA_SALGADA,
    'pizzas-doces': PIZZA_DOCE,
    calzones: CALZONE,
    esfihas: ESFIHA,
    entradas: RESTAURANT_STARTER,
    massas: RESTAURANT_PASTA,
    saladas: RESTAURANT_SALAD,
    bebidas: DRINK_SIZE,
    sobremesas: [],
  },

  restaurante: {
    'pratos-principais': RESTAURANT_MAIN,
    carnes: RESTAURANT_MEAT,
    'comida-regional': RESTAURANT_REGIONAL,
    'peixes-frutos-mar': RESTAURANT_FISH,
    massas: RESTAURANT_PASTA,
    entradas: RESTAURANT_STARTER,
    saladas: RESTAURANT_SALAD,
    bebidas: DRINK_SIZE,
    sobremesas: [],
    porcoes: SIDE_PORTION,
  },

  depositoBebidas: {
    cervejas: BEER,
    'cervejas-especiais': BEER,
    vinhos: WINE,
    destilados: SOFT_DRINK,
    refrigerantes: SOFT_DRINK,
    sucos: SOFT_DRINK,
    aguas: SOFT_DRINK,
    energeticos: SOFT_DRINK,
    'drinks-prontos': SOFT_DRINK,
    gelo: ICE_BAG,
  },

  perfumaria: {
    'perfumes-femininos': PERFUME,
    'perfumes-masculinos': PERFUME,
    natura: PERFUME,
    avon: PERFUME,
    'o-boticario': PERFUME,
    maquiagem: MAKEUP,
    'cuidados-pele': SKIN_CARE,
    cabelos: SKIN_CARE,
  },

  canozes: {
    'caldos-nordestinos': CALDO_NE,
    canjas: CANJA,
    'caldos-frutos-mar': CALDO_MAR,
    sopas: CALDO_NE,
    acompanhamentos: [
      {
        name: 'Quantidade',
        required: true,
        allowRepeat: false,
        minOptions: 1,
        maxOptions: 1,
        options: [
          { name: '1 unidade', price: 0 },
          { name: '2 unidades', price: 3 },
          { name: '3 unidades', price: 5 },
        ],
      },
    ],
    bebidas: DRINK_SIZE,
  },
};

/** Slug da categoria → chave camelCase legada em `productsData`. */
export function categorySlugToProductsKey(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
