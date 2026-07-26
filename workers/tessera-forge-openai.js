export default {
  async fetch(request, env) {
    const cors = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'content-type': 'application/json'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not configured' }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400, cors); }

    const { prompt, instructions, tool, model = 'gpt-5-mini' } = body || {};
    if (!prompt || !instructions || !tool) return json({ error: 'prompt, instructions, and tool are required' }, 400, cors);

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        instructions,
        input: prompt,
        tools: [{
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
          strict: true
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
