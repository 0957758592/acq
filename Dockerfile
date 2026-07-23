# @acq — account-lifecycle orchestrator (standalone).
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Puppeteer + CDP is the browser engine (optional dep). Skip the ~150MB browser
# binary at image-build time — the provider lazy-loads the engine and only
# launches on demand; enable the browser tier in an ops step with
# `npx puppeteer browsers install chrome`.
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json yarn.lock .nvmrc ./
COPY packages ./packages
COPY apps ./apps
RUN yarn install --frozen-lockfile --non-interactive
EXPOSE 7300 7301
# Default = orchestrator worker. MCP-HTTP surface: override CMD with
#   yarn workspace @acq/whatsapp-app mcp:http
CMD ["yarn", "workspace", "@acq/whatsapp-app", "start"]
