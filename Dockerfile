FROM node:alpine

WORKDIR /app

COPY index.js index.js
COPY package.json package.json

RUN npm install

CMD npm run start
