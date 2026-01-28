# FFmpeg Microservice

Un microservizio per processare video e audio usando FFmpeg.

## Funzionalità

- ✅ Ottenere informazioni su video/audio
- ✅ Convertire video in diversi formati
- ✅ Estrarre thumbnail da video
- ✅ Convertire audio
- ✅ Health check endpoint

## Setup Locale con Docker

### Prerequisiti
- Docker e Docker Compose installati

### Avvio

1. **Avvia il servizio:**
```bash
docker-compose up -d
```

2. **Verifica che funzioni:**
```bash
curl http://localhost:3001/health
```

3. **URL da usare in Lovable:**
```
http://localhost:3001
```

## Setup Locale senza Docker

### Prerequisiti
- Node.js 18+ installato
- FFmpeg installato sul sistema

### Installazione FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Scarica da [ffmpeg.org](https://ffmpeg.org/download.html)

### Avvio

1. **Installa dipendenze:**
```bash
npm install
```

2. **Avvia il server:**
```bash
npm start
```

3. **URL da usare in Lovable:**
```
http://localhost:3001
```

## Deploy su Cloud (Produzione)

### Opzione 1: Railway.app (Consigliato)

1. Vai su [railway.app](https://railway.app)
2. Crea un nuovo progetto
3. Connetti il tuo repository GitHub
4. Railway rileverà automaticamente il Dockerfile
5. Il servizio sarà disponibile su un URL tipo: `https://ffmpeg-service.railway.app`

### Opzione 2: Render.com

1. Vai su [render.com](https://render.com)
2. Crea un nuovo Web Service
3. Connetti il repository
4. Seleziona "Docker" come ambiente
5. Deploy!

### Opzione 3: Fly.io

```bash
# Installa flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy
flyctl launch
flyctl deploy
```

## API Endpoints

### GET /health
Verifica lo stato del servizio

### POST /video/info
Ottiene informazioni su un video
- Body: `multipart/form-data` con campo `video`

### POST /video/convert
Converte un video
- Body: `multipart/form-data` con:
  - `video`: file video
  - `format`: formato output (mp4, webm, avi, etc.)
  - `quality`: low, medium, high

### POST /video/thumbnail
Estrae un thumbnail da un video
- Body: `multipart/form-data` con:
  - `video`: file video
  - `timestamp`: momento da cui estrarre (es: "00:00:05")

### POST /audio/convert
Converte un file audio
- Body: `multipart/form-data` con:
  - `audio`: file audio
  - `format`: formato output (mp3, wav, ogg, etc.)
  - `bitrate`: bitrate audio (es: "128k")

## Esempio di utilizzo dal client

```javascript
const formData = new FormData();
formData.append('video', videoFile);
formData.append('format', 'mp4');
formData.append('quality', 'medium');

const response = await fetch('http://localhost:3001/video/convert', {
  method: 'POST',
  body: formData
});

const result = await response.json();
// result.data contiene il video convertito in base64
```

## Troubleshooting

**Errore: "Cannot find ffmpeg"**
- Assicurati che FFmpeg sia installato
- Su Docker, ricostruisci l'immagine: `docker-compose build`

**Errore: "Port already in use"**
- Cambia la porta in `docker-compose.yml` o nel file `.env`

**Performance lente**
- Per video grandi, considera di aumentare le risorse Docker
- In produzione, usa un servizio con più RAM/CPU
