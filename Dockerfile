FROM node:22-alpine

WORKDIR /app

# Dependências necessárias
RUN apk add --no-cache openssl

# Copia package files
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia restante do projeto
COPY . .

# Gera Prisma Client
RUN npx prisma generate

# Build da aplicação
RUN npm run build

# Script de startup
RUN echo '#!/bin/sh \n\
echo "⏳ Aguardando banco..." \n\
sleep 10 \n\
echo "🔧 Prisma Generate..." \n\
npx prisma generate \n\
echo "🗄️ Prisma Migrate..." \n\
npx prisma migrate deploy \n\
echo "🌱 Prisma Seed Master..." \n\
npx tsx prisma/seed-master.ts || true \n\
echo "🚀 Iniciando aplicação..." \n\
node dist/src/main.js' > /app/start.sh

RUN chmod +x /app/start.sh

EXPOSE 3001

CMD ["sh", "/app/start.sh"]