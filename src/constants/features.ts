// Mapeamento de features para exibição no frontend
export const FEATURE_LABELS: Record<string, string> = {
  delivery: 'Sistema de Delivery',
  stock: 'Controle de Estoque',
  reports: 'Relatórios Detalhados',
  coupons: 'Cupons de Desconto',
  analytics: 'Analytics Avançado',
  api: 'Acesso à API',
  support: 'Suporte Prioritário',
  multistore: 'Multi-lojas',
  whatsapp: 'Integração WhatsApp',
  customization: 'Personalização Avançada',
  custom: 'Personalização Completa',
  products: 'Produtos',
  product: 'Produtos',
  dashboard: 'Dashboard',
  category: 'Categorias',
  complement: 'Complementos',
  order: 'Pedidos',
  customer: 'Clientes',
  pdv: 'PDV',
  kds: 'KDS',
  delivery_person: 'Entregadores',
  delivery_area: 'Áreas de Entrega',
  delivery_route: 'Rotas de Entrega',
  payment_method: 'Métodos de Pagamento',
  cash_register: 'Caixa',
  user: 'Usuários',
  group: 'Grupos',
  branch: 'Filiais',
  company: 'Empresa',
  subscription: 'Assinatura',
  settings: 'Configurações',
  table: 'Mesas',
  commands: 'Comandas',
  hours: 'Horários',
  announcement: 'Anúncios',
  points: 'Pontos/Fidelidade',
  profile: 'Perfil',
};

// Função para formatar o nome da feature baseada na key
export function formatFeatureName(key: string): string {
  return FEATURE_LABELS[key] || 
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

// Função para converter um array de keys para um array de objetos {key, name}
export function formatFeatures(keys: string[]): Array<{key: string, name: string}> {
  return keys.map(key => ({
    key,
    name: formatFeatureName(key)
  }));
}
