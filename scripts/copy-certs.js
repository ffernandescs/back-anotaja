const fs = require('fs');
const path = require('path');

// Caminhos de origem e destino
const srcKeysDir = path.join(__dirname, '..', 'src', 'keys');
const distKeysDir = path.join(__dirname, '..', 'dist', 'src', 'keys');

// Criar diretório de destino se não existir
if (!fs.existsSync(distKeysDir)) {
  fs.mkdirSync(distKeysDir, { recursive: true });
}

// Copiar arquivos de certificado
const filesToCopy = ['cert.pem', 'private-key.pem'];

filesToCopy.forEach(file => {
  const srcPath = path.join(srcKeysDir, file);
  const distPath = path.join(distKeysDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, distPath);
    console.log(`✅ Copied ${file} to dist/src/keys/`);
  } else {
    console.warn(`⚠️  Warning: ${file} not found in src/keys/`);
  }
});

console.log('🔐 Certificate files copied successfully!');
