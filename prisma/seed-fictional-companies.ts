/**
 * Empresas e filiais fictícias para completar 50 filiais no seed (32 adicionais).
 *
 * Produtos, categorias, complementos, pagamentos e config da loja são criados
 * automaticamente no seed.ts — mesmo fluxo das 18 filiais base, usando o catálogo
 * do segmento (hamburgueria, pizzaria, depositoBebidas, canozes, restaurante, perfumaria).
 */

export interface FictionalBranchSeed {
  branchName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  document: string;
  phone: string;
  subdomain: string;
  primaryColor?: string;
  lat: number;
  lng: number;
}

export interface FictionalCompanySeed {
  name: string;
  companyName: string;
  document: string;
  email: string;
  phone: string;
  logo: string;
  banner: string;
  branches: FictionalBranchSeed[];
}

const BANNER_FOOD =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=400&fit=crop&q=80';
const BANNER_BURGER =
  'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&h=400&fit=crop&q=80';
const BANNER_PIZZA =
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop&q=80';
const BANNER_DRINKS =
  'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=1200&h=400&fit=crop&q=80';
const BANNER_SOUP =
  'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=1200&h=400&fit=crop&q=80';
const BANNER_PERFUME =
  'https://images.unsplash.com/photo-1592945403244-b3fbafd7f3ea?w=1200&h=400&fit=crop&q=80';
const LOGO_PLACEHOLDER =
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=200&fit=crop&q=80';

type DistrictSeed = {
  label: string;
  street: string;
  zipCode: string;
  lat: number;
  lng: number;
};

const RECIFE_DISTRICTS: DistrictSeed[] = [
  {
    label: 'Boa Viagem',
    street: 'Av. Boa Viagem',
    zipCode: '51020-100',
    lat: -8.1194,
    lng: -34.9042,
  },
  {
    label: 'Espinheiro',
    street: 'Rua Visconde de Livramento',
    zipCode: '52020-100',
    lat: -8.0423,
    lng: -34.8951,
  },
  {
    label: 'Casa Forte',
    street: 'Rua Dr. João Santos Filho',
    zipCode: '52060-100',
    lat: -8.0282,
    lng: -34.9297,
  },
  {
    label: 'Pina',
    street: 'Av. Engenheiro Domingos Ferreira',
    zipCode: '51011-100',
    lat: -8.0889,
    lng: -34.8823,
  },
  {
    label: 'Graças',
    street: 'Rua da Graça',
    zipCode: '52011-100',
    lat: -8.0512,
    lng: -34.9012,
  },
  {
    label: 'Derby',
    street: 'Av. Conde da Boa Vista',
    zipCode: '50010-100',
    lat: -8.0634,
    lng: -34.8912,
  },
  {
    label: 'Ilha do Leite',
    street: 'Rua João Pessoa',
    zipCode: '50070-100',
    lat: -8.0712,
    lng: -34.8812,
  },
  {
    label: 'Santo Amaro',
    street: 'Rua do Hospício',
    zipCode: '50040-100',
    lat: -8.0589,
    lng: -34.8756,
  },
  {
    label: 'Jaqueira',
    street: 'Rua Conselheiro Rosa e Silva',
    zipCode: '52050-100',
    lat: -8.0345,
    lng: -34.9123,
  },
  {
    label: 'Torre',
    street: 'Rua José Osório',
    zipCode: '50710-100',
    lat: -8.0467,
    lng: -34.8956,
  },
];

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

function branchFromDistrict(
  companyName: string,
  district: DistrictSeed,
  seq: number,
  numberOffset: number,
): FictionalBranchSeed {
  const subdomain = slugify(`${companyName}-${district.label}`);
  const streetNumber = 100 + numberOffset + seq * 17;

  return {
    branchName: `${companyName} - ${district.label}`,
    address: `${district.street}, ${streetNumber}`,
    city: 'Recife',
    state: 'PE',
    zipCode: district.zipCode,
    document: `12345678101${String(2200 + seq).padStart(4, '0')}`,
    phone: `8134${String(6000 + seq).padStart(4, '0')}`,
    subdomain,
    primaryColor: '1a1a2e',
    lat: district.lat + (seq % 5) * 0.0004,
    lng: district.lng - (seq % 4) * 0.0003,
  };
}

function companyWithBranches(
  name: string,
  companyDocumentSuffix: number,
  districtIndexes: number[],
  banner: string,
  branchSeqStart: number,
): FictionalCompanySeed {
  const slug = slugify(name);
  const branches = districtIndexes.map((districtIndex, i) =>
    branchFromDistrict(
      name,
      RECIFE_DISTRICTS[districtIndex],
      branchSeqStart + i,
      companyDocumentSuffix,
    ),
  );

  return {
    name,
    companyName: name,
    document: `12345678${String(companyDocumentSuffix).padStart(4, '0')}90`,
    email: `contato@${slug}.ficticio.com.br`,
    phone: `8199${String(700000 + companyDocumentSuffix).slice(-7)}`,
    logo: LOGO_PLACEHOLDER,
    banner,
    branches,
  };
}

/** 32 filiais fictícias distribuídas por segmento (18 existentes + 32 = 50). */
export const fictionalCompaniesBySegment = {
  hamburgueria: [
    companyWithBranches('Smash Bros Burger', 1001, [0, 4], BANNER_BURGER, 0),
    companyWithBranches('Burger Lab PE', 1002, [1], BANNER_BURGER, 2),
    companyWithBranches('Meu Smash Artesanal', 1003, [2], BANNER_BURGER, 3),
    companyWithBranches('Grill & Burger House', 1004, [3], BANNER_BURGER, 4),
    companyWithBranches('Na Brasa Burgers', 1005, [5], BANNER_BURGER, 5),
    companyWithBranches('Duplo Smash', 1006, [6], BANNER_BURGER, 6),
    companyWithBranches('Burger Prime Recife', 1007, [7], BANNER_BURGER, 7),
    companyWithBranches('Flame Burger Co', 1008, [8], BANNER_BURGER, 8),
    companyWithBranches('Urban Burger PE', 1009, [9], BANNER_BURGER, 9),
  ],
  pizzaria: [
    companyWithBranches('Pizza Norte Fictícia', 1101, [0], BANNER_PIZZA, 10),
    companyWithBranches('Forno 90 Graus', 1102, [1], BANNER_PIZZA, 11),
    companyWithBranches('Massa Fina Pizzaria', 1103, [2], BANNER_PIZZA, 12),
    companyWithBranches('Pizza do Zé Delivery', 1104, [3], BANNER_PIZZA, 13),
    companyWithBranches('Bella Napoli PE', 1105, [4], BANNER_PIZZA, 14),
    companyWithBranches('Sabor Italiano Pizza', 1106, [5], BANNER_PIZZA, 15),
    companyWithBranches('Pizza Express 24h', 1107, [6], BANNER_PIZZA, 16),
    companyWithBranches('Corner Pizza Recife', 1108, [7], BANNER_PIZZA, 17),
  ],
  depositoBebidas: [
    companyWithBranches('Gelada Certa Depósito', 1201, [0], BANNER_DRINKS, 18),
    companyWithBranches('Beer House PE', 1202, [1], BANNER_DRINKS, 19),
    companyWithBranches('Chopp & Cia', 1203, [2], BANNER_DRINKS, 20),
    companyWithBranches('Adega do Porto Fictícia', 1204, [3], BANNER_DRINKS, 21),
    companyWithBranches('Bebidas Já Express', 1205, [4], BANNER_DRINKS, 22),
  ],
  canozes: [
    companyWithBranches('Sopas & Caldos PE', 1301, [0], BANNER_SOUP, 23),
    companyWithBranches('Caldo Quente da Vila', 1302, [1], BANNER_SOUP, 24),
    companyWithBranches('Panela de Barro', 1303, [2], BANNER_SOUP, 25),
    companyWithBranches('Sopa do Dia', 1304, [3], BANNER_SOUP, 26),
  ],
  restaurante: [
    companyWithBranches('Tempero Nordestino', 1401, [0], BANNER_FOOD, 27),
    companyWithBranches('Mesa Posta Restaurante', 1402, [1], BANNER_FOOD, 28),
    companyWithBranches('Sabores do Mar PE', 1403, [2], BANNER_FOOD, 29),
  ],
  perfumaria: [
    companyWithBranches('Essência Perfumes PE', 1501, [0], BANNER_PERFUME, 30),
    companyWithBranches('Aroma & Beleza Shop', 1502, [1], BANNER_PERFUME, 31),
  ],
} as const;

export function countFictionalBranches(): number {
  return Object.values(fictionalCompaniesBySegment).reduce(
    (sum, companies) =>
      sum + companies.reduce((b, c) => b + c.branches.length, 0),
    0,
  );
}

const FICTIONAL_COMPANY_EMAILS = new Set(
  Object.values(fictionalCompaniesBySegment).flatMap((companies) =>
    companies.map((c) => c.email.toLowerCase()),
  ),
);

/** Empresas criadas em seed-fictional-companies.ts (cardápio via mesmo fluxo do seed base). */
export function isFictionalSeedCompany(company: { email: string }): boolean {
  return FICTIONAL_COMPANY_EMAILS.has(company.email.toLowerCase());
}
