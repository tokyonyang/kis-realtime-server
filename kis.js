import WebSocket from 'ws';
import { upsertQuote } from './supabase.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

function kisEnv() {
  return String(process.env.KIS_ENV || 'real').toLowerCase();
}

function kisRestBaseUrl() {
  return kisEnv().includes('paper') || kisEnv().includes('mock') || kisEnv().includes('vts')
    ? 'https://openapivts.koreainvestment.com:29443'
    : 'https://openapi.koreainvestment.com:9443';
}

function kisWsUrl() {
  return kisEnv().includes('paper') || kisEnv().includes('mock') || kisEnv().includes('vts')
    ? 'ws://ops.koreainvestment.com:31000'
    : 'ws://ops.koreainvestment.com:21000';
}

async function getApprovalKey() {
  const appkey = process.env.KIS_APP_KEY;
  const secretkey = process.env.KIS_APP_SECRET;
  if (!appkey || !secretkey) throw new Error('KIS_APP_KEY / KIS_APP_SECRET 환경변수가 필요합니다.');

  const res = await fetch(kisRestBaseUrl() + '/oauth2/Approval', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey, secretkey })
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { throw new Error('approval_key 응답 파싱 실패: ' + text.slice(0, 120)); }
  if (!res.ok || !data.approval_key) {
    throw new Error('approval_key 발급 실패: ' + (data.msg1 || data.error_description || text.slice(0, 160)));
  }
  return data.approval_key;
}

function subscribeMessage(approvalKey, symbol, trType = '1') {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: process.env.KIS_CUSTTYPE || 'P',
      tr_type: trType,
      'content-type': 'utf-8'
    },
    body: {
      input: {
        tr_id: 'H0STCNT0',
        tr_key: symbol
      }
    }
  });
}

function parseKisRealtimeMessage(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');

  // JSON 응답은 구독 성공/오류/PINGPONG 등 상태 메시지입니다.
  if (text.startsWith('{')) {
    try { return { type: 'status', data: JSON.parse(text) }; } catch { return { type: 'status', data: { raw: text } }; }
  }

  // 실시간 체결 예: 0|H0STCNT0|...|005930^093001^74500^...
  if (!text.includes('|H0STCNT0|')) return null;
  const payload = text.split('|').pop() || '';
  const fields = payload.split('^');
  const symbol = fields[0];
  const tradeTime = fields[1];
  const price = num(fields[2]);
  const change = num(fields[4]);
  const changeRate = num(fields[5]);
  const volume = num(fields[13] || fields[12]);
  if (!symbol || !price) return null;
  return {
    type: 'quote',
    quote: {
      symbol,
      price,
      change,
      changeRate,
      volume,
      tradeTime,
      currency: 'KRW',
      exchange: 'KRX',
      market: 'KR주식',
      source: 'kis-websocket'
    }
  };
}

export async function startKisRealtime({ onStatus } = {}) {
  const symbols = String(process.env.WATCH_SYMBOLS || '005930')
    .split(',')
    .map((s) => s.trim().replace(/\.(KS|KQ|KX)$/i, ''))
    .filter(Boolean);

  const writeIntervalMs = Math.max(200, Number(process.env.QUOTE_WRITE_INTERVAL_MS || 1000));
  const lastWrite = new Map();

  while (true) {
    let ws;
    try {
      onStatus?.({ connected: false, symbols, message: 'approval_key 발급 중' });
      const approvalKey = await getApprovalKey();
      const url = kisWsUrl();
      onStatus?.({ connected: false, symbols, message: 'KIS WebSocket 연결 중', url });

      ws = new WebSocket(url);

      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      onStatus?.({ connected: true, symbols, message: 'KIS WebSocket 연결됨' });

      for (const symbol of symbols) {
        ws.send(subscribeMessage(approvalKey, symbol, '1'));
        console.log('[subscribe]', symbol);
        await sleep(250);
      }

      await new Promise((resolve) => {
        ws.on('message', async (raw) => {
          const parsed = parseKisRealtimeMessage(raw);
          if (!parsed) return;
          if (parsed.type === 'status') {
            const tr = parsed.data?.header?.tr_id || parsed.data?.tr_id || '';
            if (tr && !String(tr).includes('PINGPONG')) console.log('[status]', parsed.data);
            return;
          }
          const q = parsed.quote;
          const now = Date.now();
          const prev = lastWrite.get(q.symbol) || 0;
          if (now - prev < writeIntervalMs) return;
          lastWrite.set(q.symbol, now);
          await upsertQuote(q);
          onStatus?.({ connected: true, lastMessageAt: new Date().toISOString(), lastQuote: q, symbols });
          console.log(`[quote] ${q.symbol} ${q.price}`);
        });
        ws.on('close', () => resolve());
        ws.on('error', (err) => {
          console.error('[ws error]', err.message || err);
          resolve();
        });
      });
    } catch (err) {
      console.error('[KIS realtime error]', err.message || err);
      onStatus?.({ connected: false, error: err.message || String(err) });
    } finally {
      try { ws?.close(); } catch {}
    }

    onStatus?.({ connected: false, message: '5초 후 재연결' });
    await sleep(5000);
  }
}
