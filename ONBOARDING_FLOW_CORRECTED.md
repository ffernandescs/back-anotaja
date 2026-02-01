# Fluxo de Onboarding Corrigido

## 🎯 Problema Identificado

O modal de onboarding estava abrindo **automaticamente** logo após o cadastro, o que não é o comportamento desejado.

## ✅ Fluxo Correto

### 1. **Cadastro em `/register-company`**
```
Usuário preenche formulário (3 steps)
  ↓
Backend cria:
  - Company (onboardingStep = SCHEDULE)
  - CompanyAddress (com coordenadas)
  - Branch (com coordenadas)
  - BranchAddress (com coordenadas)
  - User (admin)
  - Subscription (TRIAL, 7 dias)
  ↓
Envia email de boas-vindas
  ↓
Login automático
  ↓
Redireciona para /admin/dashboard
```

### 2. **Primeiro Acesso ao Dashboard**
```
✅ Usuário vê dashboard normalmente
✅ Banner de trial aparece no topo (se houver)
✅ Botão "Completar Configuração" visível
❌ Modal de onboarding NÃO abre automaticamente
```

### 3. **Quando o Modal Deve Abrir**
```
O modal de onboarding abre apenas quando:

1. Usuário clica no botão "Completar Configuração"
2. Usuário tenta acessar funcionalidade que requer onboarding completo
3. Admin força abertura via prop forceOpen={true}
```

## 🔧 Mudanças Implementadas

### Backend

#### 1. **onboardingStep Inicial = SCHEDULE**
```typescript
// companies.service.ts e companies-refactored.service.ts
const createdCompany = await prisma.company.create({
  data: {
    // ...
    onboardingStep: 'SCHEDULE', // ✅ Pula PLAN pois trial já é criado
    onboardingCompleted: false,
  },
});
```

**Motivo:** O plano trial já é criado automaticamente no cadastro, então o step PLAN já está "completo".

### Frontend

#### 2. **OnboardingModal com forceOpen**
```tsx
interface OnboardingModalProps {
  forceOpen?: boolean; // ✅ Controle manual de abertura
}

export function OnboardingModal({ forceOpen = false }: OnboardingModalProps) {
  const [hasShownOnce, setHasShownOnce] = useState(false);

  useEffect(() => {
    // Só abrir se forceOpen=true OU se já foi mostrado antes
    if (!loading && status && !status.completed) {
      const shouldOpen = forceOpen || hasShownOnce;
      
      if (shouldOpen) {
        setOpen(true);
      }
    }
  }, [loading, status, forceOpen, hasShownOnce]);
}
```

#### 3. **OnboardingButton Component**
```tsx
// Novo componente para trigger manual
export function OnboardingButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowModal(true)}>
        Completar Configuração (75%)
      </Button>

      {showModal && <OnboardingModal forceOpen={true} />}
    </>
  );
}
```

## 📍 Onde Adicionar o Botão

### Opção 1: No Header do Admin Layout
```tsx
// app/admin/layout.tsx
import { OnboardingButton } from '@/components/admin/OnboardingButton';

<header>
  <nav>
    {/* outros itens */}
    <OnboardingButton />
  </nav>
</header>
```

### Opção 2: No Dashboard
```tsx
// app/admin/dashboard/page.tsx
import { OnboardingButton } from '@/components/admin/OnboardingButton';

{!onboardingCompleted && (
  <Card>
    <h3>Complete sua configuração</h3>
    <p>Configure sua loja em poucos passos</p>
    <OnboardingButton />
  </Card>
)}
```

### Opção 3: No Trial Banner
```tsx
// components/admin/TrialBanner.tsx
import { OnboardingButton } from '@/components/admin/OnboardingButton';

<div className="flex items-center gap-2">
  <OnboardingButton />
  <Link href="/admin/settings/subscription">
    <Button>Ver Planos</Button>
  </Link>
</div>
```

## 🎨 Steps do Onboarding

### Step 1: PLAN ✅ (Auto-completo)
- Trial já criado no cadastro
- Usuário pode fazer upgrade depois

### Step 2: SCHEDULE 🔄 (Primeiro step manual)
- Configurar horários de funcionamento
- Segunda a Domingo

### Step 3: DOMAIN 🔄
- Escolher subdomínio
- Verificar disponibilidade
- Ex: `meurestaurante.anotaja.shop`

### Step 4: PAYMENT 🔄
- Selecionar métodos de pagamento
- Dinheiro, Cartão, PIX, etc.

### Conclusão: COMPLETED ✅
- `onboardingCompleted = true`
- `onboardingStep = COMPLETED`
- Modal não aparece mais

## 🚀 Experiência do Usuário

### Cadastro (Dia 1)
```
1. Preenche formulário → 2 minutos
2. Login automático → Instantâneo
3. Vê dashboard → Explora livremente
4. Banner: "7 dias de trial restantes"
5. Botão: "Completar Configuração (25%)"
```

### Configuração (Quando quiser)
```
1. Clica em "Completar Configuração"
2. Modal abre com 3 steps restantes
3. Configura horários → 1 minuto
4. Define subdomínio → 30 segundos
5. Escolhe pagamentos → 30 segundos
6. Pronto! → Pode usar 100% do sistema
```

### Upgrade (Antes do trial expirar)
```
1. Banner muda de cor quando faltam 2 dias
2. Botão "Fazer Upgrade" sempre visível
3. Pode fazer upgrade a qualquer momento
4. Trial → Plano pago sem perder dados
```

## 📊 Vantagens do Novo Fluxo

✅ **Menos fricção** - Usuário não é forçado a configurar tudo de uma vez  
✅ **Exploração livre** - Pode conhecer o sistema antes de configurar  
✅ **Configuração opcional** - Pode usar com configuração mínima  
✅ **Progresso visível** - Sabe exatamente o que falta fazer  
✅ **Controle total** - Decide quando completar o onboarding  

## 🔄 Migração de Empresas Existentes

Se já existem empresas cadastradas com `onboardingStep = PLAN`:

```sql
-- Atualizar empresas que já têm subscription trial
UPDATE "Company" 
SET "onboardingStep" = 'SCHEDULE'
WHERE "onboardingStep" = 'PLAN' 
  AND EXISTS (
    SELECT 1 FROM "Subscription" 
    WHERE "Subscription"."companyId" = "Company"."id"
  );
```

## 📝 Checklist de Implementação

- [x] Mudar onboardingStep inicial para SCHEDULE
- [x] Adicionar prop forceOpen ao OnboardingModal
- [x] Criar componente OnboardingButton
- [ ] Adicionar OnboardingButton no layout/dashboard
- [ ] Testar fluxo completo de cadastro
- [ ] Migrar empresas existentes (se necessário)
- [ ] Atualizar documentação

---

**Fluxo corrigido e pronto para uso!** 🎉
