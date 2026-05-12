FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

RUN printf '#!/bin/sh\n\
echo "⏳ Aguardando banco..."\n\
sleep 10\n\
echo "🔧 Prisma Generate..."\n\
npx prisma generate\n\
echo "🗄️ Prisma Migrate..."\n\
npx prisma migrate deploy\n\
echo "🌱 Prisma Seed Master..."\n\
npx tsx prisma/seed-master.ts || true\n\
echo "🚀 Iniciando aplicação..."\n\
exec node dist/src/main.js\n' > /app/start.sh \
    && chmod +x /app/start.sh

EXPOSE 3001

CMD ["sh", "/app/start.sh"]