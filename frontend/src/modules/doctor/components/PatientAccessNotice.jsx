import React, { useEffect, useState } from "react";
import { Lock, Clock, RefreshCw, ShieldOff, Loader2 } from "lucide-react";
import { requestAccessAgain } from "../../../api/doctorPatients";
import { formatWaitUntil } from "../../../utils/dateFormat";

// Shown in place of a patient's data when the doctor has no access to that
// patient right now: access ended (24 hours, or the patient ended it), a request
// is still waiting, or the patient declined. It says so plainly and offers the
// next step, instead of an empty screen of zeros and "no records".
//
// `patient` is a card from getDoctorPatients with its linkStatus ('expired',
// 'pending' or 'declined'; the server's retry rules arrive as requestExpired /
// requestExpiresAt / canRequestAgain / retryAt / declineCount). `onRequested`
// gets the fields to merge into that card once a new request has been sent, so
// the page can update without waiting for the next refresh.
export default function PatientAccessNotice({ patient, onRequested, onRefresh }) {
  const name = patient.patient_name || patient.name || "this patient";
  const patientUserId = patient.patientUserId || patient.patientId || patient.id;
  const status = patient.linkStatus || "expired";

  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const countdownTo = status === "declined" ? patient.retryAt : status === "pending" ? patient.requestExpiresAt : null;
  useEffect(() => {
    if (!countdownTo) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, [countdownTo]);

  const waitLeft = countdownTo ? formatWaitUntil(countdownTo, now) : "";
  const pendingWaiting = status === "pending" && patient.requestExpired !== true && Boolean(waitLeft || !patient.requestExpiresAt);
  const pendingLapsed = status === "pending" && !pendingWaiting;
  const declinedCooldown = status === "declined" && Boolean(waitLeft);
  const declinedOnce = status === "declined" && !declinedCooldown && Number(patient.declineCount) % 2 === 1;

  let title;
  let body;
  if (status === "expired") {
    title = `You no longer have access to ${name}`;
    body = "Access lasts 24 hours, or the patient may have ended it. Request access again to continue.";
  } else if (pendingWaiting) {
    title = "Waiting for the patient to respond";
    body = `Your request to ${name} is pending. You'll get access as soon as they accept.${
      waitLeft ? ` If they don't respond, you can send a new request in ${waitLeft}.` : ""
    }`;
  } else if (pendingLapsed) {
    title = `${name} didn't respond`;
    body = "Your request wasn't answered within 24 hours. Send a new request to continue.";
  } else if (declinedCooldown) {
    title = `${name} declined your request again`;
    body = "You can ask for access again after the wait below.";
  } else if (declinedOnce) {
    title = `${name} declined your request`;
    body = "You can ask once more. If they decline again, you'll have to wait 24 hours before asking again.";
  } else {
    title = `${name} declined your request`;
    body = "The wait is over. You can ask for access again.";
  }

  const canSend = !pendingWaiting && !declinedCooldown;
  const Icon = pendingWaiting ? Clock : status === "declined" ? ShieldOff : Lock;

  async function handleRequest() {
    setSending(true);
    setError("");
    try {
      await requestAccessAgain(patientUserId);
      onRequested?.({
        linkStatus: "pending",
        requestExpired: false,
        requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        canRequestAgain: undefined,
        retryAt: null,
      });
    } catch (err) {
      setError(err.message || "Could not send the request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-10 shadow-sm flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
        <Icon size={24} />
      </div>
      <p className="text-slate-900 font-semibold text-lg mb-1.5">{title}</p>
      <p className="text-slate-500 text-sm max-w-md">{body}</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {!pendingWaiting && (
          <button
            type="button"
            onClick={handleRequest}
            disabled={!canSend || sending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#004ac6] hover:bg-[#003da3] text-white text-sm font-semibold px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : canSend ? <RefreshCw size={16} /> : null}
            {sending ? "Sending request..." : declinedCooldown ? `Available in ${waitLeft}` : status === "declined" && !declinedOnce ? "Request access" : "Request access again"}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="text-sm font-medium text-[#004ac6] hover:underline"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}
