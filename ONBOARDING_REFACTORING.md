# Refatoração de Onboarding SaaS - Documentação

## 📋 Visão Geral

Esta refatoração implementa um sistema robusto de onboarding para o SaaS de delivery/restaurante, incluindo:
- Trial gratuito de 7 dias (conforme legislação brasileira)
- Modal step-by-step para configuração inicial
- Sistema de notificações de trial
- Cron job para expiração automática de trials
- Banner de alerta no painel administrativo

## 🏗️ Arquitetura

### Backend (NestJS + Prisma)

#### 1. Módulo de Onboarding
**Localização:** `src/modules/onboarding/`

**Arquivos criados:**
- `onboarding.service.ts` - Lógica de negócio do onboarding
- `onboarding.controller.ts` - Endpoints REST
- `onboarding.module.ts` - Módulo NestJS
- `dto/update-onboarding-step.dto.ts` - DTO para atualização de step
- `dto/complete-onboarding.dto.ts` - DTO para conclusão
- `dto/onboarding-status-response.dto.ts` - DTO de resposta

**Endpoints:**
```
GET  /onboarding/status - Busca status do onboarding
PATCH /onboarding/step - Atualiza step atual
POST /onboarding/complete - Finaliza onboarding
POST /onboarding/skip - Pula onboarding
```

#### 2. Serviço de Empresas Refatorado
**Localização:** `src/modules/companies/companies-refactored.service.ts`

**Mudanças principais:**
- Criação automática de assinatura trial ao cadastrar empresa
- Busca plano TRIAL ativo no banco
- Calcula data de expiração (7 dias)
- Envia email de boas-vindas
- Inicializa `onboardingStep = 'PLAN'`

**Fluxo de criação:**
```typescript
1. Validar dados da empresa
2. Criar empresa + endereço + branch + usuário admin
3. Buscar plano trial ativo
4. Criar subscription com:
   - status: ACTIVE
   - endDate: now + 7 dias
   - billingPeriod: MONTHLY
5. Enviar email de boas-vindas
```

#### 3. Cron Job de Expiração
**Localização:** `src/modules/cron/`

**Arquivos:**
- `trial-expiration.service.ts` - Serviço de verificação
- `cron.module.ts` - Módulo de cron jobs

**Jobs configurados:**
```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
checkExpiredTrials() // Expira trials vencidos

@Cron(CronExpression.EVERY_DAY_AT_10AM)
notifyTrialExpiringSoon() // Notifica trials próximos do fim
```

**⚠️ IMPORTANTE:** Instalar dependência:
```bash
npm install @nestjs/schedule
```

#### 4. Email de Boas-Vindas
**Localização:** `src/modules/mail/mail.service.ts`

**Método adicionado:**
```typescript
sendWelcomeEmail(email: string, name: string, trialDays: number)
```

**Template inclui:**
- Mensagem de boas-vindas personalizada
- Informação sobre trial de 7 dias
- Próximos passos do onboarding
- Links de suporte

### Frontend (Next.js + React)

#### 1. Modal de Onboarding
**Localização:** `src/components/onboarding/`

**Componentes:**
- `OnboardingModal.tsx` - Modal principal com navegação
- `steps/PlanStep.tsx` - Seleção de plano
- `steps/ScheduleStep.tsx` - Configuração de horários
- `steps/DomainStep.tsx` - Configuração de subdomínio
- `steps/PaymentStep.tsx` - Métodos de pagamento

**Features:**
- Barra de progresso visual
- Validação de cada step
- Possibilidade de voltar
- Botão "Pular por enquanto"
- Indicador de dias restantes do trial

#### 2. Banner de Trial
**Localização:** `src/components/admin/TrialBanner.tsx`

**Comportamento:**
- Exibe dias restantes do trial
- Muda cor quando faltam 2 dias ou menos
- Banner vermelho quando trial expirado
- Pode ser dismissado (salva no localStorage)
- Link direto para página de upgrade

**Estados:**
```typescript
- Trial ativo (>2 dias): Banner azul
- Trial urgente (≤2 dias): Banner laranja
- Trial expirado: Banner vermelho
```

#### 3. Hook de Onboarding
**Localização:** `src/hooks/useOnboarding.ts`

**Métodos:**
```typescript
const {
  status,           // Status atual do onboarding
  loading,          // Estado de carregamento
  error,            // Erro se houver
  refetch,          // Recarrega status
  completeOnboarding, // Finaliza onboarding
  skipOnboarding,   // Pula onboarding
  updateStep,       // Atualiza step atual
} = useOnboarding();
```

## 🔧 Configuração Necessária

### 1. Banco de Dados

Certifique-se de que o schema Prisma está atualizado:
```prisma
enum OnboardingStep {
  PLAN
  SCHEDULE
  DOMAIN
  PAYMENT
  COMPLETED
}

model Company {
  onboardingStep      OnboardingStep @default(PLAN)
  onboardingCompleted Boolean        @default(false)
  subscription        Subscription?
}

model Plan {
  type      PlanType
  isTrial   Boolean  @default(false)
  trialDays Int?     @default(7)
}

model Subscription {
  status    SubscriptionStatus
  endDate   DateTime?
  plan      Plan
}
```

### 2. Criar Plano Trial

Execute no banco ou via seed:
```sql
INSERT INTO "Plan" (
  id, name, description, type, price, 
  "billingPeriod", "trialDays", "isTrial", 
  active, "isFeatured", features, limits
) VALUES (
  gen_random_uuid(),
  'Trial Gratuito',
  'Teste todas as funcionalidades por 7 dias',
  'TRIAL',
  0,
  'MONTHLY',
  7,
  true,
  true,
  false,
  '["Todas as funcionalidades", "Suporte por email", "7 dias grátis"]',
  '{"branches": 1, "users": 5, "products": 100, "ordersPerMonth": 1000}'
);
```

### 3. Variáveis de Ambiente

Adicione ao `.env`:
```env
# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-app
EMAIL_FROM=suporte@anotaja.shop

# Onboarding
OTP_EXPIRES_IN_MINUTES=10
```

### 4. Instalar Dependências

**Backend:**
```bash
cd back-anotaja
npm install @nestjs/schedule
```

**Frontend:**
```bash
cd web-entregaja
# Verificar se já tem instalado:
# - @radix-ui/react-dialog
# - @radix-ui/react-progress
# - @radix-ui/react-checkbox
```

### 5. Registrar Módulos

**app.module.ts:**
```typescript
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CronModule } from './modules/cron/cron.module';

@Module({
  imports: [
    // ... outros módulos
    OnboardingModule,
    CronModule,
  ],
})
export class AppModule {}
```

**Atualizar CompaniesModule:**
```typescript
import { MailService } from '../mail/mail.service';

@Module({
  providers: [CompaniesService, GeocodingService, MailService],
})
export class CompaniesModule {}
```

### 6. Integrar no Layout Admin

**app/admin/layout.tsx:**
```tsx
import { TrialBanner } from '@/components/admin/TrialBanner';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';

export default function AdminLayout({ children }) {
  return (
    <>
      <TrialBanner />
      <OnboardingModal />
      {/* resto do layout */}
    </>
  );
}
```

## 📊 Fluxo Completo

### 1. Cadastro
```
Usuário preenche formulário
  ↓
Backend cria: Company + User + Branch + Address
  ↓
Backend busca plano TRIAL ativo
  ↓
Backend cria Subscription (ACTIVE, endDate: +7 dias)
  ↓
Backend envia email de boas-vindas
  ↓
Usuário é logado automaticamente
```

### 2. Primeiro Login
```
Usuário faz login
  ↓
Frontend verifica onboardingCompleted
  ↓
Se false: Abre OnboardingModal
  ↓
Usuário completa steps: PLAN → SCHEDULE → DOMAIN → PAYMENT
  ↓
Backend valida cada step
  ↓
onboardingCompleted = true
```

### 3. Durante o Trial
```
Banner exibe dias restantes
  ↓
Usuário pode fazer upgrade a qualquer momento
  ↓
Cron job verifica diariamente
  ↓
Se trial expirou: status = EXPIRED
  ↓
Banner vermelho: "Faça upgrade"
```

## 🎯 Validações Implementadas

### Onboarding Completo
- ✅ Plano selecionado (subscription existe)
- ✅ Horários configurados (openingHours.length > 0)
- ✅ Subdomínio definido (branch.subdomain não null)
- ✅ Métodos de pagamento (paymentMethods.length > 0)

### Trial
- ✅ Criado automaticamente no cadastro
- ✅ Duração de 7 dias (legislação brasileira)
- ✅ Expiração automática via cron
- ✅ Notificações visuais (banner)
- ✅ Possibilidade de upgrade antes do fim

## 🚀 Próximos Passos (Opcional)

1. **Integração com Stripe/Strapi:**
   - Adicionar checkout de pagamento
   - Webhook para confirmação de pagamento
   - Atualizar subscription após pagamento

2. **Tour Guiado:**
   - Implementar tour com Intro.js ou Shepherd.js
   - Destacar funcionalidades principais
   - Checklist de tarefas iniciais

3. **Emails Adicionais:**
   - Email 3 dias antes do fim do trial
   - Email 1 dia antes do fim do trial
   - Email quando trial expirar

4. **Analytics:**
   - Tracking de conversão de trial para pago
   - Métricas de conclusão de onboarding
   - Identificar pontos de abandono

5. **Melhorias UX:**
   - Salvar progresso parcial do onboarding
   - Permitir editar steps já concluídos
   - Adicionar tooltips e ajuda contextual

## 📝 Notas Importantes

1. **Legislação Brasileira:** O trial de 7 dias está em conformidade com o CDC (Código de Defesa do Consumidor).

2. **Segurança:** Todos os endpoints de onboarding requerem autenticação (JwtAuthGuard).

3. **Performance:** O cron job roda apenas 2x por dia para não sobrecarregar o banco.

4. **Escalabilidade:** A estrutura permite adicionar novos steps facilmente.

5. **Testes:** Recomenda-se criar testes unitários e E2E para o fluxo completo.

## 🐛 Troubleshooting

### Erro: Cannot find module '@nestjs/schedule'
```bash
npm install @nestjs/schedule
```

### Modal não abre
Verificar se `useOnboarding` está sendo chamado dentro de um componente client ('use client')

### Email não enviado
Verificar configurações SMTP no .env e logs do MailService

### Trial não expira
Verificar se o CronModule está registrado no AppModule

### Banner não aparece
Verificar se o TrialBanner está no layout correto e se o localStorage não está bloqueando

## ✅ Checklist de Implementação

- [x] Criar módulo de onboarding (backend)
- [x] Refatorar criação de empresa com trial
- [x] Implementar cron job de expiração
- [x] Adicionar email de boas-vindas
- [x] Criar modal de onboarding (frontend)
- [x] Criar steps do onboarding
- [x] Implementar banner de trial
- [x] Criar hook useOnboarding
- [ ] Instalar @nestjs/schedule
- [ ] Registrar módulos no AppModule
- [ ] Criar plano TRIAL no banco
- [ ] Integrar TrialBanner no layout
- [ ] Integrar OnboardingModal no layout
- [ ] Testar fluxo completo
- [ ] Configurar variáveis de ambiente
- [ ] Deploy e monitoramento

---

**Desenvolvido para AnotaJá SaaS**
**Data:** Fevereiro 2026
