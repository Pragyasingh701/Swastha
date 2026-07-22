import React from 'react';
import { CalendarDays, Edit3, HeartPulse, Trash2, Users } from 'lucide-react';

function formatDate(value) {
  if (!value) return 'Not set';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function FamilyMember({ member, onEdit, onDelete }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
            {member.relationship_tag ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {member.relationship_tag}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {member.relationship || 'Relationship not set'}
            {member.age ? ` • ${member.age} years` : ''}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(member)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Edit3 size={16} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(member)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <Trash2 size={16} />
            Remove
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <HeartPulse size={14} />
            Health Overview
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {member.health_overview || 'No health overview added yet.'}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Users size={14} />
            Notes
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {member.notes || 'No extra notes stored.'}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays size={14} />
            Next Checkup
          </div>
          <p className="mt-2 text-sm text-slate-700">{formatDate(member.next_checkup_date)}</p>
        </div>
      </div>
    </article>
  );
}