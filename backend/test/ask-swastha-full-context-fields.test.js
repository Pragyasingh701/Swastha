// Full-context mode reads `reports` directly via the shared
// loadPatientReportsForPrompt loader (see searchService.js), NOT
// report_embeddings — this test covers the 3 things that guarantee: a
// report with zero embedding rows (never indexed, or indexing failed)
// still appears; hospital/doctor/diagnosis/medicines actually reach the
// prompt (not just title/date/category/notes, which the old chunk-based
// version already covered via chunk_text); and every field is escaped, not
// just notes.
//
// Builds its own mocks inline (rather than the shared
// helpers/fullContextMocks.js installFullContextMocks) because this test
// needs to CAPTURE the exact prompt runAI was called with — mock.module
// refuses to re-mock an already-mocked specifier, so the runAI mock has to
// be built with the capture hook from the start, in this one place.
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so
// each module-mocking scenario needs its own process/module registry).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('a report with zero embedding rows still appears in full-context mode, and hospital/doctor/diagnosis/medicines all reach the prompt, fully escaped', async () => {
  const patientId = `usr_neverindexed_${Date.now()}`;

  // This report has NEVER been chunked/embedded — there is deliberately no
  // report_embeddings mock anywhere in this test, since
  // loadPatientReportsForPrompt never queries that table at all. The old
  // chunk-based full-context mode could never have surfaced a report like
  // this; the fix under test means it now does, because it reads `reports`
  // directly.
  const neverIndexedReport = {
    id: 'never-indexed-1',
    title: 'Consultation <script>alert(1)</script>',
    report_date: '2026-03-01',
    category: 'Consultation <b>bold</b>',
    hospital: 'City <Hospital>',
    doctor: 'Dr. <Smith>',
    diagnosis: 'Hypertension <stage 2>',
    medicines: 'Amlodipine <5mg> once daily',
    notes: 'Follow up in <4> weeks',
    file_url: null,
  };

  const fakeSupabase = {
    rpc: async () => ({ data: [], error: null }),
    from: () => ({
      select: () => ({
        eq: (col, val) => {
          const chain = {
            order: () => chain,
            limit: () => chain,
            then: (resolve) =>
              resolve({
                data: val === patientId ? [neverIndexedReport] : [],
                error: null,
              }),
          };
          return chain;
        },
      }),
    }),
  };
  mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
    namedExports: { supabase: fakeSupabase },
  });

  // Captures the exact prompt string full-context mode builds, so this
  // test can inspect the actual prompt text (field presence + escaping),
  // not just the final parsed answer.
  let capturedPrompt = null;
  mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
    namedExports: {
      embedText: async () => new Array(768).fill(0),
      embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
      runAI: async ({ task, input }) => {
        if (task === 'generation') {
          capturedPrompt = input;
          return {
            ok: true,
            text: JSON.stringify({ headline: 'Mock answer.', keyFacts: [], caveat: '' }),
            model_used: 'mock',
            provider: 'mock',
            degraded: false,
          };
        }
        throw new Error(`unexpected runAI task in this test: ${task}`);
      },
      FRIENDLY_FALLBACK: "Swastha couldn't process this right now. Please try again shortly.",
      EMBEDDING_MODEL: 'gemini-embedding-001',
      EMBEDDING_DIMENSIONS: 768,
    },
  });

  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');
  const sessionId = `sess-neverindexed-${Date.now()}`;

  const result = await conversationalSearch({
    query: 'What is this patient being treated for?',
    userId: patientId,
    sessionId,
  });

  // The never-indexed report is included as the (only) source — proving it
  // wasn't silently dropped for lacking embeddings.
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].report_id, 'never-indexed-1');
  assert.equal(result.degraded, undefined);

  assert.ok(capturedPrompt, 'the prompt must have been captured');

  // hospital/doctor/diagnosis/medicines must actually be IN the prompt —
  // this is the field-completeness gap the fix closes (the old chunk-based
  // version relied on these having been folded into notes at ingestion
  // time, which a never-indexed report never had happen).
  assert.match(capturedPrompt, /Hospital: /, 'Hospital field must appear in the prompt');
  assert.match(capturedPrompt, /Doctor: /, 'Doctor field must appear in the prompt');
  assert.match(capturedPrompt, /Diagnosis: /, 'Diagnosis field must appear in the prompt');
  assert.match(capturedPrompt, /Medicines: /, 'Medicines field must appear in the prompt');

  // EVERY field must be escaped, not just notes — check each field's raw
  // angle-bracket content never appears unescaped, and its escaped form does.
  const rawFieldValues = [
    'Consultation <script>alert(1)</script>', // title
    'Consultation <b>bold</b>', // category
    'City <Hospital>', // hospital
    'Dr. <Smith>', // doctor
    'Hypertension <stage 2>', // diagnosis
    'Amlodipine <5mg> once daily', // medicines
    'Follow up in <4> weeks', // notes
  ];
  for (const raw of rawFieldValues) {
    assert.ok(!capturedPrompt.includes(raw), `raw unescaped field value must not appear in the prompt: ${raw}`);
  }
  assert.match(capturedPrompt, /Consultation &lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'title must be escaped');
  assert.match(capturedPrompt, /Consultation &lt;b&gt;bold&lt;\/b&gt;/, 'category must be escaped');
  assert.match(capturedPrompt, /City &lt;Hospital&gt;/, 'hospital must be escaped');
  assert.match(capturedPrompt, /Dr\. &lt;Smith&gt;/, 'doctor must be escaped');
  assert.match(capturedPrompt, /Hypertension &lt;stage 2&gt;/, 'diagnosis must be escaped');
  assert.match(capturedPrompt, /Amlodipine &lt;5mg&gt; once daily/, 'medicines must be escaped');
  assert.match(capturedPrompt, /Follow up in &lt;4&gt; weeks/, 'notes must be escaped');

  mock.reset();
  process.exit(0);
});
