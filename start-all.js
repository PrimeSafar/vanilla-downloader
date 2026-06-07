import { spawn } from 'child_process';
import { existsSync } from 'fs';

console.log('[Start] Launching PO Token provider and main server...');

// Start PO Token provider
const provider = spawn('node', ['pot-provider.js'], {
  stdio: 'inherit',
  detached: false,
  env: { ...process.env }
});

provider.on('error', (err) => {
  console.error('[Start] Provider failed to start:', err.message);
});

// Wait 3 seconds for provider to initialize
setTimeout(() => {
  console.log('[Start] Starting main server...');
  
  // Start main server
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    detached: false,
    env: { ...process.env }
  });
  
  server.on('close', (code) => {
    console.log(`[Start] Server exited with code ${code}`);
    provider.kill();
    process.exit(code);
  });
  
  server.on('error', (err) => {
    console.error('[Start] Server failed to start:', err.message);
    provider.kill();
    process.exit(1);
  });
}, 3000);

provider.on('close', (code) => {
  console.log(`[Start] Provider exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Start] Received SIGTERM, shutting down...');
  provider.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Start] Received SIGINT, shutting down...');
  provider.kill();
  process.exit(0);
});