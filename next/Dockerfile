FROM node:20-alpine

# สร้าง working directory
WORKDIR /app

# ติดตั้ง build tools สำหรับ native modules (sharp, better-sqlite3) + python + ffmpeg
# util-linux-misc: taskset, to keep background video encodes on 2 cores (see "Video renditions" in server.js)
RUN apk add --no-cache python3 py3-pip build-base vips-dev ffmpeg util-linux-misc
RUN python3 -m pip install --no-cache-dir requests --break-system-packages

# copy package.json แล้ว install dependencies ก่อน (cache layer)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# copy ไฟล์ทั้งหมดเข้า container (ยกเว้น node_modules จาก .dockerignore)
COPY . .

RUN npm run test

# เปิด port
EXPOSE 8089

# รัน server
CMD ["node", "server.js"]
