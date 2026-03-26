-- Script para corrigir permissões após upgrade de plano
-- Execute este script para atualizar as permissões do grupo para o plano PREMIUM

-- 1. Verificar grupo atual
SELECT 
  g.id,
  g.name,
  g.description,
  b.companyId,
  COUNT(p.id) as total_permissions
FROM "Group" g
JOIN "Branch" b ON g.branchId = b.id
LEFT JOIN "Permission" p ON p.groupId = g.id
WHERE b.companyId = 'cmn7r4s0a0000k8v2862cwgnc'
GROUP BY g.id, g.name, g.description, b.companyId;

-- 2. Deletar permissões antigas do grupo
DELETE FROM "Permission"
WHERE groupId = 'cmn7r4s960004k8v22m2xw9x2';

-- 3. Inserir permissões do plano PREMIUM
-- PREMIUM = BASIC + Features avançadas
INSERT INTO "Permission" ("groupId", "action", "subject", "inverted", "createdAt")
VALUES
  -- BASIC_FEATURES
  ('cmn7r4s960004k8v22m2xw9x2', 'read', 'dashboard', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'order', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'product', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'category', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'customer', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'read', 'report', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'group', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'user', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'read', 'subscription', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'branch', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'payment_method', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'delivery_area', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'profile', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'hours', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'payment', false, NOW()),
  -- PREMIUM UPGRADES (sobrescreve READ para MANAGE)
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'customer', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'report', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'subscription', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'branch', false, NOW()),
  -- PREMIUM EXCLUSIVAS
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'cash_register', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'coupon', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'stock', false, NOW()),
  ('cmn7r4s960004k8v22m2xw9x2', 'manage', 'delivery_person', false, NOW());

-- 4. Atualizar descrição do grupo
UPDATE "Group"
SET description = 'Grupo com acesso total às funcionalidades do plano PREMIUM'
WHERE id = 'cmn7r4s960004k8v22m2xw9x2';

-- 5. Verificar permissões atualizadas
SELECT 
  g.name as grupo,
  p.action,
  p.subject,
  p.inverted
FROM "Group" g
JOIN "Permission" p ON p.groupId = g.id
WHERE g.id = 'cmn7r4s960004k8v22m2xw9x2'
ORDER BY p.subject, p.action;
