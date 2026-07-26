# Tessera Forge OpenAI integration

This branch adds the server-side half of an OpenAI provider for `examples/tessera-forge.html`.

## Why a proxy is required

The Forge page is static and runs on GitHub Pages. An OpenAI API key must not be stored in browser JavaScript or `localStorage`. The included Cloudflare Worker keeps `OPENAI_API_KEY` server-side and exposes only the narrow request shape Forge needs.

## Worker deployment

1. Create a Cloudflare Worker from `workers/tessera-forge-openai.js`.
2. Add the secret `OPENAI_API_KEY`.
3. Set `ALLOWED_ORIGIN` to the GitHub Pages origin, for example `https://barnickelus.github.io`.
4. Copy the Worker URL into the Forge UI configuration.

## Forge UI changes to apply

Add a third mode button:

```html
<button id="mOpenAI">openai</button>
```

Replace the current single-provider key box with provider-aware controls:

```html
<div id="keyBox">
  <input id="key" type="password" autocomplete="off" spellcheck="false" />
  <input id="endpoint" type="url" placeholder="https://your-worker.workers.dev" />
  <div id="modelRow">
    <select id="model"></select>
    <button id="connect" type="button">test connection</button>
    <span id="connection">not tested</span>
  </div>
  <p class="warn" id="providerHelp"></p>
  <button class="ghost" id="forgetKey">forget saved settings</button>
</div>
```

The key should save on `input`, not only `change`, and the UI should always show one of these states:

- not configured
- saved locally
- testing…
- connected
- connection failed

Claude mode continues to accept an Anthropic key. OpenAI mode accepts only a proxy endpoint and never asks for or stores an OpenAI key.

## OpenAI request adapter

```js
async function openaiPatch(text) {
  const endpoint = localStorage.getItem('forge.openai.endpoint');
  if (!endpoint) throw new Error('Set the OpenAI proxy endpoint first.');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: currentModel(),
      prompt: text,
      instructions: SYSTEM(),
      tool: PATCH_TOOL
    })
  });

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error?.message || j.error || JSON.stringify(j); }
    catch { detail = await res.text(); }
    throw new Error(`${res.status} — ${detail}`);
  }

  const data = await res.json();
  const call = (data.output || []).find(item => item.type === 'function_call' && item.name === 'apply_patch');
  if (!call) throw new Error('OpenAI replied without an apply_patch function call.');

  const patch = JSON.parse(call.arguments || '{}');
  return {
    ops: patch.ops || [],
    label: patch.label || 'patch',
    note: patch.note || '',
    cost: data.usage ? `${data.usage.input_tokens || 0} in / ${data.usage.output_tokens || 0} out` : ''
  };
}
```

## Connection test behavior

The test button should make a real minimal provider request and show the outcome. For OpenAI, send a tiny prompt such as `set subject.spin to its current value` so the response still exercises function calling without changing the scene. Do not infer connection merely because a value exists in storage.
