// Minimal HTTP server for health checks and to keep the bot process alive on platforms like Render
// No external dependencies so it can run in minimal environments.
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/health' || req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    // Basic landing page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>KnightBot-Mini</title></head><body><h1>KnightBot-Mini is running</h1><p>Use <code>/health</code> or <code>/ping</code> for a quick check.</p></body></html>');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down server...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
