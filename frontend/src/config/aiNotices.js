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

export const AI_NOTICE_VERSION = 1;

export const AI_NOTICES = {
  ask_swastha: {
    title: 'How Ask Swastha uses AI',
    body:
      'Ask Swastha uses Google Gemini to read the selected patient’s records and questions, and to generate answers. Records and questions are sent to Gemini for this purpose.',
  },
  voice_intake: {
    title: 'How voice intake uses AI',
    body:
      'Your voice recording and its transcript are sent to Sarvam to convert your speech to text, and to read questions aloud to you.',
  },
  report_upload: {
    title: 'How report scanning uses AI',
    body: 'Uploaded documents are read by Google Gemini Vision to automatically fill in this form.',
  },
};

export default { AI_NOTICE_VERSION, AI_NOTICES };
