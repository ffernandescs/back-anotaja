-- Script para atualizar permissões dos grupos após mudança de plano
-- Execute este script para corrigir as permissões do grupo "Administrador"
-- após a mudança de TRIAL para PREMIUM

-- 1. Verificar grupos atuais da empresa
SELECT 
  g.id,
  g.name,
  g.branchId,
  b.companyId,
  COUNT(p.id) as total_permissions
FROM "Group" g
JOIN "Branch" b ON g.branchId = b.id
LEFT JOIN "Permission" p ON p.groupId = g.id
WHERE b.companyId = 'cmn7q7zeq0000n0v2azen7xm3'
GROUP BY g.id, g.name, g.branchId, b.companyId;

-- 2. Deletar permissões antigas do grupo Administrador
DELETE FROM "Permission"
WHERE groupId IN (
  SELECT g.id
  FROM "Group" g
  JOIN "Branch" b ON g.branchId = b.id
  WHERE b.companyId = 'cmn7q7zeq0000n0v2azen7xm3'
);

-- 3. Inserir novas permissões do plano PREMIUM
-- PREMIUM_FEATURES = BASIC_FEATURES + Features avançadas
INSERT INTO "Permission" ("groupId", "action", "subject", "inverted", "createdAt")
SELECT 
  g.id,
  unnest(ARRAY[
    'read', 'manage', 'manage', 'manage', 'manage', 'read', 'manage', 'manage', 'read', 'manage',
    'manage', 'manage', 'manage', 'manage', 'manage',
    -- Upgrades do BASIC para PREMIUM
    'manage', 'manage', 'manage', 'manage',
    -- Features exclusivas do PREMIUM
    'manage', 'manage', 'manage', 'manage'
  ]) as action,
  unnest(ARRAY[
    'dashboard', 'order', 'product', 'category', 'customer', 'report', 'group', 'user', 'subscription', 'branch',
    'payment_method', 'delivery_area', 'profile', 'hours', 'payment',
    -- Upgrades
    'customer', 'report', 'subscription', 'branch',
    -- Exclusivas
    'cash_register', 'coupon', 'stock', 'delivery_person'
  ]) as subject,
  false as inverted,
  NOW() as createdAt
FROM "Group" g
JOIN "Branch" b ON g.branchId = b.id
WHERE b.companyId = 'cmn7q7zeq0000n0v2azen7xm3';

-- 4. Atualizar descrição do grupo
UPDATE "Group"
SET description = 'Grupo com acesso total às funcionalidades do plano PREMIUM'
WHERE id IN (
  SELECT g.id
  FROM "Group" g
  JOIN "Branch" b ON g.branchId = b.id
  WHERE b.companyId = 'cmn7q7zeq0000n0v2azen7xm3'
);

-- 5. Verificar permissões atualizadas
SELECT 
  g.name as grupo,
  p.action,
  p.subject,
  p.inverted
FROM "Group" g
JOIN "Branch" b ON g.branchId = b.id
JOIN "Permission" p ON p.groupId = g.id
WHERE b.companyId = 'cmn7q7zeq0000n0v2azen7xm3'
ORDER BY g.name, p.subject, p.action;
