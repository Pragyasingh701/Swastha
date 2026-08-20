import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import UploadReports from "../../../reports/components/pages/UploadReports";
import { parseMemberNotesAndEmail } from "../../../family/pages/FamilyMember";
import { useAuth } from "../../../../context/AuthContext";
import * as reportService from "../../../../api/reports";
import * as familyService from "../../../../api/family";
import { indexReport, removeReportFromIndex } from "../../../../api/search";
import SettingsModal from "../../../settings/components/SettingsModal";
import ProfileDropdown from "../../../settings/components/ProfileDropdown";
import PatientIdBadge from "../../../../components/Common/PatientIdBadge";
import PatientNotifications from "../../../../components/Common/PatientNotifications";
import Logo from "../../../../components/Common/Logo";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  X,
  ExternalLink,
  Sparkles,
  FlaskConical,
  ScanLine,
  Syringe,
  FileText,
  AlertTriangle,
} from "lucide-react";
import NotificationBell from "../../../../components/Common/NotificationBell";

/* -----------------------------------------------------------
   Nav + category config.
------------------------------------------------------------ */

// Same nav list as Dashboard.jsx / LabTrends.jsx, with Health Timeline active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, active: true, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

// Categories a user can pick when uploading a new report manually.
const UPLOAD_CATEGORIES = [
  { value: "Lab Reports", icon: FlaskConical, kind: "upload" },
  { value: "Prescriptions", icon: ClipboardList, kind: "medication" },
  { value: "MRI/Scans", icon: ScanLine, kind: "imaging" },
  { value: "Immunizations", icon: Syringe, kind: "upload" },
];

const CATEGORY_META = {
  Prescription: { kind: "medication", icon: ClipboardList },
  Prescriptions: { kind: "medication", icon: ClipboardList },
  "Lab Report": { kind: "lab", icon: FlaskConical },
  "Lab Reports": { kind: "lab", icon: FlaskConical },
  Imaging: { kind: "imaging", icon: ScanLine },
  "MRI/Scans": { kind: "imaging", icon: ScanLine },
  Vaccination: { kind: "immunization", icon: Syringe },
  Immunizations: { kind: "immunization", icon: Syringe },
  Consultation: { kind: "consultation", icon: FileText },
};

// Diagnosis/Medicines are stored under the same column names for every
// category, but what they actually MEAN differs by category — mirrors
// UploadReports.jsx's CATEGORY_FIELD_CONFIG so a saved report's detail
// view uses the same labels the manual entry form showed when saving it
// (e.g. a Lab Report shows "Test / Panel Name", not "Diagnosis").
const CATEGORY_FIELD_LABELS = {
  Prescription: { diagnosis: "Diagnosis", medicines: "Medicines" },
  "Lab Report": { diagnosis: "Test / Panel Name", medicines: "Key Results / Values" },
  Imaging: { diagnosis: "Findings", medicines: "Body Part / Scan Type" },
  Vaccination: { diagnosis: "Vaccine Name", medicines: "Dose / Batch Info" },
  Consultation: { diagnosis: "Reason for Visit", medicines: "Medicines" },
};

function categoryFieldLabels(category) {
  return CATEGORY_FIELD_LABELS[category] || CATEGORY_FIELD_LABELS.Prescription;
}

// Dot ring color per event kind — lab reports get their own orange tone
// as a permanent category color (matches Dashboard's SafetyAlert palette),
// independent of whether anything on the report actually needs attention.
const dotStyles = {
  lab: "bg-orange-50 text-orange-600 ring-orange-100 ",
  medication: "bg-blue-50 text-blue-600 ring-blue-100 ",
  imaging: "bg-slate-100 text-slate-600 ring-slate-200 ",
  immunization: "bg-slate-100 text-slate-600 ring-slate-200 ",
  consultation: "bg-slate-100 text-slate-600 ring-slate-200 ",
};

const tagStyles = {
  lab: "text-orange-600 ",
  medication: "text-blue-600 ",
  imaging: "text-slate-600 ",
  immunization: "text-slate-600 ",
  consultation: "text-slate-600 ",
};

// "NEEDS ATTENTION" only means one concrete thing: this report has fields
// AI extraction couldn't confidently read that are still blank — matches
// exactly what the detail view's amber "unverified fields" callout shows,
// so opening a flagged report always has something to act on. Being a Lab
// Report on its own is not a reason to flag it — that used to mark every
// lab report as needing attention even when nothing was actually unclear.
function isNotable(event) {
  return Boolean(event.unclearFields && event.unclearFields.length > 0);
}

export default function Timeline() {
  const { profileId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, isAuthenticated, user } = useAuth();
  const targetEmail = location.state?.memberEmail || new URLSearchParams(location.search).get('email') || '';
  const targetUserId = location.state?.patientUserId || new URLSearchParams(location.search).get('userId') || '';
  const [events, setEvents] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // When set, the Upload/Manual Entry modal opens pre-filled for this
  // event and submits an update (PUT) instead of creating a new report.
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsedYears, setCollapsedYears] = useState(() => new Set());

  const availableCategories = useMemo(
    () => ["All Categories", ...new Set(events.map((e) => e.category).filter(Boolean))],
    [events]
  );

  useEffect(() => {
    if (categoryFilter !== "All Categories" && !availableCategories.includes(categoryFilter)) {
      setCategoryFilter("All Categories");
    }
  }, [categoryFilter, availableCategories]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (location.state?.openUpload || params.get('upload') === 'true') {
      setShowUploadModal(true);
    }
  }, [location.search, location.state]);

  const sortEvents = (list) => {
    return [...list].sort((a, b) => {
      const dateA = new Date(a.reportDate || a.date || a.createdAt || a.created_at || null);
      const dateB = new Date(b.reportDate || b.date || b.createdAt || b.created_at || null);
      return dateB - dateA;
    });
  };

  const mapReportToEvent = (report) => {
    const normalizedDate = report.reportDate || report.date || report.createdAt || report.created_at;
    const displayDate = normalizedDate ? new Date(normalizedDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) : 'Undated';

    const category = report.category || 'Consultation';
    const meta = CATEGORY_META[category] || CATEGORY_META.Consultation;

    return {
      id: report.id || `${report.userId}-${normalizedDate}-${Math.random()}`,
      category,
      kind: meta.kind,
      icon: meta.icon,
      title: report.title || `${category} Report`,
      displayDate,
      hospital: report.hospital || '',
      doctor: report.doctor || '',
      diagnosis: report.diagnosis || '',
      medicines: report.medicines || '',
      notes: report.notes,
      analysis: report.analysis || '',
      fileUrl: report.fileUrl || null,
      fileName: report.fileUrl ? report.fileUrl.split('/').pop() : report.fileName || report.file?.name || '',
      // Field names AI extraction couldn't confidently read (illegible
      // handwriting) that the patient also left blank — flagged so a
      // doctor viewing this later knows to check the original document.
      unclearFields: Array.isArray(report.unclearFields) ? report.unclearFields : [],
      reportDate: normalizedDate,
      createdAt: report.createdAt || report.created_at || null,
      updatedAt: report.updatedAt || report.updated_at || null,
      source: report.source || 'api',
    };
  };

  const loadTimelineEvents = async () => {
    if (!isAuthenticated || !token) {
      setEvents([]);
      return;
    }

    setLoading(true);
    try {
      const response = await reportService.getTimelineReports(token, targetEmail, targetUserId);
      const mapped = (response.reports || []).map(mapReportToEvent);
      setEvents(sortEvents(mapped));
    } catch (err) {
      console.error('Failed to load timeline reports:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyMembers = async () => {
    if (!isAuthenticated || !token) {
      setFamilyMembers([]);
      return;
    }

    try {
      const response = await familyService.getFamilyMembers();
      setFamilyMembers(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Failed to load family members:', err);
      setFamilyMembers([]);
    }
  };

  useEffect(() => {
    loadTimelineEvents();
    loadFamilyMembers();
  }, [profileId, isAuthenticated, token, targetEmail, targetUserId]);

  useEffect(() => {
    const handleFamilyMembersUpdated = () => {
      loadFamilyMembers();
    };

    const handleStorageEvent = (event) => {
      if (event.key === 'familyMembersUpdate') {
        loadFamilyMembers();
      }
    };

    window.addEventListener('familyMembersUpdated', handleFamilyMembersUpdated);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('familyMembersUpdated', handleFamilyMembersUpdated);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [isAuthenticated, token]);

  async function handleAddEvent(newEvent) {
    const { file, ...rest } = newEvent;
    const mapped = {
      ...rest,
      reportDate: newEvent.date || newEvent.reportDate || new Date().toISOString(),
      category: newEvent.category || 'Consultation',
      fileUrl: newEvent.fileUrl || null,
      ...(targetUserId ? { userId: targetUserId } : {}),
      ...(targetEmail ? { targetEmail } : {}),
    };

    if (!newEvent?.id || newEvent.id.toString().startsWith('temp-')) {
      try {
        const response = await reportService.createTimelineReport(mapped, token, file);
        const event = mapReportToEvent(response.report);
        setEvents((prev) => sortEvents([event, ...prev]));

        // Best-effort: make the report searchable. The report itself is
        // already saved above regardless of whether this succeeds.
        indexReport(response.report).catch((err) => {
          console.error('Failed to index report for AI search:', err);
        });

        return event;
      } catch (error) {
        console.error('Failed to save manual timeline report:', error);
        throw error;
      }
    }

    setEvents((prev) => sortEvents([mapped, ...prev]));
    return mapped;
  }

  async function handleEditEvent(eventId, updatedFields) {
    const { file, ...rest } = updatedFields;
    const mapped = {
      ...rest,
      reportDate: updatedFields.date || updatedFields.reportDate || new Date().toISOString(),
      category: updatedFields.category || 'Consultation',
      fileUrl: updatedFields.fileUrl || null,
      ...(targetUserId ? { userId: targetUserId } : {}),
      ...(targetEmail ? { targetEmail } : {}),
    };

    try {
      const response = await reportService.updateTimelineReport(eventId, mapped, token, file);
      const event = mapReportToEvent(response.report);
      setEvents((prev) => sortEvents(prev.map((e) => (String(e.id) === String(eventId) ? event : e))));
      setSelectedEvent((prev) => (prev && String(prev.id) === String(eventId) ? event : prev));

      // Best-effort: re-index so search reflects the edited content.
      indexReport(response.report).catch((err) => {
        console.error('Failed to re-index edited report for AI search:', err);
      });

      return event;
    } catch (error) {
      console.error('Failed to update timeline report:', error);
      throw error;
    }
  }

  async function handleDeleteEvent(reportId) {
    try {
      await reportService.deleteTimelineReport(reportId, token, targetUserId, targetEmail);
      setEvents((prev) => prev.filter((event) => String(event.id) !== String(reportId)));
      setSelectedEvent(null);

      // Best-effort: drop it from the search index too.
      removeReportFromIndex(reportId).catch((err) => {
        console.error('Failed to remove report from AI search index:', err);
      });
    } catch (error) {
      console.error('Failed to delete timeline report:', error);
    }
  }

  function toggleYearCollapsed(year) {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (categoryFilter !== "All Categories" && event.category !== categoryFilter) return false;
      if (dateFrom && event.reportDate && new Date(event.reportDate) < new Date(dateFrom)) return false;
      if (dateTo && event.reportDate && new Date(event.reportDate) > new Date(dateTo)) return false;
      return true;
    });
  }, [events, categoryFilter, dateFrom, dateTo]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      <Sidebar onUploadClick={() => setShowUploadModal(true)} onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
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

      <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 ">
              Health Timeline
            </h1>
            <p className="text-slate-500 mt-1">
              {targetEmail ? `Comprehensive history for ${targetEmail}` : 'Comprehensive history of your medical journey'}
              {profileId ? (
                <span className="text-slate-400 "> · profile {profileId}</span>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <button
                type="button"
                onClick={() => navigate('/timeline')}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-semibold ring-2 ring-white transition-transform duration-200 hover:scale-110 ${
                  !targetEmail
                    ? "bg-blue-600 ring-blue-200 text-white"
                    : "bg-slate-100 ring-slate-200 text-slate-500 "
                }`}
                title={!targetEmail ? "Viewing your timeline" : "Me"}
                aria-label="Self timeline"
              >
                Me
              </button>
              {familyMembers
                .filter((member) => {
                  const { email: parsedEmail } = parseMemberNotesAndEmail(member.notes || '');
                  const memberEmail = member.email || parsedEmail || '';
                  const relationship = String(member.relationship || member.relationshipTag || '').trim().toLowerCase();
                  const name = String(member.name || '').trim().toLowerCase();
                  const isSelfRelationship = relationship === 'self' || name === 'self';
                  const isCurrentUser = user?.email ? memberEmail.toLowerCase() !== user.email.toLowerCase() : true;
                  return !isSelfRelationship && isCurrentUser;
                })
                .slice(0, 3)
                .map((member, index) => {
                  const initials = member.name
                    ? member.name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : '?';
                  const { email: parsedEmail } = parseMemberNotesAndEmail(member.notes || '');
                  const memberEmail = member.email || parsedEmail || '';
                  const isActive = memberEmail && memberEmail === targetEmail;

                  return (
                    <button
                      key={member.id || `member-${index}`}
                      type="button"
                      onClick={() => {
                        if (memberEmail) {
                          navigate(`/timeline?email=${encodeURIComponent(memberEmail)}`);
                        } else {
                          navigate('/timeline');
                        }
                      }}
                      className="group"
                      title={member.name || 'Family member'}
                    >
                      <div
                        className={`flex h-9 min-w-[36px] items-center justify-center overflow-hidden rounded-full px-0 text-center text-xs font-medium text-white ring-2 ring-white transition-all duration-200 group-hover:min-w-[140px] group-hover:px-4 ${
                          isActive ? "bg-blue-600" : "bg-slate-400"
                        }`}
                        aria-label={member.name || 'Family member'}
                      >
                        <span className="flex items-center justify-center transition-opacity duration-200 group-hover:opacity-0">
                          {initials}
                        </span>
                        <span className="hidden whitespace-nowrap text-sm font-semibold transition-all duration-200 group-hover:inline-flex">
                          {member.name || 'Family member'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              {familyMembers.length > 3 && (
                <div className="relative group">
                  <div
                    className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-medium flex items-center justify-center ring-2 ring-white transition-transform duration-200 hover:scale-110"
                    aria-label={`${familyMembers.length - 3} more family members`}
                  >
                    +{familyMembers.length - 3}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <FilterBar
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          categories={availableCategories}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
        />

        <TimelineInfographic
          events={filteredEvents}
          loading={loading}
          onSelectEvent={setSelectedEvent}
          collapsedYears={collapsedYears}
          onToggleYear={toggleYearCollapsed}
        />
      </main>
      </div>

      {(showUploadModal || editingEvent) && (
        <UploadReports
          onClose={() => {
            setShowUploadModal(false);
            setEditingEvent(null);
          }}
          onSubmit={
            editingEvent
              ? (fields) => handleEditEvent(editingEvent.id, fields)
              : handleAddEvent
          }
          initialEvent={editingEvent}
          token={token}
        />
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => {
            setEditingEvent(selectedEvent);
            setSelectedEvent(null);
          }}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */
/* Copied from Dashboard.jsx / LabTrends.jsx so all pages share identical behavior. */


function Sidebar({ onUploadClick, onOpenSettings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 h-screen overflow-y-auto px-4 py-6">
      <div className="px-2 mb-8">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, active, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`))) || active;

          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-700 "
                  : "text-slate-600 hover:bg-slate-100 "
              }`}
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
          onClick={onUploadClick}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          <UploadCloud size={18} />
          Upload New Report
        </button>

        <div className="space-y-1 pt-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 "
          >
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 ">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

/* --------------------------- Filter bar --------------------------- */

function FilterBar({ categoryFilter, setCategoryFilter, categories, dateFrom, dateTo, setDateFrom, setDateTo }) {
  const [showDateRange, setShowDateRange] = useState(false);
  const hasDateRange = Boolean(dateFrom || dateTo);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-8 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDateRange((v) => !v)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl transition-all duration-200 ${
              hasDateRange ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600 bg-slate-50 hover:bg-slate-100 "
            }`}
          >
            <span>
              {hasDateRange
                ? `${dateFrom || '...'} → ${dateTo || '...'}`
                : "All dates"}
            </span>
            <ChevronDown size={14} />
          </button>

          {showDateRange && (
            <div className="absolute z-20 top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex flex-col gap-3 w-64">
              <label className="text-xs font-medium text-slate-500 ">
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 "
                />
              </label>
              <label className="text-xs font-medium text-slate-500 ">
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 "
                />
              </label>
              {hasDateRange && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-xs text-slate-500 hover:text-blue-600 self-start"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-slate-200 " />

        {categories.map((category) => {
          const isActive = category === categoryFilter;
          return (
            <button
              key={category}
              onClick={() => setCategoryFilter(category)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all duration-200
                ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 "
                }`}
            >
              {category}
              {isActive && category !== "All Categories" && (
                <X
                  size={13}
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryFilter("All Categories");
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}

/* ----------------------- Timeline infographic ----------------------- */

function groupEventsByYear(events) {
  const groups = new Map();
  for (const event of events) {
    const year = event.reportDate ? new Date(event.reportDate).getFullYear() : "Undated";
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(event);
  }
  // Map preserves insertion order; events arrive pre-sorted newest first,
  // so years come out newest first too.
  return Array.from(groups.entries());
}

// Groups same-day events together so the date label shows once instead of
// repeating per card, and those cards render as one tighter cluster.
function groupEventsByDate(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.reportDate ? new Date(event.reportDate).toDateString() : `undated-${event.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return Array.from(groups.values());
}

function TimelineInfographic({ events, loading, onSelectEvent, collapsedYears, onToggleYear }) {
  if (loading) {
    return <p className="text-slate-400 text-sm py-10 text-center">Loading timeline...</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-10 text-center">
        No entries match this filter yet.
      </p>
    );
  }

  const yearGroups = groupEventsByYear(events);

  return (
    <div className="relative pl-4">
      <div className="flex flex-col gap-6">
        {yearGroups.map(([year, yearEvents]) => {
          const collapsed = collapsedYears.has(year);
          return (
            <div key={year} className="flex flex-col gap-6">
              <YearBadge
                year={year}
                count={yearEvents.length}
                collapsed={collapsed}
                onToggle={() => onToggleYear(year)}
              />

              {!collapsed && (
                <div className="flex flex-col gap-8">
                  {groupEventsByDate(yearEvents).map((dayEvents) => (
                    <DayGroup key={dayEvents[0].id} events={dayEvents} onSelectEvent={onSelectEvent} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearBadge({ year, count, collapsed, onToggle }) {
  return (
    <div className="relative flex items-center gap-5">
      <button
        type="button"
        onClick={onToggle}
        className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white ring-8 ring-slate-50 transition-transform duration-200 hover:scale-110"
        title={collapsed ? `Expand ${year}` : `Collapse ${year}`}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 rounded-2xl bg-blue-700 px-5 py-2.5 text-white shadow-sm transition-all duration-200 hover:bg-blue-800 hover:shadow-md"
      >
        <span className="text-xl font-bold tracking-tight">{year}</span>
        <span className="text-xs font-medium text-blue-100">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </button>
    </div>
  );
}

// One or more events sharing the same exact date. The whole group — date
// label plus every report for that date — sits inside one light-colored
// bounding box, so it reads as a single visual unit on the timeline
// (rather than the date floating loose next to disconnected cards),
// whether it's one report or several sharing that day.
function DayGroup({ events, onSelectEvent }) {
  const isCluster = events.length > 1;

  return (
    <div className="relative z-10 rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-bold text-slate-700 ">{events[0].displayDate}</span>
        {isCluster && (
          <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
            {events.length} entries
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {events.map((event) => {
          const Icon = event.icon;
          const notable = isNotable(event);
          // Same-day cluster: smaller icons since multiple reports share
          // the box. Single-day: full-size icon, matching every other row.
          const iconSize = isCluster ? "w-8 h-8 ring-4" : "w-11 h-11 ring-8";

          return (
            <div key={event.id} className="flex items-center gap-4">
              <div
                className={`relative z-10 ${iconSize} shrink-0 rounded-full flex items-center justify-center ring-slate-50 ${dotStyles[event.kind]}
                  transition-transform duration-300 hover:scale-110 ${
                    notable ? "animate-[pulse_2.5s_ease-in-out_infinite]" : ""
                  }`}
              >
                <Icon size={isCluster ? 14 : 18} />
              </div>
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onSelectEvent(event)}>
                <EventCard event={event} notable={notable} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event, notable }) {
  return (
    <div
      className={`group relative flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-1
        ${notable ? "border-l-4 border-l-orange-500" : "hover:border-blue-100 "}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {notable && (
            <p className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide mb-1.5 ${tagStyles[event.kind]}`}>
              <AlertTriangle size={12} />
              NEEDS ATTENTION
            </p>
          )}
          <h3 className="font-semibold text-slate-900 transition-colors duration-200 group-hover:text-blue-700 ">
            {event.title}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {event.doctor || 'Unknown doctor'}
            {event.hospital ? ` · ${event.hospital}` : ''}
          </p>

          {/* one-line AI summary, sourced from diagnosis for now */}
          {event.diagnosis ? (
            <p className="text-sm text-slate-500 mt-2 flex items-start gap-1.5">
              <Sparkles size={13} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{event.diagnosis}</span>
            </p>
          ) : null}

          {event.analysis ? (
            <p className="text-sm text-slate-500 mt-2 flex items-start gap-1.5">
              <FileText size={13} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{event.analysis}</span>
            </p>
          ) : null}

          {event.unclearFields && event.unclearFields.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 mt-2">
              <span className="leading-none">⚠</span>
              {event.unclearFields.length === 1 ? "1 field" : `${event.unclearFields.length} fields`} unverified — check original document
            </p>
          )}
        </div>

        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shrink-0">
          {event.category}
        </span>
      </div>
    </div>
  );
}

function getPreviewType(fileUrl) {
  if (!fileUrl) return null;
  const lower = String(fileUrl).toLowerCase();
  if (/\.pdf(\?|$)/.test(lower)) return 'pdf';
  if (/\.(png|jpe?g|webp)(\?|$)/.test(lower)) return 'image';
  return null;
}

function getPreviewUrl(fileUrl) {
  if (!fileUrl) return null;
  const apiBase = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

  // If fileUrl is an absolute URL (starts with http/https), use it directly
  try {
    const parsed = new URL(fileUrl);
    return fileUrl;
  } catch (e) {
    // Not a full URL — treat it as a Supabase storage path and request a signed URL
    return `${apiBase}/reports/signed-url?path=${encodeURIComponent(fileUrl)}`;
  }
}

function EventDetails({ event, onClose, onEdit, onDelete }) {
  const formattedDate = event.reportDate
    ? new Date(event.reportDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date';

  // Both createdAt and updatedAt get set on creation too, so only show
  // "Last edited" once updatedAt is meaningfully after createdAt — i.e.
  // the report was actually edited at least once, not just saved.
  const wasEdited =
    event.updatedAt &&
    event.createdAt &&
    new Date(event.updatedAt).getTime() - new Date(event.createdAt).getTime() > 1000;

  const formattedEditedAt = wasEdited
    ? new Date(event.updatedAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600 ">
              {event.category}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900 ">
              {event.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500 ">
              {formattedDate} · {event.hospital || 'Medical Record'}
            </p>
            {formattedEditedAt && (
              <p className="mt-1 text-xs text-slate-400 ">
                Last edited {formattedEditedAt}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 "
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Left: analysis and metadata */}
          <div className="space-y-4">
            {event.unclearFields && event.unclearFields.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
                <div>
                  <p className="font-semibold text-amber-700 ">
                    {event.unclearFields.length === 1 ? "One field" : `${event.unclearFields.length} fields`} unverified
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    AI couldn't confidently read <span className="font-medium">{event.unclearFields.join(', ')}</span> from
                    the uploaded document (usually illegible handwriting), and it wasn't filled in manually either.
                    {event.fileUrl ? " Check the original document below." : " No original document is attached to verify against."}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {event.doctor && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">Doctor</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.doctor}</p>
                </div>
              )}

              {event.category && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">Category</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.category}</p>
                </div>
              )}

              {event.diagnosis && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">{categoryFieldLabels(event.category).diagnosis}</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.diagnosis}</p>
                </div>
              )}

              {event.medicines && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">{categoryFieldLabels(event.category).medicines}</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 whitespace-pre-line">{event.medicines}</p>
                </div>
              )}
            </div>

            {event.analysis ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm text-blue-700 ">PDF / file analysis</p>
                <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{event.analysis}</p>
              </div>
            ) : null}

            {event.notes ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">Notes</p>
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{event.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Right: preview */}
          <div className="space-y-4">
            {event.fileUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 h-full flex flex-col">
                <p className="text-sm text-slate-500 ">Document preview</p>
                {getPreviewType(event.fileUrl) === 'pdf' ? (
                  <iframe
                    src={getPreviewUrl(event.fileUrl)}
                    title="PDF preview"
                    className="mt-3 flex-1 w-full rounded-xl border border-slate-200 "
                    style={{ minHeight: 420 }}
                  />
                ) : getPreviewType(event.fileUrl) === 'image' ? (
                  <img
                    src={getPreviewUrl(event.fileUrl)}
                    alt={event.title || 'Uploaded document'}
                    className="mt-3 max-h-[520px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <p className="mt-3 text-sm text-slate-500 ">Preview not available for this file type.</p>
                )}

                <a
                  href={event.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700 text-sm font-semibold transition-colors hover:bg-blue-100 "
                >
                  <FileText size={16} />
                  View original document
                </a>
              </div>
            ) : event.fileName ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">Attached file</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 break-all">{event.fileName}</p>
                <p className="mt-1 text-xs text-slate-400 ">Original document not stored yet — filename only.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">No document attached</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            Edit Event
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
          >
            Delete Event
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 "
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
