// Cloudflare Worker: Dịch thuật & Chấm điểm thông minh với Edge Cache & Memory Cache
// Tối ưu hóa tối đa quota và tốc độ phản hồi

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_MAX = 200;
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 giờ trong RAM Worker

// Hàm băm SHA-256 an toàn bằng Web Crypto API có sẵn trong Cloudflare Workers
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    // 1. CORS: Chỉ cho phép domain chính thức và localhost khi phát triển
    const ALLOWED_ORIGINS = [
      'https://ngxuanhai123.github.io',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500'
    ];
    const origin = request.headers.get('Origin');
    const isAllowed = ALLOWED_ORIGINS.includes(origin);
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Chỉ chấp nhận phương thức POST' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse và validate dữ liệu đầu vào
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
    if (!prompt || prompt.length > 800) {
      return new Response(JSON.stringify({ error: 'Prompt không hợp lệ hoặc vượt quá 800 ký tự' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. TẠO CACHE KEY TỐI ƯU DỰA TRÊN NỘI DUNG
    const model = env.AI_MODEL || 'gpt-4o-mini';
    const hash = await sha256(`${model}:${prompt.toLowerCase()}`);
    const cacheKeyUrl = `https://hihi-dich-cache.internal/v1/translate/${hash}`;
    const cacheKeyReq = new Request(cacheKeyUrl, { method: 'GET' });

    // Tầng 1: Kiểm tra Memory Cache (In-Worker RAM)
    const now = Date.now();
    const memEntry = MEMORY_CACHE.get(hash);
    if (memEntry && (now - memEntry.ts < MEMORY_TTL_MS)) {
      return new Response(JSON.stringify(memEntry.data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-HiHi-Cache': 'HIT-RAM',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
        }
      });
    }

    // Tầng 2: Kiểm tra Cloudflare Edge Cache API (caches.default)
    const edgeCache = caches.default;
    let cachedRes;
    try {
      cachedRes = await edgeCache.match(cacheKeyReq);
    } catch (e) {
      console.warn('Edge cache match error:', e);
    }

    if (cachedRes) {
      const cachedData = await cachedRes.json();
      // Đưa vào Memory Cache để phục vụ các request kế tiếp siêu tốc
      if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        MEMORY_CACHE.delete(firstKey);
      }
      MEMORY_CACHE.set(hash, { data: cachedData, ts: now });

      return new Response(JSON.stringify(cachedData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-HiHi-Cache': 'HIT-EDGE',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
        }
      });
    }

    // 4. Nếu Cache MISS -> Gọi AI với Timeout 8s
    const apiKey = env.OPENAI_API_KEY || env.AI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chưa cấu hình API Key trên Cloudflare Worker (OPENAI_API_KEY)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'Bạn là chuyên gia ngôn ngữ và trợ lý chấm điểm dịch thuật chính xác, hỗ trợ học tập.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 800
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`Nhà cung cấp AI phản hồi lỗi (${aiRes.status}): ${errText.substring(0, 100)}`);
      }

      const data = await aiRes.json();

      // Lưu vào Memory Cache
      if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        MEMORY_CACHE.delete(firstKey);
      }
      MEMORY_CACHE.set(hash, { data, ts: now });

      // Lưu vào Cloudflare Edge Cache (TTL 7 ngày)
      const cacheHeaders = {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, max-age=604800',
        'ETag': `W/"${hash}"`
      };

      const responseToCache = new Response(JSON.stringify(data), {
        status: 200,
        headers: cacheHeaders
      });

      // Ghi cache ở background không làm chậm response
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(edgeCache.put(cacheKeyReq, responseToCache.clone()));
      } else {
        try { await edgeCache.put(cacheKeyReq, responseToCache.clone()); } catch (e) {}
      }

      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          ...cacheHeaders,
          'X-HiHi-Cache': 'MISS'
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({
        error: err.name === 'AbortError' ? 'AI xử lý quá thời gian (Timeout 8s). Vui lòng thử lại!' : err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
