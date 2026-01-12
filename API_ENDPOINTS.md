# 📋 Lista de Endpoints da API

Base URL: `http://localhost:3001/api` (ou a porta configurada no `.env`)

## 🔓 Endpoints Públicos (Não requerem autenticação)

### 1. Registrar Usuário
```http
POST /api/auth/register
Content-Type: application/json
```

**Body:**
```json
{
  "name": "João Silva",
  "phone": "11999999999",
  "email": "joao@example.com",  // Opcional
  "password": "senha123"        // Opcional (mínimo 6 caracteres)
}
```

**Resposta (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxx...",
    "email": "joao@example.com",
    "name": "João Silva",
    "phone": "11999999999",
    "role": "customer"
  }
}
```

---

### 2. Login
```http
POST /api/auth/login
Content-Type: application/json
```

**Body:**
```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Resposta (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxx...",
    "email": "joao@example.com",
    "name": "João Silva",
    "phone": "11999999999",
    "role": "customer"
  }
}
```

**Erro (401):**
```json
{
  "statusCode": 401,
  "message": "Credenciais inválidas"
}
```

---

## 🔒 Endpoints Protegidos (Requerem JWT Token)

**Header necessário para todos os endpoints abaixo:**
```http
Authorization: Bearer <access_token>
```

---

## 👥 Usuários

### 3. Listar Usuários
```http
GET /api/users
Authorization: Bearer <token>
```

**Permissões:** `admin`, `manager`

**Resposta (200):**
```json
[
  {
    "id": "clxxx...",
    "email": "joao@example.com",
    "name": "João Silva",
    "phone": "11999999999",
    "role": "customer",
    "companyId": null,
    "branchId": null,
    "active": true,
    "createdAt": "2026-01-06T21:00:00.000Z",
    "updatedAt": "2026-01-06T21:00:00.000Z"
  }
]
```

---

### 4. Buscar Usuário por ID
```http
GET /api/users/:id
Authorization: Bearer <token>
```

**Parâmetros:**
- `id` (path) - ID do usuário

**Resposta (200):**
```json
{
  "id": "clxxx...",
  "email": "joao@example.com",
  "name": "João Silva",
  "phone": "11999999999",
  "role": "customer",
  "companyId": null,
  "branchId": null,
  "active": true,
  "createdAt": "2026-01-06T21:00:00.000Z",
  "updatedAt": "2026-01-06T21:00:00.000Z"
}
```

**Erro (404):**
```json
{
  "statusCode": 404,
  "message": "Usuário não encontrado"
}
```

---

### 5. Criar Usuário
```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json
```

**Permissões:** `admin`

**Body:**
```json
{
  "name": "Maria Santos",
  "phone": "11888888888",
  "email": "maria@example.com",  // Opcional
  "password": "senha123",         // Opcional (mínimo 6 caracteres)
  "role": "customer",             // Opcional: "admin", "manager", "customer"
  "companyId": "clxxx...",        // Opcional
  "branchId": "clxxx..."          // Opcional
}
```

**Resposta (201):**
```json
{
  "id": "clxxx...",
  "email": "maria@example.com",
  "name": "Maria Santos",
  "phone": "11888888888",
  "role": "customer",
  "companyId": null,
  "branchId": null,
  "active": true,
  "createdAt": "2026-01-06T21:00:00.000Z",
  "updatedAt": "2026-01-06T21:00:00.000Z"
}
```

**Erro (409):**
```json
{
  "statusCode": 409,
  "message": "Email já está em uso"
}
```
ou
```json
{
  "statusCode": 409,
  "message": "Telefone já está em uso"
}
```

---

### 6. Atualizar Usuário
```http
PATCH /api/users/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Parâmetros:**
- `id` (path) - ID do usuário

**Body (todos os campos são opcionais):**
```json
{
  "name": "Maria Santos Silva",
  "email": "maria.santos@example.com",
  "phone": "11888888888",
  "password": "novaSenha123",
  "role": "manager",
  "companyId": "clxxx...",
  "branchId": "clxxx..."
}
```

**Resposta (200):**
```json
{
  "id": "clxxx...",
  "email": "maria.santos@example.com",
  "name": "Maria Santos Silva",
  "phone": "11888888888",
  "role": "manager",
  "companyId": "clxxx...",
  "branchId": "clxxx...",
  "active": true,
  "createdAt": "2026-01-06T21:00:00.000Z",
  "updatedAt": "2026-01-06T21:30:00.000Z"
}
```

---

### 7. Deletar Usuário
```http
DELETE /api/users/:id
Authorization: Bearer <token>
```

**Permissões:** `admin`

**Parâmetros:**
- `id` (path) - ID do usuário

**Resposta (200):**
```json
{
  "id": "clxxx...",
  "email": "maria@example.com",
  "name": "Maria Santos",
  ...
}
```

---

## 🔐 Autenticação

### Como obter o token:

1. Faça login ou registro através dos endpoints públicos
2. Copie o `access_token` da resposta
3. Use no header `Authorization: Bearer <token>`

### Exemplo de uso com cURL:

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@example.com","password":"senha123"}'

# Usar o token
curl -X GET http://localhost:3001/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Exemplo com JavaScript/Fetch:

```javascript
// Login
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'joao@example.com',
    password: 'senha123'
  })
});

const { access_token } = await loginResponse.json();

// Usar o token
const usersResponse = await fetch('http://localhost:3001/api/users', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});

const users = await usersResponse.json();
```

---

## ⚠️ Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Erro de validação
- `401` - Não autenticado (token inválido ou ausente)
- `403` - Sem permissão (role insuficiente)
- `404` - Recurso não encontrado
- `409` - Conflito (email/telefone já em uso)
- `500` - Erro interno do servidor

---

## 📝 Notas Importantes

1. **Todos os endpoints (exceto `/auth/*`) requerem autenticação JWT**
2. **O prefixo global é `/api`** - todas as rotas começam com `/api`
3. **Validação automática** - campos inválidos retornam erro 400
4. **Roles disponíveis:** `admin`, `manager`, `customer`
5. **Telefone é obrigatório e único** no registro de usuário
6. **Email e senha são opcionais** no registro

---

## 🚀 Próximos Endpoints (A implementar)

- `/api/companies` - CRUD de empresas
- `/api/branches` - CRUD de filiais
- `/api/products` - CRUD de produtos
- `/api/orders` - CRUD de pedidos
- `/api/delivery` - Gestão de entregas

