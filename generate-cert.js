const { generateKeyPairSync } = require('crypto');
const fs = require('fs');

// Gerar chave
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Exportar private key
const privateKeyPem = privateKey.export({
  type: 'pkcs1',
  format: 'pem',
});

// Exportar certificado (simples)
const publicKeyPem = publicKey.export({
  type: 'spki',
  format: 'pem',
});

fs.writeFileSync('private-key.pem', privateKeyPem);
fs.writeFileSync('certificate.pem', publicKeyPem);

console.log('✅ Certificados gerados!');