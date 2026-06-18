import express from 'express';
import { startKisRealtime } from './kis.js';

const app = express();
const port = process.env.PORT || 3000;

let status = {
  service: 'kis-realtime-server',
  startedAt: new Date().toISOString(),
  connected: false,
  lastMessageAt: null,
  symbols: String(process.env.WATCH_SYMBOLS || '005930').split(',').map(s => s.trim()).filter(Boolean)
};

app.get('/', (req, res) => res.json({ ok: true, status }));
app.get('/health', (req, res) => res.json({ ok: true, status }));

app.listen(port, () => {
  console.log(`KIS realtime server listening on ${port}`);
});

startKisRealtime({
  onStatus(next) {
    status = { ...status, ...next };
  }
}).catch((err) => {
  console.error('startKisRealtime fatal error', err);
});
