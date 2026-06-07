import express from "express";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import untube from 'untube';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// COOKIE INJECTOR
// ==========================================================
if (process.env.YT_COOKIES_BASE64) {
  try {
    const decodedCookies = Buffer.from(process.env.YT_COOKIES_BASE64, 'base64').toString('utf8');
    writeFileSync("./cookies.txt", decodedCookies);
    const lines = decodedCookies.split('\n').length;
    console.log(`[Setup] cookies.txt written from BASE64. Size: ${decodedCookies.length} bytes, Lines: ${lines}`);
  } catch (err) {
    console.error("[Setup] Base64 decode failed:", err.message);
  }
} else if (process.env.YT_COOKIES) {
  try {
    writeFileSync("./cookies.txt", process.env.YT_COOKIES);
    console.log("[Setup] cookies.txt written from YT_COOKIES");
  } catch (err) {
    console.error("[Setup] Failed to write cookies.txt:", err.message);
  }
}

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `${ip}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  if (!requestCounts.has(key)) {
    requestCounts.set(key, 0);
  }

  const count = requestCounts.get(key);
  if (count >= RATE_LIMIT_MAX) {
    return false;
  }

  requestCounts.set(key, count + 1);

  for (const [k] of requestCounts) {
    const [, window] = k.split(":");
    if (Math.floor(now / RATE_LIMIT_WINDOW) - parseInt(window) > 1) {
      requestCounts.delete(k);
    }
  }

  return true;
}

// URL validation
const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/;

function extractVideoId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function validateYoutubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  return YOUTUBE_URL_REGEX.test(url);
}

// CORS configuration
const allowedOrigins = [
  "https://vanilla-downloader.onrender.com",
  "https://vanilla-downloader.web.app",
  "https://vanilla-downloader.firebaseapp.com",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

app.use(express.json());

// Rate limiting middleware
app.use("/api", (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: "Too many requests. Maximum 10 requests per minute allowed.",
    });
  }
  next();
});

// Health check
app.get("/api/hello", (req, res) => {
  res.json({ message: "VanillaDownloader backend is running with untube!" });
});

// Version endpoint
app.get("/api/version", (req, res) => {
  res.json({ 
    version: "4.3", 
    engine: "untube",
    timestamp: Date.now()
  });
});

// ==========================================================
// POST /api/info - Get video metadata
// ==========================================================
app.post("/api/info", async (req, res) => {
  const videoUrl = req.body ? req.body.url : null;

  if (!videoUrl) {
    return res.status(400).json({ error: "URL is required!" });
  }

  if (!validateYoutubeUrl(videoUrl)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: "Could not extract video ID" });
  }

  console.log("[/api/info] Fetching metadata for:", videoId);

  try {
    const info = await untube.getVideoInfo(videoId, {
      cookies: existsSync("./cookies.txt") ? "./cookies.txt" : undefined
    });

    const durationStr = `${Math.floor(info.duration / 60)}:${(info.duration % 60).toString().padStart(2, "0")}`;

    const videoFormats = untube.filterFormats(info.formats, 'video')
      .filter(f => f.resolution && f.resolution !== 'audio only')
      .sort((a, b) => {
        const heightA = parseInt(a.resolution) || 0;
        const heightB = parseInt(b.resolution) || 0;
        return heightB - heightA;
      })
      .slice(0, 5)
      .map(f => ({
        formatId: f.format_id,
        quality: f.resolution || f.quality_label || 'HD',
        ext: f.ext,
        filesize: f.filesize || null
      }));

    const audioFormats = untube.filterFormats(info.formats, 'audioonly')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))
      .slice(0, 3)
      .map(f => ({
        formatId: f.format_id,
        quality: f.abr ? `${Math.round(f.abr)}kbps` : 'Audio',
        ext: 'mp3',
        filesize: f.filesize || null
      }));

    console.log(`[/api/info] Found ${videoFormats.length} video formats, ${audioFormats.length} audio formats`);

    const responsePayload = {
      message: "Data filtered successfully!",
      videoDetails: {
        title: info.title || "Unknown Video",
        thumbnail: info.thumbnail,
        duration: durationStr,
      },
      buttonFormats: {
        video: videoFormats,
        music: audioFormats,
      },
    };

    console.log("[/api/info] Success:", info.title);
    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error("[/api/info] Error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch video info. The video may be private, age-restricted, or unavailable."
    });
  }
});

// ==========================================================
// GET /api/download - Stream video or audio
// ==========================================================
app.get("/api/download", async (req, res) => {
  const { url, formatId, title, type } = req.query;

  console.log(`[/api/download] Request received: url=${url}, formatId=${formatId}, type=${type}`);

  if (!url || !formatId) {
    return res.status(400).json({ error: "Parameters 'url' and 'formatId' are required." });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const safeTitle = (title || "media_file").replace(/[/\\?%*:|"<>]/g, "_");
  const ext = type === "music" ? "mp3" : "mp4";
  const contentType = type === "music" ? "audio/mpeg" : "video/mp4";

  console.log(`[/api/download] Streaming: "${safeTitle}" videoId=${videoId} formatId=${formatId} type=${type}`);

  try {
    const cookieOption = existsSync("./cookies.txt") ? { cookies: "./cookies.txt" } : {};
    
    // For audio, we need to use bestaudio format
    let formatToUse = formatId;
    if (type === "music") {
      // Get video info to find the best audio format
      const info = await untube.getVideoInfo(videoId, cookieOption);
      const audioFormats = untube.filterFormats(info.formats, 'audioonly');
      const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
      if (bestAudio) {
        formatToUse = bestAudio.format_id;
        console.log(`[/api/download] Using best audio format: ${formatToUse} (${bestAudio.abr}kbps)`);
      }
    }
    
    const stream = untube(videoId, {
      format: formatToUse,
      ...cookieOption
    });

    // Set headers before piping
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);
    
    stream.on('info', (info, format) => {
      console.log(`[/api/download] Download started: ${info.title}, Format: ${format.resolution || format.abr || 'audio'}`);
    });

    stream.on('progress', (progress) => {
      console.log(`[/api/download] Progress: ${progress.percent || 0}%`);
    });

    stream.on('error', (err) => {
      console.error("[/api/download] Stream error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed: " + err.message });
      }
    });

    stream.pipe(res);

    req.on("close", () => {
      console.log("[/api/download] Client disconnected.");
      stream.destroy();
    });

  } catch (error) {
    console.error("[/api/download] Error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start download: " + error.message });
    }
  }
});

// Serve compiled static Vite frontend files
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "dist")));

// Return 404 JSON for unmatched /api/ routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Fallback: serve index.html for SPA routing
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: "API endpoint not found." });
  }
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`VanillaDownloader backend running on port ${PORT} with untube!`);
});