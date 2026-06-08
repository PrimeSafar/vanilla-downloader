import express from "express";
import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { youtubeDl } from "youtube-dl-exec";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_COOKIE_PATHS = [
  "./cookies.txt",
  "./www.youtube.com_cookies.txt",
];

function normalizeCookieText(cookieText) {
  return cookieText.replace(/\\n/g, "\n").trim() + "\n";
}

function countCookieLines(cookieText) {
  return cookieText.split("\n").filter(Boolean).length;
}

function findCookiePath() {
  if (process.env.YT_COOKIE_PATH && existsSync(process.env.YT_COOKIE_PATH)) {
    return process.env.YT_COOKIE_PATH;
  }

  return DEFAULT_COOKIE_PATHS.find((cookiePath) => existsSync(cookiePath)) || null;
}

function getCookieOption() {
  if (process.env.DISABLE_YT_COOKIES === "true") {
    return {};
  }

  const cookiePath = findCookiePath();
  if (!cookiePath) {
    return {};
  }

  return { cookies: cookiePath };
}

function logCookieStatus() {
  const cookiePath = findCookiePath();
  if (!cookiePath) {
    console.log("[Setup] No cookies file found");
    return;
  }

  try {
    const cookieText = readFileSync(cookiePath, "utf8");
    console.log(
      `[Setup] Using cookies from ${cookiePath}. Size: ${cookieText.length} bytes, Lines: ${countCookieLines(cookieText)}`,
    );
  } catch (err) {
    console.error("[Setup] Failed to read cookies:", err.message);
  }
}

// ==========================================================
// COOKIE INJECTOR
// ==========================================================
if (process.env.YT_COOKIES_BASE64) {
  try {
    const decodedCookies = normalizeCookieText(Buffer.from(process.env.YT_COOKIES_BASE64, "base64").toString("utf8"));
    writeFileSync("./cookies.txt", decodedCookies);
    console.log(
      `[Setup] cookies.txt written from BASE64. Size: ${decodedCookies.length} bytes, Lines: ${countCookieLines(decodedCookies)}`,
    );
  } catch (err) {
    console.error("[Setup] Base64 decode failed:", err.message);
  }
} else if (process.env.YT_COOKIES) {
  try {
    const decodedCookies = normalizeCookieText(process.env.YT_COOKIES);
    writeFileSync("./cookies.txt", decodedCookies);
    console.log("[Setup] cookies.txt written from YT_COOKIES");
  } catch (err) {
    console.error("[Setup] Failed to write cookies.txt:", err.message);
  }
}

logCookieStatus();

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
  res.json({ message: "VanillaDownloader backend is running with youtube-dl-exec!" });
});

// Version endpoint
app.get("/api/version", (req, res) => {
  res.json({ 
    version: "7.0", 
    engine: "youtube-dl-exec",
    timestamp: Date.now()
  });
});

app.get("/api/debug", async (req, res) => {
  try {
    const result = await youtubeDl("https://youtu.be/lfp9y6gcxH0", {
      dumpSingleJson: true,
    });

    res.json({
      success: true,
      title: result.title,
    });
  } catch (error) {
    res.json({
      message: error.message,
      stderr: error.stderr,
      stdout: error.stdout,
    });
  }
});

app.get("/api/yt-version", (req, res) => {
  exec("./node_modules/youtube-dl-exec/bin/yt-dlp --version", (err, stdout, stderr) => {
    res.json({
      stdout,
      stderr,
      error: err?.message,
    });
  });
});

app.get("/api/cookie-status", (req, res) => {
  const cookiePath = findCookiePath();

  if (!cookiePath) {
    return res.json({
      enabled: process.env.DISABLE_YT_COOKIES !== "true",
      found: false,
    });
  }

  try {
    const cookieText = readFileSync(cookiePath, "utf8");
    return res.json({
      enabled: process.env.DISABLE_YT_COOKIES !== "true",
      found: true,
      path: cookiePath,
      size: cookieText.length,
      lines: countCookieLines(cookieText),
      hasNetscapeHeader: cookieText.includes("Netscape HTTP Cookie File"),
    });
  } catch (error) {
    return res.json({
      enabled: process.env.DISABLE_YT_COOKIES !== "true",
      found: true,
      path: cookiePath,
      error: error.message,
    });
  }
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

  console.log("[/api/info] Fetching metadata for:", videoUrl);

  try {
    const info = await youtubeDl(videoUrl, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      ...getCookieOption(),
    });

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
    
  } catch (error) {
    console.error("[/api/info] Error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch video info. The video may be private, age-restricted, or unavailable."
    });
  }
});

// ==========================================================
// GET /api/download - Stream using youtube-dl-exec
// ==========================================================
app.get("/api/download", async (req, res) => {
  const { url, formatId, title, type } = req.query;

  console.log(`[/api/download] Request: formatId=${formatId}, type=${type}`);

  if (!url || !formatId) {
    return res.status(400).json({ error: "Parameters 'url' and 'formatId' are required." });
  }

  const safeTitle = (title || "media_file").replace(/[/\\?%*:|"<>]/g, "_");
  const ext = type === "music" ? "mp3" : "mp4";
  const contentType = type === "music" ? "audio/mpeg" : "video/mp4";

  console.log(`[/api/download] Streaming: "${safeTitle}"`);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${ext}"`);

  try {
    let args;
    if (type === "music") {
      args = {
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: 0,
        output: "-",
        noPlaylist: true,
        noWarnings: true,
        ...getCookieOption(),
      };
      
      // Use formatId or bestaudio
      if (formatId && formatId !== 'bestaudio') {
        args.format = formatId;
      } else {
        args.format = 'bestaudio';
      }
      
    } else {
      args = {
        format: formatId,
        output: "-",
        noPlaylist: true,
        noWarnings: true,
        ...getCookieOption(),
      };
    }
    
    console.log("[/api/download] Starting youtube-dl-exec...");
    
    const subprocess = youtubeDl.exec(url, args);
    
    subprocess.stdout.on("data", (chunk) => {
      res.write(chunk);
    });
    
    subprocess.stderr.on("data", (data) => {
      console.log("[yt-dlp]", data.toString().trim());
    });
    
    subprocess.on("error", (err) => {
      console.error("[/api/download] Process error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed: " + err.message });
      }
    });
    
    subprocess.on("close", (code) => {
      console.log(`[/api/download] Process closed with code ${code}`);
      res.end();
    });
    
    req.on("close", () => {
      console.log("[/api/download] Client disconnected, killing process");
      subprocess.kill();
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
  console.log(`VanillaDownloader backend running on port ${PORT} with youtube-dl-exec!`);
});
