# 对战中继服务(独立于前端 Next 应用)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY pvp-server.mjs ./
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "pvp-server.mjs"]
