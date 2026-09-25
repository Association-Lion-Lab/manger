FROM node:24-alpine

LABEL org.opencontainers.image.title="Manger!" \
      org.opencontainers.image.source="https://codeberg.org/LION_LAB/manger" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

WORKDIR /app
COPY --chown=node:node package.json server.js accounts.js catalog.js recipe-import.js ingredients.js backup-tools.js restore.js ./
COPY --chown=node:node public ./public
RUN mkdir /data && chown node:node /data

ENV MANGER_DB=/data/manger.db
ENV MANGER_PORT=3000
EXPOSE 3000
VOLUME ["/data"]

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
