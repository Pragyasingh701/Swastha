import React, { useCallback, useEffect, useState } from 'react';
import { X, Stethoscope, Loader2, AlertCircle, ShieldOff } from 'lucide-react';
import { getMyDoctors, revokeDoctorAccess } from '../../../api/doctorPatients';

// "Ends in 5h 20m" / "Ends in 12m" / "Ending now"
function formatTimeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 60 * 1000) return 'Ending now';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `Ends in ${hours}h ${minutes % 60}m` : `Ends in ${minutes}m`;
}

// The doctors who can see this patient's records right now, each with a
// button to end that access immediately instead of waiting out the 24 hours.
export default function DoctorAccessModal({ isOpen, onClose }) {
  const [doctors, setDoctors] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setDoctors(await getMyDoctors());
    } catch (err) {
      setDoctors([]);
      setError(err.message || 'Could not load the doctors who have access.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setDoctors(null);
    setConfirmingId(null);
    load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  async function handleRevoke(linkId) {
    setRevokingId(linkId);
    setError('');
    try {
      await revokeDoctorAccess(linkId);
      setConfirmingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not revoke access. Please try again.');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Stethoscope size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">Doctor access</h3>
              <p className="text-xs text-slate-500 mt-0.5">Doctors who can see your records right now</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {doctors === null && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              Loading…
            </div>
          )}

          {doctors && doctors.length === 0 && !error && (
            <p className="text-sm text-slate-500 text-center py-6">
              No doctor has access to your records right now. Access you approve lasts 24 hours.
            </p>
          )}

          {doctors && doctors.map((doctor) => (
            <div key={doctor.linkId} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-900">Dr. {String(doctor.doctorName).replace(/^Dr\.?\s+/i, '')}</p>
              {(doctor.specialty || doctor.hospitalName) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {[doctor.specialty, doctor.hospitalName].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="text-xs font-semibold text-slate-600 mt-2">{formatTimeLeft(doctor.accessExpiresAt)}</p>

              {confirmingId === doctor.linkId ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRevoke(doctor.linkId)}
                    disabled={revokingId === doctor.linkId}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 transition-colors"
                  >
                    {revokingId === doctor.linkId ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                    Yes, revoke access
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    disabled={revokingId === doctor.linkId}
                    className="rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold px-3 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(doctor.linkId)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold px-3 py-2 transition-colors"
                >
                  <ShieldOff size={14} />
                  Revoke access
                </button>
              )}
            </div>
          ))}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Revoking takes effect immediately. The doctor can send a new request later, and you can decline it.
          </p>
        </div>
      </div>
    </div>
  );
}
