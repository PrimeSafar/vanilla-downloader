import express from "express";
import { spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

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

// Find yt-dlp binary
const YTDLP = existsSync("./yt-dlp") ? "./yt-dlp" : "yt-dlp";
console.log(`[yt-dlp] Using binary: ${YTDLP}`);

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
  res.json({ message: "VanillaDownloader backend is running!" });
});

// Version endpoint
app.get("/api/version", (req, res) => {
  res.json({ 
    version: "5.0", 
    engine: "yt-dlp",
    timestamp: Date.now()
  });
});

// ==========================================================
// POST /api/info - Get video metadata using yt-dlp
// ==========================================================
app.post("/api/info", async (req, res) => {
  const videoUrl = req.body ? req.body.url : null;

  if (!videoUrl) {
    return res.status(400).json({ error: "URL is required!" });
  }

  if (!validateYoutubeUrl(videoUrl)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  console.log("[/api/info] Fetching metadata for:", videoUrl);

  const args = [
    "--no-playlist",
    "--dump-json",
    "--no-warnings",
    ...(existsSync("./cookies.txt") ? ["--cookies", "./cookies.txt"] : []),
    "--extractor-args",
    "youtube:player_client=android,web",
    videoUrl,
  ];

  const proc = spawn(YTDLP, args);
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (data) => { stdout += data.toString(); });
  proc.stderr.on("data", (data) => { stderr += data.toString(); });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error("[/api/info] yt-dlp error:", stderr);
      return res.status(500).json({
        error: "Failed to fetch video info. Video may be private or unavailable."
      });
    }

    try {
      const info = JSON.parse(stdout);
      const durationStr = `${Math.floor(info.duration / 60)}:${(info.duration % 60).toString().padStart(2, "0")}`;
      
      const allFormats = info.formats || [];
      
      // Video formats
      const videoFormats = allFormats
        .filter(f => f.vcodec && f.vcodec !== "none" && f.height)
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .slice(0, 5)
        .map(f => ({
          formatId: f.format_id,
          quality: `${f.height}p`,
          ext: f.ext,
          filesize: f.filesize || null
        }));
      
      // Audio formats
      const audioFormats = allFormats
        .filter(f => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))
        .slice(0, 3)
        .map(f => ({
          formatId: f.format_id,
          quality: f.abr ? `${Math.round(f.abr)}kbps` : "Audio",
          ext: "mp3",
          filesize: f.filesize || null
        }));
      
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
      
    } catch (err) {
      console.error("[/api/info] Parse error:", err.message);
      return res.status(500).json({ error: "Failed to parse video metadata." });
    }
  });
  
  proc.on("error", (err) => {
    console.error("[/api/info] spawn error:", err.message);
    return res.status(500).json({ error: "yt-dlp binary not found." });
  });
});

// ==========================================================
// GET /api/download - Stream using yt-dlp
// ==========================================================
app.get("/api/download", (req, res) => {
  const { url, formatId, title, type } = req.query;

  if (!url || !formatId) {
    return res.status(400).json({ error: "Parameters 'url' and 'formatId' are required." });
  }

  const safeTitle = (title || "media_file").replace(/[/\\?%*:|"<>]/g, "_");
  const ext = type === "music" ? "mp3" : "mp4";
  const contentType = type === "music" ? "audio/mpeg" : "video/mp4";

  console.log(`[/api/download] Streaming: "${safeTitle}" format=${formatId} type=${type}`);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);

  let args;
  if (type === "music") {
    args = [
      "--no-playlist",
      "--no-warnings",
      ...(existsSync("./cookies.txt") ? ["--cookies", "./cookies.txt"] : []),
      "-f", formatId,
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", "-",
      url,
    ];
  } else {
    args = [
      "--no-playlist",
      "--no-warnings",
      ...(existsSync("./cookies.txt") ? ["--cookies", "./cookies.txt"] : []),
      "-f", formatId,
      "-o", "-",
      url,
    ];
  }

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);
  
  proc.stderr.on("data", (data) => {
    console.error("[yt-dlp stderr]", data.toString().trim());
  });
  
  proc.on("error", (err) => {
    console.error("[/api/download] error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed" });
    }
  });
  
  req.on("close", () => {
    console.log("[/api/download] Client disconnected");
    proc.kill();
  });
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
  console.log(`VanillaDownloader backend running on port ${PORT}`);
});