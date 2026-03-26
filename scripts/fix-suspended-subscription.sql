-- Script para corrigir subscription suspensa
-- Execute este script para reativar a subscription e sincronizar com o Stripe

-- 1. Verificar status atual
SELECT 
  s.id,
  s.companyId,
  s.planId,
  s.status,
  s.stripeSubscriptionId,
  p.name as plan_name,
  p.type as plan_type
FROM "Subscription" s
JOIN "Plan" p ON s.planId = p.id
WHERE s.companyId = 'cmn7ru8xx0000jkv24b00v8fj';

-- 2. Atualizar status para ACTIVE
-- (O Stripe ainda tem a subscription ativa, só o banco que está desatualizado)
UPDATE "Subscription"
SET 
  status = 'ACTIVE',
  "updatedAt" = NOW()
WHERE companyId = 'cmn7ru8xx0000jkv24b00v8fj';

-- 3. Deletar permissões antigas do grupo
DELETE FROM "Permission"
WHERE groupId = 'cmn7ru95s0004jkv2gwkf8u3p';

-- 4. Inserir permissões do plano PREMIUM
INSERT INTO "Permission" ("groupId", "action", "subject", "inverted", "createdAt")
VALUES
  -- BASIC_FEATURES
  ('cmn7ru95s0004jkv2gwkf8u3p', 'read', 'dashboard', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'order', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'product', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'category', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'customer', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'read', 'report', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'group', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'user', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'read', 'subscription', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'branch', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'payment_method', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'delivery_area', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'profile', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'hours', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'payment', false, NOW()),
  -- PREMIUM UPGRADES
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'customer', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'report', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'subscription', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'branch', false, NOW()),
  -- PREMIUM EXCLUSIVAS
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'cash_register', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'coupon', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'stock', false, NOW()),
  ('cmn7ru95s0004jkv2gwkf8u3p', 'manage', 'delivery_person', false, NOW());

-- 5. Atualizar descrição do grupo
UPDATE "Group"
SET description = 'Grupo com acesso total às funcionalidades do plano PREMIUM'
WHERE id = 'cmn7ru95s0004jkv2gwkf8u3p';

-- 6. Verificar resultado
SELECT 
  s.status,
  p.name as plan_name,
  COUNT(perm.id) as total_permissions
FROM "Subscription" s
JOIN "Plan" p ON s.planId = p.id
JOIN "Company" c ON s.companyId = c.id
JOIN "Branch" b ON b.companyId = c.id
JOIN "Group" g ON g.branchId = b.id
LEFT JOIN "Permission" perm ON perm.groupId = g.id
WHERE s.companyId = 'cmn7ru8xx0000jkv24b00v8fj'
GROUP BY s.status, p.name;
