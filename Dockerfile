FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# Copia tudo de uma vez (para incluir prisma)
COPY package*.json ./
COPY prisma ./prisma
COPY environments ./environments
COPY scripts ./scripts
COPY src ./src

# Instala dependências
RUN npm ci

ENV NODE_ENV=production
ENV DOTENV_CONFIG_PATH=environments/.env.prod

# Build do NestJS + Prisma
RUN npm run build:prod

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
