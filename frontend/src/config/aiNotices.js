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
      'Your answers, typed or spoken, are sent to AI services to understand and organise them. If you speak, your voice recording and its transcript are sent to a speech service to convert it to text, and questions are read aloud to you by one.',
    // Shown instead of the English text in a Hindi intake session. Same meaning; needs the
    // same legal sign-off as the English copy (see the TODO above).
    hi: {
      title: 'वॉइस इंटेक में AI का उपयोग कैसे होता है',
      body:
        'आपके उत्तर, चाहे लिखे हों या बोले गए, उन्हें समझने और व्यवस्थित करने के लिए AI सेवाओं को भेजे जाते हैं। अगर आप बोलते हैं, तो आपकी आवाज़ की रिकॉर्डिंग और उसका लिखित रूप आवाज़ को टेक्स्ट में बदलने के लिए एक स्पीच सेवा को भेजा जाता है, और सवाल भी ऐसी ही एक सेवा द्वारा आपको पढ़कर सुनाए जाते हैं।',
    },
  },
  report_upload: {
    title: 'How report scanning uses AI',
    body: 'Uploaded documents are read by AI to automatically fill in this form.',
  },
};

export default { AI_NOTICE_VERSION, AI_NOTICES };
