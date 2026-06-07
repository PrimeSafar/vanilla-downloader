import { startServer } from 'bgutil-ytdlp-pot-provider';

// Start the PO Token provider server
console.log('[PO Token Provider] Starting...');

startServer({
  port: 4416,
  host: '0.0.0.0',
  logLevel: 'info',
}).then((server) => {
  console.log('[PO Token Provider] ✅ Started successfully on port 4416');
  console.log('[PO Token Provider] Ready to serve PO tokens for yt-dlp');
}).catch((err) => {
  console.error('[PO Token Provider] ❌ Failed to start:', err.message);
  process.exit(1);
});