// Cloudflare Worker: Dịch thuật & Chấm điểm thông minh với Edge Cache & Memory Cache
// Bản bảo mật (Secured Version) - Chặn Origin:null, rate limit, timeout an toàn

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_MAX = 300;
const MEMORY_TTL_MS = 60 * 60 * 1000;

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return false;

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (origin === 'https://ngxuanhai123.github.io') return true;
  if (/^https:\/\/([a-z0-9-]+\.)?memrise\.com$/i.test(origin)) return true;
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) return true;

  return false;
}

const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  let record = RATE_LIMIT_MAP.get(ip);
  if (!record || (now - record.resetTime > RATE_LIMIT_WINDOW_MS)) {
    record = { count: 1, resetTime: now };
    RATE_LIMIT_MAP.set(ip, record);
    if (RATE_LIMIT_MAP.size > 2000) {
      for (const [k, v] of RATE_LIMIT_MAP.entries()) {
        if (now - v.resetTime > RATE_LIMIT_WINDOW_MS) RATE_LIMIT_MAP.delete(k);
      }
    }
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT_MAX_REQUESTS;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (origin && !isAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Domain của bạn không được phép sử dụng API này.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': (origin && isAllowedOrigin(origin)) ? origin : 'https://ngxuanhai123.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app-token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too Many Requests: Rate limit exceeded. Vui lòng thử lại sau.' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '10',
        }
      });
    }

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Chỉ chấp nhận phương thức POST' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Dữ liệu JSON không hợp lệ' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = body && typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
      return new Response(JSON.stringify({ error: 'Prompt không hợp lệ hoặc vượt quá giới hạn (tối đa 4000 ký tự)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const hash = await sha256(prompt.toLowerCase());
    const cacheKeyUrl = `https://hihi-dich-cache.internal/v2/translate/${hash}`;
    const cacheKeyReq = new Request(cacheKeyUrl, { method: 'GET' });

    const now = Date.now();
    const memEntry = MEMORY_CACHE.get(hash);
    if (memEntry && (now - memEntry.ts < MEMORY_TTL_MS)) {
      return new Response(JSON.stringify(memEntry.data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'HIT-MEMORY'
        }
      });
    }

    const edgeCache = caches.default;
    let cachedRes = null;
    try {
      cachedRes = await edgeCache.match(cacheKeyReq);
    } catch (_) {}

    if (cachedRes) {
      const cachedData = await cachedRes.json();
      if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        MEMORY_CACHE.delete(firstKey);
      }
      MEMORY_CACHE.set(hash, { data: cachedData, ts: now });

      return new Response(JSON.stringify(cachedData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'HIT-EDGE'
        }
      });
    }

    const groqKey = env.GROQ_API_KEY;
    const openaiKey = env.OPENAI_API_KEY || env.AI_API_KEY;

    if (!groqKey && !openaiKey) {
      return new Response(JSON.stringify({ error: 'Chưa cấu hình API Key trên Cloudflare Worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      let aiContent = '';

      if (groqKey) {
        const model = env.AI_MODEL || 'openai/gpt-oss-120b';
        const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Bạn là chuyên gia ngôn ngữ và trợ lý dịch thuật chính xác, hỗ trợ học tập.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
          signal: controller.signal
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text().catch(() => '');
          console.error('Groq API Error:', aiRes.status, errText.slice(0, 200));
          throw new Error(`Lỗi dịch vụ AI (${aiRes.status})`);
        }
        const data = await aiRes.json();
        aiContent = (data.choices?.[0]?.message?.content || '').trim();
      } else {
        const model = env.AI_MODEL || 'gpt-4o-mini';
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Bạn là chuyên gia ngôn ngữ và trợ lý dịch thuật chính xác, hỗ trợ học tập.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
          signal: controller.signal
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text().catch(() => '');
          console.error('OpenAI API Error:', aiRes.status, errText.slice(0, 200));
          throw new Error(`Lỗi dịch vụ AI (${aiRes.status})`);
        }
        const data = await aiRes.json();
        aiContent = (data.choices?.[0]?.message?.content || '').trim();
      }

      if (!aiContent) {
        return new Response(JSON.stringify({ error: 'AI không trả về nội dung.' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const finalResult = {
        response: aiContent,
        translation: aiContent,
        content: aiContent,
        text: aiContent
      };

      if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        MEMORY_CACHE.delete(firstKey);
      }
      MEMORY_CACHE.set(hash, { data: finalResult, ts: now });

      const edgeCacheHeaders = {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'ETag': `W/"${hash}"`
      };
      const responseToCache = new Response(JSON.stringify(finalResult), {
        status: 200,
        headers: edgeCacheHeaders
      });

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(edgeCache.put(cacheKeyReq, responseToCache.clone()));
      } else {
        try { await edgeCache.put(cacheKeyReq, responseToCache.clone()); } catch (_) {}
      }

      return new Response(JSON.stringify(finalResult), {
        headers: {
          ...corsHeaders,
          ...edgeCacheHeaders,
          'X-Cache': 'MISS'
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: err.name === 'AbortError' ? 'AI xử lý quá thời gian (Timeout 12s). Vui lòng thử lại!' : err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } finally {
      clearTimeout(timeout);
    }
  }
};
