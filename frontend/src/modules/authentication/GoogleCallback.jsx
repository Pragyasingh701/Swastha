import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getGoogleRedirectUri, consumeGoogleOAuthContext } from "../../utils/googleAuth";

export default function GoogleCallback() {
  const navigate = useNavigate();
  const { finishGoogleAuth } = useAuth();
  const [error, setError] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    const context = consumeGoogleOAuthContext() || { mode: "login" };

    if (oauthError) {
      setError(oauthError === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed. Please try again.");
      return;
    }

    if (!code) {
      setError("Missing authorization code from Google. Please try again.");
      return;
    }

    (async () => {
      try {
        const result = await finishGoogleAuth({
          code,
          redirectUri: getGoogleRedirectUri(),
          mode: context.mode,
          role: context.role,
        });

        if (result?.requiresOTP) {
          navigate("/verify-otp", { state: { email: result.email, isRegister: context.mode === "register" }, replace: true });
          return;
        }

        if (result?.user?.hasSelectedRole || (result?.user?.role && result?.user?.role !== "none")) {
          navigate(result?.user?.role === "doctor" ? "/doctor-dashboard" : "/dashboard", { replace: true });
        } else {
          navigate("/role-selection", { replace: true });
        }
      } catch (err) {
        setError(err.message || "Google sign-in failed. Please try again.");
      }
    })();
  }, [finishGoogleAuth, navigate]);

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center font-body-md text-on-surface">
      {error ? (
        <>
          <span className="material-symbols-outlined text-error text-[36px]">error</span>
          <p className="text-body-md text-on-surface max-w-sm">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="rounded-xl bg-primary-container px-5 py-2.5 text-white font-label-md hover:bg-primary-container/90 transition-all"
          >
            Back to Login
          </button>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-body-sm text-on-surface-variant">Finishing Google sign-in...</p>
        </>
      )}
    </main>
  );
}
