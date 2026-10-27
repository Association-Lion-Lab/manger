ARG MANGER_CANDIDATE_IMAGE
FROM ${MANGER_CANDIDATE_IMAGE}

# Separate maintenance image: never add these tools to the web image.
USER root
RUN apk add --no-cache postgresql18-client
USER node
ENV MANGER_PG_TOOLS=/usr/libexec/postgresql18
RUN node -e 'const {execFileSync}=require("node:child_process"); for(const name of ["pg_dump","pg_restore"]) if(!/\b18\.\d+\b/.test(execFileSync(process.env.MANGER_PG_TOOLS+"/"+name,["--version"],{encoding:"utf8"}))) process.exit(1)'
HEALTHCHECK NONE
ENTRYPOINT ["node", "postgres-instance.js"]
CMD []
