# Phase 1 — AI Call Site Audit (read-only)

Every place Swastha calls Gemini or OpenRouter, what model it uses, and what
retry behaviour exists **today**. No code was changed in this phase.

---

## 0. Key configuration (after the key-handling step)

| Service | Var | Keys | Rotates? |
|---|---|---|---|
| `rag/` | `GEMINI_API_KEYS` | 4 | Yes — [gemini.js:78-95](rag/src/config/gemini.js#L78-L95) |
| `backend/` | `GEMINI_API_KEY` | 1 | **No** |
| `backend/` | `GEMINI_API_KEYS` *(added this session)* | 4 | Not yet read by any code |
| `rag/` | `OPENROUTER_API_KEY` | 1 | Model-level fallback only |

`backend/.env`'s original single key was verified (by SHA-256 fingerprint) to be
identical to key #1 of rag's list, so the new 4-key list is a strict superset —
nothing was replaced.

> **The 4 keys are now present in `backend/.env` but no backend code reads them
> yet.** `certificateParserService.js` still reads the singular `GEMINI_API_KEY`.
> Phase 3 closes that gap.

---

## 1. Gemini call sites

Both services talk to Gemini over plain REST (`fetch`), no SDK.

### 1a. `rag/src/config/gemini.js` — the only Gemini caller in `rag/`

Central chokepoint; three exported functions, two distinct models.

| Const | Value | Line |
|---|---|---|
| `EMBEDDING_MODEL` | `gemini-embedding-001` (768-dim, MRL-truncated) | [:12-13](rag/src/config/gemini.js#L12-L13) |
| `VISION_MODEL` | `gemini-flash-latest` | [:16](rag/src/config/gemini.js#L16) |

**Retry today:** `callGemini()` walks `GEMINI_API_KEYS` in order. Retries the next
key **only** on `429` / `503` (`RETRYABLE_STATUSES`, [:60](rag/src/config/gemini.js#L60)).
Any other status (400/401/403, malformed body, network error) fails immediately.

- No model-level fallback — if `gemini-flash-latest` 404s, all 4 keys fail
  identically and the call dies. **Gap.**
- Does **not** treat `RESOURCE_EXHAUSTED` as retryable unless HTTP status is 429.
- No fall-through to OpenRouter for vision/embedding.

**Consumers:**

| Feature | Entry point | Gemini fn | Model |
|---|---|---|---|
| Report indexing | [embeddingService.js:77](rag/src/services/embeddingService.js#L77) | `embedTexts` | embedding-001 |
| Ask Swastha (one-shot) | [searchService.js:35](rag/src/services/searchService.js#L35) | `embedText` | embedding-001 |
| Ask Swastha (conversational) | [reportRetriever.js:42](rag/src/langchain/reportRetriever.js#L42) | `embedText` | embedding-001 |
| Report auto-fill / OCR | [routes/extract.js:45](rag/src/routes/extract.js#L45) | `extractReportFromImage` | flash-latest |

`embedTexts` is **sequential** ([:135-142](rag/src/config/gemini.js#L135-L142)) to
respect free-tier limits — a 20-chunk report is 20 serial calls, so one report
can burn a key's quota alone.

### 1b. `backend/services/certificateParserService.js` — doctor signup

Independent implementation; shares no code with `rag/`.

- **Models:** `['gemini-flash-latest', 'gemini-2.0-flash']` ([:74](backend/services/certificateParserService.js#L74))
- **Retry today:** nested loop — 2 models × 2 attempts = up to 4 tries, with a
  fixed 1 s sleep on 429 ([:98-103](backend/services/certificateParserService.js#L98-L103)).
- **Single key only** — reads `process.env.GEMINI_API_KEY` ([:57](backend/services/certificateParserService.js#L57)).
  When that key is quota-exhausted, all 4 attempts fail against the same key.
- Trigger: doctor registration, [routes/auth.js:750](backend/routes/auth.js#L750).

> ### ⚠ Pre-existing bug found (unrelated to failover, present before this session)
>
> `lastError` is declared with `let` **inside** `if (geminiKey) {` at
> [:75](backend/services/certificateParserService.js#L75), but read **outside**
> that block at [:122](backend/services/certificateParserService.js#L122) and
> [:126](backend/services/certificateParserService.js#L126).
>
> I confirmed by running the isolated block structure under Node: it throws
> `ReferenceError: lastError is not defined` — **unconditionally**, whether or not
> a key is set. The file passes `node --check` because this is a runtime TDZ/scope
> error, not a syntax error.
>
> Reachability: the only success exit is `return evaluateParsedCertificate(...)`
> at [:109](backend/services/certificateParserService.js#L109). So **any** Gemini
> failure path (quota exhausted, bad file, network error) reaches line 122 and
> throws instead of returning `{ error }`. In [auth.js:750](backend/routes/auth.js#L750)
> the call is `await`ed without a local try/catch, so this surfaces as a **500 on
> doctor registration** rather than the intended validation message.
>
> It's invisible while the key is healthy, which is likely why it hasn't been hit.
> **It is exactly the path failover work will start exercising**, so it must be
> fixed in Phase 3 — I have not touched it yet.

---

## 2. OpenRouter call sites

### 2a. `rag/src/config/openrouter.js` — the only OpenRouter caller

- **Endpoint:** `https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible)
- **`temperature: 0`** — deterministic/factual ([:47](rag/src/config/openrouter.js#L47))
- **Model chain**, hardcoded ([:16-22](rag/src/config/openrouter.js#L16-L22)):
  1. `openrouter/free`
  2. `google/gemma-2-9b-it:free`
  3. `meta-llama/llama-3-8b-instruct:free`
  4. `qwen/qwen-2-7b-instruct:free`
  5. `mistralai/mistral-7b-instruct:free`

**Retry today:** `generateGroundedAnswer()` walks the chain, advancing on `429`/`503`
only. Same limitation as Gemini — a `404` (model retired) is fatal, and OpenRouter's
free lineup rotates monthly. This is precisely the hardcoding your Phase 2 brief
calls out.

**Consumers — all four generation features share this one chain and one key:**

| Feature | Call site | Path |
|---|---|---|
| Ask Swastha (one-shot) | [searchService.js:98](rag/src/services/searchService.js#L98) | direct |
| AI report summaries | [summaryService.js:45](rag/src/services/summaryService.js#L45) | direct |
| Lab insights | [labInsightsService.js:94](rag/src/services/labInsightsService.js#L94) | direct |
| Ask Swastha (conversational) | [conversationalSearchService.js:53, :143](rag/src/services/conversationalSearchService.js#L143) | via LangChain |

### 2b. `rag/src/langchain/openRouterChatModel.js`

Thin `SimpleChatModel` shim whose `_call` delegates to `generateGroundedAnswer`
([:48](rag/src/langchain/openRouterChatModel.js#L48)) — deliberately adds no retry
logic of its own. Conversational search invokes it **twice per turn**: once to
rewrite the follow-up into a standalone question ([:53](rag/src/services/conversationalSearchService.js#L53)),
once for the grounded answer ([:143](rag/src/services/conversationalSearchService.js#L143)).
So one chat turn = 2 generation calls + 1 embedding call.

---

## 3. Error surfacing today — does a failure reach the user?

| Feature | Current behaviour on total failure | User sees |
|---|---|---|
| Report auto-fill / OCR | Caught at [extract.js:50-55](rag/src/routes/extract.js#L50-L55) | Friendly msg — **already correct** |
| Report indexing | `throw` ([embeddingService.js:79-83](rag/src/services/embeddingService.js#L79-L83)) | Background job; deliberate, keep |
| Ask Swastha (one-shot) | `throw` → generic 500 | **Raw failure** |
| Ask Swastha (conversational) | `throw` ([:146](rag/src/services/conversationalSearchService.js#L146)) | **Raw failure** |
| Summaries | Unwrapped `throw` | **Raw failure** |
| Lab insights | Unwrapped `throw` | **Raw failure** |
| Certificate verification | **`ReferenceError` → 500** (see bug above) | **Raw failure** |

Only 1 of 7 features degrades gracefully today. `extract.js` is the pattern to
generalise in Phase 2.

---

## 4. Summary of gaps Phase 2 must close

1. **Backend can't rotate keys** — 4 keys now in `backend/.env`, code reads 1.
2. **No cross-provider fallback** — Gemini failure never tries OpenRouter.
3. **No model-level fallback for Gemini in `rag/`** — single `VISION_MODEL`, a 404 is fatal.
4. **Hardcoded OpenRouter slugs** — no live `/models` discovery.
5. **Narrow retry predicate** — HTTP 429/503 only; ignores `RESOURCE_EXHAUSTED` in
   body, 500, 502, 504, and network-level errors.
6. **Inconsistent response shapes** — Gemini `candidates[0].content.parts[]` vs
   OpenRouter `choices[0].message.content`; no normalisation layer.
7. **Errors reach users** in 5 of 7 features.
8. **Pre-existing `lastError` scope bug** must be fixed before that path is exercised.

---

## Note on Phase 4 (flagging early)

Your Phase 4 asks me to blank a key to force an auth error and confirm rotation.
Worth knowing now: an invalid Gemini key returns **HTTP 400** (`API_KEY_INVALID`),
not 429 — and under both the current predicate and a literal reading of your
Phase 2 spec ("rotate on 429/503/RESOURCE_EXHAUSTED"), a 400 is **not** retryable,
so that test would show *no* rotation and look like a failure.

That's a real design question, not a test-harness detail: a dead/revoked key is
exactly the case you want survived silently. I'd recommend treating auth-shaped
errors (400/401/403) as **key-fatal but rotation-eligible** — skip that key,
try the next — while keeping them non-retryable *on the same key*. I'll specify
this precisely in Phase 2 rather than decide it silently here.
