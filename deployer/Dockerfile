# ---------------------------------------------------------------------------
# deployer - drives `docker compose up -d --build` through the mounted Docker
# socket for the admin panel's one-click rebuild button.
#
# The Docker CLI and the Compose/Buildx plugins are all it needs: the helper
# itself is plain Node with no dependencies, so nothing is installed at build
# time beyond the CLI packages.
# ---------------------------------------------------------------------------
FROM node:26-alpine

RUN apk add --no-cache docker-cli docker-cli-compose docker-cli-buildx

WORKDIR /app

COPY --chown=0:0 deployer.js /app/deployer.js

# HOME/DOCKER_CONFIG point at the tmpfs mount: the root filesystem is read-only
# and the CLI wants a writable place for its buildx state.
ENV NODE_ENV=production \
    PORT=4000 \
    HOME=/tmp \
    DOCKER_CONFIG=/tmp/docker-config

EXPOSE 4000

USER 0:0

CMD ["node", "/app/deployer.js"]
