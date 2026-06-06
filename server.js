// 1. ALL imports MUST be at the very top of the file
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // Render automatically injects its own port number here

// Secure CORS to only allow your Firebase app and localhost
const allowedOrigins = [
  'https://vanilla-downloader.web.app',
  'https://vanilla-downloader.firebaseapp.com',
  'http://localhost:5173' // Vite default local dev port
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// 2. Middleware to read incoming JSON request bodies safely
app.use(express.json());

// Basic sanity-check route
app.get('/api/hello', (req, res) => {
    res.json({ message: "Hello from the backend!" });
});

// ==========================================
// POST ROUTE: LINK ANALYSIS (PROCESS BUTTON)
// ==========================================
app.post('/api/info', (req, res) => {
    const VideoUrl = req.body ? req.body.url : null;

    if (!VideoUrl) {
        return res.status(400).json({ error: "URL is required!" });
    }

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = VideoUrl.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    
    if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    console.log("Backend caught the link. Fetching details for Video ID:", videoId);

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
        console.error("Missing RAPIDAPI_KEY environment variable.");
        return res.status(500).json({ error: "Server misconfiguration. API key missing." });
    }

    const options = {
      method: 'GET',
      hostname: 'youtube138.p.rapidapi.com',
      port: null,
      path: `/video/details/?id=${videoId}`,
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'youtube138.p.rapidapi.com'
      }
    };

    const rapidReq = https.request(options, function (rapidRes) {
      const chunks = [];

      rapidRes.on('data', function (chunk) {
        chunks.push(chunk);
      });

      rapidRes.on('end', function () {
        try {
          const body = Buffer.concat(chunks);
          const fullData = JSON.parse(body.toString());

          if (!fullData || !fullData.title) {
             return res.status(500).json({ error: "No video data found or invalid response from RapidAPI." });
          }

          const durationSeconds = fullData.lengthSeconds || 0;
          const durationStr = `${Math.floor(durationSeconds/60)}:${(durationSeconds%60).toString().padStart(2, '0')}`;
          
          let videoFormats = [];
          if (fullData.streamingData && fullData.streamingData.formats) {
            videoFormats = fullData.streamingData.formats.map(f => ({
                formatId: f.itag.toString(),
                quality: f.qualityLabel || `${f.height}p`,
                ext: f.mimeType ? f.mimeType.split(';')[0].split('/')[1] : 'mp4',
                url: f.url
            }));
          }

          let audioFormats = [];
          if (fullData.streamingData && fullData.streamingData.adaptiveFormats) {
            audioFormats = fullData.streamingData.adaptiveFormats
                .filter(f => f.mimeType && f.mimeType.includes('audio'))
                .map(f => ({
                    formatId: f.itag.toString(),
                    quality: f.audioQuality ? f.audioQuality.replace('AUDIO_QUALITY_', '').toLowerCase() : `${Math.round(f.bitrate/1000)}kbps`,
                    ext: f.mimeType ? f.mimeType.split(';')[0].split('/')[1] : 'mp3',
                    url: f.url
                }))
                .slice(0, 3);
          }

          const responsePayload = {
              message: "Data filtered successfully!",
              videoDetails: {
                  title: fullData.title || "Unknown Video",
                  thumbnail: fullData.thumbnails && fullData.thumbnails.length > 0 ? fullData.thumbnails[fullData.thumbnails.length - 1].url : "",
                  duration: durationStr,
              },
              buttonFormats: {
                  music: audioFormats,
                  video: videoFormats
              }
          };

          console.log("=== API Response Data ===\n", JSON.stringify(responsePayload, null, 2));
          return res.status(200).json(responsePayload);

        } catch (error) {
          console.error("Parse error inside try block:", error);
          return res.status(500).json({ error: "Failed to parse RapidAPI data packet structures." });
        }
      });
    });
    
    rapidReq.on('error', function(err) {
      console.error("Failed to fetch from RapidAPI:", err);
      return res.status(500).json({ error: "Failed to connect to RapidAPI." });
    });

    rapidReq.end();
});

// ==========================================================
// GET ROUTE: HIGH-SPEED SECURE DIRECT STREAM PIPELINE
// ==========================================================
app.get('/api/download', (req, res) => {
    const { url, title, type } = req.query;
    
    if (!url || !type) {
        return res.status(400).send("Security parameters 'url', and 'type' are required.");
    }

    const safeTitle = (title || 'media_file').replace(/[/\\?%*:|"<>]/g, '_');
    
    if (type === 'music') {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
    } else {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp4"`);
    }

    console.log(`[INSTANT STREAM] Proxying URL for file: ${safeTitle}`);
    
    const client = url.startsWith('https') ? https : http;

    client.get(url, (proxyRes) => {
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
             console.log("Redirecting to:", proxyRes.headers.location);
             const redirectClient = proxyRes.headers.location.startsWith('https') ? https : http;
             redirectClient.get(proxyRes.headers.location, (redirectRes) => {
                 redirectRes.pipe(res);
             }).on('error', (e) => {
                 console.error("Proxy redirect error:", e);
                 if (!res.headersSent) res.status(500).send("Proxy error");
             });
             return;
        }

        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error("Proxy stream failed:", err);
        if (!res.headersSent) {
            res.status(500).send("Streaming pipeline crashed.");
        }
    });
});

// Serve compiled static Vite frontend files out of the dist folder
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'dist')));

// Return 404 JSON for any unmatched /api/ routes (prevents serving HTML as JSON)
app.use('/api', (req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
});

// Fallback catch-all to route frontend refreshes cleanly back to your single page app index
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
