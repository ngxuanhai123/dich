// Cloudflare Worker: Dá»ch thuáº­t & Cháº¥m Äiá»m thÃ´ng minh vá»i Edge Cache & Memory Cache
// Báº£n báº£o máº­t (Secured Version) - KhÃ³a CORS, chá»ng spam quota, há» trá»£ Groq & OpenAI

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_MAX = 300;
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 giá» trong RAM Worker

// HÃ m bÄm SHA-256 an toÃ n báº±ng Web Crypto API
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Kiá»m tra Origin há»£p lá»
function isAllowedOrigin(origin) {
  if (!origin) return true; // Cho phÃ©p requests tá»« apps native (iOS/curl/shortcuts khÃ´ng cÃ³ header Origin)
  if (origin === 'null') return true;

  // Localhost phÃ¡t triá»n
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  // Domain chÃ­nh thá»©c trÃªn GitHub Pages
  if (origin === 'https://ngxuanhai123.github.io') return true;

  // Domain Memrise (cho Userscript / Add-on)
  if (/^https:\/\/([a-z0-9-]+\.)?memrise\.com$/i.test(origin)) return true;

  // Chrome extensions
  if (origin.startsWith('chrome-extension://')) return true;

  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 1. Fail-fast: Cháº·n Äá»©ng má»i domain khÃ´ng ÄÆ°á»£c phÃ©p
    if (origin && !isAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Domain cá»§a báº¡n khÃ´ng ÄÆ°á»£c phÃ©p sá»­ dá»¥ng API nÃ y.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin || 'https://ngxuanhai123.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app-token',
      'Access-Control-Max-Age': '86400',
    };

    // 2. Preflight request (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Chá» cháº¥p nháº­n phÆ°Æ¡ng thá»©c POST' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Parse vÃ  validate dá»¯ liá»u Äáº§u vÃ o
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Dá»¯ liá»u JSON khÃ´ng há»£p lá»' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = body && typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
      return new Response(JSON.stringify({ error: 'Prompt khÃ´ng há»£p lá» hoáº·c vÆ°á»£t quÃ¡ giá»i háº¡n (tá»i Äa 4000 kÃ½ tá»±)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. CACHE Tá»I Æ¯U HÃA (TIáº¾T KIá»M QUOTA)
    const hash = await sha256(prompt.toLowerCase());
    const cacheKeyUrl = `https://hihi-dich-cache.internal/v2/translate/${hash}`;
    const cacheKeyReq = new Request(cacheKeyUrl, { method: 'GET' });

    // Táº§ng 1: In-Memory Cache (RAM)
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

    // Táº§ng 2: Cloudflare Edge Cache
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

    // 5. XÃC Äá»NH NHÃ CUNG Cáº¤P AI (Æ¯u tiÃªn Groq vÃ¬ ÄÃ£ cáº¥u hÃ¬nh Secret, fallback OpenAI)
    const groqKey = env.GROQ_API_KEY || env['env.GROQ_API_KEY'];
    const openaiKey = env.OPENAI_API_KEY || env.AI_API_KEY;

    if (!groqKey && !openaiKey) {
      return new Response(JSON.stringify({ error: 'ChÆ°a cáº¥u hÃ¬nh API Key trÃªn Cloudflare Worker (GROQ_API_KEY hoáº·c OPENAI_API_KEY)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      let aiContent = '';

      if (groqKey) {
        // Sá»­ dá»¥ng Groq API
        const model = env.AI_MODEL || 'openai/gpt-oss-120b';
        const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'Báº¡n lÃ  chuyÃªn gia ngÃ´n ngá»¯ vÃ  trá»£ lÃ½ dá»ch thuáº­t chÃ­nh xÃ¡c, há» trá»£ há»c táº­p.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          throw new Error(`Groq API Error (${aiRes.status}): ${errText.slice(0, 150)}`);
        }
        const data = await aiRes.json();
        aiContent = data.choices?.[0]?.message?.content || '';
      } else {
        // Sá»­ dá»¥ng OpenAI API
        const model = env.AI_MODEL || 'gpt-4o-mini';
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'Báº¡n lÃ  chuyÃªn gia ngÃ´n ngá»¯ vÃ  trá»£ lÃ½ dá»ch thuáº­t chÃ­nh xÃ¡c, há» trá»£ há»c táº­p.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          throw new Error(`OpenAI API Error (${aiRes.status}): ${errText.slice(0, 150)}`);
        }
        const data = await aiRes.json();
        aiContent = data.choices?.[0]?.message?.content || '';
      }

      // ÄÃ³ng gÃ³i response tÆ°Æ¡ng thÃ­ch ngÆ°á»£c 100% vá»i frontend
      const finalResult = {
        response: aiContent,
        translation: aiContent,
        content: aiContent,
        text: aiContent
      };

      // LÆ°u vÃ o RAM Cache
      if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        MEMORY_CACHE.delete(firstKey);
      }
      MEMORY_CACHE.set(hash, { data: finalResult, ts: now });

      // LÆ°u vÃ o Cloudflare Edge Cache (TTL 7 ngÃ y)
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
      clearTimeout(timeout);
      return new Response(JSON.stringify({
        error: err.name === 'AbortError' ? 'AI xá»­ lÃ½ quÃ¡ thá»i gian (Timeout 12s). Vui lÃ²ng thá»­ láº¡i!' : err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};