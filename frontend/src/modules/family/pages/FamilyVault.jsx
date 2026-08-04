import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  ClipboardList,
  Folder,
  HelpCircle,
  LayoutGrid,
  Mail,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  LogOut,
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

const emptyForm = {
  name: '',
  age: '',
  relationship: '',
  relationshipTag: '',
  healthOverview: '',
  notes: '',
  lastVisitDate: '',
  nextCheckupDate: '',
  email: '',
};

function validateForm(form, isEditing = false, addMethod = 'manual') {
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

  if (addMethod === 'email' || email) {
    if (addMethod === 'email' && !email) {
      errors.email = 'Email address is required in Email mode';
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }
  }

  if (form.age !== '' && form.age !== null && form.age !== undefined) {
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      errors.age = 'Age must be an integer between 0 and 150';
    }
  }

  if (relationship && (relationship.length < 2 || relationship.length > 50)) {
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

  if (isEditing && Object.keys(errors).length === 0 && !name && !relationship && !relationshipTag && !healthOverview && !notes && !form.age && !form.lastVisitDate && !form.nextCheckupDate && !email) {
    errors.form = 'At least one field is required to update a member';
  }

  return errors;
}

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, route: '/dashboard' },
  { label: 'Health Timeline', icon: TrendingUp, route: '/timeline' },
  { label: 'Medical Vault', icon: Folder, route: '/vault' },
  { label: 'Family Records', icon: Users, route: '/family-vault' },
  { label: 'Lab Insights', icon: TrendingUp, route: '/lab-trends' },
];

const VAULT_PROMPT_STORAGE_KEY = 'swastha.familyVaultPromptShown';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-6 min-h-screen">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold leading-tight text-blue-700">Swastha AI</h1>
        <p className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-400">CLINICAL INTELLIGENCE</p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`)));

          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              aria-label={label}
              title={label}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 pt-4">
        <button
          type="button"
          onClick={() => navigate('/family-vault')}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          title="Open Family Vault"
          aria-label="Open Family Vault"
        >
          <PlusCircle size={18} />
          Open Family Vault
        </button>

        <div className="space-y-1 pt-2">
          <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100" title="Settings" aria-label="Settings">
            <Settings size={18} />
            Settings
          </button>
          <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100" title="Support" aria-label="Support">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Header({ userName, userEmail }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
      <div className="flex-1 relative max-w-xl">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search medical history, labs, or insights..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <button type="button" className="relative rounded-lg p-2 hover:bg-slate-100">
        <Bell size={20} className="text-slate-600" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
      </button>

      <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-800">{userName || 'Loading user...'}</p>
          <p className="text-xs text-slate-400">{userEmail || 'Fetching profile...'}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
          {(userName || 'U').charAt(0).toUpperCase()}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center ml-1"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
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
  const [relationshipTags, setRelationshipTags] = useState([]);
  const [healthOverview, setHealthOverview] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [addMethod, setAddMethod] = useState('email');
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
      const data = await getFamilyDashboard();
      setMembers(data.members || []);
      setSummary(data.summary || {});
      setRelationshipTags(data.relationshipTags || []);
      setHealthOverview(data.healthOverview || []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load family vault');
    } finally {
      setLoading(false);
    }
  }

  async function loadVaultStatus() {
    if (!isAuthenticated || !token) {
      setFamilyVault(null);
      setShowVaultModal(false);
      return;
    }

    try {
      const data = await getFamilyVault();
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
      const data = await createFamilyVault();
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
    setEditingMemberId(null);
    setAddMethod('email');
    setFieldErrors({});
    setServerErrorMeta(null);
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
    setAddMethod('email');
    setFieldErrors({});
    setError('');
    setNotice('');
    setServerErrorMeta(null);
    setForm({
      name: member.name || '',
      age: member.age ?? '',
      relationship: member.relationship || '',
      relationshipTag: member.relationshipTag || member.relationship_tag || '',
      healthOverview: member.healthOverview || member.health_overview || '',
      notes: cleanedNotes,
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

    const nextFieldErrors = validateForm(form, Boolean(editingMemberId), addMethod);
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
      age: form.age === '' ? null : Number(form.age),
      relationship: form.relationship.trim(),
      relationshipTag: form.relationshipTag.trim(),
      healthOverview: form.healthOverview.trim(),
      notes: finalNotes,
      lastVisitDate: form.lastVisitDate,
      nextCheckupDate: form.nextCheckupDate,
      authorizationMethod: 'mail',
    };

    try {
      if (form.email?.trim()) {
        await sendFamilyMemberAuthorization({
          name: form.name.trim(),
          email: form.email.trim(),
          inviterEmail: user?.email,
          notes: payload.notes,
          relationship: payload.relationship,
          relationshipTag: payload.relationshipTag,
          healthOverview: payload.healthOverview,
          age: payload.age,
          lastVisitDate: payload.lastVisitDate,
          nextCheckupDate: payload.nextCheckupDate,
        });
        setNotice('Authorization request sent. The member will be added after they approve it.');
      } else {
        if (editingMemberId) {
          await updateFamilyMember(editingMemberId, payload);
          setNotice('Family member updated successfully.');
        } else {
          await createFamilyMember(payload);
          setNotice('Family member added successfully.');
        }
      }

      resetForm();
      await loadFamilyVault();
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
    const confirmDelete = window.confirm(`Remove ${member.name} from Family Vault?`);
    if (!confirmDelete) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await deleteFamilyMember(member.id);
      if (editingMemberId === member.id) {
        resetForm();
      }
      setNotice('Family member removed successfully.');
      await loadFamilyVault();
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to remove family member');
    } finally {
      setSaving(false);
    }
  }

  const isEditing = Boolean(editingMemberId);
  const canManageMembers = Boolean(familyVault);
  const healthOverviewCards = (healthOverview || [])
    .filter((item) => item.relationshipTag || item.relationship || item.healthOverview || item.notes)
    .map((item) => {
      const { notes: cleanedNotes } = parseMemberNotesAndEmail(item.notes || '');
      return {
        label: item.name || 'Family member',
        tag: item.relationshipTag || 'No tag added',
        relationship: item.relationship || 'Relationship not set',
        detail: item.healthOverview || cleanedNotes || 'No health overview added yet.',
      };
    });
  const relationshipTagChips = (relationshipTags || []).map((tag, index) => {
    if (typeof tag === 'string') {
      return { key: tag || `tag-${index}`, label: tag };
    }

    return { key: tag?.label || `tag-${index}`, label: tag?.label || 'Tag', count: tag?.count };
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {showVaultModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <ShieldCheck size={16} className="mr-2" />
              Family Admin Setup
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-900">Create your family vault</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
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
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header userName={user?.name || user?.fullName} userEmail={user?.email} />
          <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-14 text-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 backdrop-blur">
                  <ShieldCheck size={16} />
                  Private family health workspace
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Family Vault</h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
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
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
                >
                  <PlusCircle size={16} />
                  Create Family Vault
                </button>
              ) : null}
            </div>
          </section>

          <main className="mx-auto max-w-7xl px-6 py-10">
            {error ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="text-sm space-y-1">
                  <p>{error}</p>
                  {serverErrorMeta?.code || serverErrorMeta?.hint || serverErrorMeta?.details ? (
                    <div className="rounded-xl bg-white/70 p-3 text-rose-700/90">
                      {serverErrorMeta?.code ? <p><span className="font-semibold">Code:</span> {serverErrorMeta.code}</p> : null}
                      {serverErrorMeta?.hint ? <p><span className="font-semibold">Hint:</span> {serverErrorMeta.hint}</p> : null}
                      {serverErrorMeta?.details ? <p><span className="font-semibold">Details:</span> {serverErrorMeta.details}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {notice ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
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

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Health Overview</h2>
                    <p className="mt-1 text-sm text-slate-500">At-a-glance metrics pulled from Family Vault data.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                    <Users size={16} />
                    {members.length} members
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {healthOverviewCards.length > 0 ? (
                    healthOverviewCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-500">{item.label}</p>
                        <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-blue-700">Tag: {item.tag}</p>
                        <p className="mt-1 text-sm text-slate-600">Relationship: {item.relationship}</p>
                        <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 sm:col-span-2">
                      Add family members to populate the dashboard summary.
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Relationship Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {relationshipTagChips.length > 0 ? (
                      relationshipTagChips.map((tag) => (
                        <span key={tag.key} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          {tag.label} {tag.count !== undefined ? <span className="text-slate-400">({tag.count})</span> : null}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">
                        No tags yet
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{isEditing ? 'Edit Family Member' : 'Add Family Member'}</h2>
                  <p className="mt-1 text-sm text-slate-500">Update names, relationships, and health notes from one form.</p>
                </div>

                {!canManageMembers ? (
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Create a family vault first to add or edit family members.
                  </div>
                ) : null}

                <form className={`mt-5 space-y-4 ${!canManageMembers ? 'pointer-events-none opacity-70' : ''}`} onSubmit={handleSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Name</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        maxLength={80}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        placeholder="e.g. Ananya Sharma"
                        required
                      />
                      {fieldErrors.name ? <p className="text-sm text-rose-600">{fieldErrors.name}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Age</span>
                      <input
                        type="number"
                        min="0"
                        max="150"
                        value={form.age}
                        onChange={(event) => setForm({ ...form, age: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        placeholder="e.g. 42"
                      />
                      {fieldErrors.age ? <p className="text-sm text-rose-600">{fieldErrors.age}</p> : null}
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Relationship</span>
                      <input
                        value={form.relationship}
                        onChange={(event) => setForm({ ...form, relationship: event.target.value })}
                        maxLength={50}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        placeholder="e.g. Mother"
                      />
                      {fieldErrors.relationship ? <p className="text-sm text-rose-600">{fieldErrors.relationship}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Relationship Tag</span>
                      <input
                        value={form.relationshipTag}
                        onChange={(event) => setForm({ ...form, relationshipTag: event.target.value })}
                        maxLength={50}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        placeholder="e.g. Immediate Family"
                      />
                      {fieldErrors.relationshipTag ? <p className="text-sm text-rose-600">{fieldErrors.relationshipTag}</p> : null}
                    </label>
                  </div>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700">Recipient email</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      placeholder="person@example.com"
                    />
                    {fieldErrors.email ? <p className="text-sm text-rose-600">{fieldErrors.email}</p> : null}
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700">Health Overview</span>
                    <textarea
                      rows="3"
                      value={form.healthOverview}
                      onChange={(event) => setForm({ ...form, healthOverview: event.target.value })}
                      maxLength={500}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      placeholder="e.g. Hypertension monitoring, stable labs, monthly follow-up"
                    />
                    {fieldErrors.healthOverview ? <p className="text-sm text-rose-600">{fieldErrors.healthOverview}</p> : null}
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700">Notes</span>
                    <textarea
                      rows="3"
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      maxLength={1000}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      placeholder="Optional notes for reminders, allergies, doctors, etc."
                    />
                    {fieldErrors.notes ? <p className="text-sm text-rose-600">{fieldErrors.notes}</p> : null}
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Last Visit Date</span>
                      <input
                        type="date"
                        value={form.lastVisitDate}
                        onChange={(event) => setForm({ ...form, lastVisitDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                      {fieldErrors.lastVisitDate ? <p className="text-sm text-rose-600">{fieldErrors.lastVisitDate}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Next Checkup Date</span>
                      <input
                        type="date"
                        value={form.nextCheckupDate}
                        onChange={(event) => setForm({ ...form, nextCheckupDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                      {fieldErrors.nextCheckupDate ? <p className="text-sm text-rose-600">{fieldErrors.nextCheckupDate}</p> : null}
                    </label>
                  </div>

                  {fieldErrors.form ? <p className="text-sm text-rose-600">{fieldErrors.form}</p> : null}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving || !canManageMembers}
                      className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {saving ? 'Sending...' : isEditing ? 'Update Member' : 'Ask for Permission'}
                    </button>

                    {isEditing ? (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                  </div>
                </form>
              </section>
            </div>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">All Family Members</h2>
                  <p className="mt-1 text-sm text-slate-500">Review, edit, and remove every saved member.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Loading family vault...
                  </div>
                ) : members.length > 0 ? (
                  members.map((member) => (
                    <FamilyMember key={member.id} member={member} onEdit={handleEdit} onDelete={handleDelete} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
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