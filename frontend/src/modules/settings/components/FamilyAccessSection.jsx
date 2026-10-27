import React, { useCallback, useEffect, useState } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { getFamilyAdminsWithAccess, revokeFamilyAdminAccess } from '../../../api/family';
import { formatDate } from '../../../utils/dateFormat';

// Who can open this patient's records through a family vault, with a way to take
// that access back. Shown to patients only; renders nothing when nobody has it.
export default function FamilyAccessSection({ token }) {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setAdmins(await getFamilyAdminsWithAccess(token));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load who has access to your records.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id) => {
    setBusyId(id);
    try {
      await revokeFamilyAdminAccess(id, token);
      setConfirmingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not remove that access.');
    } finally {
      setBusyId(null);
    }
  };

  if (!error && (!admins || admins.length === 0)) return null;

  return (
    <div className="pt-4 border-t border-slate-100 space-y-3">
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
        <Users size={16} className="text-emerald-600" />
        Family members with access to your records
      </h4>
      {error && (
        <p className="flex items-center gap-2 text-xs font-semibold text-rose-600">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      {(admins || []).map((admin) => (
        <div key={admin.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">{admin.adminName || admin.adminEmail || 'A family member'}</p>
            <p className="text-[11px] font-semibold text-slate-500 truncate">
              {admin.adminEmail}{admin.approvedAt ? ` · since ${formatDate(admin.approvedAt)}` : ''}
            </p>
          </div>
          {confirmingId === admin.id ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busyId === admin.id}
                onClick={() => revoke(admin.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-extrabold disabled:opacity-60"
              >
                {busyId === admin.id ? 'Removing…' : 'Yes, remove'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-extrabold text-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingId(admin.id)}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-[11px] font-extrabold text-rose-600 shrink-0"
            >
              Remove access
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
