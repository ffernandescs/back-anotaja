const jwt = require('jsonwebtoken');

// Token que você está usando
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbW44M3R6MDkwMDAwZW92MjhvNnR6b3ZiIiwiZW1haWwiOiJhZG1pbkBzaXN0ZW1hLmNvbSIsInR5cGUiOiJvd25lciIsInJvbGUiOiJtYXN0ZXIiLCJpYXQiOjE3NzQ1NzEzNDUsImV4cCI6MTc3NDU3MTM0NX0.hlba11I3gHYmROAcv_wOUsMnkcp40oiUnZ4g5jorCXo';

console.log('🔍 Debug Token JWT');
console.log('Token:', token);
console.log('');

// Tentar decodificar sem verificar (só para ver o payload)
try {
  const decoded = jwt.decode(token);
  console.log('✅ Payload decodificado:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.log('❌ Erro ao decodificar:', e.message);
}

console.log('');

// Testar com diferentes secrets
const secrets = [
  '12346',
  'seu-secret-super-seguro-aquis',
  'seu-secret-super-seguro-aquis2',
  'seu-secret-super-seguro-aquis3',
  'secret',
  'default-secret'
];

console.log('🔐 Testando com diferentes secrets:');
secrets.forEach(secret => {
  try {
    const decoded = jwt.verify(token, secret);
    console.log(`✅ VÁLIDO com "${secret}":`, decoded.email);
  } catch (e) {
    console.log(`❌ Inválido com "${secret}"`);
  }
});

console.log('');
console.log('🕐 Timestamps:');
try {
  const decoded = jwt.decode(token);
  console.log('iat (issued at):', new Date(decoded.iat * 1000));
  console.log('exp (expires):', new Date(decoded.exp * 1000));
  console.log('agora:', new Date());
  console.log('expirado?', decoded.exp < Math.floor(Date.now() / 1000));
} catch (e) {
  console.log('Erro ao verificar timestamps:', e.message);
}
