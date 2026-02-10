FROM node:20-alpine

WORKDIR /app

# Dependências necessárias para Prisma
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .

# Usa explicitamente o env de produção
ENV NODE_ENV=production
ENV DOTENV_CONFIG_PATH=environments/.env.prod

# Build usando seu script real
RUN npm run build:prod

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
