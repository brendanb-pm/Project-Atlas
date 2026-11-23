FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY hosted/*.mjs ./hosted/
USER node
CMD ["node", "hosted/start.mjs"]
