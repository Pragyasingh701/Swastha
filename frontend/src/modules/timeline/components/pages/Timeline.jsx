import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import UploadReports from "../../../reports/components/pages/UploadReports";
import { parseMemberNotesAndEmail } from "../../../family/pages/FamilyMember";
import { useAuth } from "../../../../context/AuthContext";
import * as reportService from "../../../../api/reports";
import * as familyService from "../../../../api/family";
import { indexReport, removeReportFromIndex } from "../../../../api/search";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  UploadCloud,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  X,
  Bell,
  ExternalLink,
  Sparkles,
  FlaskConical,
  ScanLine,
  Syringe,
  FileText,
  AlertTriangle,
} from "lucide-react";

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

// Established app-wide "alert/warning" tone — same orange used by the
// SafetyAlert card on Dashboard.jsx, not an invented severity color.
// Category-based heuristic: only Lab Report entries are flagged notable —
// a diagnosis alone isn't a signal of severity (nearly every prescription
// has one), so that used to over-flag almost the whole timeline.
const NOTABLE_KINDS = new Set(["lab"]);

// Dot ring color per event kind — neutral slate by default, orange only
// for the notable/flagged kinds above (matches Dashboard's SafetyAlert).
const dotStyles = {
  lab: "bg-orange-50 text-orange-600 ring-orange-100",
  medication: "bg-blue-50 text-blue-600 ring-blue-100",
  imaging: "bg-slate-100 text-slate-600 ring-slate-200",
  immunization: "bg-slate-100 text-slate-600 ring-slate-200",
  consultation: "bg-slate-100 text-slate-600 ring-slate-200",
};

const tagStyles = {
  lab: "text-orange-600",
  medication: "text-blue-600",
  imaging: "text-slate-600",
  immunization: "text-slate-600",
  consultation: "text-slate-600",
};

function isNotable(event) {
  return NOTABLE_KINDS.has(event.kind);
}

export default function Timeline() {
  const { profileId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, isAuthenticated, user } = useAuth();
  const targetEmail = location.state?.memberEmail || new URLSearchParams(location.search).get('email') || '';
  const [events, setEvents] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // When set, the Upload/Manual Entry modal opens pre-filled for this
  // event and submits an update (PUT) instead of creating a new report.
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const response = await reportService.getTimelineReports(token, targetEmail);
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
  }, [profileId, isAuthenticated, token, targetEmail]);

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
      await reportService.deleteTimelineReport(reportId, token);
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
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar onUploadClick={() => setShowUploadModal(true)} />

      <main className="flex-1 px-6 sm:px-10 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Health Timeline
            </h1>
            <p className="text-slate-500 mt-1">
              {targetEmail ? `Comprehensive history for ${targetEmail}` : 'Comprehensive history of your medical journey'}
              {profileId ? (
                <span className="text-slate-400"> · profile {profileId}</span>
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
                    : "bg-slate-100 ring-slate-200 text-slate-500"
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
            <button className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 transition-all duration-200 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm">
              <Bell size={18} />
            </button>
          </div>
        </header>

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
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */
/* Copied from Dashboard.jsx / LabTrends.jsx so all pages share identical behavior. */

const logo = "data:image/png;base64,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7W9/w5/+9Kd221+0aJGYPXu2O13oFCFEh7/v/fffL1599VVNrg0Yexx3lad/x/LycvHJJ59g4cKFWLNmDZqaXJsz9u7dG1dddRWuu+46DB8+XFp/2vt7d9U555yDVatWudTHju7x9957D7/97W+7/Ptu375dpKSktPn46tWrMXXqVNO+R3Z0f3fVihUrXA6qXaHfPRs6EN89WJfb5fyUJii6+tgi53S5I3n6WZlF2snKav0DpSucp8XpLVwCAJuvvoZbnhanXy+//LLo1auXuOmmm7BgwQKXP9AAwNGjR/Hss89i4MCBuOSSS8S+ffv4LVIH9u7di4cfftjr/k5Gv8+++OKLDn9m+fLlyM/P97rnVmsff/wxvv/+e/7dybRKS0vFE088Ifr27Yt7770XK1ascDlcAoBjx47h+eefx4gRI3DeeeeJ9PR0r3i9PProozhx4oQhflejv0dqSV8zHh3SY00mBQJW6C+Mcbcm08Fcfa0UI20cPljRpf9ObzWXTqUogNWqn+GWNZf0afPmzWLkyJHigQceQHZ2ttvtfffddxg5ciQeeughr/pg0xWvvPIKNm3a5BV/JzPcZxs2bHBp+1NjY6NLQRTJd++996K8vNwrXlPkXb744gsxfPhwPPvssygvL3e7vaVLl2Ls2LG48847Tf96KS0txd133611N9plhvdIrelnxqNjegyZ/BV9hjHuhEwVtQIllZKOpSPDOnG8qtP/jZ7DJQDw9dVPbTGGS/r0+uuvi8mTJyMjI0Nquw6HA//85z8xdepUwZUcbWtqasLtt9+udTdUZ5b7rDOh0eeff65iT6gt2dnZePjhh7XuBpFUv/vd78Q111yDvLw8qe22tLRg3rx5SE1NFceOHTP1e/X333+Pjz76SJe/o1neI7XGgMlFeguZfHUaMAHuhUyH8vT7e5H6DuwrEy2dLPCt93AJ0M/2OIZL+vTYY4+Je++9t1PL6ztr7dq1mDRpErKyskz/waarMjMz8cQTT5j272Om++yrr75y+We3bNmCvXv3mvZ51bP3338fS5Ys4d+eDK+2tlacf/754t1331X1Olu3bsWUKVNw9OhRU79uHn74YeTl5enqdzTTe6TW9JGWGISeTpcL0HHABHT9dLlDeS2YMEjFjpGuHT5U0fn/xhGN8hb9hkuAflYwMVzSn+eee048//zzHrnWsWPH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";

function Sidebar({ onUploadClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 min-h-screen px-4 py-6">
      <div className="px-2 mb-8">
        <img src={logo} alt="Swastha" className="h-14 w-auto" />
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
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
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
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
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
              hasDateRange ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600 bg-slate-50 hover:bg-slate-100"
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
              <label className="text-xs font-medium text-slate-500">
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
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

        <div className="w-px h-5 bg-slate-200" />

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
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
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

      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
          <SlidersHorizontal size={17} />
        </button>
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
      {/* Bold vertical spine connecting every entry top to bottom. */}
      <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-slate-200" />

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

// One or more events sharing the same exact date. The date label sits
// beside the FIRST card's top edge (not centered against the whole
// cluster), and every event still gets its own icon+card row so the icon
// for row N stays aligned with card N's vertical center regardless of how
// tall each card is — icons and cards can't be laid out as two
// independently-spaced columns, since card heights vary with content
// (diagnosis line, unclear-fields warning, etc.) while icons don't.
function DayGroup({ events, onSelectEvent }) {
  const isCluster = events.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {events.map((event, index) => {
        const Icon = event.icon;
        const notable = isNotable(event);
        // Same-day cluster: smaller icons hanging off a sub-timeline
        // border so each entry reads as "part of this day" rather than a
        // full top-level entry. Single-day: full-size icon, matching
        // every other row on the page.
        const iconSize = isCluster ? "w-8 h-8 ring-4" : "w-11 h-11 ring-8";

        return (
          <div key={event.id} className="flex gap-5">
            {/* Date label column — only rendered once, on the first row,
                and top-aligned so it lines up with the top of the FIRST
                card specifically, not centered against the whole group. */}
            <div className="flex flex-col items-center shrink-0 w-11">
              {index === 0 ? (
                <>
                  <span className="text-xs font-semibold text-slate-500 text-center leading-tight">
                    {event.displayDate}
                  </span>
                  {isCluster && (
                    <span className="mt-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                      {events.length} entries
                    </span>
                  )}
                </>
              ) : (
                // Empty spacer keeps every row's left column the same
                // width so the sub-timeline border below stays straight.
                <div aria-hidden="true" />
              )}
            </div>

            <div className={`flex-1 min-w-0 flex items-center gap-4 ${isCluster ? "pl-5 border-l-2 border-slate-100" : ""}`}>
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
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ event, notable }) {
  return (
    <div
      className={`group relative flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-1
        ${notable ? "border-l-4 border-l-orange-500" : "hover:border-blue-100"}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {notable && (
            <p className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide mb-1.5 ${tagStyles[event.kind]}`}>
              <AlertTriangle size={12} />
              NEEDS ATTENTION
            </p>
          )}
          <h3 className="font-semibold text-slate-900 transition-colors duration-200 group-hover:text-blue-700">
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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
              {event.category}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              {event.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {formattedDate} · {event.hospital || 'Medical Record'}
            </p>
            {formattedEditedAt && (
              <p className="mt-1 text-xs text-slate-400">
                Last edited {formattedEditedAt}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
                  <p className="font-semibold text-amber-700">
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
                  <p className="text-sm text-slate-500">Doctor</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{event.doctor}</p>
                </div>
              )}

              {event.category && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Category</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{event.category}</p>
                </div>
              )}

              {event.diagnosis && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Diagnosis</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{event.diagnosis}</p>
                </div>
              )}

              {event.medicines && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Medicines</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{event.medicines}</p>
                </div>
              )}
            </div>

            {event.analysis ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm text-blue-700">PDF / file analysis</p>
                <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{event.analysis}</p>
              </div>
            ) : null}

            {event.notes ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Notes</p>
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{event.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Right: preview */}
          <div className="space-y-4">
            {event.fileUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 h-full flex flex-col">
                <p className="text-sm text-slate-500">Document preview</p>
                {getPreviewType(event.fileUrl) === 'pdf' ? (
                  <iframe
                    src={getPreviewUrl(event.fileUrl)}
                    title="PDF preview"
                    className="mt-3 flex-1 w-full rounded-xl border border-slate-200"
                    style={{ minHeight: 420 }}
                  />
                ) : getPreviewType(event.fileUrl) === 'image' ? (
                  <img
                    src={getPreviewUrl(event.fileUrl)}
                    alt={event.title || 'Uploaded document'}
                    className="mt-3 max-h-[520px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Preview not available for this file type.</p>
                )}

                <a
                  href={event.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700 text-sm font-semibold transition-colors hover:bg-blue-100"
                >
                  <FileText size={16} />
                  View original document
                </a>
              </div>
            ) : event.fileName ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Attached file</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 break-all">{event.fileName}</p>
                <p className="mt-1 text-xs text-slate-400">Original document not stored yet — filename only.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">No document attached</p>
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
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
