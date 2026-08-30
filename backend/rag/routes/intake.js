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
