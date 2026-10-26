FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
# Databasen ligger på et volumen, så den overlever nye udgivelser
ENV PORT=8080 HOST=0.0.0.0 DB_PATH=/data/worldwide.db
# Fly lægger volumenet ind som root, så serveren kører som root i sin egen mikro-VM (ikke som 'node')
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
