import express from "express";
import { spawn } from "child_process";
import { existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// COOKIE INJECTOR: Creates cookies.txt from Render Env Var
// ==========================================================
if (process.env.YT_COOKIES) {
  try {
    writeFileSync("./cookies.txt", process.env.YT_COOKIES);
    console.log("[Setup] cookies.txt successfully written from environment variable.");
    
    // Debug: Check first few lines of cookies file
    const cookieContent = readFileSync("./cookies.txt", "utf8");
    const firstLines = cookieContent.split('\n').slice(0, 5).join('\n');
    console.log("[Setup] Cookie preview (first 5 lines):\n", firstLines);
    console.log("[Setup] Cookies file size:", cookieContent.length, "bytes");
  } catch (err) {
    console.error("[Setup] Failed to write cookies.txt:", err.message);
  }
} else {
  console.log("[Setup] No YT_COOKIES environment variable found!");
}

// Rate limiting: simple in-memory store for request tracking
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
const RATE_LIMIT_MAX = 10; // max requests per window per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `${ip}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  if (!requestCounts.has(key)) {
    requestCounts.set(key, 0);
  }

  const count = requestCounts.get(key);
  if (count >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }

  requestCounts.set(key, count + 1);

  // Cleanup old entries
  for (const [k] of requestCounts) {
    const [, window] = k.split(":");
    if (Math.floor(now / RATE_LIMIT_WINDOW) - parseInt(window) > 1) {
      requestCounts.delete(k);
    }
  }

  return true; // OK
}

// URL validation helper
const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/;
const MAX_URL_LENGTH = 2048;
const VALID_FORMAT_ID_REGEX = /^[\w,+]+$/; // Only alphanumeric, comma, plus

function validateYoutubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.length > MAX_URL_LENGTH) return false;
  return YOUTUBE_URL_REGEX.test(url);
}

function validateFormatId(formatId) {
  if (!formatId || typeof formatId !== "string") return false;
  if (formatId.length > 100) return false;
  return VALID_FORMAT_ID_REGEX.test(formatId);
}

// Find yt-dlp binary: prefer ./yt-dlp (downloaded during build on Render),
// fallback to system PATH for local development
const YTDLP =
  process.env.YTDLP_PATH || (existsSync("./yt-dlp") ? "./yt-dlp" : "yt-dlp");

console.log(`[yt-dlp] Using binary: ${YTDLP}`);
console.log(`[yt-dlp] Binary exists check: ${existsSync("./yt-dlp")}`);

// Common yt-dlp arguments for YouTube (including Deno for JS challenges)
const getCommonArgs = () => {
  const args = [
    "--no-playlist",
    "--no-warnings",
  ];
  
  // Add Deno for JavaScript challenge solving
  args.push("--js-runtime", "deno");
  args.push("--remote-components", "ejs:npm");
  
  // Add cookies if they exist
  const cookiesPath = "./cookies.txt";
  if (existsSync(cookiesPath)) {
    console.log(`[yt-dlp] Using cookies from: ${cookiesPath}`);
    args.push("--cookies", cookiesPath);
  } else {
    console.log("[yt-dlp] WARNING: No cookies file found!");
  }
  
  // Use android/mweb clients for better compatibility
  args.push("--extractor-args", "youtube:player_client=android,mweb");
  
  return args;
};

// CORS: allow Render (production), and localhost (dev)
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
        console.log(`[CORS] Blocked origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

app.use(express.json());

// Rate limiting middleware for all API routes
app.use("/api", (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: "Too many requests. Maximum 10 requests per minute allowed.",
    });
  }
  next();
});

// Basic health-check route
app.get("/api/hello", (req, res) => {
  res.json({ message: "VanillaDownloader backend is running!" });
});

// ==========================================
// HELPER: Run yt-dlp and collect stdout
// ==========================================
function runYtDlp(args, onData, onEnd, onError) {
  console.log("[runYtDlp] Executing:", YTDLP, args.slice(0, 8).join(" "), "...");
  const proc = spawn(YTDLP, args);
  const chunks = [];

  proc.stdout.on("data", (chunk) => {
    chunks.push(chunk);
    if (onData) onData(chunk);
  });

  proc.stderr.on("data", (data) => {
    const message = data.toString().trim();
    console.error("[yt-dlp stderr]", message);
    if (message.includes("cookies") || message.includes("Sign in")) {
      console.error("[yt-dlp] COOKIE ERROR:", message);
    }
  });

  proc.on("close", (code) => {
    console.log(`[runYtDlp] Process exited with code ${code}`);
    if (onEnd) onEnd(code, Buffer.concat(chunks));
  });

  proc.on("error", (err) => {
    console.error("[runYtDlp] spawn error:", err.message);
    if (onError) onError(err);
  });

  return proc;
}

// POST /api/info — Get video metadata + format list
// ==========================================
app.post("/api/info", (req, res) => {
  const VideoUrl = req.body ? req.body.url : null;

  if (!VideoUrl) {
    return res.status(400).json({ error: "URL is required!" });
  }

  if (!validateYoutubeUrl(VideoUrl)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  console.log("[/api/info] Fetching metadata for:", VideoUrl);

  const args = [
    ...getCommonArgs(),
    "--dump-json",
    VideoUrl,
  ];

  runYtDlp(
    args,
    null,
    (code, rawBuffer) => {
      if (res.headersSent) return;
      if (code !== 0) {
        console.error("[/api/info] yt-dlp exited with code", code);
        return res.status(500).json({
          error: "yt-dlp failed to fetch video info. Video may be private or unavailable.",
        });
      }

      try {
        const info = JSON.parse(rawBuffer.toString());

        const dur = info.duration || 0;
        const durationStr = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`;

        const thumbnail =
          info.thumbnail ||
          (info.thumbnails && info.thumbnails.length > 0
            ? info.thumbnails[info.thumbnails.length - 1].url
            : "");

        const allFormats = info.formats || [];

        const videoFormats = allFormats
          .filter(
            (f) =>
              f.vcodec &&
              f.vcodec !== "none" &&
              f.acodec &&
              f.acodec !== "none" &&
              f.height &&
              (f.ext === "mp4" || f.ext === "webm"),
          )
          .sort((a, b) => (b.height || 0) - (a.height || 0))
          .slice(0, 5)
          .map((f) => ({
            formatId: f.format_id,
            quality: `${f.height}p`,
            ext: f.ext,
            filesize: f.filesize || f.filesize_approx || null,
          }));

        const fallbackVideo = allFormats
          .filter((f) => f.vcodec && f.vcodec !== "none" && f.height)
          .sort((a, b) => (b.height || 0) - (a.height || 0))
          .slice(0, 5)
          .map((f) => ({
            formatId: f.format_id,
            quality: `${f.height}p`,
            ext: f.ext || "mp4",
            filesize: f.filesize || f.filesize_approx || null,
          }));

        const finalVideoFormats =
          videoFormats.length > 0 ? videoFormats : fallbackVideo;

        const audioFormats = allFormats
          .filter(
            (f) =>
              f.acodec &&
              f.acodec !== "none" &&
              (f.vcodec === "none" || !f.vcodec) &&
              f.abr
          )
          .sort((a, b) => (b.abr || 0) - (a.abr || 0))
          .slice(0, 5)
          .map((f) => ({
            formatId: f.format_id,
            quality: f.abr ? `${Math.round(f.abr)}kbps` : "Audio",
            ext: "mp3",
            filesize: f.filesize || f.filesize_approx || null,
          }));

        console.log(`[/api/info] Found ${finalVideoFormats.length} video formats, ${audioFormats.length} audio formats`);

        const responsePayload = {
          message: "Data filtered successfully!",
          videoDetails: {
            title: info.title || "Unknown Video",
            thumbnail,
            duration: durationStr,
          },
          buttonFormats: {
            video: finalVideoFormats,
            music: audioFormats,
          },
        };

        console.log("[/api/info] Success:", info.title);
        return res.status(200).json(responsePayload);
      } catch (err) {
        console.error("[/api/info] JSON parse error:", err.message);
        return res
          .status(500)
          .json({ error: "Failed to parse video metadata." });
      }
    },
    (err) => {
      console.error("[/api/info] spawn error:", err.message);
      return res
        .status(500)
        .json({ error: "yt-dlp binary not found. Please install yt-dlp." });
    },
  );
});

// GET /api/download — Stream video or audio directly to browser
// ==========================================================
app.get("/api/download", (req, res) => {
  const { url, formatId, title, type } = req.query;

  if (!url || !formatId) {
    return res
      .status(400)
      .json({ error: "Parameters 'url' and 'formatId' are required." });
  }

  if (!validateYoutubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  if (!validateFormatId(formatId)) {
    return res.status(400).json({ error: "Invalid format ID" });
  }

  if (type && !["video", "music"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Must be 'video' or 'music'." });
  }

  const safeTitle = (title || "media_file").replace(/[/\\?%*:|"<>]/g, "_");
  const ext = type === "music" ? "mp3" : "mp4";
  const contentType = type === "music" ? "audio/mpeg" : "video/mp4";

  console.log(
    `[/api/download] Streaming: "${safeTitle}" format=${formatId} type=${type}`,
  );

  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeTitle}.${ext}"`,
  );

  const args = [...getCommonArgs()];
  
  if (type === "music") {
    args.push("-f", formatId || "bestaudio");
    args.push("--extract-audio");
    args.push("--audio-format", "mp3");
    args.push("--audio-quality", "0");
  } else {
    args.push("-f", formatId);
  }
  
  args.push("-o", "-");
  args.push(url);

  console.log("[/api/download] Args:", args.slice(0, -1).join(" "));

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);

  proc.stderr.on("data", (data) => {
    console.error("[yt-dlp download stderr]", data.toString().trim());
  });

  proc.on("error", (err) => {
    console.error("[/api/download] spawn error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp binary not found on server." });
    }
  });

  proc.on("close", (code) => {
    console.log(`[/api/download] yt-dlp exited with code ${code}`);
  });

  req.on("close", () => {
    console.log("[/api/download] Client disconnected, killing yt-dlp process.");
    proc.kill("SIGTERM");
  });
});

// Serve compiled static Vite frontend files
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "dist")));

// Return 404 JSON for unmatched /api/ routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Fallback: serve index.html for SPA routing - FIXED
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`VanillaDownloader backend running on port ${PORT}`);
});