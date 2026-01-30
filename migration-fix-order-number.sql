-- Migration: Fix orderNumber unique constraint to be per branch
-- This allows different branches to have the same orderNumber
-- Issue: UniqueConstraintViolation on Order_orderNumber_key

-- Step 1: Drop the existing unique constraint on orderNumber
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_orderNumber_key";

-- Step 2: Create a new composite unique constraint on (orderNumber, branchId)
-- This ensures orderNumber is unique only within each branch
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderNumber_branchId_key" UNIQUE ("orderNumber", "branchId");

-- Step 3: Create an index for better query performance
CREATE INDEX IF NOT EXISTS "Order_orderNumber_branchId_idx" ON "Order"("orderNumber", "branchId");
