import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { TableStatus } from 'src/modules/tables/types';

interface ProductSeed {
  name: string;
  description: string;
  price: number;
  image: string;
  featured?: boolean;
  filterMetadata?: {
    genero?: string;
    tamanho?: string[];
    tipo?: string;
    tom?: string[];
    acabamento?: string;
    marca?: string;
    linha?: string;
  };
}

export interface BranchSeed {
  branchName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  document: string;
  phone: string;
  subdomain: string;
  lat: number;
  lng: number;
}

export interface CompanySeed {
  name: string;
  companyName: string;
  document: string;
  email: string;
  phone: string;
  logo: string;
  banner: string;
  branches: BranchSeed[];
}

interface CategorySeed {
  name: string;
  slug: string;
  image: string;
  featured: boolean;
}

export const BusinessSegment = {
  HAMBURGUERIA: 'hamburgueria',
  DEPOSITO_BEBIDAS: 'depositoBebidas',
  PERFUMARIA: 'perfumaria',
  PIZZARIA: 'pizzaria',
  CANOZES: 'canozes',
  RESTAURANTE: 'restaurante',
} as const;

export type BusinessSegmentType =
  (typeof BusinessSegment)[keyof typeof BusinessSegment];

// Mapeamento de categorias por segmento
export type SegmentCategories = {
  [BusinessSegment.HAMBURGUERIA]:
    | 'hamburgers'
    | 'acompanhamentos'
    | 'bebidas'
    | 'sobremesas';
  [BusinessSegment.DEPOSITO_BEBIDAS]:
    | 'cervejas'
    | 'refrigerantes'
    | 'sucos'
    | 'aguas'
    | 'energeticos';
  [BusinessSegment.RESTAURANTE]: 'pratosPrincipais' | 'entradas';
  [BusinessSegment.PIZZARIA]: 'pizzas' | 'calzones';
  [BusinessSegment.CANOZES]: 'pizzas' | 'calzones' | 'canecas';
  [BusinessSegment.PERFUMARIA]:
    | 'perfumes'
    | 'natura'
    | 'avon'
    | 'oBoticario'
    | 'maquiagem'
    | 'cuidadosPessoais';
};

interface ComplementOptionSeed {
  name: string;
  price: number;
}

interface ComplementSeed {
  name: string;
  required: boolean;
  allowRepeat: boolean;
  minOptions: number;
  maxOptions?: number;
  options: ComplementOptionSeed[];
}

interface ComplementOptionSeed {
  name: string;
  price: number;
}

interface ComplementSeed {
  name: string;
  required: boolean;
  allowRepeat: boolean;
  minOptions: number;
  maxOptions?: number;
  options: ComplementOptionSeed[];
}

export type BusinessSegment =
  (typeof BusinessSegment)[keyof typeof BusinessSegment];

type ProductsByCategory = Record<string, ProductSeed[]>;
type ComplementsByCategory = Record<string, ComplementSeed[]>;
type ProductsByCompanyType = Record<BusinessSegmentType, ProductsByCategory>;
type ComplementsBySegment = Record<BusinessSegment, ComplementSeed[]>;

// Função auxiliar para obter as categorias de um segmento
function getCategoriesForSegment(segment: BusinessSegmentType): CategorySeed[] {
  return categoriesData[segment] || [];
}

// Função auxiliar para obter produtos de uma categoria
function getProductsForCategory(
  segment: BusinessSegmentType,
  categorySlug: string,
): ProductSeed[] {
  const segmentProducts = productsData[segment];
  if (!segmentProducts) return [];

  return segmentProducts[categorySlug] || [];
}

// Função auxiliar para obter complementos de uma categoria

function getComplementsForSegment(
  segment: BusinessSegmentType,
): ComplementSeed[] {
  return complementsData[segment] || [];
}
async function createCategoriesProductsAndComplements(
  segment: BusinessSegmentType,
  branchId: string,
  money: (value: number) => number,
) {
  console.log(`🔄 Criando categorias para o segmento: ${segment}`);

  const categories = getCategoriesForSegment(segment);
  const createdCategories: any[] = [];

  // PEGAR TODOS OS COMPLEMENTOS DO SEGMENTO UMA VEZ
  const segmentComplements = getComplementsForSegment(segment);

  for (const categoryData of categories) {
    console.log(`🔄 Criando categoria: ${categoryData.name}`);

    const category = await prisma.category.create({
      data: {
        name: categoryData.name,
        slug: categoryData.slug,
        image: categoryData.image,
        featured: categoryData.featured,
        branchId: branchId,
        active: true,
      },
    });
    createdCategories.push(category);

    const products = getProductsForCategory(segment, categoryData.slug);
    console.log(
      `📦 Criando ${products.length} produtos para ${categoryData.name}`,
    );

    for (const productData of products) {
      console.log(`  🔄 Criando produto: ${productData.name}`);

      const priceInCents = Math.round(Number(productData.price) * 100);

      const product = await prisma.product.create({
        data: {
          name: productData.name,
          description: productData.description,
          price: priceInCents,
          image: productData.image,
          featured: productData.featured || false,
          active: true,
          categoryId: category.id,
          branchId: branchId,
          preparationTime:
            segment === BusinessSegment.PERFUMARIA
              ? null
              : Math.floor(Math.random() * 30) + 15,
          filterMetadata: productData.filterMetadata
            ? JSON.stringify(productData.filterMetadata)
            : null,
        },
      });

      // APLICAR TODOS OS COMPLEMENTOS DO SEGMENTO
      if (segmentComplements.length > 0) {
        console.log(`  🔧 Criando ${segmentComplements.length} complementos`);

        for (const complementData of segmentComplements) {
          // GERAR VALORES ALEATÓRIOS
          const allowRepeat = Math.random() > 0.7; // 30% de chance de permitir repetir
          const totalOptions = complementData.options.length;

          // minOptions: entre 0 e metade das opções disponíveis
          const minOptions = complementData.required
            ? Math.max(1, Math.floor(Math.random() * (totalOptions / 2)))
            : Math.floor(Math.random() * (totalOptions / 2));

          // maxOptions: entre minOptions e total de opções
          const maxOptions =
            minOptions +
            Math.floor(Math.random() * (totalOptions - minOptions + 1));

          const complement = await prisma.productComplement.create({
            data: {
              name: complementData.name,
              required: complementData.required,
              allowRepeat: allowRepeat,
              minOptions: minOptions,
              maxOptions: Math.max(maxOptions, minOptions), // garantir que max >= min
              active: true,
              productId: product.id,
              branchId: branchId,
            },
          });

          for (const optionData of complementData.options) {
                  const priceInCents = Math.round(Number(optionData.price) * 100);

            await prisma.complementOption.create({
              data: {
                name: optionData.name,
                branchId: branchId,
                price: priceInCents,
                active: true,
                complement: {
                  connect: {
                    id: complement.id,
                  },
                },
                stockControlEnabled: false,
              },
            });
          }
        }
      }
    }
  }

  console.log(`✅ Categorias criadas: ${createdCategories.length}`);
  return createdCategories;
}
// Garantir valores monetários sempre com 2 casas decimais (evita 23.902321)
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

// Configurações do seed
const SEED_CONFIG = {
  // Quantidade de empresas por tipo
  companies: {
    hamburgueria: 3,
    depositoBebidas: 2,
    restaurante: 2,
    pizzaria: 3,
    perfumaria: 1,
  },
  // Quantidade de produtos por categoria
  productsPerCategory: 5,
  // Quantidade de entregadores por filial
  deliveryPerBranch: 2,
  // Quantidade de áreas de entrega por filial
  deliveryAreasPerBranch: 2,
  // Mesas (PDV)
  tablesPerBranch: 10,
  numberofpeople: 4,
};

async function seedTablesForBranch(branchId: string, userId: string) {
  const tables = Array.from(
    { length: SEED_CONFIG.tablesPerBranch },
    (_, i) => ({
      branchId,
      number: String(i + 1),
      numberofpeople: SEED_CONFIG.numberofpeople,
      identification: `Mesa ${i + 1}`,
      status: TableStatus.CLOSED,
      userId: userId,
    }),
  );

  console.log('🔄 Criando mesas para a filial...');
  for (let i = 0; i < tables.length; i++) {
    await prisma.table.create({
      data: {
        ...tables[i],
      },
    });
  }
}

export async function generateHashedPassword(
  password: string,
): Promise<string> {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    return hashedPassword;
  } catch (error) {
    throw new Error('Erro ao gerar hash da senha');
  }
}

// Dados de empresas do Recife

const customersData = [
  {
    name: 'João da Silva',
    email: 'joao.silva@example.com',
    phone: '81987654321',
    address: 'Rua do Pina, 1017',
    city: 'Recife',
  },
  {
    name: 'Maria Oliveira',
    email: 'maria.oliveira@example.com',
    phone: '81987654322',
    address: 'Av. Boa Viagem, 5000',
    city: 'Recife',
  },
  {
    name: 'Pedro Santos',
    email: 'pedro.santos@example.com',
    phone: '81987654323',
    address: 'Rui Barbosa, 1520',
    city: 'Recife',
  },
  {
    name: 'Ana Souza',
    email: 'ana.souza@example.com',
    phone: '81987654324',
    address: 'Rua da Várzea, 123',
    city: 'Recife',
  },
  {
    name: 'Rafael Oliveira',
    email: 'rafael.oliveira@example.com',
    phone: '81987654325',
    address: 'Av. Rui Barbosa, 1520',
    city: 'Recife',
  },
  {
    name: 'Julia Santos',
    email: 'julia.santos@example.com',
    phone: '81987654326',
    address: 'Rua da Várzea, 123',
    city: 'Recife',
  },
  {
    name: 'Bruno Carvalho',
    email: 'bruno.carvalho@example.com',
    phone: '81987654327',
    address: 'Av. Rui Barbosa, 1520',
    city: 'Recife',
  },
  {
    name: 'Larissa Oliveira',
    email: 'larissa.oliveira@example.com',
    phone: '81987654328',
    address: 'Rua da Várzea, 123',
    city: 'Recife',
  },
  {
    name: 'Gustavo Santos',
    email: 'gustavo.santos@example.com',
    phone: '81987654329',
    address: 'Av. Rui Barbosa, 1520',
    city: 'Recife',
  },
];


const companiesData: Record<BusinessSegment, CompanySeed[]> = {
  [BusinessSegment.HAMBURGUERIA]: [
    {
      name: 'Tio Armênio',
      companyName: 'Tio Armênio',
      document: '12345678013190',
      email: 'contato@tioarmenio.com.br',
      phone: '81987654321',
      logo: 'https://tioarmenio.com.br/wp-content/uploads/2023/01/logo-tio-armenio.png',
      banner:
        'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Tio Armênio - Boa Viagem',
          address: 'Av. Conselheiro Aguiar, 3150',
          city: 'Recife',
          state: 'PE',
          zipCode: '51021-020',
          document: '123421781012190',
          phone: '8132657070',
          subdomain: 'tioarmenioboaviagem',
          lat: -8.1223,
          lng: -34.9028,
        },
        {
          branchName: 'Tio Armênio - Espinheiro',
          address: 'Rua Benfica, 234',
          city: 'Recife',
          state: 'PE',
          document: '121256781012191',
          zipCode: '52020-080',
          phone: '8132418585',
          subdomain: 'tioarmenioespinheiro',
          lat: -8.0423,
          lng: -34.8951,
        },
      ],
    },
    {
      name: 'Burger Station',
      companyName: 'Burger Station',
      document: '12345678000191',
      email: 'contato@burgerstation.com.br',
      phone: '81987654323',
      logo: 'https://burgerstation.com.br/assets/logo.png',
      banner:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Burger Station - Recife Antigo',
          address: 'Rua do Bom Jesus, 120',
          city: 'Recife',
          state: 'PE',
          document: '123456781012192',
          zipCode: '50030-170',
          phone: '8133551234',
          subdomain: 'burgerstationrecife',
          lat: -8.0626,
          lng: -34.8712,
        },
      ],
    },
    {
      name: 'Cão Véio',
      companyName: 'Cão Véio',
      document: '12345228000192',
      email: 'contato@caoveio.com.br',
      phone: '81987654325',
      logo: 'https://caoveio.com.br/wp-content/uploads/2022/logo-cao-veio.png',
      banner:
        'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Cão Véio - Boa Viagem',
          address: 'Av. Boa Viagem, 3600',
          city: 'Recife',
          state: 'PE',
          zipCode: '51021-000',
          document: '123456781012193',
          phone: '8133251212',
          subdomain: 'caoveioboaviagem',
          lat: -8.1194,
          lng: -34.9042,
        },
      ],
    },
    {
      name: 'Five Burger',
      companyName: 'Five Burger',
      document: '12345678000201',
      email: 'contato@fiveburger.com.br',
      phone: '81987654350',
      logo: 'https://fiveburger.com.br/assets/images/logo-five.png',
      banner:
        'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Five Burger - Casa Forte',
          address: 'Praça de Casa Forte, 65',
          city: 'Recife',
          state: 'PE',
          document: '123456781012199',
          zipCode: '52060-420',
          phone: '8133414545',
          subdomain: 'fiveburgercasaforte',
          lat: -8.0282,
          lng: -34.9297,
        },
      ],
    },
  ],
  [BusinessSegment.PIZZARIA]: [
    {
      name: 'Atlântico Pizzaria',
      companyName: 'Atlântico Pizzaria',
      document: '12345678000192',
      email: 'contato@atlanticopizzaria.com.br',
      phone: '8134633434',
      logo: 'https://atlanticopizzaria.com.br/wp-content/uploads/logo-atlantico.png',
      banner:
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Atlântico Pizzaria - Boa Viagem',
          address: 'Av. Boa Viagem, 5000',
          city: 'Recife',
          state: 'PE',
          zipCode: '51030-000',
          document: '123456781012194',
          phone: '8134633434',
          subdomain: 'atlanticopizzaria',
          lat: -8.1294,
          lng: -34.9042,
        },
      ],
    },
    {
      name: 'Donna Pizza',
      companyName: 'Donna Pizza',
      document: '1234528001191',
      email: 'contato@donnapizza.com.br',
      phone: '8133267878',
      logo: 'https://donnapizza.com.br/assets/logo-donna.png',
      banner:
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Donna Pizza - Espinheiro',
          address: 'Rua Real da Torre, 567',
          city: 'Recife',
          state: 'PE',
          zipCode: '52050-000',
          document: '123456781012196',
          phone: '8133267878',
          subdomain: 'donnapizzaespinheiro',
          lat: -8.0456,
          lng: -34.8945,
        },
      ],
    },
    {
      name: 'Pizza Hut Recife',
      companyName: 'Pizza Hut Recife',
      document: '123223678000192',
      email: 'contato@pizzahutrecife.com.br',
      phone: '8140208080',
      logo: 'https://logos-world.net/wp-content/uploads/2020/11/Pizza-Hut-Logo.png',
      banner:
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Pizza Hut - Shopping Recife',
          address: 'Rua Padre Carapuceiro, 777',
          city: 'Recife',
          state: 'PE',
          zipCode: '51020-280',
          phone: '8140208080',
          document: '123456781012197',
          subdomain: 'pizzahutrecife',
          lat: -8.1194,
          lng: -34.9042,
        },
      ],
    },
    {
      name: 'Forno & Forneria',
      companyName: 'Forno & Forneria',
      document: '12345678000213',
      email: 'contato@fornoeforneria.com.br',
      phone: '8133421919',
      logo: 'https://fornoeforneria.com.br/assets/logo.png',
      banner:
        'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Forno & Forneria - Boa Viagem',
          address: 'Av. Conselheiro Aguiar, 1472',
          city: 'Recife',
          document: '123456781012198',
          state: 'PE',
          zipCode: '51011-030',
          phone: '8133421919',
          subdomain: 'fornoeforneria',
          lat: -8.1156,
          lng: -34.8989,
        },
      ],
    },
  ],
  [BusinessSegment.DEPOSITO_BEBIDAS]: [
    {
      name: 'Adega 31',
      companyName: 'Adega 31',
      document: '12345678000301',
      email: 'contato@adega31.com.br',
      phone: '8133261234',
      logo: 'https://adega31.com.br/assets/logo-adega31.png',
      banner:
        'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Adega 31 - Boa Viagem',
          address: 'Av. Boa Viagem, 3100',
          city: 'Recife',
          state: 'PE',
          zipCode: '51020-001',
          document: '123456781012301',
          phone: '8133261234',
          subdomain: 'adega31boaviagem',
          lat: -8.1189,
          lng: -34.9015,
        },
      ],
    },
    {
      name: 'Depósito Recife',
      companyName: 'Depósito Recife',
      document: '12345678000302',
      email: 'contato@depositorecife.com.br',
      phone: '8133455678',
      logo: 'https://depositorecife.com.br/logo.png',
      banner:
        'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Depósito Recife - Casa Forte',
          address: 'Rua Benfica, 789',
          city: 'Recife',
          state: 'PE',
          zipCode: '52061-100',
          document: '123456781012302',
          phone: '8133455678',
          subdomain: 'depositorecifecasaforte',
          lat: -8.0312,
          lng: -34.9267,
        },
      ],
    },
  ],
  [BusinessSegment.PERFUMARIA]: [],
  [BusinessSegment.CANOZES]: [
    {
      name: 'Caldos do Neguinho',
      companyName: 'Caldos do Neguinho',
      document: '12345678000601',
      email: 'contato@caldosdoneguinho.com.br',
      phone: '8133881122',
      logo: 'https://caldosdoneguinho.com.br/assets/logo-caldos.png',
      banner:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Caldos do Neguinho - Boa Viagem',
          address: 'Av. Boa Viagem, 5523',
          city: 'Recife',
          state: 'PE',
          zipCode: '51030-001',
          document: '123456781012601',
          phone: '8133881122',
          subdomain: 'caldosdoneguinhoboaviagem',
          lat: -8.1323,
          lng: -34.9067,
        },
      ],
    },
    {
      name: 'Caldo de Sururu do Edu',
      companyName: 'Caldo de Sururu do Edu',
      document: '12345678000602',
      email: 'contato@caldosururudoedu.com.br',
      phone: '8133992233',
      logo: 'https://caldosururudoedu.com.br/assets/logo-sururu.png',
      banner:
        'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Caldo de Sururu do Edu - Pina',
          address: 'Rua do Pina, 450',
          city: 'Recife',
          state: 'PE',
          zipCode: '51011-000',
          document: '123456781012602',
          phone: '8133992233',
          subdomain: 'sururudoedupina',
          lat: -8.0889,
          lng: -34.8823,
        },
      ],
    },
    {
      name: 'Canjas & Caldos da Vovó',
      companyName: 'Canjas & Caldos da Vovó',
      document: '12345678000603',
      email: 'contato@canjasdavovo.com.br',
      phone: '8134003344',
      logo: 'https://canjasdavovo.com.br/assets/logo-vovo.png',
      banner:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Canjas & Caldos da Vovó - Casa Amarela',
          address: 'Estrada do Arraial, 1234',
          city: 'Recife',
          state: 'PE',
          zipCode: '52051-380',
          document: '123456781012603',
          phone: '8134003344',
          subdomain: 'canjasdavovocasaamarela',
          lat: -8.0189,
          lng: -34.9234,
        },
      ],
    },
    {
      name: 'Caldo Bom Demais',
      companyName: 'Caldo Bom Demais',
      document: '12345678000604',
      email: 'contato@caldobomdemais.com.br',
      phone: '8134114455',
      logo: 'https://caldobomdemais.com.br/assets/logo-bom-demais.png',
      banner:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Caldo Bom Demais - Torre',
          address: 'Rua da Torre, 789',
          city: 'Recife',
          state: 'PE',
          zipCode: '50710-000',
          document: '123456781012604',
          phone: '8134114455',
          subdomain: 'caldobomdemaistorre',
          lat: -8.0467,
          lng: -34.8956,
        },
      ],
    },
  ],
  [BusinessSegment.RESTAURANTE]: [
    {
      companyName: 'Parraxaxá',
      name: 'Parraxaxá',
      document: '12345678000401',
      email: 'contato@parraxaxa.com.br',
      phone: '8133021588',
      logo: 'https://parraxaxa.com.br/wp-content/uploads/logo-parraxaxa.png',
      banner:
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Parraxaxá - Boa Viagem',
          address: 'Av. Fernando Simões Barbosa, 1200',
          city: 'Recife',
          state: 'PE',
          zipCode: '51021-060',
          document: '123456781012401',
          phone: '8133021588',
          subdomain: 'parraxaxaboaviagem',
          lat: -8.1167,
          lng: -34.8956,
        },
      ],
    },
    {
      name: 'Bode do Nô',
      companyName: 'Bode do Nô',
      document: '12345678000402',
      email: 'contato@bodedono.com.br',
      phone: '8133271818',
      logo: 'https://bodedono.com.br/assets/logo-bode.png',
      banner:
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Bode do Nô - Boa Viagem',
          address: 'Rua Baltazar Pereira, 32',
          city: 'Recife',
          state: 'PE',
          zipCode: '51030-390',
          document: '123456781012402',
          phone: '8133271818',
          subdomain: 'bodedonoboaviagem',
          lat: -8.1278,
          lng: -34.9012,
        },
      ],
    },
    {
      name: 'Oficina do Sabor',
      companyName: 'Oficina do Sabor',
      document: '12345678000403',
      email: 'contato@oficinadosabor.com.br',
      phone: '8130352147',
      logo: 'https://oficinadosabor.com/assets/logo-oficina.png',
      banner:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=400&fit=crop&q=80',
      branches: [
        {
          branchName: 'Oficina do Sabor - Poço',
          address: 'Rua do Poço, 65',
          city: 'Recife',
          state: 'PE',
          zipCode: '50040-220',
          document: '123456781012403',
          phone: '8130352147',
          subdomain: 'oficinadosabor',
          lat: -8.0534,
          lng: -34.8812,
        },
      ],
    },
  ],
};

// Categorias por tipo de empresa
const categoriesData: Record<BusinessSegment, CategorySeed[]> = {
  [BusinessSegment.HAMBURGUERIA]: [
    {
      name: 'Hambúrgueres',
      slug: 'hamburgueres',
      image:
        'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Hambúrgueres Premium',
      slug: 'hamburgueres-premium',
      image:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Hambúrgueres Artesanais',
      slug: 'hamburgueres-artesanais',
      image:
        'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Hambúrgueres Veganos',
      slug: 'hamburgueres-veganos',
      image:
        'https://images.unsplash.com/photo-1525059696034-4967a7290027?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Acompanhamentos',
      slug: 'acompanhamentos',
      image:
        'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Porções',
      slug: 'porcoes',
      image:
        'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Bebidas',
      slug: 'bebidas',
      image:
        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Milkshakes',
      slug: 'milkshakes',
      image:
        'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Sobremesas',
      slug: 'sobremesas',
      image:
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Combos',
      slug: 'combos',
      image:
        'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&h=400&fit=crop',
      featured: true,
    },
  ],
  [BusinessSegment.DEPOSITO_BEBIDAS]: [
    {
      name: 'Cervejas',
      slug: 'cervejas',
      image:
        'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Cervejas Especiais',
      slug: 'cervejas-especiais',
      image:
        'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Refrigerantes',
      slug: 'refrigerantes',
      image:
        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Sucos',
      slug: 'sucos',
      image:
        'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Águas',
      slug: 'aguas',
      image:
        'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Energéticos',
      slug: 'energeticos',
      image:
        'https://images.unsplash.com/photo-1622543925917-763c34f1f161?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Vinhos',
      slug: 'vinhos',
      image:
        'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Destilados',
      slug: 'destilados',
      image:
        'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Drinks Prontos',
      slug: 'drinks-prontos',
      image:
        'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Gelo',
      slug: 'gelo',
      image:
        'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&h=400&fit=crop',
      featured: false,
    },
  ],
  [BusinessSegment.RESTAURANTE]: [
    {
      name: 'Pratos Principais',
      slug: 'pratos-principais',
      image:
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Comida Regional',
      slug: 'comida-regional',
      image:
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Entradas',
      slug: 'entradas',
      image:
        'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Peixes e Frutos do Mar',
      slug: 'peixes-frutos-mar',
      image:
        'https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Carnes',
      slug: 'carnes',
      image:
        'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Massas',
      slug: 'massas',
      image:
        'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Saladas',
      slug: 'saladas',
      image:
        'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Sobremesas',
      slug: 'sobremesas',
      image:
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Bebidas',
      slug: 'bebidas',
      image:
        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Porções',
      slug: 'porcoes',
      image:
        'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop',
      featured: false,
    },
  ],
  [BusinessSegment.CANOZES]: [
    {
      name: 'Caldos Nordestinos',
      slug: 'caldos-nordestinos',
      image:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Canjas',
      slug: 'canjas',
      image:
        'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Caldos de Frutos do Mar',
      slug: 'caldos-frutos-mar',
      image:
        'https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Sopas',
      slug: 'sopas',
      image:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Acompanhamentos',
      slug: 'acompanhamentos',
      image:
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Bebidas',
      slug: 'bebidas',
      image:
        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop',
      featured: false,
    },
  ],
  [BusinessSegment.PERFUMARIA]: [
    {
      name: 'Perfumes Femininos',
      slug: 'perfumes-femininos',
      image:
        'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Perfumes Masculinos',
      slug: 'perfumes-masculinos',
      image:
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Natura',
      slug: 'natura',
      image:
        'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Avon',
      slug: 'avon',
      image:
        'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'O Boticário',
      slug: 'o-boticario',
      image:
        'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Maquiagem',
      slug: 'maquiagem',
      image:
        'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Cuidados com a Pele',
      slug: 'cuidados-pele',
      image:
        'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Cabelos',
      slug: 'cabelos',
      image:
        'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&h=400&fit=crop',
      featured: false,
    },
  ],
  [BusinessSegment.PIZZARIA]: [
    {
      name: 'Pizzas Salgadas',
      slug: 'pizzas-salgadas',
      image:
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Pizzas Doces',
      slug: 'pizzas-doces',
      image:
        'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Pizzas Premium',
      slug: 'pizzas-premium',
      image:
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop',
      featured: true,
    },
    {
      name: 'Calzones',
      slug: 'calzones',
      image:
        'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Esfihas',
      slug: 'esfihas',
      image:
        'https://images.unsplash.com/photo-1619740455993-8cced4f2e3fe?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Entradas',
      slug: 'entradas',
      image:
        'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Massas',
      slug: 'massas',
      image:
        'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Saladas',
      slug: 'saladas',
      image:
        'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Bebidas',
      slug: 'bebidas',
      image:
        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop',
      featured: false,
    },
    {
      name: 'Sobremesas',
      slug: 'sobremesas',
      image:
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=400&fit=crop',
      featured: false,
    },
  ],
};

// Produtos por categoria
const productsData: ProductsByCompanyType = {
  [BusinessSegment.HAMBURGUERIA]: {
    hamburgueres: [
      {
        name: 'Hambúrguer Clássico',
        description:
          'Pão, hambúrguer 150g, alface, tomate, cebola e molho especial',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'X-Burger',
        description: 'Pão, hambúrguer 150g, queijo, alface, tomate e maionese',
        price: 20.9,
        image:
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'X-Salada',
        description:
          'Pão, hambúrguer 150g, queijo, presunto, alface, tomate e maionese',
        price: 22.9,
        image:
          'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'X-Bacon',
        description:
          'Pão, hambúrguer 150g, queijo, bacon, alface, tomate e molho',
        price: 24.9,
        image:
          'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'X-Tudo',
        description:
          'Pão, hambúrguer 150g, queijo, presunto, bacon, ovo, alface, tomate e milho',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1572448862527-d3c904757de6?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'X-Egg',
        description: 'Pão, hambúrguer 150g, queijo, ovo, alface e tomate',
        price: 23.9,
        image:
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    hamburgueresPrestigios: [
      {
        name: 'Hambúrguer Duplo',
        description:
          'Pão, 2 hambúrgueres 150g, queijo duplo, alface, tomate e molho especial',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Hambúrguer Triplo',
        description:
          'Pão, 3 hambúrgueres 150g, queijo triplo, bacon e molho especial',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1572448862527-d3c904757de6?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Hambúrguer Cheddar Bacon',
        description:
          'Pão, hambúrguer 180g, cheddar cremoso, bacon crocante e cebola roxa',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Hambúrguer BBQ',
        description:
          'Pão, hambúrguer 180g, queijo, bacon, onion rings e molho barbecue',
        price: 30.9,
        image:
          'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    hamburgueresArtesanais: [
      {
        name: 'Artesanal Picanha',
        description:
          'Pão brioche, hambúrguer de picanha 180g, queijo gorgonzola, rúcula e cebola caramelizada',
        price: 36.9,
        image:
          'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Artesanal Costela',
        description:
          'Pão brioche, hambúrguer de costela 180g, queijo provolone, cebola crispy e molho especial',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Artesanal Angus',
        description:
          'Pão australiano, hambúrguer angus 200g, queijo cheddar, bacon e geleia de pimenta',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Artesanal da Casa',
        description:
          'Pão brioche, hambúrguer 200g, queijo brie, rúcula, tomate seco e molho pesto',
        price: 40.9,
        image:
          'https://images.unsplash.com/photo-1572448862527-d3c904757de6?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    hamburgueresVeganos: [
      {
        name: 'Hambúrguer Vegano',
        description:
          'Pão integral, hambúrguer de grão de bico, alface, tomate e molho vegano',
        price: 22.9,
        image:
          'https://images.unsplash.com/photo-1525059696034-4967a7290027?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Hambúrguer de Quinoa',
        description:
          'Pão integral, hambúrguer de quinoa e legumes, rúcula e molho tahine',
        price: 24.9,
        image:
          'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Hambúrguer Beyond Meat',
        description:
          'Pão brioche vegano, hambúrguer plant-based, queijo vegano e guacamole',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1525059696034-4967a7290027?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    acompanhamentos: [
      {
        name: 'Batata Frita',
        description: 'Batata frita crocante porção individual',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Batata Frita com Cheddar',
        description: 'Batata frita com cheddar cremoso e bacon',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1630431341973-02e1d543c7e1?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Batata Rústica',
        description: 'Batata rústica com casca temperada',
        price: 10.9,
        image:
          'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Onion Rings',
        description: 'Anéis de cebola empanados e fritos - 8 unidades',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1639024471283-03518883512d?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    porcoes: [
      {
        name: 'Nuggets',
        description: '10 unidades de nuggets de frango',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Tiras de Frango',
        description: '6 tiras de frango empanadas',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Porção de Calabresa',
        description: 'Calabresa acebolada 300g',
        price: 22.9,
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    bebidas: [
      {
        name: 'Coca-Cola 350ml',
        description: 'Refrigerante Coca-Cola lata',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Guaraná Antarctica 350ml',
        description: 'Refrigerante Guaraná Antarctica lata',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Sprite 350ml',
        description: 'Refrigerante Sprite lata',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Suco Natural 300ml',
        description: 'Suco natural - laranja, limão ou maracujá',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Água Mineral 500ml',
        description: 'Água mineral sem gás',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    milkshakes: [
      {
        name: 'Milkshake Chocolate',
        description: 'Milkshake cremoso de chocolate 400ml',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Milkshake Morango',
        description: 'Milkshake cremoso de morango 400ml',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Milkshake Baunilha',
        description: 'Milkshake cremoso de baunilha 400ml',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Milkshake Ovomaltine',
        description: 'Milkshake cremoso de ovomaltine 400ml',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    sobremesas: [
      {
        name: 'Sorvete de Casquinha',
        description: 'Sorvete de casquinha - chocolate ou morango',
        price: 6.9,
        image:
          'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Brownie com Sorvete',
        description: 'Brownie quente com sorvete de creme',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Torta de Limão',
        description: 'Fatia de torta de limão',
        price: 10.9,
        image:
          'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Cheesecake',
        description: 'Fatia de cheesecake com calda de frutas vermelhas',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1533134242820-b3bae20e7b75?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    combos: [
      {
        name: 'Combo Clássico',
        description: 'Hambúrguer clássico + batata frita + refrigerante 350ml',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Combo Duplo',
        description:
          '2 hambúrgueres clássicos + batata grande + 2 refrigerantes',
        price: 52.9,
        image:
          'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Combo Premium',
        description: 'Hambúrguer artesanal + batata rústica + milkshake',
        price: 48.9,
        image:
          'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
  },

  // ========== RESTAURANTE ==========
  [BusinessSegment.RESTAURANTE]: {
    pratosPrincipais: [
      {
        name: 'Feijoada Completa',
        description: 'Feijoada completa com arroz, farofa, couve e laranja',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1628158145672-c1b77cb1a480?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Picanha na Brasa',
        description: 'Picanha grelhada na brasa com arroz, vinagrete e farofa',
        price: 48.9,
        image:
          'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Frango Grelhado',
        description: 'Peito de frango grelhado com arroz e salada',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'File de Peixe Grelhado',
        description: 'Filé de peixe grelhado com arroz, legumes e molho',
        price: 35.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Bife à Parmegiana',
        description:
          'Bife empanado com molho de tomate e queijo, arroz e fritas',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    comidaRegional: [
      {
        name: 'Carne de Sol com Macaxeira',
        description:
          'Carne de sol na manteiga com macaxeira cozida e feijão verde',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1504973960431-1c467e159aa4?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Buchada de Bode',
        description: 'Buchada de bode completa com arroz e pirão',
        price: 45.9,
        image:
          'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Sarapatel',
        description: 'Sarapatel tradicional pernambucano com arroz',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Baião de Dois',
        description: 'Arroz com feijão verde, queijo coalho e carne seca',
        price: 34.9,
        image:
          'https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Galinha à Cabidela',
        description: 'Galinha à cabidela servida com arroz branco',
        price: 36.9,
        image:
          'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    entradas: [
      {
        name: 'Salada Caesar',
        description: 'Salada Caesar com frango grelhado e croutons',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Bruschetta',
        description: 'Bruschetta italiana com tomate, manjericão e azeite',
        price: 15.9,
        image:
          'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Bolinho de Bacalhau',
        description: '6 unidades de bolinho de bacalhau',
        price: 22.9,
        image:
          'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Casquinha de Siri',
        description: 'Casquinha de siri gratinada - 2 unidades',
        price: 24.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Queijo Coalho Grelhado',
        description: 'Queijo coalho grelhado com melado de cana',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    peixesFrutosMar: [
      {
        name: 'Moqueca de Peixe',
        description: 'Moqueca de peixe com arroz e pirão',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Camarão ao Alho e Óleo',
        description: 'Camarões grandes ao alho e óleo com arroz',
        price: 52.9,
        image:
          'https://images.unsplash.com/photo-1633504581786-316c8002b1b9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Peixada Pernambucana',
        description: 'Peixada com legumes e molho especial',
        price: 45.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Caldeirada de Frutos do Mar',
        description: 'Caldeirada com camarão, lula, polvo e peixe',
        price: 58.9,
        image:
          'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    carnes: [
      {
        name: 'Picanha Grelhada',
        description: 'Picanha grelhada 400g com acompanhamentos',
        price: 54.9,
        image:
          'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Costela de Boi na Brasa',
        description: 'Costela de boi assada na brasa com farofa',
        price: 48.9,
        image:
          'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'File Mignon ao Molho Madeira',
        description: 'Filé mignon ao molho madeira com batatas',
        price: 52.9,
        image:
          'https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    massas: [
      {
        name: 'Espaguete à Bolonhesa',
        description: 'Espaguete com molho bolonhesa e queijo ralado',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Lasanha à Bolonhesa',
        description: 'Lasanha de carne com molho bolonhesa gratinada',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Fettuccine Alfredo',
        description: 'Fettuccine ao molho alfredo com frango',
        price: 34.9,
        image:
          'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    saladas: [
      {
        name: 'Salada Tropical',
        description: 'Mix de folhas, manga, abacaxi e castanhas',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Salada Grega',
        description: 'Salada com tomate, pepino, azeitonas e queijo feta',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    sobremesas: [
      {
        name: 'Pudim de Leite',
        description: 'Pudim de leite condensado com calda de caramelo',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Cartola',
        description: 'Banana frita com queijo coalho e canela',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Bolo de Rolo',
        description: 'Fatia de bolo de rolo tradicional pernambucano',
        price: 10.9,
        image:
          'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Mousse de Maracujá',
        description: 'Mousse de maracujá cremoso',
        price: 11.9,
        image:
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    bebidas: [
      {
        name: 'Suco de Caju',
        description: 'Suco natural de caju 500ml',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Suco de Acerola',
        description: 'Suco natural de acerola 500ml',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Água de Coco',
        description: 'Água de coco natural',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Refrigerante 350ml',
        description: 'Refrigerante lata - vários sabores',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Caipirinha',
        description: 'Caipirinha tradicional - limão, morango ou maracujá',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    porcoes: [
      {
        name: 'Porção de Torresmo',
        description: 'Torresmo crocante 300g',
        price: 24.9,
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Porção de Macaxeira Frita',
        description: 'Macaxeira frita 400g',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1639744091413-7e0c4f0a1c6d?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Porção de Camarão Empanado',
        description: 'Camarão empanado 300g',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
  },

  // ========== PIZZARIA ==========
  [BusinessSegment.PIZZARIA]: {
    pizzasSalgadas: [
      {
        name: 'Pizza Margherita',
        description: 'Molho de tomate, mussarela e manjericão',
        price: 35.9,
        image:
          'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Calabresa',
        description: 'Molho de tomate, mussarela, calabresa e cebola',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Portuguesa',
        description:
          'Molho de tomate, mussarela, presunto, ovos, cebola e azeitona',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Frango com Catupiry',
        description: 'Molho de tomate, mussarela, frango desfiado e catupiry',
        price: 42.9,
        image:
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Mussarela',
        description: 'Molho de tomate e mussarela',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Pizza Pepperoni',
        description: 'Molho de tomate, mussarela e pepperoni',
        price: 44.9,
        image:
          'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Pizza Bacon',
        description: 'Molho de tomate, mussarela, bacon e cebola',
        price: 40.9,
        image:
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Pizza Napolitana',
        description: 'Molho de tomate, mussarela, tomate fatiado e parmesão',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    pizzasDoces: [
      {
        name: 'Pizza de Chocolate',
        description: 'Chocolate ao leite com granulado',
        price: 36.9,
        image:
          'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza de Brigadeiro',
        description: 'Brigadeiro cremoso com granulado',
        price: 38.9,
        image:
          'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Romeu e Julieta',
        description: 'Queijo mussarela com goiabada',
        price: 34.9,
        image:
          'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Pizza Banana com Canela',
        description: 'Banana, canela e açúcar',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    pizzasPremium: [
      {
        name: 'Pizza Quatro Queijos',
        description:
          'Molho de tomate, mussarela, provolone, parmesão e gorgonzola',
        price: 45.9,
        image:
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Camarão',
        description: 'Molho branco, camarão e catupiry',
        price: 52.9,
        image:
          'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Filé Mignon',
        description: 'Molho de tomate, mussarela, filé mignon e cebola',
        price: 54.9,
        image:
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pizza Lombo Canadense',
        description: 'Molho de tomate, mussarela e lombo canadense',
        price: 46.9,
        image:
          'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    calzones: [
      {
        name: 'Calzone de Frango',
        description: 'Calzone recheado com frango, mussarela e catupiry',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Calzone de Calabresa',
        description: 'Calzone recheado com calabresa, mussarela e cebola',
        price: 30.9,
        image:
          'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Calzone Quatro Queijos',
        description:
          'Calzone recheado com mussarela, provolone, parmesão e gorgonzola',
        price: 36.9,
        image:
          'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    esfihas: [
      {
        name: 'Esfiha de Carne',
        description: 'Esfiha fechada de carne - 6 unidades',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1619740455993-8cced4f2e3fe?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Esfiha de Frango',
        description: 'Esfiha fechada de frango com catupiry - 6 unidades',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1619740455993-8cced4f2e3fe?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Esfiha de Queijo',
        description: 'Esfiha aberta de queijo - 6 unidades',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1619740455993-8cced4f2e3fe?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    entradas: [
      {
        name: 'Bruschetta',
        description: '6 unidades de bruschetta com tomate e manjericão',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pão de Alho',
        description: 'Pão de alho gratinado',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Porção de Batata Frita',
        description: 'Batata frita crocante',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    massas: [
      {
        name: 'Espaguete à Bolonhesa',
        description: 'Espaguete com molho bolonhesa',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Lasanha à Bolonhesa',
        description: 'Lasanha de carne gratinada',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Penne ao Molho Branco',
        description: 'Penne ao molho branco com frango',
        price: 30.9,
        image:
          'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    saladas: [
      {
        name: 'Salada Caesar',
        description: 'Salada Caesar com frango grelhado',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Salada Caprese',
        description: 'Tomate, mussarela de búfala e manjericão',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    bebidas: [
      {
        name: 'Refrigerante 350ml',
        description: 'Refrigerante lata - vários sabores',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Refrigerante 2L',
        description: 'Refrigerante 2 litros - vários sabores',
        price: 10.9,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Suco Natural 500ml',
        description: 'Suco natural - vários sabores',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Água Mineral 500ml',
        description: 'Água mineral sem gás',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    sobremesas: [
      {
        name: 'Petit Gateau',
        description: 'Petit gateau de chocolate com sorvete',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Tiramisu',
        description: 'Tiramisu tradicional italiano',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Sorvete',
        description: 'Sorvete - vários sabores',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
  },

  // ========== DEPÓSITO DE BEBIDAS ==========
  [BusinessSegment.DEPOSITO_BEBIDAS]: {
    cervejas: [
      {
        name: 'Skol 350ml',
        description: 'Cerveja Skol lata',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Brahma 350ml',
        description: 'Cerveja Brahma lata',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Antarctica 350ml',
        description: 'Cerveja Antarctica lata',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Itaipava 350ml',
        description: 'Cerveja Itaipava lata',
        price: 2.9,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Original 350ml',
        description: 'Cerveja Original lata',
        price: 3.5,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    cervejasEspeciais: [
      {
        name: 'Heineken 350ml',
        description: 'Cerveja Heineken lata',
        price: 6.9,
        image:
          'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Stella Artois 350ml',
        description: 'Cerveja Stella Artois lata',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Corona 355ml',
        description: 'Cerveja Corona garrafa',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Budweiser 350ml',
        description: 'Cerveja Budweiser lata',
        price: 6.5,
        image:
          'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Eisenbahn 350ml',
        description: 'Cerveja Eisenbahn lata',
        price: 7.5,
        image:
          'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Colorado Appia 350ml',
        description: 'Cerveja Colorado Appia',
        price: 9.9,
        image:
          'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    refrigerantes: [
      {
        name: 'Coca-Cola 2L',
        description: 'Refrigerante Coca-Cola 2 litros',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Guaraná Antarctica 2L',
        description: 'Refrigerante Guaraná Antarctica 2 litros',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Pepsi 2L',
        description: 'Refrigerante Pepsi 2 litros',
        price: 7.5,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Fanta Laranja 2L',
        description: 'Refrigerante Fanta Laranja 2 litros',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1625740515050-7b0b60f247c4?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Sprite 2L',
        description: 'Refrigerante Sprite 2 litros',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Schweppes Citrus 350ml',
        description: 'Refrigerante Schweppes Citrus lata',
        price: 4.9,
        image:
          'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    sucos: [
      {
        name: 'Del Valle Laranja 1L',
        description: 'Suco Del Valle sabor laranja 1 litro',
        price: 9.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Del Valle Uva 1L',
        description: 'Suco Del Valle sabor uva 1 litro',
        price: 9.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Suco Natural One Laranja 900ml',
        description: 'Suco Natural One sabor laranja',
        price: 11.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Suco de Caju Maguary 1L',
        description: 'Suco de caju Maguary 1 litro',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    aguas: [
      {
        name: 'Água Mineral Crystal 1,5L',
        description: 'Água mineral Crystal sem gás 1,5 litros',
        price: 3.9,
        image:
          'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Água Mineral Crystal com Gás 1,5L',
        description: 'Água mineral Crystal com gás 1,5 litros',
        price: 4.9,
        image:
          'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Água de Coco Kero Coco 1L',
        description: 'Água de coco Kero Coco 1 litro',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Água Mineral Indaiá 500ml',
        description: 'Água mineral Indaiá sem gás 500ml',
        price: 2.5,
        image:
          'https://images.unsplash.com/photo-1548839140-5a617f575f6f?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    energeticos: [
      {
        name: 'Red Bull 250ml',
        description: 'Energético Red Bull lata',
        price: 9.9,
        image:
          'https://images.unsplash.com/photo-1622543925917-763c34f1f161?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Monster Energy 473ml',
        description: 'Energético Monster lata',
        price: 10.9,
        image:
          'https://images.unsplash.com/photo-1622543925917-763c34f1f161?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'TNT Energy Drink 269ml',
        description: 'Energético TNT lata',
        price: 6.9,
        image:
          'https://images.unsplash.com/photo-1622543925917-763c34f1f161?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Fusion Energy 350ml',
        description: 'Energético Fusion lata',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1622543925917-763c34f1f161?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    vinhos: [
      {
        name: 'Vinho Tinto Miolo 750ml',
        description: 'Vinho tinto seco Miolo',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Vinho Branco Salton 750ml',
        description: 'Vinho branco seco Salton',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Espumante Chandon 750ml',
        description: 'Espumante Chandon Brut',
        price: 68.9,
        image:
          'https://images.unsplash.com/photo-1546548970-71785318a17b?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    destilados: [
      {
        name: 'Whisky Red Label 1L',
        description: 'Whisky Johnnie Walker Red Label',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Vodka Smirnoff 1L',
        description: 'Vodka Smirnoff',
        price: 52.9,
        image:
          'https://images.unsplash.com/photo-1618146830731-b7c2138408e1?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Cachaça Pitú 1L',
        description: 'Cachaça Pitú tradicional',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Gin Tanqueray 750ml',
        description: 'Gin Tanqueray London Dry',
        price: 98.9,
        image:
          'https://images.unsplash.com/photo-1602526211842-8b5e575febc8?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
    drinksProntos: [
      {
        name: 'Caipirinha Ice 275ml',
        description: 'Caipirinha pronta Ice lata',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Smirnoff Ice 275ml',
        description: 'Smirnoff Ice lata',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    gelo: [
      {
        name: 'Gelo em Cubos 2kg',
        description: 'Gelo em cubos saco 2kg',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Gelo em Cubos 5kg',
        description: 'Gelo em cubos saco 5kg',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
  },

  // ========== PERFUMARIA ==========
  [BusinessSegment.PERFUMARIA]: {
    perfumesFemininos: [
      {
        name: 'Perfume Feminino Floral',
        description: 'Perfume feminino com fragrância floral e doce - 50ml',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'floral',
        },
      },
      {
        name: 'Perfume Feminino Frutal',
        description:
          'Perfume feminino com fragrância frutal e refrescante - 50ml',
        price: 79.9,
        image:
          'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'frutal',
        },
      },
      {
        name: 'Perfume Feminino Oriental',
        description:
          'Perfume feminino com fragrância oriental e amadeirada - 50ml',
        price: 99.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'oriental',
        },
      },
    ],
    perfumesMasculinos: [
      {
        name: 'Perfume Masculino Amadeirado',
        description:
          'Perfume masculino com fragrância amadeirada e especiada - 50ml',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'amadeirado',
        },
      },
      {
        name: 'Perfume Masculino Cítrico',
        description:
          'Perfume masculino com fragrância cítrica e refrescante - 50ml',
        price: 79.9,
        image:
          'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'citrico',
        },
      },
      {
        name: 'Perfume Masculino Aromático',
        description:
          'Perfume masculino com fragrância aromática e marcante - 50ml',
        price: 94.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          tipo: 'aromatico',
        },
      },
    ],
    natura: [
      {
        name: 'Natura Ekos - Pitanga',
        description: 'Perfume Natura Ekos Pitanga 50ml - fragrância frutal',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Natura',
          linha: 'Ekos',
        },
      },
      {
        name: 'Natura Una - Flor de Lótus',
        description:
          'Perfume Natura Una Flor de Lótus 50ml - fragrância floral',
        price: 99.9,
        image:
          'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Natura',
          linha: 'Una',
        },
      },
      {
        name: 'Natura Homem - Essence',
        description:
          'Perfume Natura Homem Essence 50ml - fragrância amadeirada',
        price: 119.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Natura',
          linha: 'Homem',
        },
      },
      {
        name: 'Natura Kaiak - Masculino',
        description:
          'Perfume Natura Kaiak Masculino 50ml - fragrância aquática',
        price: 109.9,
        image:
          'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Natura',
          linha: 'Kaiak',
        },
      },
      {
        name: 'Natura Kaiak - Feminino',
        description: 'Perfume Natura Kaiak Feminino 50ml - fragrância aquática',
        price: 109.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Natura',
          linha: 'Kaiak',
        },
      },
      {
        name: 'Natura Tododia - Açaí',
        description: 'Desodorante Colônia Natura Tododia Açaí 200ml',
        price: 29.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'unissex',
          tamanho: ['200ml'],
          marca: 'Natura',
          linha: 'Tododia',
          tipo: 'desodorante-colonia',
        },
      },
      {
        name: 'Natura Chronos - Hidratante',
        description: 'Creme Hidratante Natura Chronos 200g',
        price: 69.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'unissex',
          marca: 'Natura',
          linha: 'Chronos',
          tipo: 'hidratante',
        },
      },
    ],
    avon: [
      {
        name: 'Avon Far Away - Feminino',
        description: 'Perfume Avon Far Away Feminino 50ml - fragrância floral',
        price: 79.9,
        image:
          'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: 'Far Away',
        },
      },
      {
        name: 'Avon Black Suede - Masculino',
        description:
          'Perfume Avon Black Suede Masculino 50ml - fragrância amadeirada',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: 'Black Suede',
        },
      },
      {
        name: 'Avon Imari - Feminino',
        description: 'Perfume Avon Imari Feminino 50ml - fragrância oriental',
        price: 69.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: 'Imari',
        },
      },
      {
        name: 'Avon Attraction - Masculino',
        description: 'Perfume Avon Attraction Masculino 50ml',
        price: 79.9,
        image:
          'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: 'Attraction',
        },
      },
      {
        name: 'Avon Musk - Masculino',
        description: 'Perfume Avon Musk Masculino 50ml - fragrância amadeirada',
        price: 84.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: 'Musk',
        },
      },
      {
        name: 'Avon 300Km - Masculino',
        description: 'Perfume Avon 300Km Masculino 50ml - fragrância esportiva',
        price: 79.9,
        image:
          'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'Avon',
          linha: '300Km',
          tipo: 'esportivo',
        },
      },
      {
        name: 'Avon Skin So Soft - Loção',
        description: 'Loção Hidratante Avon Skin So Soft 200ml',
        price: 39.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'unissex',
          marca: 'Avon',
          linha: 'Skin So Soft',
          tipo: 'loção',
        },
      },
    ],
    oBoticario: [
      {
        name: 'O Boticário Malbec - Masculino',
        description:
          'Perfume O Boticário Malbec Masculino 50ml - fragrância amadeirada',
        price: 129.9,
        image:
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'O Boticário',
          linha: 'Malbec',
        },
      },
      {
        name: 'O Boticário Lily - Feminino',
        description:
          'Perfume O Boticário Lily Feminino 50ml - fragrância floral',
        price: 139.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'O Boticário',
          linha: 'Lily',
        },
      },
      {
        name: 'O Boticário Floratta - Feminino',
        description:
          'Perfume O Boticário Floratta Feminino 50ml - fragrância floral',
        price: 119.9,
        image:
          'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['30ml', '50ml', '100ml'],
          marca: 'O Boticário',
          linha: 'Floratta',
        },
      },
      {
        name: 'O Boticário Egeo - Masculino',
        description: 'Desodorante Colônia O Boticário Egeo Masculino 90ml',
        price: 49.9,
        image:
          'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'masculino',
          tamanho: ['90ml'],
          marca: 'O Boticário',
          linha: 'Egeo',
          tipo: 'desodorante-colonia',
        },
      },
      {
        name: 'O Boticário Egeo - Feminino',
        description: 'Desodorante Colônia O Boticário Egeo Feminino 90ml',
        price: 49.9,
        image:
          'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          genero: 'feminino',
          tamanho: ['90ml'],
          marca: 'O Boticário',
          linha: 'Egeo',
          tipo: 'desodorante-colonia',
        },
      },
    ],
    maquiagem: [
      {
        name: 'Base Líquida',
        description: 'Base líquida alta cobertura - vários tons',
        price: 49.9,
        image:
          'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          tipo: 'base',
          tom: ['claro', 'medio', 'escuro'],
        },
      },
      {
        name: 'Batom Matte',
        description: 'Batom matte longa duração - vários tons',
        price: 29.9,
        image:
          'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          tipo: 'batom',
          acabamento: 'matte',
        },
      },
      {
        name: 'Máscara de Cílios',
        description: 'Máscara de cílios volumosa e alongadora',
        price: 39.9,
        image:
          'https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?w=600&h=600&fit=crop',
        featured: false,
        filterMetadata: {
          tipo: 'mascara',
        },
      },
      {
        name: 'Paleta de Sombras',
        description: 'Paleta de sombras com 12 cores',
        price: 59.9,
        image:
          'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&h=600&fit=crop',
        featured: true,
        filterMetadata: {
          tipo: 'sombra',
        },
      },
    ],
    cuidadosPele: [
      {
        name: 'Creme Hidratante Facial',
        description: 'Creme hidratante facial para todos os tipos de pele',
        price: 54.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Protetor Solar FPS 50',
        description: 'Protetor solar facial FPS 50',
        price: 69.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Sérum Vitamina C',
        description: 'Sérum facial com vitamina C',
        price: 89.9,
        image:
          'https://images.unsplash.com/photo-1556228578-6190d11a0e5a?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    cabelos: [
      {
        name: 'Shampoo Hidratante',
        description: 'Shampoo hidratante 400ml',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Condicionador Hidratante',
        description: 'Condicionador hidratante 400ml',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Máscara Capilar',
        description: 'Máscara capilar intensiva 250g',
        price: 44.9,
        image:
          'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop',
        featured: true,
      },
    ],
  },
  [BusinessSegment.CANOZES]: {
    caldosNordestinos: [
      {
        name: 'Caldo de Sururu',
        description:
          'Caldo de sururu tradicional pernambucano com tempero regional',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Camarão',
        description: 'Caldo de camarão cremoso com leite de coco',
        price: 22.9,
        image:
          'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Peixe',
        description: 'Caldo de peixe regional com legumes',
        price: 16.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Caranguejo',
        description: 'Caldo de caranguejo com temperos regionais',
        price: 24.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Feijão',
        description: 'Caldo de feijão com bacon e linguiça',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    canjas: [
      {
        name: 'Canja de Galinha',
        description: 'Canja de galinha tradicional com arroz e legumes',
        price: 14.9,
        image:
          'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Canja de Galinha com Hortelã',
        description: 'Canja de galinha com hortelã fresca',
        price: 15.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Canja de Frango Caipira',
        description: 'Canja de frango caipira com legumes orgânicos',
        price: 18.9,
        image:
          'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    caldosFrutosMar: [
      {
        name: 'Caldeirada Mista',
        description: 'Caldeirada com camarão, peixe e lula',
        price: 28.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Polvo',
        description: 'Caldo de polvo ao molho especial',
        price: 32.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Caldo de Ostra',
        description: 'Caldo de ostra fresca temperado',
        price: 26.9,
        image:
          'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    sopas: [
      {
        name: 'Sopa de Legumes',
        description: 'Sopa cremosa de legumes variados',
        price: 12.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Sopa de Mandioca',
        description: 'Sopa cremosa de mandioca com carne seca',
        price: 15.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Sopa de Feijão Verde',
        description: 'Sopa de feijão verde com legumes',
        price: 13.9,
        image:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    acompanhamentos: [
      {
        name: 'Tapioca',
        description: 'Tapioca com manteiga - 2 unidades',
        price: 8.9,
        image:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Beiju',
        description: 'Beiju tradicional - 2 unidades',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Pão Francês',
        description: 'Pão francês fresco - 3 unidades',
        price: 4.9,
        image:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Macaxeira Cozida',
        description: 'Porção de macaxeira cozida',
        price: 9.9,
        image:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Farofa',
        description: 'Porção de farofa especial',
        price: 6.9,
        image:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
    bebidas: [
      {
        name: 'Suco de Caju',
        description: 'Suco natural de caju 500ml',
        price: 7.9,
        image:
          'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Água de Coco',
        description: 'Água de coco natural gelada',
        price: 6.9,
        image:
          'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop',
        featured: true,
      },
      {
        name: 'Refrigerante 350ml',
        description: 'Refrigerante lata - vários sabores',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=600&fit=crop',
        featured: false,
      },
      {
        name: 'Cerveja 350ml',
        description: 'Cerveja gelada lata',
        price: 5.9,
        image:
          'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop',
        featured: false,
      },
    ],
  },
};

const complementsData: ComplementsBySegment = {
  // ========== HAMBURGUERIA ==========
  [BusinessSegment.HAMBURGUERIA]: [
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
      name: 'Adicionais para Acompanhamento',
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
    {
      name: 'Tamanho Bebida',
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
    {
      name: 'Tamanho Milkshake',
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
      name: 'Adicionais para Milkshake',
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

  // ========== PIZZARIA ==========
  [BusinessSegment.PIZZARIA]: [
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
    {
      name: 'Tamanho Calzone',
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
      name: 'Extras para Calzone',
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
    {
      name: 'Quantidade Esfihas',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: '6 unidades', price: 0 },
        { name: '12 unidades', price: 18.0 },
        { name: '20 unidades', price: 28.0 },
      ],
    },
    {
      name: 'Tamanho Bebida',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 1,
      options: [
        { name: '350ml', price: 0 },
        { name: '500ml', price: 2.0 },
        { name: '1L', price: 4.0 },
        { name: '2L', price: 6.0 },
      ],
    },
  ],

  // ========== RESTAURANTE ==========
  [BusinessSegment.RESTAURANTE]: [
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
    {
      name: 'Acompanhamentos Regionais',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 3,
      options: [
        { name: 'Arroz Branco', price: 0 },
        { name: 'Feijão Verde', price: 0 },
        { name: 'Macaxeira Cozida', price: 0 },
        { name: 'Farofa', price: 0 },
        { name: 'Pirão', price: 2.0 },
      ],
    },
    {
      name: 'Extras Regionais',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 3,
      options: [
        { name: 'Queijo Coalho', price: 6.0 },
        { name: 'Carne de Sol Extra', price: 8.0 },
        { name: 'Linguiça', price: 5.0 },
      ],
    },
    {
      name: 'Modo de Preparo',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: 'Grelhado', price: 0 },
        { name: 'Frito', price: 0 },
        { name: 'Assado', price: 2.0 },
      ],
    },
    {
      name: 'Acompanhamentos para Peixe',
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
      name: 'Molho',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: 'Molho Bolonhesa', price: 0 },
        { name: 'Molho Branco', price: 2.0 },
        { name: 'Molho ao Pesto', price: 3.0 },
        { name: 'Molho Rosé', price: 2.0 },
      ],
    },
    {
      name: 'Adicionais para Massa',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 3,
      options: [
        { name: 'Frango', price: 5.0 },
        { name: 'Bacon', price: 4.0 },
        { name: 'Queijo Ralado Extra', price: 2.0 },
      ],
    },
    {
      name: 'Tamanho Bebida',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 1,
      options: [
        { name: '300ml', price: 0 },
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
      ],
    },
  ],

  // ========== DEPÓSITO DE BEBIDAS ==========
  [BusinessSegment.DEPOSITO_BEBIDAS]: [
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
    {
      name: 'Quantidade Cervejas Especiais',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 1,
      options: [
        { name: '1 unidade', price: 0 },
        { name: 'Pack 6 unidades', price: -3.0 },
        { name: 'Pack 12 unidades', price: -8.0 },
      ],
    },
    {
      name: 'Temperatura Vinho',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 1,
      options: [
        { name: 'Temperatura Ambiente', price: 0 },
        { name: 'Gelado', price: 0 },
      ],
    },
    {
      name: 'Tamanho Gelo',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: '2kg', price: 0 },
        { name: '5kg', price: 10.0 },
        { name: '10kg', price: 18.0 },
      ],
    },
  ],

  // ========== PERFUMARIA ==========
  [BusinessSegment.PERFUMARIA]: [
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
      name: 'Tamanho Natura',
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
        { name: 'Embrulho Premium', price: 8.0 },
      ],
    },
    {
      name: 'Tamanho Avon',
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
    {
      name: 'Tamanho O Boticário',
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
      name: 'Embalagem Presente O Boticário',
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

  // ========== CANOZES ==========
  [BusinessSegment.CANOZES]: [
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
    {
      name: 'Tamanho Canja',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: 'Copo 300ml', price: 0 },
        { name: 'Caneca 500ml', price: 3.0 },
        { name: 'Tigela 700ml', price: 6.0 },
      ],
    },
    {
      name: 'Adicionais para Canja',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 2,
      options: [
        { name: 'Frango Extra', price: 4.0 },
        { name: 'Arroz Extra', price: 2.0 },
      ],
    },
    {
      name: 'Tamanho Caldos Frutos do Mar',
      required: true,
      allowRepeat: false,
      minOptions: 1,
      maxOptions: 1,
      options: [
        { name: 'Copo 300ml', price: 0 },
        { name: 'Caneca 500ml', price: 5.0 },
        { name: 'Tigela 700ml', price: 10.0 },
      ],
    },
    {
      name: 'Adicionais para Frutos do Mar',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 3,
      options: [
        { name: 'Camarão Extra', price: 8.0 },
        { name: 'Peixe Extra', price: 6.0 },
        { name: 'Limão', price: 0.5 },
      ],
    },
    {
      name: 'Quantidade Acompanhamentos',
      required: false,
      allowRepeat: false,
      minOptions: 0,
      maxOptions: 1,
      options: [
        { name: '1 unidade', price: 0 },
        { name: '2 unidades', price: 3.0 },
        { name: '3 unidades', price: 5.0 },
      ],
    },
  ],
};
// Complementos e opções por tipo de produto
// Nomes de entregadores
const deliveryNames = [
  'João Silva',
  'Maria Santos',
  'Pedro Oliveira',
  'Ana Costa',
  'Carlos Souza',
  'Juliana Ferreira',
  'Roberto Alves',
  'Fernanda Lima',
  'Ricardo Martins',
  'Patricia Rocha',
  'Lucas Gomes',
  'Camila Ribeiro',
  'Felipe Carvalho',
  'Amanda Dias',
  'Bruno Araújo',
];
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function generateRandomDocument(length = 14) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

function generateCompanyEmail(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return `${slug}-${Date.now()}@anotaja.com`;
}

function generateUniquePhone() {
  return `11${Math.floor(900000000 + Math.random() * 99999999)}`;
}

function generateSubdomain(name: string) {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  return `${slug}-${Date.now()}`;
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Limpar banco de dados
  console.log('🧹 Limpando banco de dados...');

  const hashedPassword = await generateHashedPassword('123456');

  // Criar empresas
  console.log('🏢 Criando empresas...');
  const allCompanies: any[] = [];
  let userCounter = 0; // Contador global para garantir emails e telefones únicos

  for (const [type, companies] of Object.entries(companiesData)) {
    for (const companyData of companies) {
      console.log(`🏢 Criando empresa - ${companyData.name}`);

      const company = await prisma.company.create({
        data: {
          companyName: companyData.name,
          name: companyData.name,
          document: generateRandomDocument(14),
          email: `teste${userCounter}@anotaja.com`,
          phone: generateUniquePhone(),
          onboardingStep: 'SCHEDULE',
          active: true,
        },
      });

      // Buscar plano trial e criar assinatura
      const trialPlan = await prisma.plan.findFirst({
        where: {
          type: 'TRIAL',
          active: true,
        },
      });

      if (!trialPlan) {
        console.warn('⚠️ Plano trial não encontrado. Pulando criação de assinatura.');
      } else {
        const now = new Date();
        const trialEndDate = new Date(now);
        trialEndDate.setDate(trialEndDate.getDate() + (trialPlan.trialDays ?? 7));

        await prisma.subscription.create({
          data: {
            companyId: company.id,
            planId: trialPlan.id,
            status: 'ACTIVE',
            billingPeriod: trialPlan.billingPeriod,
            startDate: now,
            endDate: trialEndDate,
            nextBillingDate: trialEndDate,
            notes: 'Trial de 7 dias - Criado automaticamente no seed',
          },
        });
      }

      // Criar filial matriz (primeira filial) ANTES do admin
      const firstBranchData = companyData.branches[0];

      const defaultSocialMedia = JSON.stringify({
        instagram: `@${companyData.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
        facebook: `facebook.com/${companyData.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
        whatsapp: firstBranchData.phone,
      });

      const branches = companyData.branches;
      for (const [index, branchData] of branches.entries()) {
        const isMatriz = index === 0;

        const createBranchAddress = await prisma.branchAddress.create({
          data: {
            street: branchData.state,
            number: Math.floor(Math.random() * 1000).toString(),
            complement: '',
            neighborhood: '',
            city: branchData.city,
            state: branchData.state,
            zipCode: branchData.zipCode,
          },
        });

        const branch = await prisma.branch.create({
          data: {
            branchName: isMatriz
              ? `Matriz - ${companyData.companyName}`
              : branchData.branchName,
            document: isMatriz ? companyData.document : branchData.document,
            addressId: createBranchAddress.id,
            phone: branchData.phone,
          email: `teste${userCounter}@anotaja.com`,
            subdomain: null,
            logoUrl: companyData.logo || null,
            bannerUrl: companyData.banner || null,
            companyId: company.id,
            active: true,
            primaryColor:
              type === 'hamburgueria'
                ? '#FF6B35'
                : type === 'pizzaria'
                  ? '#E63946'
                  : type === 'restaurante'
                    ? '#2A9D8F'
                    : type === 'depositoBebidas'
                      ? '#F77F00'
                      : type === 'perfumaria'
                        ? '#9B59B6'
                        : '#3B82F6',
            socialMedia: defaultSocialMedia,
            description: `A melhor ${
              type === 'hamburgueria'
                ? 'hamburgueria'
                : type === 'pizzaria'
                  ? 'pizzaria'
                  : type === 'restaurante'
                    ? 'experiência gastronômica'
                    : type === 'depositoBebidas'
                      ? 'seleção de bebidas'
                      : 'perfumaria'
            } de ${branchData.city}!`,
            instagram: `@${companyData.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
            minOrderValue: money(type === 'perfumaria' ? 50.0 : 20.0),
            checkoutMessage:
              'Obrigado por escolher nossa loja! Seu pedido será preparado com muito carinho.',
            latitude: branchData.lat,
            longitude: branchData.lng,
          },
        });
        console.log('🔄 Criando clientes para a filial matriz...');
        for (const customerData of customersData) {
          await prisma.customer.create({
            data: {
              name: customerData.name,
              email: customerData.email,
              phone: customerData.phone,
              branchId: branch.id,
            },
          });
        }

        userCounter++;
        const adminPhone = `8198765${String(2000 + userCounter).padStart(4, '0')}`;

        console.log('👤 Criando usuário admin da filial matriz...');
        const adminUser = await prisma.user.create({
          data: {
            name: `Admin ${companyData.name}`,
          email: `teste${userCounter}@anotaja.com`,
            phone: adminPhone,
            password: hashedPassword,
            role: 'admin',
            companyId: company.id,
            branchId: branch.id, // VINCULADO À FILIAL MATRIZ
            active: true,
          },
        });
        await seedTablesForBranch(branch.id, adminUser.id);

        console.log('💰 Criando métodos de pagamento para a filial matriz...');

        // Criar dados para a filial matriz (categorias, produtos, complementos, opções, cupons, entregadores, caixa)
        const companyType = type as keyof typeof categoriesData;
        console.log('🔄 Criando categorias para a filial matriz...');
        await createCategoriesProductsAndComplements(
          companyType,
          branch.id,
          money,
        );

        // Criar áreas de entrega para a filial matriz
        console.log('🔄 Criando áreas de entrega para a filial matriz...');
        for (let i = 0; i < SEED_CONFIG.deliveryAreasPerBranch; i++) {
          const radius = 5000 + i * 2000;
          const deliveryFee = 5.0 + i * 2.0;
          const deliveryFeeData = Math.round(Number(deliveryFee) * 100);
          const minOrderValue = Math.round(20.0 + Math.random() * 10);

          const level = i + 1;

          await prisma.deliveryArea.upsert({
            where: {
              branchId_level: { branchId: branch.id, level },
            },
            update: {
              name: `Área ${level} - ${branch.branchName}`,
              type: 'CIRCLE',
              centerLat: firstBranchData.lat,
              centerLng: firstBranchData.lng,
              radius,
              deliveryFee: deliveryFeeData,
              minOrderValue,
              estimatedTime: 30 + i * 10,
              active: true,
            },
            create: {
              name: `Área ${level} - ${branch.branchName}`,
              type: 'CIRCLE',
              centerLat: firstBranchData.lat,
              centerLng: firstBranchData.lng,
              radius,
              deliveryFee: deliveryFeeData,
              minOrderValue,
              estimatedTime: 30 + i * 10,
              level,
              active: true,
              branchId: branch.id,
            },
          });
        }

        // Criar entregadores para a filial matriz usando DeliveryPerson
        const deliveryCount = SEED_CONFIG.deliveryPerBranch;
        console.log('🔄 Criando entregadores para a filial matriz...');
        for (let i = 0; i < deliveryCount; i++) {
          userCounter++;
          const deliveryIndex = userCounter % deliveryNames.length;
          const deliveryPhone = `8198765${String(4000 + userCounter).padStart(4, '0')}`;
          await prisma.deliveryPerson.create({
            data: {
              name: deliveryNames[deliveryIndex],
              email: `entregador${userCounter}@${companyData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')}.com.br`,
              phone: deliveryPhone,
              branchId: branch.id,
              active: true,
            },
          });
        }

        // Criar caixa para a filial matriz
        const openingAmount =  Math.random() * 200;

        console.log('🔄 Criando caixa para a filial matriz...');
        const cashRegister = await prisma.cashRegister.create({
          data: {
            branchId: branch.id,
            openedBy: adminUser.id, // Admin abre o caixa da filial matriz
            openingAmount: openingAmount,
            status: 'OPENING',
            notes: `Caixa aberto automaticamente pelo seed para ${branch.branchName}`,
          },
        });

        // Criar movimentação de abertura
        console.log(
          '🔄 Criando movimentação de abertura para a filial matriz...',
        );
        await prisma.cashMovement.create({
          data: {
            cashRegisterId: cashRegister.id,
            type: 'OPENING',
            amount: openingAmount,
            description: `Abertura de caixa - ${branch.branchName}`,
            userId: adminUser.id,
          },
        });

        const companyCode = normalize(companyData.name);
        const branchCode = isMatriz ? 'MATRIZ' : `FILIAL${index}`;

        const welcomeCouponCode = `BEMVINDO10-${companyCode}-${branchCode}`;
        const freeShippingCouponCode = `FRETEGRATIS-${companyCode}-${branchCode}`;

        // Criar cupons para a filial matriz
        console.log('🔄 Criando cupons para a filial matriz...');
        await prisma.coupon.upsert({
          where: { code: welcomeCouponCode },
          update: {},
          create: {
            code: welcomeCouponCode,
            type: 'PERCENTAGE',
            value: 10,
            minValue: 30,
            maxUses: 100,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            active: true,
            branchId: branch.id,
          },
        });

        // Cupom de frete grátis
        await prisma.coupon.upsert({
          where: { code: freeShippingCouponCode },
          update: {},
          create: {
            code: freeShippingCouponCode,
            type: 'FIXED',
            value: 1000,
            minValue: 500,
            maxUses: 50,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            active: true,
            branchId: branch.id,
          },
        });
      }

      allCompanies.push({ company, type });
    }
  }

  console.log(`✅ Seed concluído!`);
  console.log(`📊 Resumo:`);
  console.log(`   - ${allCompanies.length} empresas criadas`);
  console.log(`   - ${await prisma.branch.count()} filiais criadas`);
  console.log(`   - ${await prisma.user.count()} usuários criados`);
  console.log(
    `   - ${await prisma.category.count()} categorias criadas (individual por filial)`,
  );
  console.log(
    `   - ${await prisma.product.count()} produtos criados (individual por filial)`,
  );
  console.log(
    `   - ${await prisma.productComplement.count()} complementos criados (individual por produto)`,
  );
  console.log(
    `   - ${await prisma.complementOption.count()} opções criadas (individual por complemento)`,
  );
  console.log(
    `   - ${await prisma.deliveryArea.count()} áreas de entrega criadas (individual por filial)`,
  );
  console.log(
    `   - ${await prisma.deliveryPerson.count()} entregadores criados (individual por filial)`,
  );
  console.log(
    `   - ${await prisma.coupon.count()} cupons criados (individual por filial)`,
  );
  console.log(
    `   - ${await prisma.cashRegister.count()} caixas criados (individual por filial)`,
  );

  // Criar usuário master
  console.log('👑 Criando usuário master...');
  const masterPassword = await generateHashedPassword('master123');
  const masterUser = await prisma.masterUser.upsert({
    where: { email: 'master@anotaja.com' },
    update: {},
    create: {
      name: 'Master Admin',
      email: 'master@anotaja.com',
      password: masterPassword,
      active: true,
    },
  });
  console.log(
    `✅ Usuário master criado: ${masterUser.email} / senha: master123`,
  );

  // Criar planos
  console.log('💳 Criando planos...');
  console.log(`✅ ${await prisma.plan.count()} planos já existentes no banco`);

  // Nota: As assinaturas trial já foram criadas junto com cada empresa no loop acima
  const subscriptionCount = await prisma.subscription.count();
  console.log(`✅ ${subscriptionCount} assinaturas criadas (incluindo trials)`);

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
