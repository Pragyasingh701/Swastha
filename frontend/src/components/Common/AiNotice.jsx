import React, { useState } from "react";
import { Info, Sparkles, X } from "lucide-react";
import { AI_NOTICES } from "../../config/aiNotices";

/**
 * Small persistent inline notice + "i" info link, for a feature that
 * discloses its AI processing up front but doesn't require a blocking
 * acknowledgement (report upload/OCR — see UploadReports.jsx). Also used
 * as the persistent header link for features that DO also have a one-time
 * ack gate (Ask Swastha), since the ack modal only ever appears once but
 * the disclosure should stay reachable for the life of the feature.
 *
 * `feature` must be a key of AI_NOTICES (config/aiNotices.js).
 */
export function AiNoticeBanner({ feature, className = "" }) {
  const notice = AI_NOTICES[feature];
  if (!notice) return null;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/80 px-3.5 py-3 text-xs text-blue-700 ${className}`}
    >
      <Info size={15} className="shrink-0 mt-0.5 text-blue-500" />
      <span>{notice.body}</span>
    </div>
  );
}

/**
 * Small "i" icon + label that opens the same notice as a popover-style
 * inline panel — meant for a header, so the disclosure stays reachable for
 * the life of the feature (task requirement: "a persistent info link in
 * its header"), not just shown once and forgotten.
 */
export function AiNoticeInfoLink({ feature }) {
  const [open, setOpen] = useState(false);
  const notice = AI_NOTICES[feature];
  if (!notice) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
        aria-expanded={open}
      >
        <Info size={14} />
        How this uses AI
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{notice.body}</p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Blocking one-time acknowledgement modal. Rendered by the feature page
 * itself (DoctorAskSwastha.jsx, IntakeChat.jsx) whenever it doesn't yet know
 * the caller has acknowledged this version — see each page's own
 * GET /api/notices/ack/:feature check on mount. Accepting calls
 * POST /api/notices/ack; the feature's own endpoint (searchChat.js's POST /,
 * intake.js's POST /start) is the real, server-side enforcement — this
 * modal only exists so the caller doesn't hit a confusing 403 on first use.
 */
export function AiNoticeAckModal({ feature, onAccept, accepting }) {
  const notice = AI_NOTICES[feature];
  if (!notice) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
          <Sparkles size={20} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{notice.title}</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">{notice.body}</p>
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="w-full h-11 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {accepting ? "Continuing..." : "I understand, continue"}
        </button>
      </div>
    </div>
  );
}

export default { AiNoticeBanner, AiNoticeInfoLink, AiNoticeAckModal };
