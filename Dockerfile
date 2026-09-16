FROM node:24-alpine

WORKDIR /app
COPY --chown=node:node package.json server.js catalog.js ./
COPY --chown=node:node public ./public
RUN mkdir /data && chown node:node /data

ENV MANGER_DB=/data/manger.db
ENV MANGER_PORT=3000
EXPOSE 3000
VOLUME ["/data"]

USER node
CMD ["node", "server.js"]
