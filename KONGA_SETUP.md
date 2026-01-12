# Guia de Configuração do Konga

O Konga é uma interface web open-source para gerenciar o Kong Gateway de forma visual e intuitiva.

## 🚀 Iniciando os Serviços

```bash
docker-compose up -d
```

Aguarde alguns segundos para todos os serviços iniciarem completamente.

## 📝 Primeira Configuração

### 1. Acesse o Konga

Abra seu navegador e acesse: **http://localhost:1337**

### 2. Criar Conta de Administrador

Na primeira vez que acessar, você verá uma tela de registro:
- Preencha os dados (nome, email, senha)
- Clique em "Sign Up"
- Você será redirecionado para o login

### 3. Fazer Login

- Use o email e senha que acabou de criar
- Clique em "Sign In"

### 4. Conectar ao Kong

Após fazer login, você verá uma tela para adicionar uma conexão:

1. Clique em **"Add New Connection"** ou **"Create Connection"**

2. Preencha os campos:
   - **Name**: `Kong Local` (ou qualquer nome de sua preferência)
   - **Kong Admin URL**: `http://kong:8001`
   - **Kong API URL**: `http://kong:8000`
   - **Kong Admin API Version**: Deixe como `1.4.x` ou `latest`

3. Clique em **"Test Connection"** para verificar se está funcionando

4. Se o teste for bem-sucedido, clique em **"Save Connection"**

### 5. Selecionar a Conexão

- Selecione a conexão que acabou de criar no dropdown no topo da página
- Agora você pode gerenciar o Kong através da interface!

## 🎯 Funcionalidades do Konga

### Services (Serviços)
- Visualizar todos os serviços configurados
- Criar, editar e deletar serviços
- Ver detalhes de cada serviço

### Routes (Rotas)
- Gerenciar rotas de cada serviço
- Configurar paths, methods, hosts
- Visualizar rotas ativas

### Plugins
- Visualizar plugins configurados
- Adicionar novos plugins (CORS, Rate Limiting, JWT, etc.)
- Editar configurações de plugins existentes

### Consumers
- Gerenciar consumidores (usuários/APIs que consomem seus serviços)
- Criar e gerenciar JWT tokens
- Configurar credenciais de autenticação

### Certificates
- Gerenciar certificados SSL/TLS
- Configurar certificados para domínios

### SNIs (Server Name Indications)
- Configurar SNIs para certificados

### Upstreams
- Gerenciar upstreams (servidores backend)
- Configurar balanceamento de carga

### Targets
- Configurar targets para upstreams
- Gerenciar saúde dos targets

## 🔧 Configuração Avançada

### Variáveis de Ambiente do Konga

No `docker-compose.yml`, você pode personalizar:

```yaml
environment:
  TOKEN_SECRET: konga-token-secret-change-in-production  # Altere em produção!
  KONGA_HOOK_TIMEOUT: 120000  # Timeout para webhooks
```

### Backup do Banco de Dados do Konga

O banco de dados do Konga está no volume `konga-data`. Para fazer backup:

```bash
docker exec -t konga-database pg_dump -U konga konga > konga_backup.sql
```

## 🐛 Troubleshooting

### Konga não inicia

1. Verifique os logs:
```bash
docker-compose logs konga
```

2. Verifique se o banco de dados do Konga está rodando:
```bash
docker-compose ps
```

### Não consegue conectar ao Kong

1. Verifique se o Kong está rodando:
```bash
docker-compose ps kong
```

2. Teste a Admin API do Kong diretamente:
```bash
curl http://localhost:8001/
```

3. No Konga, use `http://kong:8001` (nome do serviço Docker) e não `http://localhost:8001`

### Erro de conexão com o banco

1. Verifique se o serviço `konga-database` está rodando
2. Verifique os logs:
```bash
docker-compose logs konga-database
```

## 📚 Recursos Adicionais

- [Documentação do Konga](https://github.com/pantsel/konga)
- [Documentação do Kong](https://docs.konghq.com/)
- [Kong Admin API Reference](https://docs.konghq.com/gateway/latest/admin-api/)

