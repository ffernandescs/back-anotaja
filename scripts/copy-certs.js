const fs = require('fs');
const path = require('path');

console.log('🔐 Iniciando cópia de certificados...');

// Caminhos de origem e destino
const srcKeysDir = path.join(__dirname, '..', 'src', 'keys');
const distKeysDir = path.join(__dirname, '..', 'dist', 'src', 'keys');

console.log('📁 Diretório de origem:', srcKeysDir);
console.log('📁 Diretório de destino:', distKeysDir);

// Verificar se diretório de origem existe
if (!fs.existsSync(srcKeysDir)) {
  console.error('❌ Diretório de origem não existe:', srcKeysDir);
  process.exit(1);
}

// Criar diretório de destino se não existir
if (!fs.existsSync(distKeysDir)) {
  console.log('📁 Criando diretório de destino...');
  fs.mkdirSync(distKeysDir, { recursive: true });
  console.log('✅ Diretório criado:', distKeysDir);
}

// Copiar arquivos de certificado
const filesToCopy = ['cert.pem', 'private-key.pem'];

filesToCopy.forEach(file => {
  const srcPath = path.join(srcKeysDir, file);
  const distPath = path.join(distKeysDir, file);
  
  console.log(`🔍 Verificando arquivo: ${file}`);
  
  if (fs.existsSync(srcPath)) {
    try {
      fs.copyFileSync(srcPath, distPath);
      console.log(`✅ Copiado ${file} -> dist/src/keys/`);
      
      // Verificar se foi copiado corretamente
      if (fs.existsSync(distPath)) {
        const stats = fs.statSync(distPath);
        console.log(`📊 Tamanho do arquivo copiado: ${stats.size} bytes`);
      } else {
        console.error(`❌ Falha ao verificar cópia: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao copiar ${file}:`, error);
    }
  } else {
    console.warn(`⚠️ Warning: ${file} não encontrado em src/keys/`);
  }
});

// Listar arquivos no destino
console.log('� Arquivos em dist/src/keys/:');
try {
  const files = fs.readdirSync(distKeysDir);
  files.forEach(file => {
    const filePath = path.join(distKeysDir, file);
    const stats = fs.statSync(filePath);
    console.log(`  📄 ${file} (${stats.size} bytes)`);
  });
} catch (error) {
  console.error('❌ Erro ao listar arquivos de destino:', error);
}

console.log('🔐 Cópia de certificados concluída!');
