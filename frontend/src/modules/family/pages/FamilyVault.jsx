import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

import { useAuth } from '../../../context/AuthContext';

import {
  createFamilyMember,
  createFamilyVault,
  deleteFamilyMember,
  getFamilyDashboard,
  getFamilyVault,
  sendFamilyMemberAuthorization,
  updateFamilyMember,
} from '../../../api/family';
import FamilyMember, { parseMemberNotesAndEmail } from './FamilyMember';
import AppHeader from "../../../components/common/AppHeader";
import { formatDate } from "../../../utils/dateFormat";
import PatientSidebar from "../../../components/common/PatientSidebar";

const emptyForm = {
  name: '',
  dob: '',
  age: '',
  relationship: '',
  relationshipTag: '',
  parentMemberId: '',
  healthOverview: '',
  notes: '',
  conditions: [],
  lastVisitDate: '',
  nextCheckupDate: '',
  email: '',
};

const relationshipOptions = [
  'Mother',
  'Father',
  'Spouse',
  'Child',
  'Sibling',
  'Grandparent',
  'Grandchild',
  'Cousin',
  'Aunt/Uncle',
  'Niece/Nephew',
  'Caregiver',
  'Guardian',
  'Other',
];

const relationshipTagOptions = [
  'Immediate Family',
  'Extended Family',
  'Dependent',
  'Care Team',
  'Primary Contact',
  'Emergency Contact',
  'Other',
];

function calculateAgeFromDob(dobValue) {
  const dateValue = new Date(dobValue);
  if (!dobValue || Number.isNaN(dateValue.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - dateValue.getFullYear();
  const monthDiff = today.getMonth() - dateValue.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateValue.getDate())) {
    age -= 1;
  }

  return age >= 0 && age <= 150 ? age : null;
}

// Only a name and the relationship are needed to add someone. Everything else is optional, so
// nobody has to invent a date of birth, a last visit or a checkup date just to get past the form.
function validateForm(form) {
  const errors = {};
  const name = form.name.trim();
  const email = form.email ? form.email.trim() : '';
  const relationship = form.relationship.trim();
  const relationshipTag = form.relationshipTag.trim();
  const healthOverview = form.healthOverview.trim();
  const notes = form.notes.trim();

  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  } else if (name.length > 80) {
    errors.name = 'Name must be 80 characters or less';
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (form.dob && calculateAgeFromDob(form.dob) === null) {
    errors.dob = 'Please enter a valid date of birth';
  }

  if (!form.dob && form.age !== '' && form.age != null) {
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      errors.age = 'Age must be a whole number between 0 and 150';
    }
  }

  if (!relationship) {
    errors.relationship = 'Relationship is required';
  } else if (relationship.length < 2 || relationship.length > 50) {
    errors.relationship = 'Relationship must be 2 to 50 characters';
  }

  if (relationshipTag && (relationshipTag.length < 2 || relationshipTag.length > 50)) {
    errors.relationshipTag = 'Relationship tag must be 2 to 50 characters';
  }

  if (healthOverview.length > 500) {
    errors.healthOverview = 'Health overview must be 500 characters or less';
  }

  if (notes.length > 1000) {
    errors.notes = 'Notes must be 1000 characters or less';
  }

  if (form.lastVisitDate && Number.isNaN(new Date(form.lastVisitDate).getTime())) {
    errors.lastVisitDate = 'Last visit date must be valid';
  }

  if (form.nextCheckupDate && Number.isNaN(new Date(form.nextCheckupDate).getTime())) {
    errors.nextCheckupDate = 'Next checkup date must be valid';
  }

  return errors;
}

const VAULT_PROMPT_STORAGE_KEY = 'swastha.familyVaultPromptShown';

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500 ">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 ">{value}</p>
      <p className="mt-1 text-sm text-slate-500 ">{detail}</p>
    </div>
  );
}

export default function FamilyVault() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, authReady } = useAuth();
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState({
    totalMembers: 0,
    relationshipTagCount: 0,
    upcomingCheckups: 0,
    membersWithHealthNotes: 0,
    recentVisits: 0,
  });
  const [pendingInvites, setPendingInvites] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [conditionDraft, setConditionDraft] = useState({ name: '', ageOfOnset: '' });
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverErrorMeta, setServerErrorMeta] = useState(null);
  const [familyVault, setFamilyVault] = useState(null);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultCreating, setVaultCreating] = useState(false);
  const hasShownVaultPromptRef = React.useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    hasShownVaultPromptRef.current = window.sessionStorage.getItem(VAULT_PROMPT_STORAGE_KEY) === 'true';
  }, []);

  async function loadFamilyVault() {
    if (!isAuthenticated || !token) {
      setError('Please log in to access Family Vault.');
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await getFamilyDashboard(token);
      setMembers(data.members || []);
      setSummary(data.summary || {});
      setPendingInvites(data.pendingInvites || []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load family vault');
    } finally {
      setLoading(false);
    }
  }

  function notifyFamilyMembersUpdated() {
    if (typeof window === 'undefined') return;

    try {
      window.dispatchEvent(new Event('familyMembersUpdated'));
      localStorage.setItem('familyMembersUpdate', Date.now().toString());
    } catch (err) {
      console.warn('Failed to notify family member update:', err);
    }
  }

  async function loadVaultStatus() {
    if (!isAuthenticated || !token) {
      setFamilyVault(null);
      setShowVaultModal(false);
      return;
    }

    try {
      const data = await getFamilyVault(token);
      const vault = data?.vault || null;
      setFamilyVault(vault);

      if (!vault && !hasShownVaultPromptRef.current) {
        hasShownVaultPromptRef.current = true;
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(VAULT_PROMPT_STORAGE_KEY, 'true');
        }
        setShowVaultModal(true);
      } else if (!vault) {
        setShowVaultModal(false);
        setError('Create a family vault first to manage family members.');
      } else {
        setShowVaultModal(false);
      }
    } catch (loadError) {
      setError(loadError.message || 'Failed to load family vault status');
    }
  }

  async function handleCreateFamilyVault() {
    setVaultCreating(true);
    setError('');

    try {
      const data = await createFamilyVault(token);
      const vault = data?.vault || null;
      setFamilyVault(vault);
      setShowVaultModal(false);
      setNotice(data?.message || 'Family vault created successfully.');
      await loadVaultStatus();
      await loadFamilyVault();
    } catch (createError) {
      setError(createError.message || 'Failed to create family vault');
    } finally {
      setVaultCreating(false);
    }
  }

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (!isAuthenticated && !token && !user) {
      navigate('/login', { replace: true });
      return;
    }

    loadVaultStatus();
    loadFamilyVault();
  }, [authReady, isAuthenticated, navigate, token, user]);

  function resetForm() {
    setForm(emptyForm);
    setConditionDraft({ name: '', ageOfOnset: '' });
    setEditingMemberId(null);
    setFieldErrors({});
    setServerErrorMeta(null);
  }

  function addConditionDraft() {
    const name = conditionDraft.name.trim();
    if (!name) return;

    const ageOfOnset = conditionDraft.ageOfOnset !== '' ? Number(conditionDraft.ageOfOnset) : null;
    setForm((prev) => ({
      ...prev,
      conditions: [...(prev.conditions || []), { name, ageOfOnset: Number.isInteger(ageOfOnset) ? ageOfOnset : null }],
    }));
    setConditionDraft({ name: '', ageOfOnset: '' });
  }

  function removeConditionDraft(index) {
    setForm((prev) => ({
      ...prev,
      conditions: (prev.conditions || []).filter((_, i) => i !== index),
    }));
  }

  function handleEdit(member) {
    if (!isAuthenticated || !token) {
      setError('Please log in first to manage family members.');
      navigate('/login', { replace: true });
      return;
    }

    if (!familyVault) {
      setShowVaultModal(true);
      setError('Create a family vault first to manage family members.');
      return;
    }

    const { notes: cleanedNotes, email } = parseMemberNotesAndEmail(member.notes || '');

    setEditingMemberId(member.id);
    setFieldErrors({});
    setError('');
    setNotice('');
    setServerErrorMeta(null);
    setForm({
      name: member.name || '',
      // The date of birth only if one was stored; an age alone stays an age.
      dob: member.dob || member.date_of_birth || '',
      age: !(member.dob || member.date_of_birth) && member.age != null ? String(member.age) : '',
      relationship: member.relationship || '',
      relationshipTag: member.relationshipTag || member.relationship_tag || '',
      parentMemberId: member.parentMemberId || member.parent_member_id || '',
      healthOverview: member.healthOverview || member.health_overview || '',
      notes: cleanedNotes,
      conditions: Array.isArray(member.conditions) ? member.conditions : [],
      email: email,
      lastVisitDate: member.lastVisitDate || member.last_visit_date || '',
      nextCheckupDate: member.nextCheckupDate || member.next_checkup_date || '',
    });

    // Scroll the form into view so the user sees the pre-populated fields
    setTimeout(() => {
      document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setServerErrorMeta(null);

    if (!isAuthenticated || !token) {
      setError('Please log in first to add family members.');
      navigate('/login', { replace: true });
      return;
    }

    if (!familyVault) {
      setShowVaultModal(true);
      setError('Create a family vault first to add family members.');
      return;
    }

    const nextFieldErrors = validateForm(form);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setSaving(true);

    let finalNotes = form.notes.trim();
    if (form.email && form.email.trim()) {
      finalNotes = `[Email: ${form.email.trim()}]\n${finalNotes}`.trim();
    }

    const payload = {
      name: form.name.trim(),
      dob: form.dob || undefined,
      // The age follows the date of birth when there is one; otherwise the age that was typed in.
      age: form.dob ? calculateAgeFromDob(form.dob) : (form.age !== '' ? Number(form.age) : null),
      relationship: form.relationship.trim(),
      relationshipTag: form.relationshipTag.trim(),
      parentMemberId: form.parentMemberId || null,
      healthOverview: form.healthOverview.trim(),
      notes: finalNotes,
      conditions: form.conditions || [],
      lastVisitDate: form.lastVisitDate || undefined,
      nextCheckupDate: form.nextCheckupDate || undefined,
    };

    try {
      const shouldNotify = Boolean(editingMemberId || !form.email?.trim());

      if (editingMemberId) {
        await updateFamilyMember(editingMemberId, payload, token);
        setNotice('Family member updated successfully.');
      } else if (form.email?.trim()) {
        await sendFamilyMemberAuthorization({
          name: form.name.trim(),
          email: form.email.trim(),
          inviterEmail: user?.email,
          notes: payload.notes,
          relationship: payload.relationship,
          relationshipTag: payload.relationshipTag,
          healthOverview: payload.healthOverview,
          conditions: payload.conditions,
          age: payload.age,
          lastVisitDate: payload.lastVisitDate,
          nextCheckupDate: payload.nextCheckupDate,
        }, token);
        setNotice('If a patient account exists for that email, an authorization request has been sent. The member will be added once they approve it.');
      } else {
        await createFamilyMember(payload, token);
        setNotice('Family member added successfully.');
      }

      resetForm();
      await loadFamilyVault();
      if (shouldNotify) {
        notifyFamilyMembersUpdated();
      }
    } catch (submitError) {
      setFieldErrors(submitError?.fieldErrors || {});
      setError(submitError.message || 'Failed to save family member');
      setServerErrorMeta({
        code: submitError.errorCode,
        hint: submitError.errorHint,
        details: submitError.errorDetails,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(member) {
    const relationship = String(member?.relationship || '').trim().toLowerCase();
    const relationshipTag = String(member?.relationshipTag || member?.relationship_tag || '').trim().toLowerCase();

    if (relationship === 'self' || relationshipTag === 'self') {
      setError('The self profile cannot be removed.');
      setNotice('');
      return;
    }

    const confirmDelete = window.confirm(`Remove ${member.name} from Family Vault?`);
    if (!confirmDelete) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await deleteFamilyMember(member.id, token);
      if (editingMemberId === member.id) {
        resetForm();
      }
      setNotice('Family member removed successfully.');
      await loadFamilyVault();
      notifyFamilyMembersUpdated();
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to remove family member');
    } finally {
      setSaving(false);
    }
  }

  const isEditing = Boolean(editingMemberId);
  const canManageMembers = Boolean(familyVault);
  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      {showVaultModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ">
              <ShieldCheck size={16} className="mr-2" />
              Family Admin Setup
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-900 ">Create your family vault</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 ">
              Set up a private family vault and create a vault ID for the family admin. You can add family members after the vault is created.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCreateFamilyVault}
                disabled={vaultCreating}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {vaultCreating ? 'Creating...' : 'Create Family Vault'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowVaultModal(false);
                  setError('Create a family vault first to manage family members.');
                  setNotice('');
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 "
              >
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex h-screen overflow-hidden flex-col lg:flex-row">
        <PatientSidebar action={{ label: 'Open Family Vault', icon: PlusCircle, route: '/family-vault' }} />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <AppHeader />
          <section className="shrink-0 border-b border-slate-200 bg-white px-6 py-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 ">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Private family health workspace
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Family Vault</h1>
                  <p className="mt-1.5 max-w-2xl text-sm text-slate-500 ">
                    Organize family members, relationship tags, and health notes in one secure dashboard.
                  </p>
                </div>
              </div>

              {!familyVault ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setShowVaultModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 shrink-0"
                >
                  <PlusCircle size={16} />
                  Create Family Vault
                </button>
              ) : null}
            </div>
          </section>

          <main className="flex-1 overflow-y-auto mx-auto max-w-7xl px-6 py-10">
            {error ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 ">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="text-sm">
                  <p>{error}</p>
                </div>
              </div>
            ) : null}

            {notice ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 ">
                <Sparkles className="mt-0.5 shrink-0" size={18} />
                <p className="text-sm">{notice}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Members" value={summary.totalMembers || 0} detail="People in your vault" />
              <StatCard label="Relationship Tags" value={summary.relationshipTagCount || 0} detail="Grouped family labels" />
              <StatCard label="Upcoming Checkups" value={summary.upcomingCheckups || 0} detail="Due in the next 30 days" />
              <StatCard label="Health Notes" value={summary.membersWithHealthNotes || 0} detail="Members with health summaries" />
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 ">{isEditing ? 'Edit Family Member' : 'Add Family Member'}</h2>
                  <p className="mt-1 text-sm text-slate-500 ">Only a name and the relationship are needed. Everything else can be added later.</p>
                </div>

                {!canManageMembers ? (
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 ">
                    Create a family vault first to add or edit family members.
                  </div>
                ) : null}

                <form className={`mt-5 space-y-4 ${!canManageMembers ? 'pointer-events-none opacity-70' : ''}`} onSubmit={handleSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Name <span className="text-rose-500">*</span></span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        maxLength={80}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        placeholder="Their full name"
                        required
                      />
                      {fieldErrors.name ? <p className="text-sm text-rose-600 ">{fieldErrors.name}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Date of Birth <span className="text-slate-400">(optional)</span></span>
                      <input
                        type="date"
                        value={form.dob}
                        onChange={(event) => setForm({ ...form, dob: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      />
                      {form.dob && !fieldErrors.dob ? (
                        <p className="text-xs text-slate-500 ">Calculated age: {calculateAgeFromDob(form.dob)} years</p>
                      ) : null}
                      {fieldErrors.dob ? <p className="text-sm text-rose-600 ">{fieldErrors.dob}</p> : null}
                      {!form.dob ? (
                        <input
                          type="number"
                          min="0"
                          max="150"
                          value={form.age}
                          onChange={(event) => setForm({ ...form, age: event.target.value })}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                          placeholder="or just their age in years"
                        />
                      ) : null}
                      {fieldErrors.age ? <p className="text-sm text-rose-600 ">{fieldErrors.age}</p> : null}
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Relationship <span className="text-rose-500">*</span></span>
                      <select
                        value={form.relationship}
                        onChange={(event) => setForm({ ...form, relationship: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        required
                      >
                        <option value="">Select relationship</option>
                        {relationshipOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      {fieldErrors.relationship ? <p className="text-sm text-rose-600 ">{fieldErrors.relationship}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Relationship Tag <span className="text-slate-400">(optional)</span></span>
                      <select
                        value={form.relationshipTag}
                        onChange={(event) => setForm({ ...form, relationshipTag: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      >
                        <option value="">Select tag</option>
                        {relationshipTagOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      {fieldErrors.relationshipTag ? <p className="text-sm text-rose-600 ">{fieldErrors.relationshipTag}</p> : null}
                    </label>
                  </div>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Their email <span className="text-slate-400">(optional)</span></span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="Their email address"
                    />
                    <p className="text-xs text-slate-500 ">
                      {isEditing
                        ? 'Their email, if you want it on record.'
                        : 'If they have their own Swastha account, add their email and we will ask for their permission. For a child or someone without an account, leave it blank and they are added straight away.'}
                    </p>
                    {fieldErrors.email ? <p className="text-sm text-rose-600 ">{fieldErrors.email}</p> : null}
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Health Overview <span className="text-slate-400">(optional)</span></span>
                    <textarea
                      rows="3"
                      value={form.healthOverview}
                      onChange={(event) => setForm({ ...form, healthOverview: event.target.value })}
                      maxLength={500}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="e.g. Hypertension monitoring, stable labs, monthly follow-up"
                    />
                    {fieldErrors.healthOverview ? <p className="text-sm text-rose-600 ">{fieldErrors.healthOverview}</p> : null}
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Notes <span className="text-slate-400">(optional)</span></span>
                    <textarea
                      rows="3"
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      maxLength={1000}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="Notes for reminders, allergies, doctors, etc."
                    />
                    {fieldErrors.notes ? <p className="text-sm text-rose-600 ">{fieldErrors.notes}</p> : null}
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Last Visit Date <span className="text-slate-400">(optional)</span></span>
                      <input
                        type="date"
                        value={form.lastVisitDate}
                        onChange={(event) => setForm({ ...form, lastVisitDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      />
                      {fieldErrors.lastVisitDate ? <p className="text-sm text-rose-600 ">{fieldErrors.lastVisitDate}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Next Checkup Date <span className="text-slate-400">(optional)</span></span>
                      <input
                        type="date"
                        value={form.nextCheckupDate}
                        onChange={(event) => setForm({ ...form, nextCheckupDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      />
                      {fieldErrors.nextCheckupDate ? <p className="text-sm text-rose-600 ">{fieldErrors.nextCheckupDate}</p> : null}
                    </label>
                  </div>

                  {fieldErrors.form ? <p className="text-sm text-rose-600 ">{fieldErrors.form}</p> : null}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving || !canManageMembers}
                      className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {saving ? 'Saving...' : isEditing ? 'Update Member' : form.email.trim() ? 'Ask for Permission' : 'Add Member'}
                    </button>

                    {isEditing ? (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 "
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                  </div>
                </form>
              </section>

              <div className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 ">Waiting for approval</h2>
                  <p className="mt-1 text-sm text-slate-500 ">
                    Permission requests you have sent. A person is added to your vault once they approve.
                  </p>
                  {pendingInvites.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {pendingInvites.map((invite) => (
                        <li key={invite.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900 ">{invite.name || 'Family member'}</p>
                          <p className="text-xs text-slate-600 break-all">{invite.email || 'No email on record'}</p>
                          <p className="mt-1 text-xs text-amber-800">
                            Waiting for them to approve
                            {invite.requestedAt ? ` · sent ${formatDate(invite.requestedAt, { fallback: '' })}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                      No requests waiting.
                    </p>
                  )}
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 ">How adding works</h2>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600 ">
                    <li><span className="font-medium text-slate-800">With their own account:</span> add their email. They get a request and appear here once they approve.</li>
                    <li><span className="font-medium text-slate-800">Without an account</span> (a child, a grandparent): leave the email blank. They are added right away and you keep their records.</li>
                  </ul>
                </section>
              </div>
            </div>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 ">All Family Members</h2>
                  <p className="mt-1 text-sm text-slate-500 ">Review, edit, and remove every saved member.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 ">
                    Loading family vault...
                  </div>
                ) : members.length > 0 ? (
                  members.map((member) => (
                    <FamilyMember key={member.id} member={member} onEdit={handleEdit} onDelete={handleDelete} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 ">
                    No family members yet. Add the first one using the form above.
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>

    </div>
  );
}