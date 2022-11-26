FROM --platform=linux/arm/v7 node:16-alpine

WORKDIR /app

COPY . .

RUN npm i

ENV PORT=8888

EXPOSE 8888

CMD [ "npm", "start" ]
