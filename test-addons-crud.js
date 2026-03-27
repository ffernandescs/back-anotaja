const axios = require('axios');

const API_URL = 'http://localhost:3001/api/addons';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbW44M3R6MDkwMDAwZW92MjhvNnR6b3ZiIiwiZW1haWwiOiJhZG1pbkBzaXN0ZW1hLmNvbSIsInR5cGUiOiJvd25lciIsInJvbGUiOiJtYXN0ZXIiLCJpYXQiOjE3NzQ1NzEzNDUsImV4cCI6MTc3NDU3MTM0NX0.hlba11I3gHYmROAcv_wOUsMnkcp40oiUnZ4g5jorCXo';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

console.log('🧪 Testando CRUD de Addons');
console.log('================================');

// Test data
const addonData = {
  key: 'test-addon',
  name: 'Addon de Teste',
  description: 'Addon criado para teste',
  price: 19.99
};

async function testAddonCRUD() {
  try {
    // 1. CREATE
    console.log('\n1. CREATE - Criando addon...');
    const createResponse = await axios.post(API_URL, addonData, { headers });
    console.log('✅ Addon criado:', createResponse.data);
    const addonId = createResponse.data.id;

    // 2. FIND ALL
    console.log('\n2. FIND ALL - Listando addons...');
    const findAllResponse = await axios.get(API_URL);
    console.log('✅ Addons encontrados:', findAllResponse.data.length);

    // 3. FIND BY ID
    console.log('\n3. FIND BY ID - Buscando addon por ID...');
    const findByIdResponse = await axios.get(`${API_URL}/${addonId}`);
    console.log('✅ Addon encontrado:', findByIdResponse.data.name);

    // 4. FIND BY KEY
    console.log('\n4. FIND BY KEY - Buscando addon por key...');
    const findByKeyResponse = await axios.get(`${API_URL}/key/${addonData.key}`);
    console.log('✅ Addon encontrado:', findByKeyResponse.data.name);

    // 5. UPDATE
    console.log('\n5. UPDATE - Atualizando addon...');
    const updateData = { name: 'Addon Atualizado', price: 29.99 };
    const updateResponse = await axios.patch(`${API_URL}/${addonId}`, updateData, { headers });
    console.log('✅ Addon atualizado:', updateResponse.data.name);

    // 6. TOGGLE ACTIVE
    console.log('\n6. TOGGLE ACTIVE - Alternando status...');
    const toggleResponse = await axios.patch(`${API_URL}/${addonId}/toggle`, {}, { headers });
    console.log('✅ Status alterado:', toggleResponse.data.active);

    // 7. FIND ALL INCLUDING INACTIVE
    console.log('\n7. FIND ALL INCLUDING INACTIVE - Listando todos...');
    const allResponse = await axios.get(`${API_URL}/all`, { headers });
    console.log('✅ Total addons (incluindo inativos):', allResponse.data.length);

    // 8. DELETE
    console.log('\n8. DELETE - Deletando addon...');
    const deleteResponse = await axios.delete(`${API_URL}/${addonId}`, { headers });
    console.log('✅ Addon deletado:', deleteResponse.data.active);

    console.log('\n🎉 Todos os testes passaram!');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.log('💡 Dica: Verifique se o token é válido ou faça login novamente');
    }
  }
}

testAddonCRUD();
