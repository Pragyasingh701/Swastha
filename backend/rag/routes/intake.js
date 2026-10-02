import express from 'express';
import multer from 'multer';
import { startIntakeSession, advanceIntakeSession, finalizeIntakeSession } from '../services/intakeService.js';
import { supabase } from '../config/supabase.js';
import { synthesizeSpeech, buildOptionsSpeech, normalizeLanguage, DEFAULT_LANGUAGE } from '../services/ttsService.js';
import { transcribeSpeech, isSupportedAudioMime } from '../services/asrService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// In-memory storage — a recorded answer is only needed transiently to send
// to Sarvam, never persisted. Same shape as routes/extract.js's uploader,
// which uses memory storage for the same transient reason.
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, matches routes/extract.js
  fileFilter: (req, file, cb) => {
    if (isSupportedAudioMime(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported audio format.'));
  },
});

/**
 * Voice layer (Phase 7a). Speaks a question and returns the fields to merge
 * into a turn response. Kept here at the route layer rather than inside
 * intakeService.js on purpose: the dialogue engine's job is text in / JSON
 * out, and voice is explicitly a layer wrapped around that contract, not a
 * branch inside it (Voice Layer PRD §4 — the engine's JSON contract does
 * not change).
 *
 * Additive only: on any failure the audio fields are simply absent and the
 * response is byte-identical to the pre-voice contract, so the text/tap
 * flow keeps working untouched (PRD §3 — a TTS hiccup never blocks intake).
 */
async function withAudio(payload, questionText, language) {
  const speech = await synthesizeSpeech(questionText, language);

  // Options are spoken as a SEPARATE clip rather than appended to the
  // question's own text. The question text repeats across sessions (the
  // opening question is identical every time — a permanent cache hit),
  // while its option list varies far more; combining them would make the
  // cached unit as volatile as its most volatile half and throw away most
  // of ttsService's cache hits, costing real Sarvam credit per session.
  // Keeping them separate also lets the patient answer as soon as they've
  // heard the question, without sitting through the option list.
  const optionsText = buildOptionsSpeech(payload.quick_reply_options?.options, language);
  const optionsSpeech = optionsText ? await synthesizeSpeech(optionsText, language) : null;

  if (!speech.ok) return payload;

  return {
    ...payload,
    audio_base64: speech.audio_base64,
    audio_mime_type: speech.mime_type,
    audio_provider: speech.provider,
    // True when Sarvam failed and this came from the edge-tts fallback —
    // lets the frontend/demo tell a degraded voice from the intended one.
    audio_degraded: !!speech.degraded,
    language,
    // Absent for free-text turns with no options, and absent if the
    // options clip failed while the question's own audio succeeded — the
    // question still plays either way.
    ...(optionsSpeech?.ok
      ? {
          options_audio_base64: optionsSpeech.audio_base64,
          options_audio_mime_type: optionsSpeech.mime_type,
        }
      : {}),
  };
}

/**
 * GET /api/intake/:sessionId
 * PATIENT-facing. Issue #4 fix (audit report): there was previously no way
 * for the frontend to rehydrate an in-progress session after a page
 * refresh/tab-close/reload — IntakeChat.jsx held the whole conversation in
 * local React state only, so any reload called POST /start again, silently
 * abandoning the previous session (never finalized, invisible to the
 * frontend) and starting a brand-new one. That was a direct contributor to
 * the stuck/abandoned in_progress rows found live in the audit (Issue #10).
 *
 * Returns the full turns[] transcript plus enough state (section,
 * quick_reply_options for the LAST assistant turn, red_flag) for the chat
 * UI to redraw exactly where the patient left off, in the same shape /start
 * and /turn already return for the latest turn, plus the full message list.
 * Ownership is the same check every other route here uses — 404, not 403,
 * on a session that exists but isn't the caller's, so a client can't
 * distinguish "not yours" from "doesn't exist" (routes/doctorPatients.js's
 * intake-queue detail route uses the same 404-not-403 convention).
 *
 * A session that has already reached status 'completed' is intentionally
 * excluded (404) — resume is for continuing an unfinished conversation;
 * finalized sessions have nothing left to resume into, and the frontend
 * clears its stored session_id once /finalize succeeds (see IntakeChat.jsx)
 * so this should not normally even be requested for one.
 */
router.get('/:sessionId', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { sessionId } = req.params;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('intake_sessions')
      .select('id, patient_id, status, structured_history, turns, language')
      .eq('id', sessionId)
      .single();

    const resumableStatuses = ['in_progress', 'abandoned'];
    if (sessionError || !session || session.patient_id !== patientId || !resumableStatuses.includes(session.status)) {
      // Same 404-not-403 posture as every other ownership check in this
      // file — a client can't tell "not yours" from "doesn't exist" from
      // "already finished", which is also the correct signal for the
      // frontend to fall back to starting a fresh session either way.
      // 'completed' is deliberately excluded (nothing left to resume into);
      // 'abandoned' IS resumable — see the un-abandon below (Issue #10).
      return res.status(404).json({ error: 'No resumable intake session found.' });
    }

    if (session.status === 'abandoned') {
      // The patient came back — un-abandon it rather than leaving them
      // resumed into a row that still reads as abandoned everywhere else
      // (the doctor's queue, history). abandoned_at is cleared too, so a
      // session that gets abandoned and resumed more than once doesn't
      // carry a stale timestamp from an earlier abandonment.
      const { error: unabandonError } = await supabase
        .from('intake_sessions')
        .update({ status: 'in_progress', abandoned_at: null })
        .eq('id', sessionId);
      if (unabandonError) {
        console.error(`[GET /api/intake/${sessionId}] failed to un-abandon session:`, unabandonError);
        // Not fatal to the resume itself — the patient can still continue;
        // the row just stays marked abandoned until the next sweep skips it
        // again (still status-filtered to in_progress) or a future request
        // retries this update.
      }
    }

    const turns = Array.isArray(session.turns) ? session.turns : [];
    const lastAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant');

    return res.status(200).json({
      session_id: session.id,
      section: session.structured_history?.section || 'chief_complaint',
      // Same shape sendIntakeTurn's response uses for options, built from
      // the last assistant turn's own recorded options — not re-derived
      // from anything else, so a resumed session shows exactly the chips
      // the patient last saw.
      quick_reply_options: { options: lastAssistantTurn?.options || [], allow_multiple: false },
      red_flag: !!session.structured_history?.red_flag,
      red_flag_reason: session.structured_history?.red_flag_reason || null,
      language: normalizeLanguage(session.language || DEFAULT_LANGUAGE),
      // Full transcript so the frontend can redraw every prior bubble, not
      // just the latest question — { role: 'patient'|'assistant', text }.
      messages: turns.map((t) => ({ role: t.role, text: t.text })),
    });
  } catch (err) {
    console.error(`[GET /api/intake/${sessionId}] failed for patient ${patientId}:`, err);
    return res.status(500).json({ error: 'Could not load intake session.' });
  }
});

/**
 * POST /api/intake/start
 * PATIENT-facing. Creates a new intake_sessions row for the caller and runs
 * the first dialogue-engine turn. patient_id comes from the JWT
 * (req.user.userId), never from the request body — a client can't start a
 * session on someone else's behalf.
 */
router.post('/start', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  // Language is chosen once, here, and stored on the session row (Voice
  // Layer PRD §6). Unrecognised or absent values fall back to the default
  // rather than 400-ing — a bad language must never block an intake.
  const language = normalizeLanguage(req.body?.language || DEFAULT_LANGUAGE);

  try {
    const { session, turn } = await startIntakeSession(patientId, { language });
    return res.status(200).json(await withAudio({
      session_id: session.id,
      next_question: turn.next_question,
      quick_reply_options: turn.quick_reply_options,
      section: turn.section,
      red_flag: turn.red_flag,
    }, turn.next_question, language));
  } catch (err) {
    console.error(`[POST /api/intake/start] failed for patient ${patientId}:`, err);
    return res.status(500).json({ error: 'Could not start intake session.' });
  }
});

/**
 * POST /api/intake/turn
 * Body: { session_id, message }
 * Ownership check happens here (not in the service) — same boundary as
 * intakeService.js not owning the auth/ownership decision, matching
 * routes/doctorPatients.js verifying link ownership at the route layer.
 */
router.post('/turn', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { session_id: sessionId, message } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message (non-empty string) is required' });
  }

  try {
    const { session, turn } = await advanceIntakeSession({ sessionId, patientMessage: message });

    // Ownership check after the fetch (advanceIntakeSession already loaded
    // the row) — a patient cannot advance someone else's session by
    // guessing a session_id.
    if (session.patient_id !== patientId) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    // Read back from the session row, not the request — the language is
    // fixed at /start and a client cannot switch voices mid-session.
    const language = normalizeLanguage(session.language || DEFAULT_LANGUAGE);

    return res.status(200).json(await withAudio({
      session_id: session.id,
      next_question: turn.next_question,
      quick_reply_options: turn.quick_reply_options,
      updated_fields: turn.structured_history,
      section: turn.section,
      section_complete: turn.section_complete,
      red_flag: turn.red_flag,
      red_flag_reason: turn.red_flag_reason,
      red_flag_is_new: turn.red_flag_is_new,
    }, turn.next_question, language));
  } catch (err) {
    console.error(`[POST /api/intake/turn] failed for patient ${patientId}, session ${sessionId}:`, err);
    return res.status(500).json({ error: 'Could not process intake turn.' });
  }
});

/**
 * POST /api/intake/finalize
 * Body: { session_id }
 */
router.post('/finalize', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { session_id: sessionId } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const session = await finalizeIntakeSession(sessionId);

    if (session.patient_id !== patientId) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    return res.status(200).json({
      session_id: session.id,
      status: session.status,
      structured_history: session.structured_history,
      completed_at: session.completed_at,
    });
  } catch (err) {
    console.error(`[POST /api/intake/finalize] failed for patient ${patientId}, session ${sessionId}:`, err);
    return res.status(500).json({ error: 'Could not finalize intake session.' });
  }
});

/**
 * POST /api/intake/transcribe
 * multipart/form-data: file (recorded audio) + session_id.
 *
 * Voice layer (Phase 7b). Transcribes one recorded answer and returns the
 * text — it does NOT advance the dialogue. The transcript goes back to the
 * patient's answer field for them to review and edit, and only then does
 * the (possibly corrected) text go to POST /turn exactly as a typed answer
 * would (PRD §6, §8.1). ASR therefore has no path of its own into the
 * dialogue engine, and /turn's contract is untouched.
 *
 * Returns { transcript, language_code } — deliberately no confidence
 * field: Sarvam's STT response does not include one (verified against the
 * live API). The editable field is the confirmation step instead, applied
 * to every transcript rather than only low-scoring ones.
 */
router.post('/transcribe', requireAuth, (req, res) => {
  const patientId = req.user.userId;

  uploadAudio.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Audio upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio uploaded.' });
    }

    const sessionId = req.body?.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'session_id is required' });
    }

    try {
      // Language comes from the session row, never the request body — it
      // was fixed once at /start (PRD §6) and a client must not be able to
      // transcribe against a different language than the session's own.
      // Doubles as the ownership check, same boundary as /turn.
      const { data: session, error: sessionError } = await supabase
        .from('intake_sessions')
        .select('id, patient_id, language')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found.' });
      }
      if (session.patient_id !== patientId) {
        return res.status(403).json({ error: 'This session does not belong to you.' });
      }

      const language = normalizeLanguage(session.language || DEFAULT_LANGUAGE);
      const result = await transcribeSpeech(req.file.buffer, req.file.mimetype, language);

      if (!result.ok) {
        // 422 rather than 500 for "heard nothing" — the request was fine,
        // there was just no speech in it. The frontend distinguishes this
        // to say "didn't catch that" instead of a generic error, and in
        // every case leaves whatever the patient already typed alone.
        const status = result.error_code === 'NO_SPEECH_DETECTED' ? 422 : 502;
        return res.status(status).json({ error: result.error_code });
      }

      return res.status(200).json({
        transcript: result.transcript,
        language_code: result.language_code,
      });
    } catch (error) {
      console.error(`[POST /api/intake/transcribe] failed for patient ${patientId}, session ${sessionId}:`, error);
      return res.status(500).json({ error: 'Could not transcribe audio.' });
    }
  });
});

/**
 * POST /api/intake/replay-audio
 * Body: { session_id, text }
 *
 * Voice layer. Re-speaks a question the patient has already been asked, so
 * any earlier question in the transcript can be replayed — not just the
 * latest one. Strictly read-only: it does NOT touch the dialogue engine,
 * the session's structured_history, its turns, or its section. Nothing
 * about the conversation state changes when this is used.
 *
 * `text` is verified to actually be one of this session's own assistant
 * turns before being synthesized — otherwise this would be an open
 * text-to-speech oracle billable to our Sarvam quota by any authenticated
 * caller. Language comes from the session row, never the request, so a
 * replay always sounds like the rest of the session.
 *
 * ttsService's in-memory cache means replaying a question the patient has
 * already heard is a cache hit, costing nothing.
 */
router.post('/replay-audio', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { session_id: sessionId, text } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('intake_sessions')
      .select('id, patient_id, language, turns')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    if (session.patient_id !== patientId) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    const wanted = text.trim();
    const isOwnQuestion = (Array.isArray(session.turns) ? session.turns : []).some(
      (t) => t && t.role === 'assistant' && typeof t.text === 'string' && t.text.trim() === wanted
    );
    if (!isOwnQuestion) {
      return res.status(400).json({ error: 'That text is not a question from this session.' });
    }

    const language = normalizeLanguage(session.language || DEFAULT_LANGUAGE);
    const speech = await synthesizeSpeech(wanted, language);

    if (!speech.ok) {
      return res.status(502).json({ error: speech.error_code });
    }

    return res.status(200).json({
      audio_base64: speech.audio_base64,
      audio_mime_type: speech.mime_type,
      audio_provider: speech.provider,
      language,
    });
  } catch (err) {
    console.error(`[POST /api/intake/replay-audio] failed for patient ${patientId}, session ${sessionId}:`, err);
    return res.status(500).json({ error: 'Could not generate audio.' });
  }
});

export default router;
