FROM node:slim

COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY entrypoint.js /entrypoint.js

ENTRYPOINT ["/entrypoint.js"]