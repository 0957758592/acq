# @acq — account-lifecycle orchestrator (standalone).
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock .nvmrc ./
COPY packages ./packages
COPY apps ./apps
RUN yarn install --frozen-lockfile --non-interactive
EXPOSE 7300 7301
# Default = orchestrator worker. MCP-HTTP surface: override CMD with
#   yarn workspace @acq/whatsapp-app mcp:http
CMD ["yarn", "workspace", "@acq/whatsapp-app", "start"]
