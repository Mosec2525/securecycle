FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json esbuild.design.mjs ./
COPY src ./src
COPY design ./design
COPY media ./media

RUN npm ci \
  && npm run compile \
  && npm prune --omit=dev

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
  && python3 -m venv /opt/semgrep \
  && /opt/semgrep/bin/pip install --no-cache-dir semgrep \
  && ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/vibesec

COPY --from=build /app/out ./out
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY rules ./rules

WORKDIR /workspace

ENTRYPOINT ["node", "/opt/vibesec/out/cli.js"]
CMD ["scan", "/workspace"]
