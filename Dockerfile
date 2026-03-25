FROM node:20-alpine

WORKDIR /app

# Copia dependências
COPY package*.json ./

RUN npm install

# Copia o resto do projeto
COPY . .

# Gera Prisma Client
RUN npm run prisma:generate:prod

# Build NestJS
RUN npm run build:prod

EXPOSE 3001

COPY environments/.env.prod .env
CMD ["node", "-r", "dotenv/config", "dist/src/main.js"]