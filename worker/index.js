export default {
  async fetch(request, env) {
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

    // 2. Chặn lỗi timeout (8 giây)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const body = await request.json();
      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.length > 800) {
        return new Response(JSON.stringify({ error: 'Prompt không hợp lệ hoặc vượt quá 800 ký tự' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const apiKey = env.OPENAI_API_KEY || env.AI_API_KEY;
      if (!apiKey) {
        throw new Error('Chưa cấu hình API Key trên Cloudflare Worker (OPENAI_API_KEY)');
      }

      // 3. Gọi AI an toàn
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: env.AI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Bạn là chuyên gia ngôn ngữ và trợ lý chấm điểm dịch thuật chính xác, hỗ trợ học tập.'
            },
            {
              role: 'user',
              content: body.prompt
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
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
