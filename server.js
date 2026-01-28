const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// =======================
// Middleware
// =======================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// =======================
// Multer (kept for legacy endpoints)
// =======================
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
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Legacy helper (file upload support)
const videoUpload = (req, res, next) => {
  const uploader = upload.any();
  uploader(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

// =======================
// Utils
// =======================
function downloadFromUrl(sourceUrl, destPath) {
  return new Promise((resolve, reject) => {
    const client = sourceUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    client.get(sourceUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// =======================
// Health
// =======================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ffmpeg-microservice',
    timestamp: new Date().toISOString()
  });
});

// =======================
// INFO — accepts ONLY file (legacy)
// =======================
app.post('/video/info', videoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    ffmpeg.ffprobe(req.file.path, (err, metadata) => {
      try { fs.unlinkSync(req.file.path); } catch {}

      if (err) {
        return res.status(500).json({ error: err.message });
      }

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
    res.status(500).json({ error: error.message });
  }
});

// =======================
// 🔥 MAIN ENDPOINT FOR LOVABLE
// Accepts JSON or multipart with videoUrl
// =======================
app.post('/video/convert-from-url', async (req, res) => {
  console.log('Received convert-from-url request');

  const {
    videoUrl,
    url,
    format = 'mp4',
    quality = 'medium',
    startTime,
    duration
  } = req.body || {};

  const sourceUrl = videoUrl || url;

  if (!sourceUrl) {
    return res.status(400).json({ error: 'No videoUrl provided' });
  }

  const inputPath = `./uploads/input-${Date.now()}.mp4`;
  const outputPath = `./uploads/converted-${Date.now()}.${format}`;

  try {
    console.log('Downloading video from:', sourceUrl);
    await downloadFromUrl(sourceUrl, inputPath);
    console.log('Download completed');

    const qualityPresets = {
      low: { videoBitrate: '500k', audioBitrate: '64k' },
      medium: { videoBitrate: '1000k', audioBitrate: '128k' },
      high: { videoBitrate: '2500k', audioBitrate: '192k' }
    };

    const preset = qualityPresets[quality] || qualityPresets.medium;

    let command = ffmpeg(inputPath)
      .videoBitrate(preset.videoBitrate)
      .audioBitrate(preset.audioBitrate)
      .format(format);

    if (startTime !== undefined) {
      command = command.setStartTime(startTime);
    }
    if (duration !== undefined) {
      command = command.setDuration(duration);
    }

    command
      .on('end', () => {
        const fileBuffer = fs.readFileSync(outputPath);
        const base64 = fileBuffer.toString('base64');

        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        } catch {}

        res.json({
          success: true,
          format,
          quality,
          data: base64,
          contentType: `video/${format}`
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {}

        res.status(500).json({
          error: 'FFmpeg failed',
          details: err.message
        });
      })
      .save(outputPath);

  } catch (error) {
    console.error('Download or processing error:', error);
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}

    res.status(500).json({
      error: 'Download or processing failed',
      details: error.message
    });
  }
});

// =======================
// Legacy endpoints (kept as-is)
// =======================
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
        const fileBuffer = fs.readFileSync(outputPath);
        const base64 = fileBuffer.toString('base64');

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
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        res.status(500).json({ error: err.message });
      })
      .save(outputPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
app.listen(PORT, () => {
  console.log(`FFmpeg microservice running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
