const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware con configurazione CORS specifica
app.use(cors({
  origin: '*', // Permetti tutte le origini (puoi limitare a lovable.dev in produzione)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configurazione storage per upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

// Helper middleware per accettare sia 'video' che 'file' come nome campo
const videoUpload = (req, res, next) => {
  const uploader = upload.any();
  uploader(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    // Trova il primo file caricato
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

// Endpoint per verificare lo stato del servizio
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ffmpeg-microservice',
    timestamp: new Date().toISOString()
  });
});

// Endpoint per ottenere informazioni su un video
app.post('/video/info', videoUpload, async (req, res) => {
  console.log('Received video info request');
  try {
    if (!req.file) {
      console.error('No video file provided');
      return res.status(400).json({ error: 'No video file provided' });
    }

    console.log('Processing file:', req.file.originalname);
    
    ffmpeg.ffprobe(req.file.path, (err, metadata) => {
      // Pulisci il file temporaneo
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }

      if (err) {
        console.error('FFprobe error:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log('Video info retrieved successfully');
      res.json({
        duration: metadata.format.duration,
        size: metadata.format.size,
        format: metadata.format.format_name,
        streams: metadata.streams.map(s => ({
          type: s.codec_type,
          codec: s.codec_name,
          width: s.width,
          height: s.height,
          fps: s.r_frame_rate
        }))
      });
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint per convertire video - accetta sia 'video' che 'file'
app.post('/video/convert', videoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { format = 'mp4', quality = 'medium' } = req.body;
    const outputPath = `./uploads/converted-${Date.now()}.${format}`;

    const qualityPresets = {
      low: { videoBitrate: '500k', audioBitrate: '64k' },
      medium: { videoBitrate: '1000k', audioBitrate: '128k' },
      high: { videoBitrate: '2500k', audioBitrate: '192k' }
    };

    const preset = qualityPresets[quality] || qualityPresets.medium;

    ffmpeg(req.file.path)
      .videoBitrate(preset.videoBitrate)
      .audioBitrate(preset.audioBitrate)
      .format(format)
      .on('end', () => {
        // Leggi il file convertito
        const fileBuffer = fs.readFileSync(outputPath);
        const base64 = fileBuffer.toString('base64');

        // Pulisci i file temporanei
        fs.unlinkSync(req.file.path);
        fs.unlinkSync(outputPath);

        res.json({
          success: true,
          format,
          quality,
          data: base64,
          contentType: `video/${format}`
        });
      })
      .on('error', (err) => {
        // Pulisci i file in caso di errore
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        res.status(500).json({ error: err.message });
      })
      .save(outputPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint per estrarre thumbnail da video
app.post('/video/thumbnail', videoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { timestamp = '00:00:01' } = req.body;
    const outputPath = `./uploads/thumb-${Date.now()}.jpg`;

    ffmpeg(req.file.path)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: './uploads',
        size: '640x?'
      })
      .on('end', () => {
        const fileBuffer = fs.readFileSync(outputPath);
        const base64 = fileBuffer.toString('base64');

        // Pulisci i file temporanei
        fs.unlinkSync(req.file.path);
        fs.unlinkSync(outputPath);

        res.json({
          success: true,
          data: base64,
          contentType: 'image/jpeg'
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        res.status(500).json({ error: err.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint per convertire audio
app.post('/audio/convert', videoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { format = 'mp3', bitrate = '128k' } = req.body;
    const outputPath = `./uploads/converted-${Date.now()}.${format}`;

    ffmpeg(req.file.path)
      .audioBitrate(bitrate)
      .format(format)
      .on('end', () => {
        const fileBuffer = fs.readFileSync(outputPath);
        const base64 = fileBuffer.toString('base64');

        fs.unlinkSync(req.file.path);
        fs.unlinkSync(outputPath);

        res.json({
          success: true,
          format,
          bitrate,
          data: base64,
          contentType: `audio/${format}`
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        res.status(500).json({ error: err.message });
      })
      .save(outputPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`FFmpeg microservice running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
