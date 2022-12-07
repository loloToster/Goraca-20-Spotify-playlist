FROM --platform=linux/arm/v7 node:16-alpine

WORKDIR /app

COPY . .

RUN npm i

ENV PORT=8888

EXPOSE 8888

HEALTHCHECK --start-period=30s --retries=1 --interval=10s CMD node healthcheck.js

CMD [ "npm", "start" ]
