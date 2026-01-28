FROM node:18-alpine

# Installa FFmpeg
RUN apk add --no-cache ffmpeg

# Crea directory di lavoro
WORKDIR /app

# Copia package.json
COPY package.json ./

# Installa dipendenze
RUN npm install

# Copia il codice
COPY . .

# Esponi la porta
EXPOSE 3001

# Avvia il server
CMD ["node", "server.js"]
