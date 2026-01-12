# Sistema de Delivery Backend

Backend completo em NestJS para um sistema de delivery de restaurantes/hamburguerias.

## 🚀 Tecnologias

- **NestJS** - Framework Node.js
- **Prisma** - ORM para PostgreSQL
- **PostgreSQL** - Banco de dados (Neon)
- **JWT** - Autenticação
- **Kong Gateway** - API Gateway
- **Docker** - Containerização

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- Docker e Docker Compose
- Conta no Neon PostgreSQL (ou banco PostgreSQL local)

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <repository-url>
cd back-anotaja
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
# Copie o arquivo .env.example e configure com suas credenciais
# DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/delivery_db?sslmode=require"
# JWT_SECRET="seu-secret-super-seguro-aqui"
# JWT_EXPIRES_IN="7d"
# PORT=3000
# NODE_ENV="development"
# KONG_ADMIN_URL="http://localhost:8001"
# KONG_GATEWAY_URL="http://localhost:8000"
```

4. Configure o Prisma:
```bash
# Gerar Prisma Client
npx prisma generate

# Criar migration
npx prisma migrate dev --name init
```

5. Inicie o Kong Gateway e Konga:
```bash
docker-compose up -d
```

   Aguarde alguns segundos para os serviços iniciarem completamente.

6. Inicie a aplicação:
```bash
npm run start:dev
```

## 📁 Estrutura do Projeto

```
src/
├── config/              # Configurações (database, jwt, kong)
├── common/              # Recursos compartilhados
│   ├── decorators/      # Decorators customizados
│   ├── guards/          # Guards de autenticação e autorização
│   ├── interceptors/    # Interceptors
│   └── filters/         # Exception filters
├── modules/             # Módulos da aplicação
│   ├── auth/            # Autenticação
│   ├── users/           # Usuários
│   ├── companies/       # Empresas
│   ├── branches/        # Filiais
│   ├── products/        # Produtos
│   ├── orders/          # Pedidos
│   └── delivery/        # Entregas
├── prisma/              # Prisma Service e Module
└── main.ts              # Entry point
```

## 🔐 Autenticação

O sistema utiliza JWT para autenticação. Todas as rotas são protegidas por padrão, exceto as marcadas com o decorator `@Public()`.

### Endpoints Públicos

- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Login

### Endpoints Protegidos

- `GET /api/users` - Listar usuários (ADMIN, COMPANY_OWNER)
- `GET /api/users/:id` - Buscar usuário
- `POST /api/users` - Criar usuário (ADMIN)
- `PATCH /api/users/:id` - Atualizar usuário
- `DELETE /api/users/:id` - Deletar usuário (ADMIN)

## 🛡️ Segurança

- JWT com expiração configurável
- Rate limiting configurado no Kong Gateway
- Validação de dados com class-validator
- Bcrypt para hash de senhas (rounds: 10)
- CORS configurado adequadamente
- Todas as rotas passam pelo Kong Gateway

## 🐳 Kong Gateway

O Kong Gateway está configurado com:
- CORS habilitado
- Rate limiting (100 req/min, 1000 req/hora)
- Request size limiting (10MB)
- JWT authentication

### Acessos:
- **Proxy**: http://localhost:8000
- **Admin API**: http://localhost:8001
- **Konga (Interface Web)**: http://localhost:1337

### Configurando o Konga

1. Acesse http://localhost:1337
2. Na primeira vez, você precisará criar uma conta de administrador
3. Após criar a conta, faça login
4. Clique em "Add New Connection" para conectar ao Kong
5. Configure a conexão:
   - **Name**: Kong Local (ou qualquer nome)
   - **Kong Admin URL**: http://kong:8001
   - **Kong API URL**: http://kong:8000
   - Clique em "Test Connection" e depois em "Save Connection"
6. Agora você pode gerenciar o Kong através da interface web!

### Recursos do Konga:
- Visualizar e gerenciar Services, Routes, Consumers
- Configurar Plugins (CORS, Rate Limiting, JWT, etc.)
- Gerenciar Consumers e JWT tokens
- Visualizar métricas e logs
- Configurar certificados SSL/TLS

## 📊 Banco de Dados

### Modelos Principais:
- **User** - Usuários do sistema
- **Company** - Empresas/restaurantes
- **Branch** - Filiais das empresas
- **Product** - Produtos
- **Order** - Pedidos
- **OrderItem** - Itens do pedido

### Prisma Studio:
```bash
npx prisma studio
```

## 🧪 Testes

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## 📝 Scripts Disponíveis

```bash
# Desenvolvimento (com Nodemon - reinicia automaticamente)
npm run start:dev

# Desenvolvimento (com NestJS watch)
npm run start:dev:nest

# Produção
npm run start:prod

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## 🔄 Nodemon

O projeto está configurado com **Nodemon** para desenvolvimento. Ele monitora mudanças nos arquivos e reinicia automaticamente o servidor.

### Configuração

- **Arquivo de configuração**: `nodemon.json`
- **Arquivos monitorados**: `src/**/*.ts`, `.env`
- **Delay de reinicialização**: 2 segundos
- **Comando de reinício manual**: Digite `rs` no terminal e pressione Enter

### Recursos do Nodemon

- ✅ Reinicia automaticamente ao salvar arquivos `.ts` e `.json`
- ✅ Monitora mudanças no arquivo `.env`
- ✅ Ignora arquivos de teste e node_modules
- ✅ Suporta reinício manual com `rs`
- ✅ Saída colorida e verbosa

### Personalização

Você pode personalizar o comportamento editando o arquivo `nodemon.json`:

```json
{
  "watch": ["src", ".env"],
  "ext": "ts,json",
  "delay": 2000,
  "restartable": "rs"
}
```

## 🔄 Próximos Passos

- [ ] Implementar CRUDs para Companies, Branches, Products, Orders
- [ ] Adicionar middlewares de logging
- [ ] Implementar tratamento de erros global
- [ ] Adicionar Swagger/OpenAPI documentation
- [ ] Implementar testes unitários e e2e
- [ ] Configurar CI/CD

## 📄 Licença

Este projeto é privado e não possui licença pública.
