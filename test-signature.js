const crypto = require('crypto');
const fs = require('fs');

// Carregar chave privada
const privateKey = fs.readFileSync('src/keys/private-key.pem', 'utf8');

// Dados que o QZ Tray está tentando assinar (formato exato)
const timestamp = Date.now();
const signObj = {
  call: 'printers.find',
  params: {},
  timestamp: timestamp
};

const dataToSign = JSON.stringify(signObj);

// Gerar assinatura
const signer = crypto.createSign('SHA256');
signer.update(dataToSign);
signer.end();

const signature = signer.sign(privateKey, 'base64');

console.log('Sign Object:', JSON.stringify(signObj, null, 2));
console.log('Data to Sign:', dataToSign);
console.log('Signature:', signature);
console.log('Length:', signature.length);
