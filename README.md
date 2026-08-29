# WA Pairing Server

This repository branch hosts a small Express + Puppeteer pairing server and a simple frontend UI to generate WhatsApp pairing codes.

Environment variables
- PORT: server port (default 3000)
- API_KEY: optional secret key to protect /pair endpoint
- CONCURRENCY: number of parallel Puppeteer jobs (default 2)

Usage
1. Install deps: npm install
2. Start: npm start
3. Access UI: http://localhost:3000/

Security & Notes
- Protect the endpoint with API_KEY before making public.
- Puppeteer requires Chromium; on some hosts additional setup is needed.
- This automation may break if WhatsApp Web markup or flow changes; update selectors in server.js accordingly.
