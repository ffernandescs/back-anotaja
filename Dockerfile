FROM node:20-alpine

WORKDIR /app

# Copia dependências
COPY package*.json ./

RUN npm install

# Copia o resto do projeto
COPY . .

# Gera Prisma Client
RUN npx prisma generate

# Build NestJS
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
