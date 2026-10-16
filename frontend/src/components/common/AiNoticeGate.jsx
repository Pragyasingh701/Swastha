import React, { useEffect, useState } from "react";
import { AI_NOTICE_REQUIRED_EVENT } from "../../api/client";
import { acknowledgeNotice } from "../../api/notices";
import { AiNoticeAckModal } from "./AiNotice";

export const AI_NOTICE_ACCEPTED_EVENT = "swastha:ai-notice-accepted";

// One app-wide prompt for "how Swastha uses AI". Any AI-backed request that
// the server refuses because the user hasn't accepted the notice yet (scanning
// a report, summaries, lab insights, indexing a saved report, ...) announces
// it via AI_NOTICE_REQUIRED_EVENT (api/client.js); this shows the blocking
// acknowledgement and records it. After accepting, the user simply retries the
// action they were doing.
export default function AiNoticeGate() {
  const [feature, setFeature] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    function onRequired(event) {
      setFeature(event?.detail?.feature || "ask_swastha");
    }
    window.addEventListener(AI_NOTICE_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(AI_NOTICE_REQUIRED_EVENT, onRequired);
  }, []);

  if (!feature) return null;

  async function handleAccept() {
    setAccepting(true);
    try {
      await acknowledgeNotice(feature);
      setFeature(null);
      window.dispatchEvent(new CustomEvent(AI_NOTICE_ACCEPTED_EVENT, { detail: { feature } }));
    } catch {
      // Leave the modal up so the user can try again; the server stays the
      // real gate either way.
    } finally {
      setAccepting(false);
    }
  }

  return <AiNoticeAckModal feature={feature} onAccept={handleAccept} accepting={accepting} />;
}
