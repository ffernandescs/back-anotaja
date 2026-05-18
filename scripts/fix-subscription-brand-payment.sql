-- Corrige enum SubscriptionPaymentProvider (remove STRAPI) e colunas em Subscription.
-- Execute antes de `prisma db push` ou `prisma migrate deploy` se falhar com paymentProvider.

-- 1) Normalizar valores STRAPI → STRIPE (se a tabela existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'master_brand_payment_configs'
  ) THEN
    UPDATE master_brand_payment_configs
    SET provider = 'STRIPE'
  WHERE provider::text = 'STRAPI';
  END IF;
END $$;

-- 2) Recriar enum sem STRAPI (PostgreSQL não permite DROP VALUE direto)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionPaymentProvider') THEN
    CREATE TYPE "SubscriptionPaymentProvider" AS ENUM ('STRIPE', 'CAKTO', 'ASAAS');
  ELSIF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SubscriptionPaymentProvider' AND e.enumlabel = 'STRAPI'
  ) THEN
    CREATE TYPE "SubscriptionPaymentProvider_new" AS ENUM ('STRIPE', 'CAKTO', 'ASAAS');

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'master_brand_payment_configs'
    ) THEN
      ALTER TABLE master_brand_payment_configs
        ALTER COLUMN provider DROP DEFAULT;

      ALTER TABLE master_brand_payment_configs
        ALTER COLUMN provider TYPE "SubscriptionPaymentProvider_new"
        USING (
          CASE provider::text
            WHEN 'STRAPI' THEN 'STRIPE'
            ELSE provider::text
          END::"SubscriptionPaymentProvider_new"
        );

      ALTER TABLE master_brand_payment_configs
        ALTER COLUMN provider SET DEFAULT 'STRIPE';
    END IF;

    DROP TYPE "SubscriptionPaymentProvider";
    ALTER TYPE "SubscriptionPaymentProvider_new" RENAME TO "SubscriptionPaymentProvider";
  END IF;
END $$;

-- 3) Colunas na assinatura (white-label billing)
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentProvider" "SubscriptionPaymentProvider";
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "masterBrandId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "externalCheckoutId" TEXT;
