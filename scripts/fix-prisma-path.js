const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../dist/lib/prisma.js');

if (!fs.existsSync(filePath)) {
  console.error(
    '❌ Arquivo não encontrado, verifique se o build foi feito:',
    filePath,
  );
  process.exit(1);
}

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Substitui ../generated por ../../generated
  content = content.replace(
    'require("../generated/prisma/client")',
    'require("../../generated/prisma/client")',
  );

  fs.writeFileSync(filePath, content, 'utf8');
} catch (error) {
  console.error('❌ Erro ao corrigir caminho do Prisma:', error.message);
}
