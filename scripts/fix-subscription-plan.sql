-- Script para corrigir subscription que não foi atualizada pelo webhook
-- Use este script APENAS em desenvolvimento quando o webhook não funcionar

-- 1. Verificar subscription atual
SELECT 
  s.id,
  s.companyId,
  s.planId,
  s.status,
  s.stripeSubscriptionId,
  s.stripeCustomerId,
  s.nextBillingDate,
  p.name as planName,
  p.type as planType
FROM "Subscription" s
LEFT JOIN "Plan" p ON s.planId = p.id
WHERE s.companyId = 'cmn7q7zeq0000n0v2azen7xm3';

-- 2. Atualizar para o plano BÁSICO (substitua 'basic-plan-monthly' pelo ID correto do seu plano)
-- IMPORTANTE: Verifique o ID correto do plano BÁSICO antes de executar!

UPDATE "Subscription"
SET 
  planId = 'basic-plan-monthly', -- ← Substitua pelo ID correto do plano BÁSICO
  status = 'ACTIVE',
  notes = 'Plano atualizado manualmente - Webhook não processado em desenvolvimento'
WHERE companyId = 'cmn7q7zeq0000n0v2azen7xm3';

-- 3. Verificar se foi atualizado
SELECT 
  s.id,
  s.companyId,
  s.planId,
  s.status,
  s.stripeSubscriptionId,
  s.nextBillingDate,
  p.name as planName,
  p.type as planType
FROM "Subscription" s
LEFT JOIN "Plan" p ON s.planId = p.id
WHERE s.companyId = 'cmn7q7zeq0000n0v2azen7xm3';
