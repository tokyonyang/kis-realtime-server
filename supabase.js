import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn('[WARN] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. live_quotes 저장이 실패할 수 있습니다.');
}

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', serviceKey || 'missing-key', {
  auth: { persistSession: false }
});

export async function upsertQuote(quote) {
  const { error } = await supabase.from('live_quotes').upsert({
    symbol: quote.symbol,
    name: quote.name || null,
    market: quote.market || 'KR주식',
    exchange: quote.exchange || 'KRX',
    currency: quote.currency || 'KRW',
    price: quote.price,
    change: quote.change ?? null,
    change_rate: quote.changeRate ?? null,
    volume: quote.volume ?? null,
    trade_time: quote.tradeTime || null,
    source: quote.source || 'kis-websocket',
    updated_at: new Date().toISOString()
  }, { onConflict: 'symbol' });

  if (error) {
    console.error('[Supabase upsert error]', error.message || error);
  }
}
