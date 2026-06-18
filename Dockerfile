FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/api ./api
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/vite.config.js ./vite.config.js
EXPOSE 3000
CMD ["node", "server.js"]
