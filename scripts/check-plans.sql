-- Script para verificar todos os planos disponíveis no sistema

SELECT 
  id,
  name,
  type,
  price,
  billingPeriod,
  active,
  isTrial
FROM "Plan"
WHERE active = true
ORDER BY type, billingPeriod;
