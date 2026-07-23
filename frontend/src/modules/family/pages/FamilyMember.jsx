import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Edit3, Eye, HeartPulse, Trash2, Users } from 'lucide-react';

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
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const relationshipTag = member.relationshipTag || member.relationship_tag || 'No tag added';
  const relationship = member.relationship || 'Relationship not set';
  const age = member.age ?? 'Not set';
  const healthOverview = member.healthOverview || member.health_overview || 'No health overview added yet.';
  const notes = member.notes || 'No extra notes stored.';
  const lastVisitDate = member.lastVisitDate || member.last_visit_date;
  const nextCheckupDate = member.nextCheckupDate || member.next_checkup_date;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
            {relationshipTag && relationshipTag !== 'No tag added' ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {relationshipTag}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {relationship}
            {age !== 'Not set' ? ` • ${age} years` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/timeline')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <CalendarDays size={16} />
            Medical Timeline
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Eye size={16} />
            {expanded ? 'Hide' : 'View'}
          </button>
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
            {healthOverview}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Users size={14} />
            Notes
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {notes}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays size={14} />
            Next Checkup
          </div>
          <p className="mt-2 text-sm text-slate-700">{formatDate(nextCheckupDate)}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Relationship</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{relationship}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Age</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{age}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last Visited</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{formatDate(lastVisitDate)}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next Checkup</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{formatDate(nextCheckupDate)}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm md:col-span-2 xl:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Health Overview</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{healthOverview}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm md:col-span-2 xl:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{notes}</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}