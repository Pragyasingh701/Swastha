// Single source of truth for the AI-processing disclosure text and version
// shown to users before first use of Ask Swastha / voice intake, and for
// the version enforced server-side by requireNoticeAck.js. Frontend copy
// (frontend/src/config/aiNotices.js) mirrors AI_NOTICE_VERSION and the
// wording — bumping a version here requires bumping it there too, or the
// frontend will show a stale notice for a version the backend no longer
// accepts as current (it will still 403 and re-prompt, just with old text
// on the way there).
//
// TODO(legal): all notice copy below is placeholder engineering text, not
// reviewed consent/legal language. Needs sign-off before this ships to real
// patients — see AI_NOTICES.ask_swastha / .voice_intake / .report_upload.

// Bump this to force every user to re-acknowledge (e.g. after a material
// wording change, or a new AI provider is added). A row in
// ai_notice_acknowledgements only satisfies requireNoticeAck for the exact
// version it was recorded against.
export const AI_NOTICE_VERSION = 1;

// TODO(legal): review wording for regulatory/consent-language requirements
// (this is engineering copy, not reviewed legal text).
export const AI_NOTICES = {
  ask_swastha: {
    short:
      'Ask Swastha uses Google Gemini to read the selected records and generate answers to your questions.',
  },
  voice_intake: {
    short:
      'Your voice and its transcript are sent to Sarvam to convert speech to text and to read questions aloud.',
  },
  report_upload: {
    short: 'Uploaded documents are read by Google Gemini Vision to auto-fill this form.',
  },
};

export default { AI_NOTICE_VERSION, AI_NOTICES };
