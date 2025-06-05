# filepath: d:\Dify-chatbot\DemoWebDify\backend\Dockerfile
FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN apt-get update && apt-get install -y libssl-dev

RUN npx prisma generate

EXPOSE 8000

CMD ["npm", "start"]
