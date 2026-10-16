// Frontend copy of backend/rag/config/aiNotices.js — must be kept in sync:
// AI_NOTICE_VERSION here is DISPLAY ONLY (it decides whether to re-show the
// modal locally); the backend's own copy of this constant is what's
// actually enforced server-side (requireNoticeAck.js), so a mismatch just
// means a stale/wrong prompt on the way to a 403 that re-syncs it, not a
// security gap.
//
// TODO(legal): all notice copy below is placeholder engineering text, not
// reviewed consent/legal language. Needs sign-off before this ships to real
// patients.

export const AI_NOTICE_VERSION = 2;

export const AI_NOTICES = {
  // The one consent that covers every AI feature that reads health records or
  // documents (the key stays 'ask_swastha' — it is what the backend stores).
  ask_swastha: {
    title: 'How Swastha uses AI with your records',
    body:
      'Swastha uses AI to read health records and uploaded documents: to answer questions in Ask Swastha, to fill in forms from scanned reports, to write summaries and lab insights, and to make records searchable. Records, documents and questions are sent to AI services for this purpose.',
  },
  voice_intake: {
    title: 'How voice intake uses AI',
    body:
      'Your voice recording and its transcript are sent to an AI service to convert your speech to text, and to read questions aloud to you.',
  },
  report_upload: {
    title: 'How report scanning uses AI',
    body: 'Uploaded documents are read by AI to automatically fill in this form.',
  },
};

export default { AI_NOTICE_VERSION, AI_NOTICES };
