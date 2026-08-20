import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ClipboardList,
  Folder,
  HelpCircle,
  LayoutGrid,
  Mail,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  LogOut,
} from 'lucide-react';
import NotificationBell from "../../../components/Common/NotificationBell";
import { useAuth } from '../../../context/AuthContext';
import ProfileDropdown from '../../settings/components/ProfileDropdown';
import PatientIdBadge from '../../../components/Common/PatientIdBadge';
import PatientNotifications from '../../../components/Common/PatientNotifications';
import SettingsModal from '../../settings/components/SettingsModal';
import Logo from '../../../components/Common/Logo';
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
  dob: '',
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

function calculateDateOfBirthFromAge(age) {
  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 150) {
    return '';
  }

  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - ageNumber);
  return dob.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

  if (!email && !isEditing) {
    errors.email = 'Email address is required';
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!form.dob) {
    errors.dob = 'Date of birth is required';
  } else {
    const age = calculateAgeFromDob(form.dob);
    if (age === null) {
      errors.dob = 'Please enter a valid date of birth';
    }
  }

  if (!relationship) {
    errors.relationship = 'Relationship is required';
  } else if (relationship.length < 2 || relationship.length > 50) {
    errors.relationship = 'Relationship must be 2 to 50 characters';
  }

  if (!relationshipTag) {
    errors.relationshipTag = 'Relationship tag is required';
  } else if (relationshipTag.length < 2 || relationshipTag.length > 50) {
    errors.relationshipTag = 'Relationship tag must be 2 to 50 characters';
  }

  if (!healthOverview) {
    errors.healthOverview = 'Health overview is required';
  } else if (healthOverview.length > 500) {
    errors.healthOverview = 'Health overview must be 500 characters or less';
  }

  if (notes && notes.length > 1000) {
    errors.notes = 'Notes must be 1000 characters or less';
  }

  if (!form.lastVisitDate) {
    errors.lastVisitDate = 'Last visit date is required';
  } else if (Number.isNaN(new Date(form.lastVisitDate).getTime())) {
    errors.lastVisitDate = 'Last visit date must be valid';
  }

  if (!form.nextCheckupDate) {
    errors.nextCheckupDate = 'Next checkup date is required';
  } else if (Number.isNaN(new Date(form.nextCheckupDate).getTime())) {
    errors.nextCheckupDate = 'Next checkup date must be valid';
  }

  if (isEditing && Object.keys(errors).length === 0 && !name && !relationship && !relationshipTag && !healthOverview && !notes && !form.dob && !form.lastVisitDate && !form.nextCheckupDate && !email) {
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
  { label: 'Ask Swastha', icon: Sparkles, route: '/search' },
];

const VAULT_PROMPT_STORAGE_KEY = 'swastha.familyVaultPromptShown';


function Sidebar({ onOpenSettings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-6 h-screen overflow-y-auto">
      <div className="mb-8 px-2">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`)));

          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                  ? 'bg-blue-100 text-blue-700 '
                  : 'text-slate-600 hover:bg-slate-100 '
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
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 "
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
            Settings
          </button>
          <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 " title="Support" aria-label="Support">
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
      <p className="text-sm font-medium text-slate-500 ">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 ">{value}</p>
      <p className="mt-1 text-sm text-slate-500 ">{detail}</p>
    </div>
  );
}

function Header({ userName, userEmail }) {
  const navigate = useNavigate();

  return (
    <header className="shrink-0 flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
      >
        <Sparkles size={16} />
        Ask Swastha about your health records...
      </button>

      <PatientNotifications />

      <PatientIdBadge />

      <ProfileDropdown />
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
  const [conditionDraft, setConditionDraft] = useState({ name: '', ageOfOnset: '' });
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
      setRelationshipTags(data.relationshipTags || []);
      setHealthOverview(data.healthOverview || []);
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
    setAddMethod('email');
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
    setAddMethod('email');
    setFieldErrors({});
    setError('');
    setNotice('');
    setServerErrorMeta(null);
    setForm({
      name: member.name || '',
      dob: member.dob || member.date_of_birth || (member.age != null ? (() => {
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - Number(member.age));
        return dob.toISOString().slice(0, 10);
      })() : ''),
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
      dob: form.dob,
      age: calculateAgeFromDob(form.dob),
      relationship: form.relationship.trim(),
      relationshipTag: form.relationshipTag.trim(),
      parentMemberId: form.parentMemberId || null,
      healthOverview: form.healthOverview.trim(),
      notes: finalNotes,
      conditions: form.conditions || [],
      lastVisitDate: form.lastVisitDate,
      nextCheckupDate: form.nextCheckupDate,
      authorizationMethod: 'mail',
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
        setNotice('Authorization request sent. The member will be added after they approve it.');
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

  const parentMemberOptions = (members || []).filter((member) => {
    const normalizedRelationship = String(member?.relationship || '').trim().toLowerCase();
    return member.id !== editingMemberId && member.id !== form.parentMemberId && normalizedRelationship !== 'self';
  });

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
        <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Header userName={user?.name || user?.fullName} userEmail={user?.email} />
          <section className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-14 text-white">
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

          <main className="flex-1 overflow-y-auto mx-auto max-w-7xl px-6 py-10">
            {error ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 ">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="text-sm space-y-1">
                  <p>{error}</p>
                  {serverErrorMeta?.code || serverErrorMeta?.hint || serverErrorMeta?.details ? (
                    <div className="rounded-xl bg-white/70 p-3 text-rose-700/90 ">
                      {serverErrorMeta?.code ? <p><span className="font-semibold">Code:</span> {serverErrorMeta.code}</p> : null}
                      {serverErrorMeta?.hint ? <p><span className="font-semibold">Hint:</span> {serverErrorMeta.hint}</p> : null}
                      {serverErrorMeta?.details ? <p><span className="font-semibold">Details:</span> {serverErrorMeta.details}</p> : null}
                    </div>
                  ) : null}
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

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 ">Health Overview</h2>
                    <p className="mt-1 text-sm text-slate-500 ">At-a-glance metrics pulled from Family Vault data.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 ">
                    <Users size={16} />
                    {members.length} members
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {healthOverviewCards.length > 0 ? (
                    healthOverviewCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-500 ">{item.label}</p>
                        <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-blue-700 ">Tag: {item.tag}</p>
                        <p className="mt-1 text-sm text-slate-600 ">Relationship: {item.relationship}</p>
                        <p className="mt-2 text-sm text-slate-500 ">{item.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 sm:col-span-2">
                      Add family members to populate the dashboard summary.
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400 ">Relationship Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {relationshipTagChips.length > 0 ? (
                      relationshipTagChips.map((tag) => (
                        <span key={tag.key} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 ">
                          {tag.label} {tag.count !== undefined ? <span className="text-slate-400 ">({tag.count})</span> : null}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400 ">
                        No tags yet
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 ">{isEditing ? 'Edit Family Member' : 'Add Family Member'}</h2>
                  <p className="mt-1 text-sm text-slate-500 ">Update names, relationships, and health notes from one form.</p>
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
                        placeholder="e.g. Ananya Sharma"
                        required
                      />
                      {fieldErrors.name ? <p className="text-sm text-rose-600 ">{fieldErrors.name}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Date of Birth <span className="text-rose-500">*</span></span>
                      <input
                        type="date"
                        value={form.dob}
                        onChange={(event) => setForm({ ...form, dob: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        required
                      />
                      {form.dob && !fieldErrors.dob ? (
                        <p className="text-xs text-slate-500 ">Calculated age: {calculateAgeFromDob(form.dob)} years</p>
                      ) : null}
                      {fieldErrors.dob ? <p className="text-sm text-rose-600 ">{fieldErrors.dob}</p> : null}
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
                      <span className="text-sm font-medium text-slate-700 ">Relationship Tag <span className="text-rose-500">*</span></span>
                      <select
                        value={form.relationshipTag}
                        onChange={(event) => setForm({ ...form, relationshipTag: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        required
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
                    <span className="text-sm font-medium text-slate-700 ">Parent / linked relative (optional)</span>
                    <select
                      value={form.parentMemberId}
                      onChange={(event) => setForm({ ...form, parentMemberId: event.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                    >
                      <option value="">No parent linked</option>
                      {parentMemberOptions.map((member) => (
                        <option key={member.id} value={member.id}>{member.name} ({member.relationship || 'relative'})</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">This link helps the doctor see a more accurate family pedigree.</p>
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Recipient email <span className="text-rose-500">*</span></span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="person@example.com"
                      required
                    />
                    {fieldErrors.email ? <p className="text-sm text-rose-600 ">{fieldErrors.email}</p> : null}
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Health Overview <span className="text-rose-500">*</span></span>
                    <textarea
                      rows="3"
                      value={form.healthOverview}
                      onChange={(event) => setForm({ ...form, healthOverview: event.target.value })}
                      maxLength={500}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="e.g. Hypertension monitoring, stable labs, monthly follow-up"
                      required
                    />
                    {fieldErrors.healthOverview ? <p className="text-sm text-rose-600 ">{fieldErrors.healthOverview}</p> : null}
                  </label>

                  <div className="space-y-2">
                    <span className="text-sm font-medium text-slate-700 ">
                      Known Conditions <span className="text-slate-400 font-normal">(used for hereditary risk in the doctor view)</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={conditionDraft.name}
                        onChange={(event) => setConditionDraft({ ...conditionDraft, name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addConditionDraft();
                          }
                        }}
                        maxLength={100}
                        placeholder="e.g. Type 2 Diabetes"
                        className="flex-1 min-w-[160px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      />
                      <input
                        type="number"
                        min="0"
                        max="150"
                        value={conditionDraft.ageOfOnset}
                        onChange={(event) => setConditionDraft({ ...conditionDraft, ageOfOnset: event.target.value })}
                        placeholder="Age of onset"
                        className="w-36 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      />
                      <button
                        type="button"
                        onClick={addConditionDraft}
                        className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 "
                      >
                        Add
                      </button>
                    </div>
                    {(form.conditions || []).length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {form.conditions.map((condition, index) => (
                          <span
                            key={`${condition.name}-${index}`}
                            className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 "
                          >
                            {condition.name}
                            {condition.ageOfOnset != null ? ` · onset ${condition.ageOfOnset}` : ''}
                            <button
                              type="button"
                              onClick={() => removeConditionDraft(index)}
                              className="text-blue-400 hover:text-blue-700"
                              aria-label={`Remove ${condition.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700 ">Notes</span>
                    <textarea
                      rows="3"
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      maxLength={1000}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                      placeholder="Notes for reminders, allergies, doctors, etc."
                      required
                    />
                    {fieldErrors.notes ? <p className="text-sm text-rose-600 ">{fieldErrors.notes}</p> : null}
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Last Visit Date <span className="text-rose-500">*</span></span>
                      <input
                        type="date"
                        value={form.lastVisitDate}
                        onChange={(event) => setForm({ ...form, lastVisitDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        required
                      />
                      {fieldErrors.lastVisitDate ? <p className="text-sm text-rose-600 ">{fieldErrors.lastVisitDate}</p> : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 ">Next Checkup Date <span className="text-rose-500">*</span></span>
                      <input
                        type="date"
                        value={form.nextCheckupDate}
                        onChange={(event) => setForm({ ...form, nextCheckupDate: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:bg-white "
                        required
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
                      {saving ? 'Sending...' : isEditing ? 'Update Member' : 'Ask for Permission'}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}