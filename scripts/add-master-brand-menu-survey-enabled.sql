-- Pesquisa de cardápio por brand (Master)
ALTER TABLE "master_brands"
ADD COLUMN IF NOT EXISTS "menuSurveyEnabled" BOOLEAN NOT NULL DEFAULT true;
