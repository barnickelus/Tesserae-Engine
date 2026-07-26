export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'content-type': 'application/json',
      'vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not configured' }, 500, cors);

    const origin = request.headers.get('origin');
    if (allowedOrigin !== '*' && origin && origin !== allowedOrigin) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400, cors); }

    const { prompt, instructions, tool, model = 'gpt-5-mini' } = body || {};
    if (!prompt || !instructions || !tool) {
      return json({ error: 'prompt, instructions, and tool are required' }, 400, cors);
    }
    if (String(prompt).length > 12000 || String(instructions).length > 30000) {
      return json({ error: 'Request is too large' }, 413, cors);
    }

    const allowedModels = new Set(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']);
    const selectedModel = allowedModels.has(model) ? model : 'gpt-5-mini';

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        instructions,
        input: prompt,
        store: false,
        max_output_tokens: 8000,
        tools: [{
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
          strict: false
        }],
        tool_choice: { type: 'function', name: tool.name }
      })
    });

    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: cors });
  }
};

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers });
}
