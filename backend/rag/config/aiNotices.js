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
export const AI_NOTICE_VERSION = 2;

// TODO(legal): review wording for regulatory/consent-language requirements
// (this is engineering copy, not reviewed legal text).
export const AI_NOTICES = {
  // The one consent that covers every AI feature that reads health records or
  // documents (the feature key stays 'ask_swastha': it is what the
  // ai_notice_acknowledgements table and requireNoticeAck already use).
  ask_swastha: {
    short:
      'Swastha uses AI to read health records and uploaded documents: to answer questions in Ask Swastha, to fill in forms from scanned reports, to write summaries and lab insights, and to make records searchable. Records, documents and questions are sent to AI services for this.',
  },
  voice_intake: {
    short:
      'Your answers, typed or spoken, are sent to AI services to understand and organise them. If you speak, your voice and its transcript are sent to a speech service to convert it to text, and questions are read aloud by one.',
  },
  report_upload: {
    short: 'Uploaded documents are read by AI to auto-fill this form.',
  },
};

export default { AI_NOTICE_VERSION, AI_NOTICES };
