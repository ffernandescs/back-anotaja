const { generateKeyPairSync, createSign } = require('crypto');
const fs = require('fs');

// Gerar chave RSA
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Exportar private key
const privateKeyPem = privateKey.export({
  type: 'pkcs1',
  format: 'pem',
});

// Criar certificado X.509 autoassinado
const forge = require('node-forge');

// Converter chave para formato Forge
const privateKeyForge = forge.pki.privateKeyFromPem(privateKeyPem);

// Criar certificado
const cert = forge.pki.createCertificate();
cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({
  type: 'spki',
  format: 'pem',
}));

cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

// Atributos do certificado
const attrs = [{
  name: 'commonName',
  value: 'anotaja.shop'
}, {
  name: 'organizationName',
  value: 'Anotaja'
}, {
  shortName: 'OU',
  value: 'Anotaja'
}];

cert.setSubject(attrs);
cert.setIssuer(attrs);

// Assinar certificado
cert.sign(privateKeyForge);

fs.writeFileSync('src/keys/private-key.pem', privateKeyPem);
fs.writeFileSync('certificate.pem', forge.pki.certificateToPem(cert));

console.log('✅ Certificado X.509 e chave privada gerados!');