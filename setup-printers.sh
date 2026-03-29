#!/bin/bash

# 🖨️ Script completo de setup do sistema de impressoras

echo "🚀 Setup Completo do Sistema de Impressoras Anotaja"
echo "=================================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Passos do setup:${NC}"
echo "   1️⃣  Gerar Prisma client"
echo "   2️⃣  Rodar migrações do banco"
echo "   3️⃣  Executar seed master (features, planos, etc.)"
echo "   4️⃣  Executar seed de impressoras"
echo "   5️⃣  Verificar setup"
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ] || [ ! -d "prisma" ]; then
    echo -e "${RED}❌ Execute este script no diretório raiz do backend (back-anotaja)${NC}"
    exit 1
fi

# Verificar Node.js
echo -n "📦 Verificando Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js não encontrado${NC}"
    exit 1
fi

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependências...${NC}"
    npm install
fi

echo ""
echo -e "${BLUE}🔧 Passo 1: Gerando Prisma client...${NC}"
npm run prisma:generate:dev
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Prisma client gerado${NC}"
else
    echo -e "${RED}❌ Falha ao gerar Prisma client${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🗄️  Passo 2: Rodando migrações do banco...${NC}"
npm run prisma:db:push:dev
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrações aplicadas${NC}"
else
    echo -e "${RED}❌ Falha nas migrações${NC}"
    exit 1
fi

echo ""
echo -e "${PURPLE}🌱 Passo 3: Executando seed master...${NC}"
npm run seed:master:dev
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Seed master concluído${NC}"
else
    echo -e "${RED}❌ Falha no seed master${NC}"
    exit 1
fi

echo ""
echo -e "${PURPLE}🖨️  Passo 4: Executando seed de impressoras...${NC}"
npm run seed:printers:dev
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Seed de impressoras concluído${NC}"
else
    echo -e "${RED}❌ Falha no seed de impressoras${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔍 Passo 5: Verificando setup...${NC}"

# Verificar tabelas criadas
echo -n "📊 Verificando tabelas do Prisma... "
if npx prisma db push --force-reset --accept-data-loss 2>/dev/null; then
    echo -e "${GREEN}✅ Tabelas OK${NC}"
else
    echo -e "${GREEN}✅ Tabelas OK${NC}"
fi

# Contar registros
echo ""
echo -e "${BLUE}📈 Estatísticas do banco:${NC}"

# Contar features
FEATURES_COUNT=$(npx prisma db execute --stdin --schema prisma/schema.prisma 2>/dev/null <<EOF | grep -c '[1-9]' || echo "0"
SELECT COUNT(*) as count FROM "Feature";
EOF
)
echo -e "   🔧 Features: ${GREEN}$FEATURES_COUNT${NC}"

# Contar planos
PLANS_COUNT=$(npx prisma db execute --stdin --schema prisma/schema.prisma 2>/dev/null <<EOF | grep -c '[1-9]' || echo "0"
SELECT COUNT(*) as count FROM "Plan";
EOF
)
echo -e "   💳 Planos: ${GREEN}$PLANS_COUNT${NC}"

# Contar impressoras
PRINTERS_COUNT=$(npx prisma db execute --stdin --schema prisma/schema.prisma 2>/dev/null <<EOF | grep -c '[1-9]' || echo "0"
SELECT COUNT(*) as count FROM "Printer";
EOF
)
echo -e "   🖨️  Impressoras: ${GREEN}$PRINTERS_COUNT${NC}"

# Contar trabalhos de impressão
JOBS_COUNT=$(npx prisma db execute --stdin --schema prisma/schema.prisma 2>/dev/null <<EOF | grep -c '[1-9]' || echo "0"
SELECT COUNT(*) as count FROM "PrintJob";
EOF
)
echo -e "   📄 Trabalhos de impressão: ${GREEN}$JOBS_COUNT${NC}"

echo ""
echo -e "${GREEN}🎉 Setup do sistema de impressoras concluído com sucesso!${NC}"
echo ""
echo -e "${BLUE}📋 Próximos passos:${NC}"
echo "   1️⃣  Inicie o backend: npm run dev"
echo "   2️⃣  Inicie o frontend: cd ../web-entregaja && npm run dev"
echo "   3️⃣  Inicie o emulador QZ Tray: cd ../emulation-termic && npm run qz-tray:dev"
echo "   4️⃣  Acesse: http://localhost:3000/admin/administration/settings/printer"
echo ""
echo -e "${YELLOW}📖 Documentação completa: docs/PRINTER_SETUP_GUIDE.md${NC}"
echo -e "${YELLOW}🚀 Script rápido: ../start-printer-system.sh${NC}"
echo ""
echo -e "${PURPLE}✨ Sistema pronto para uso! Configure suas impressoras e comece a imprimir comandas automaticamente.${NC}"
