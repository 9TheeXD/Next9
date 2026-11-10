# โปรดใช้คำสั่ง sudo เสมอ (Always use sudo when building/running this container)
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
