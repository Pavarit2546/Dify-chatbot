# filepath: d:\Dify-chatbot\DemoWebDify\backend\Dockerfile
FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN apt-get update && apt-get install -y libssl-dev

# Compile TypeScript เป็น JavaScript
RUN npx prisma generate
RUN npx tsc

EXPOSE 8000

# รันไฟล์ที่ compile แล้ว
CMD ["node", "dist/app.js"]
