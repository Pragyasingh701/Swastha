# Phase 2 — Shared AI Failover Design

Interface + exact rotation order for the module every AI feature will call
through. **No code written yet.** Live probes were run against the real APIs to
ground the design; findings in §0.

---

## 0. Live probe findings (run during this phase — these change the design)

| Probe | Result | Consequence |
|---|---|---|
| Invalid Gemini key | **HTTP 400** `INVALID_ARGUMENT` / `API_KEY_INVALID` | Confirms Phase 1 flag: a dead key is *not* a 429. Needs its own class (§3). |
| `gemini-2.0-flash` | **HTTP 404** — *"no longer available"* | The cert parser's **only** fallback model is retired. Its retry loop is decorative today. |
| `gemini-flash-latest` | **HTTP 503** on a live call | Transient overload is real, not theoretical. |
| `gemini-flash-lite-latest` | **HTTP 200** | Flash-Lite tier confirmed available. |
| OpenRouter `/models` | 414 models, **19 free** | Live discovery works, no auth needed. |
| Hardcoded OR chain | **4 of 5 GONE** (only `openrouter/free` survives) | Confirms your no-hardcoding requirement. |

> The 4-of-5 dead chain and the retired `gemini-2.0-flash` mean **generation and
> certificate OCR are already running on far less redundancy than the code implies.**
> This is pre-existing, not a regression.

---

## 1. Module placement

`backend/` and `rag/` are separate deployables with separate `package.json` and
no shared parent package — a root `shared/` would need a build/publish step or
path hackery, adding deploy risk to a live project.

**Decision: one authored implementation, vendored to both.**

```
rag/src/config/aiClient.js        <- authored here (rag has both providers)
backend/services/aiClient.js      <- byte-identical copy, except its env import
```

Both carry a header comment naming the other as its mirror — matching the
existing convention already used between `gemini.js` and `certificateParserService.js`.
Divergence risk is real but small (the module is self-contained and provider-facing);
the alternative (a workspace refactor) touches deploy config on a live service,
which your brief rules out.

---

## 2. Public interface

One function. Callers never name a provider.

```js
await runAI({
  task:     'embedding' | 'vision-ocr' | 'generation',   // required
  input:    string,                                       // text, or prompt
  file:     { data: base64, mime: string },               // vision-ocr only
  json:     boolean,                                      // request JSON output
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',     // embedding only
  label:    string,                                       // for logs, e.g. 'summary'
})
```

### Normalised return shape — identical across providers

```js
{
  ok: true,
  text:       string,     // generation / vision-ocr
  embedding:  number[],   // embedding only
  model_used: string,     // e.g. 'gemini-flash-lite-latest'
  provider:   'gemini' | 'openrouter',
  degraded:   false,      // true = friendly fallback, not a real answer
  attempts:   number,
}
```

On total exhaustion — **resolves, never rejects**:

```js
{
  ok: false,
  text: "Swastha couldn't process this right now. Please try again shortly.",
  embedding: null, model_used: null, provider: null,
  degraded: true, attempts: N, error_code: 'ALL_PROVIDERS_EXHAUSTED',
}
```

Full error detail (every attempt, status, provider, model, redacted key index)
is logged **server-side only**. Key values are never logged — only `key#2/4`.

### ⚠ `degraded` must be checked by callers that parse

`text` is always a usable string, so a caller doing `JSON.parse(result.text)`
would throw on the friendly-sentence fallback. Structured callers
(`vision-ocr`, lab insights) **must branch on `ok`/`degraded` before parsing**.
This is called out explicitly in Phase 3 per feature.

---

## 3. Error classification — the heart of the design

Replaces today's narrow `RETRYABLE_STATUSES = {429, 503}`.

| Class | Triggers | Same key? | Next key? | Next model? | Next provider? |
|---|---|---|---|---|---|
| `RATE_LIMIT` | 429, `RESOURCE_EXHAUSTED` in body | no | **yes** | yes | yes |
| `KEY_DEAD` | 400 `API_KEY_INVALID`, 401, 403 | no | **yes** *(skip key)* | — | yes |
| `MODEL_GONE` | 404, `NOT_FOUND` | no | no *(all keys agree)* | **yes** | yes |
| `TRANSIENT` | 500, 502, 503, 504, network/DNS/timeout | **1 retry** | yes | yes | yes |
| `BAD_REQUEST` | other 400 (malformed payload, oversized file) | **no** | no | no | **no — fail fast** |

Two decisions worth your attention:

1. **`KEY_DEAD` rotates.** This resolves the Phase 1 open question. A revoked or
   typo'd key is exactly what should be survived silently. That key is marked
   dead **for the process lifetime** so later requests skip it immediately.
2. **`BAD_REQUEST` fails fast.** A 20 MB upload or malformed prompt fails on every
   key and model. Retrying 4 keys × 3 models = 12 pointless calls and a ~30 s hang
   for a user whose request can never succeed. **Failover must not mask genuine bugs.**
   This is a deliberate exception to "always fall through".

---

## 4. Model ladders per task

### `embedding`
```
gemini-embedding-001  ×  key1 → key2 → key3 → key4
```
No fallback model or provider — **by design**. Embeddings must stay dimensionally
and semantically consistent with what's already stored in `report_embeddings`
(768-dim, MRL-truncated). A different model would produce vectors that are
**silently incomparable** under cosine similarity, quietly corrupting search
relevance. OpenRouter has no equivalent anyway.

> On exhaustion this **still throws** rather than returning `degraded` — it's a
> background indexing job ([embeddingService.js:79](rag/src/services/embeddingService.js#L79)),
> and a silent skip means a report that is never findable. Retained deliberately.
> `embedding` is the one task exempt from the never-throw rule.

### `vision-ocr` (fastest good-enough first, per your brief)
```
1. gemini-flash-lite-latest   × all 4 keys      (probe: 200)
2. gemini-flash-latest        × all 4 keys      (probe: 503 — real)
3. gemini-3.1-flash-lite      × all 4 keys      (pinned generation-fallback)
   ────────────────────────────────────────
4. OpenRouter vision-capable free model, if any
5. degraded result
```
`gemini-2.0-flash` is **removed** — probe says 404. OpenRouter's free tier has
little reliable vision, so step 4 is best-effort; step 5 is the real safety net.

### `generation`
```
1. gemini-flash-lite-latest   × all 4 keys
2. gemini-flash-latest        × all 4 keys
   ────────────────────────────────────────
3. OpenRouter: live free list (§5), first 3 text models
4. openrouter/free            (hardcoded safe default — probe: still EXISTS)
5. degraded result
```
Gemini-first is a change: generation currently goes straight to OpenRouter
because *"Gemini's chat models kept 404ing"* ([openrouter.js:2-4](rag/src/config/openrouter.js#L2-L4)).
The probe shows Flash/Flash-Lite now answer **200** on your keys, and 4 keys ×
free tier is more headroom than OpenRouter's shared limit. `MODEL_GONE` handles
regression automatically.

---

## 5. OpenRouter live free-model discovery

Per your brief — no hardcoded monthly-rotating slugs.

- **Endpoint:** `GET https://openrouter.ai/api/v1/models` (no auth, 414 models)
- **Filter:** `pricing.prompt === 0 && pricing.completion === 0`
- **Then:** keep `id.endsWith(':free')` and text in `output_modalities`
  → **16 models** at probe time
- **Order:** by `context_length` desc, take **top 3**
- **Cache:** in-memory, **6 h TTL**, refreshed lazily on first use after expiry.
  Never blocks a request: a failed/slow refresh (3 s timeout) reuses the last good
  list, or the hardcoded default.
- **Hardcoded safe default (only if discovery fails):** `['openrouter/free']` —
  the one slug the probe proved still alive.

> The `:free` suffix filter matters: `google/lyria-3-pro-preview` prices at 0 but
> is an **audio** model. Filtering on price alone would route a medical summary
> to a music model.

---

## 6. Cross-cutting behaviour

- **Ordering:** keys rotate innermost, models next, provider outermost — exhaust
  all 4 keys on the cheapest model before paying latency for a bigger one.
- **Timeouts:** 20 s embedding / 45 s vision / 30 s generation per attempt, via
  `AbortController`. Prevents a hung socket stalling the whole ladder.
- **Backoff:** none between keys (a *different* key needs no wait — that's the
  point of rotation); 800 ms only before a same-key `TRANSIENT` retry.
- **Worst case:** `generation` ≈ 2 models × 4 keys + 4 OR models ≈ 12 attempts.
  With timeouts this is bounded ≈ 60 s. Mitigated by dead-key marking and by
  `BAD_REQUEST` failing fast.
- **Key order rotation:** starting key index advances per process (round-robin) so
  key #1 isn't always burned first.
- **Redaction:** logs reference `key#2/4` — never a key value, prefix, or length.

---

## 7. What Phase 3 must also fix

1. **`lastError` scope bug**, [certificateParserService.js:75](backend/services/certificateParserService.js#L75)
   — throws `ReferenceError` on *every* Gemini failure path. Must be fixed as that
   file is rewritten, or failover will surface it as a 500 on doctor signup.
2. **Backend reads only `GEMINI_API_KEY`** — must read the new 4-key `GEMINI_API_KEYS`.
3. **5 of 7 features throw raw errors** — routed through `degraded` instead.
4. **Retired `gemini-2.0-flash`** removed from the cert parser.

---

## 8. Risks / call-outs

| Risk | Mitigation |
|---|---|
| Vendored copy drifts | Header comment cross-links; identical files |
| Gemini-first changes generation output | Same prompts, `temperature: 0`; verified per feature in Phase 3 |
| `degraded` text hits a `JSON.parse` | Callers branch on `ok` first — enforced per feature |
| Discovery returns junk model | `:free` + text-modality filter + `openrouter/free` default |
| Longer worst-case latency | Per-attempt timeouts, dead-key marking, fail-fast `BAD_REQUEST` |
| 4 keys, same Google project? | Keys are from 4 separate accounts per your brief → independent quotas |

---

## 9. Open question for you

**Embeddings deliberately do not fall back to another provider or model** (§4) and
remain the one task that throws rather than degrading — changing the embedding
model would silently corrupt similarity search against already-stored vectors,
and a silently-skipped index means a permanently unfindable report.

If you'd rather report indexing degrade silently too, say so and I'll change it —
but I'd keep it loud, since a failed embed is recoverable by re-saving whereas a
silent one is invisible until a patient can't find their record.
