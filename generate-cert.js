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

// Adicionar SAN (Subject Alternative Name) para QZ Tray
const sans = [
  {
    type: 2, // DNS name
    value: 'anotaja.shop'
  },
  {
    type: 2,
    value: 'www.anotaja.shop'
  },
  {
    type: 2,
    value: 'localhost'
  },
  {
    type: 7, // IP address
    ip: '127.0.0.1'
  }
];

cert.setExtensions([{
  name: 'subjectAltName',
  altNames: sans
}, {
  name: 'basicConstraints',
  cA: false
}, {
  name: 'keyUsage',
  keyCertSign: true,
  digitalSignature: true,
  nonRepudiation: true,
  keyEncipherment: true,
  dataEncipherment: true
}, {
  name: 'extKeyUsage',
  serverAuth: true,
  clientAuth: true
}]);

// Assinar certificado
cert.sign(privateKeyForge);

fs.writeFileSync('src/keys/private-key.pem', privateKeyPem);
fs.writeFileSync('certificate.pem', forge.pki.certificateToPem(cert));

// Também salvar para frontend
fs.writeFileSync('../web-entregaja/public/cert/digital-certificate.txt', forge.pki.certificateToPem(cert));

console.log('✅ Certificado X.509 com SAN gerado para QZ Tray!');
console.log('📋 Domínios: anotaja.shop, www.anotaja.shop, localhost, 127.0.0.1');