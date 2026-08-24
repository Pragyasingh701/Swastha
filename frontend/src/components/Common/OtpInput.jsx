import React, { useRef } from "react";

// Shared 6-box OTP input UI, extracted out of
// modules/authentication/VerifyOTP.jsx so both the login/registration OTP
// screen and the new Clinic Check-In flow (modules/patient/pages/
// ClinicCheckIn.jsx) render/behave identically — same digit-only entry,
// auto-advance-on-type, backspace-to-previous, and 6-digit paste support.
// Deliberately presentational only (no fetch/verify logic, no AuthContext
// dependency) — the caller owns what "submit" and "resend" do, since the
// two call sites hit different endpoints (POST /api/auth/verify-otp vs
// POST /api/clinic/verify-otp).
//
// Props:
//   value: string[6] of digits (controlled)
//   onChange: (nextValue: string[6]) => void
//   disabled?: boolean
export default function OtpInput({ value, onChange, disabled = false }) {
  const inputRefs = useRef([]);

  const handleChange = (index, raw) => {
    if (isNaN(raw)) return;
    const next = [...value];
    next[index] = raw.slice(-1);
    onChange(next);

    if (raw && index < value.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, value.length);
    if (!pasted) return;

    const next = Array(value.length).fill("");
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    onChange(next);

    const nextIndex = Math.min(pasted.length, value.length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex justify-between items-center gap-2">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center text-headline-md font-extrabold bg-surface-container-lowest border border-outline-variant rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
        />
      ))}
    </div>
  );
}
