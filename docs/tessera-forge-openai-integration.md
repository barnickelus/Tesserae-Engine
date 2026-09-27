# Tessera Forge — the OpenAI Worker

`examples/tessera-forge.html` is a static page on GitHub Pages, so it can't hold
an API key. Its first two LLM providers are bring-your-own-key: you paste a key,
and it stays in your browser. The third provider removes the key from the
browser entirely. A small Cloudflare Worker (`workers/tessera-forge-openai.js`)
holds `OPENAI_API_KEY` as a secret, and the page holds only the Worker's URL.

A URL is not a secret — anyone can see it in the page's network traffic. So a
Worker that spends money for whoever calls it has to set its own limits:

| protection | what it does | what it doesn't do |
|---|---|---|
| **Origin allowlist** (`ALLOWED_ORIGIN`, required) | Refuses requests that don't come from the Forge page, so other websites can't borrow your Worker through their visitors' browsers. | Stop a script: `curl` can send any `Origin` header. It's a filter, not a lock. |
| **Daily dollar cap** (`DAILY_BUDGET_USD`, default $1.00) | Before each call, reserves its worst-case cost (prompt size + `max_output_tokens`, at list price); afterwards, settles to the real cost from OpenAI's `usage`. Kept in a Durable Object, so the count is exact even for simultaneous calls. When the day's cap is reached, it refuses until 00:00 UTC. | Know about spend outside this Worker. For a hard ceiling on the key itself, see *Cap the key too* below. |
| **Rate limit** (`RATE_LIMIT_PER_MINUTE`, default 8) | Per address; an IPv6 /64 counts as one address. | Survive the ledger being evicted after it sits idle — the window then restarts. The daily cap is the limit that has to hold. |
| **Access code** (`ACCESS_CODE`, optional secret) | Callers must send it. Use it when the Worker is for you and whoever you give the code to. | — |
| **Narrow relay** | The Worker builds the OpenAI request itself: the `apply_patch` tool is forced, `store: false`, output is capped, and only models in its table are allowed. Requests are size-capped and replies are trimmed to the patch and its cost. It isn't a general-purpose chat endpoint on your card. | — |

If a deployment has **neither** the ledger nor an access code, the Worker
refuses to spend at all.

## Deploy from GitHub — no local tools

1. **Cloudflare** — make a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
   Open **Workers & Pages** once, so the account gets its `workers.dev` subdomain.
2. **API token** — *My Profile → API Tokens → Create Token*, then use the
   **Edit Cloudflare Workers** template. Copy the token.
3. **Account ID** — shown on the **Workers & Pages** overview page, and in the
   dashboard URL (`dash.cloudflare.com/<account-id>/…`).
4. **OpenAI key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
   A key in its own project is easiest to revoke.
5. **Repository secrets** — in this repo, *Settings → Secrets and variables →
   Actions → New repository secret*, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `OPENAI_API_KEY`
   - `FORGE_ACCESS_CODE` — optional; any passphrase
6. **Run it** — *Actions → Deploy Forge Worker → Run workflow*. The workflow
   runs the Worker's tests, deploys with the secrets uploaded in the same
   version (so it is never live without its key), then calls the new Worker's
   `/health` to check that OpenAI accepts the key. The run summary shows the
   Worker's URL.

   The workflow appears under *Actions* once
   `.github/workflows/deploy-forge-worker.yml` is on the default branch.
7. **Use it** — on the Forge page choose **LLM → OpenAI via your Worker**, paste
   the URL (and the access code, if you set one), and press **test**. It should
   say `Worker ✓ · key ✓ · gpt-5-mini ✓`, and the log lists the Worker's limits
   and today's spend. Then type a change and press **go**.

To change the key or the code later, update the repository secret and run the
workflow again.

## Deploy from a terminal

```sh
cd workers
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ACCESS_CODE      # optional
npx wrangler deploy                      # prints the URL
```

`npm test` runs the Worker's test suite locally, in the same runtime Cloudflare
uses; nothing is sent to OpenAI.

## Settings

All of these are `[vars]` in `workers/wrangler.toml`.

| var | default | |
|---|---|---|
| `ALLOWED_ORIGIN` | `https://barnickelus.github.io` | The page's scheme and host, with no path. Separate several with commas, e.g. `,http://localhost:8000` for testing. |
| `DAILY_BUDGET_USD` | `1.00` | `0` removes the cap. That isn't recommended for a public URL. |
| `RATE_LIMIT_PER_MINUTE` | `8` | Per address. |
| `MAX_OUTPUT_TOKENS` | `8000` | Per call, reasoning included. It also sets each call's reservation against the cap. |
| `DEFAULT_MODEL` | first in the table | Used when the page asks for a model the table doesn't have. |
| `REASONING_EFFORT` | unset | Sent as `reasoning.effort`. Valid values differ by model, and an invalid one is a 400 on every call, so leave it unset unless you know the model accepts it. |
| `MODELS` | built in | JSON allowlist with prices in USD per 1M tokens: `{"gpt-5-mini":[0.25,2],"gpt-6-luna":[0.1,0.5]}`. |

The built-in table holds gpt-5-mini, gpt-5, gpt-5-nano, gpt-6-luna and
gpt-6-sol, at OpenAI's list prices as of 2026-09-27. When prices change,
override them with `MODELS` rather than editing code. The page's model
dropdown fills itself from the Worker's table when you press **test**.

## What it costs

- **Cloudflare** — the free plan covers it: 100,000 Worker requests a day, and
  Durable Objects on the SQLite backend. Each patch is one request plus two
  ledger calls.
- **OpenAI** — a patch is about 1,600 input tokens (the scene registry plus
  your sentence), plus output that includes the model's reasoning. At list
  prices that is roughly $0.001–0.006 per patch on gpt-5-mini, and a fraction
  of that on gpt-6-luna. The default $1.00 daily cap is a few hundred patches
  on gpt-5-mini.

### Cap the key too

The Worker's cap only sees the Worker's traffic. For a limit on the key
itself, use prepaid credit with auto-recharge off: the balance then bounds
every use of the key, this Worker included.

## Troubleshooting

| symptom | cause |
|---|---|
| Deploy: *"You need to register a workers.dev subdomain"* | Open **Workers & Pages** in the Cloudflare dashboard once. |
| Deploy: authentication error | The token needs the **Edit Cloudflare Workers** template's permissions, and `CLOUDFLARE_ACCOUNT_ID` must be the same account. |
| test: *origin not allowed* | `ALLOWED_ORIGIN` must match the page exactly: `https://barnickelus.github.io`, no trailing path. |
| test: *needs access code* / *access code wrong* | The Worker has `ACCESS_CODE` set. Enter the same code in the page. |
| test: *Worker key rejected* | OpenAI refused `OPENAI_API_KEY`. Update the secret and redeploy. |
| test: *no gpt-… on its key* | That key's project can't use the model. Pick another in the dropdown. |
| go: *Today's budget for this Worker is used up* | The daily cap was reached. It resets at 00:00 UTC, or you can raise `DAILY_BUDGET_USD`. |
| go: *The model used its whole 8000-token budget…* | Reasoning ate the output cap. Try a narrower request, or raise `MAX_OUTPUT_TOKENS`. |

## The other OpenAI page

`examples/tessera-forge-openai.html` came first: it wraps the Forge in an
iframe and calls OpenAI straight from the browser, with the key held in
`sessionStorage` for the tab's lifetime. The main Forge page now covers the
same ground — OpenAI with a key in the browser, or through this Worker with
no key in the browser.
