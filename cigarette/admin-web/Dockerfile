FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
RUN npm run build

ENV PORT=7011
EXPOSE 7011

CMD ["sh", "-c", "node cron.js & npx next start -p 7011"]

# sudo docker build -t ciga-next9-img .
# sudo docker run -d --name ciga-next9 --network host --env-file .env.local ciga-next9-img
# sudo docker build -t ciga-next9-img . && sudo docker rm -f ciga-next9 && sudo docker run -d --name ciga-next9 --network host --env-file .env.local ciga-next9-img
