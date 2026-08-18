import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authService } from '../../../services/auth';
import { X, KeyRound, MailCheck, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { user, token } = useAuth();
  const isGoogleAccount = (user?.auth_provider || user?.authProvider) === 'google';
  const [step, setStep] = useState('intro'); // intro -> otp -> password -> success
  const [otpCode, setOtpCode] = useState('');
  const [changeToken, setChangeToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setOtpCode('');
      setChangeToken('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendOtp = async () => {
    setIsLoading(true);
    setError('');
    try {
      await authService.sendChangePasswordOTP(token);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit code sent to your email.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const result = await authService.verifyChangePasswordOTP(otpCode, token);
      setChangeToken(result.changeToken);
      setStep('password');
    } catch (err) {
      setError(err.message || 'Invalid or expired code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await authService.confirmChangePassword(changeToken, newPassword, token);
      setStep('success');
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 ">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                Change Password
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify it's you, then set a new password
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 ">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {step === 'intro' && isGoogleAccount && (
            <div className="space-y-5 text-center py-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <LogIn size={26} />
              </div>
              <p className="text-sm text-slate-600 ">
                No password needed — <span className="font-bold text-slate-900 ">{user?.email}</span> was registered using Google Sign-In. Just continue signing in with the "Continue with Google" button.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all"
              >
                Got it
              </button>
            </div>
          )}

          {step === 'intro' && !isGoogleAccount && (
            <div className="space-y-5 text-center py-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <MailCheck size={26} />
              </div>
              <p className="text-sm text-slate-600 ">
                We'll send a 6-digit verification code to{' '}
                <span className="font-bold text-slate-900 ">{user?.email}</span> to confirm it's you before changing your password.
              </p>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLoading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </div>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <p className="text-sm text-slate-600 text-center">
                Enter the 6-digit code sent to <span className="font-bold text-slate-900 ">{user?.email}</span>
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="w-full text-center text-2xl font-extrabold tracking-[0.5em] px-3.5 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isLoading}
                className="w-full text-xs font-bold text-blue-600 hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 "
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  Confirm New Password
                </label>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 ">Password Updated!</h3>
              <p className="text-sm text-slate-500 ">
                Your password has been changed successfully. Use it next time you log in.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
