import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function createOwner() {
  try {
    console.log('🔧 Criando usuário Owner na tabela masterUser...');

    // Verificar se já existe um usuário owner
    const existingOwner = await prisma.masterUser.findFirst({
      where: {
        email: 'owner@anotaja.com',
      },
    });

    if (existingOwner) {
      console.log('✅ Usuário Owner já existe na tabela masterUser');
      return;
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash('Owner@123', 10);

    // Criar usuário Owner na tabela masterUser
    const ownerUser = await prisma.masterUser.create({
      data: {
        name: 'Owner',
        email: 'owner@anotaja.com',
        password: hashedPassword,
        active: true,
      },
    });

    console.log('✅ Usuário Owner criado com sucesso na tabela masterUser!');
    console.log('📧 Email: owner@anotaja.com');
    console.log('🔑 Senha: Owner@123');
    console.log('👤 Nome: Owner');

  } catch (error) {
    console.error('❌ Erro ao criar usuário Owner:', error);
    throw error;
  }
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
  createOwner()
    .then(() => {
      console.log('🎉 Seed Owner concluído com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro no seed Owner:', error);
      process.exit(1);
    });
}

export default createOwner;
