# Proposta: Features com Subfeatures (Hierarquia)

## Problema Atual
O sistema atual trata todas as features como itens planos no menu. Não há suporte para:
- Features principais que contêm subfeatures
- Menu com submenu/dropdown
- Estrutura hierárquica de navegação

## Solução Proposta

### 1. Backend - Schema Prisma

Adicionar campo `parentId` à model Feature:

```prisma
model Feature {
  id                 String              @id @default(cuid())
  key                String              @unique // "catalog", "product", "category"
  name               String
  description        String?
  active             Boolean             @default(true)
  defaultActions     String?             // Permissões padrão como JSON
  href               String?             // Rota da feature (ex: "/admin/dashboard")
  parentId           String?             // ID da feature pai (null para features principais)
  parent             Feature?            @relation("FeatureHierarchy", fields: [parentId], references: [id])
  children           Feature[]           @relation("FeatureHierarchy")
  createdAt          DateTime            @default(now())

  planFeatures       PlanFeature[]
  addonFeatures      AddonFeature[]
  featureMenuGroups  FeatureMenuGroup[]
  featureLimits      FeatureLimit[]
}
```

### 2. Backend - Seed Master Modificado

```typescript
// Features principais (sem parentId)
const mainFeatures = [
  {
    key: 'catalog',
    name: 'Catálogo',
    description: 'Gerenciamento completo de catálogo de produtos',
    href: '/admin/catalog',
    defaultActions: JSON.stringify(['read']),
  },
  // ... outras features principais
];

// Subfeatures (com parentId)
const subFeatures = [
  {
    key: 'product',
    name: 'Produtos',
    description: 'Gerenciamento de produtos',
    href: '/admin/products',
    defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
    parentKey: 'catalog', // referência à feature principal
  },
  {
    key: 'category',
    name: 'Categorias',
    description: 'Gerenciamento de categorias',
    href: '/admin/categories',
    defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
    parentKey: 'catalog',
  },
  // ... outras subfeatures
];
```

### 3. Backend - MenuService Atualizado

```typescript
async generateMenuFromPlanFeatures(
  plan: string,
  addons: string[] = [],
  userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
): Promise<MenuGroup[]> {
  // Buscar features com hierarquia
  const allFeatures = await prisma.feature.findMany({
    where: { active: true },
    include: {
      children: true, // incluir subfeatures
      featureMenuGroups: { include: { group: true } }
    },
    orderBy: { name: 'asc' }
  });

  // Separar features principais e subfeatures
  const mainFeatures = allFeatures.filter(f => !f.parentId);
  const subFeatures = allFeatures.filter(f => f.parentId);

  // Gerar menu items com subitems
  const allowedMenuItems: MenuItem[] = [];
  
  for (const feature of mainFeatures) {
    if (hasPermissionForFeature(feature, userPermissions)) {
      const menuItem: MenuItem = {
        id: feature.key,
        label: feature.name,
        href: feature.href || undefined,
        action: Action.READ,
        subject: this.inferSubjectFromFeatureKey(feature.key),
      };

      // Adicionar subfeatures se tiver permissão
      const children = subFeatures
        .filter(sf => sf.parentId === feature.id && hasPermissionForFeature(sf, userPermissions))
        .map(sf => ({
          id: sf.key,
          label: sf.name,
          href: sf.href || undefined,
          action: Action.READ,
          subject: this.inferSubjectFromFeatureKey(sf.key),
        }));

      if (children.length > 0) {
        menuItem.children = children;
      }

      allowedMenuItems.push(menuItem);
    }
  }

  return this.groupMenuItems(allowedMenuItems);
}
```

### 4. Frontend - Tipos Atualizados

```typescript
// src/types/tenant.ts - já suporta children
export interface MenuItem {
  id: string;
  label: string;
  href?: string;
  icon?: string;
  action?: string;
  subject?: string;
  children?: MenuItem[]; // ✅ Já existe!
}
```

### 5. Frontend - Componente de Menu

```typescript
// Componente que renderiza menu com submenu
const MenuWithSubmenu = ({ item }: { item: MenuItem }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (item.children && item.children.length > 0) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span>{item.label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
            {item.children.map(child => (
              <Link
                key={child.id}
                href={child.href || '#'}
                className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href || '#'}
      className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {item.label}
    </Link>
  );
};
```

## Exemplo Prático: Catálogo

### Backend (Seed)
```typescript
// Feature principal
{
  key: 'catalog',
  name: 'Catálogo',
  description: 'Gerenciamento completo de catálogo',
  href: null, // não tem rota própria
  defaultActions: JSON.stringify(['read']),
}

// Subfeatures
{
  key: 'product',
  name: 'Produtos',
  href: '/admin/products',
  parentKey: 'catalog',
},
{
  key: 'category', 
  name: 'Categorias',
  href: '/admin/categories',
  parentKey: 'catalog',
},
{
  key: 'complement',
  name: 'Complementos',
  href: '/admin/complements', 
  parentKey: 'catalog',
}
```

### Frontend (Resultado)
```
📁 Catálogo
  ├── 📦 Produtos (/admin/products)
  ├── 🏷️ Categorias (/admin/categories)
  └── ➕ Complementos (/admin/complements)
```

## Vantagens

1. **Estrutura clara**: Features principais agrupam subfeatures relacionadas
2. **Menu organizado**: Submenu/dropdown no frontend
3. **Flexibilidade**: Features podem existir isoladamente ou com subfeatures
4. **Backward compatibility**: Features existentes continuam funcionando
5. **Permissões granulares**: Controle por subfeature independente

## Migração

1. Adicionar campo `parentId` ao schema
2. Criar migration do Prisma
3. Atualizar seed master com nova estrutura
4. Modificar MenuService para suportar hierarquia
5. Frontend já suporta `children` - só precisa implementar renderização
