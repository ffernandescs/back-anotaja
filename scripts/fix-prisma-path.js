const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../dist/lib/prisma.js');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Substitui ../generated por ../../generated
  content = content.replace(
    'require("../generated/prisma/client")',
    'require("../../generated/prisma/client")',
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Caminho do Prisma corrigido em dist/lib/prisma.js');
} catch (error) {
  console.error('❌ Erro ao corrigir caminho do Prisma:', error.message);
}
