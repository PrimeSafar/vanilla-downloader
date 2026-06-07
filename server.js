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
// COOKIE INJECTOR: Creates cookies.txt from Base64 Env Var
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
} else {
  console.log("[Setup] No cookies environment variable found!");
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
const MAX_URL_LENGTH = 2048;
const VALID_FORMAT_ID_REGEX = /^[\w,+]+$/;

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

// Find yt-dlp binary
const YTDLP =
  process.env.YTDLP_PATH || (existsSync("./yt-dlp") ? "./yt-dlp" : "yt-dlp");

console.log(`[yt-dlp] Using binary: ${YTDLP}`);
console.log(`[yt-dlp] Binary exists check: ${existsSync("./yt-dlp")}`);

// ==========================================================
// COMMON ARGS - NO FORMAT SELECTION HERE
// ==========================================================
const getCommonArgs = () => {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--sleep-interval", "3",
    "--max-sleep-interval", "7",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  
  // Add Deno for JavaScript challenge solving
  args.push("--js-runtime", "deno");
  args.push("--remote-components", "ejs:npm");
  
  // Add cookies if they exist
  if (existsSync("./cookies.txt")) {
    args.push("--cookies", "./cookies.txt");
  }
  
  // PO Token support
  args.push("--extractor-args", "youtube:player_client=mweb,web,android");
  args.push("--extractor-args", "youtube:po_token=web");
  
  return args;
};

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

// Helper: Run yt-dlp
function runYtDlp(args, onData, onEnd, onError) {
  const proc = spawn(YTDLP, args);
  const chunks = [];

  proc.stdout.on("data", (chunk) => {
    chunks.push(chunk);
    if (onData) onData(chunk);
  });

  proc.stderr.on("data", (data) => {
    console.error("[yt-dlp stderr]", data.toString().trim());
  });

  proc.on("close", (code) => {
    if (onEnd) onEnd(code, Buffer.concat(chunks));
  });

  proc.on("error", (err) => {
    if (onError) onError(err);
  });

  return proc;
}

// ==========================================================
// POST /api/info - Get video metadata (NO FORMAT SELECTION)
// ==========================================================
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

        // Video formats (combined video+audio)
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

        // Fallback video formats (video only)
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

        // Audio formats
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

// ==========================================================
// GET /api/download - Stream video or audio (WITH FORMAT SELECTION)
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

  // Build args with common options
  const args = [...getCommonArgs()];
  
  // Add format selection (ONLY HERE, NOT in getCommonArgs)
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

  const proc = spawn(YTDLP, args);

  // Pipe yt-dlp stdout directly to HTTP response
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

  // If client disconnects early, kill yt-dlp to save resources
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

// Fallback: serve index.html for SPA routing - FIXED for Express v5
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: "API endpoint not found." });
  }
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`VanillaDownloader backend running on port ${PORT}`);
});