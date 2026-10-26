FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
# Databasen ligger på et volumen, så den overlever nye udgivelser
ENV PORT=8080 HOST=0.0.0.0 DB_PATH=/data/worldwide.db
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
