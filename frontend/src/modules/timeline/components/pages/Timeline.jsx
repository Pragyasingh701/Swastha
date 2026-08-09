import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import UploadReports from "../../../reports/components/pages/UploadReports";
import { parseMemberNotesAndEmail } from "../../../family/pages/FamilyMember";
import { useAuth } from "../../../../context/AuthContext";
import * as reportService from "../../../../api/reports";
import * as familyService from "../../../../api/family";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  UploadCloud,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  Bell,
  Paperclip,
  MessageSquare,
  Download,
  Sparkles,
  FlaskConical,
  ScanLine,
  Syringe,
  FileText,
  CheckCircle2,
} from "lucide-react";

/* -----------------------------------------------------------
   Static nav + timeline data.
   Swap `timelineEvents` for real data fetched by profileId.
------------------------------------------------------------ */

// Same nav list as Dashboard.jsx / LabTrends.jsx, with Health Timeline active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, active: true, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
];

const FILTERS = ["All Members"];

// Categories a user can pick when uploading a new report manually.
const UPLOAD_CATEGORIES = [
  { value: "Lab Reports", icon: FlaskConical, kind: "upload" },
  { value: "Prescriptions", icon: ClipboardList, kind: "medication" },
  { value: "MRI/Scans", icon: ScanLine, kind: "imaging" },
  { value: "Immunizations", icon: Syringe, kind: "upload" },
];

const timelineEvents = [
  {
    id: "evt-1",
    category: "Lab Reports",
    kind: "alert",
    icon: FlaskConical,
    tag: "ACTION REQUIRED",
    tagTone: "danger",
    title: "Blood Test (Apollo Hospitals)",
    meta: "Aug 14, 2024 · Diagnostic Panel #402",
    accent: true,
    stat: { label: "HbA1c: 6.8%", sub: "Above target range (4.0 - 5.6%)" },
    footer: [
      { icon: Paperclip, text: "2 PDF Files" },
      { icon: MessageSquare, text: "AI Summary Ready" },
    ],
  },
  {
    id: "evt-2",
    category: "Prescriptions",
    kind: "medication",
    icon: ClipboardList,
    tag: "ACTIVE MEDICATION",
    tagTone: "info",
    title: "Prescription (Dr. Mehta)",
    meta: "Jul 20, 2024 · Endocrine Specialist",
    rightTitle: "Metformin 500mg",
    rightSub: "Twice Daily (Post Meals)",
  },
  {
    id: "evt-3",
    category: "MRI/Scans",
    kind: "imaging",
    icon: ScanLine,
    tag: "IMAGING",
    tagTone: "neutral",
    title: "MRI Scan (Radiology Plus)",
    meta: "Jun 15, 2024 · Knee Assessment (Right)",
    image: true,
    chips: ["Bone Health", "Soft Tissue"],
    aiNote:
      "Your HbA1c is showing a rising trend over the last 3 months. Shall I prepare a summary for Dr. Mehta?",
  },
  {
    id: "evt-4",
    category: "Immunizations",
    kind: "immunization",
    icon: Syringe,
    tag: "IMMUNIZATION",
    tagTone: "danger",
    title: "Vaccination – Flu Shot",
    meta: "May 02, 2024 · Family Physician",
    rightBadge: "Valid",
  },
];

const tagStyles = {
  danger: "text-red-600",
  info: "text-blue-600",
  neutral: "text-slate-700",
  upload: "text-indigo-600",
};

const dotStyles = {
  alert: "bg-red-50 text-red-500 ring-red-100",
  medication: "bg-blue-50 text-blue-500 ring-blue-100",
  imaging: "bg-slate-100 text-slate-600 ring-slate-200",
  immunization: "bg-red-50 text-red-500 ring-red-100",
  upload: "bg-indigo-50 text-indigo-500 ring-indigo-100",
};

export default function Timeline() {
  const { profileId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const targetEmail = location.state?.memberEmail || new URLSearchParams(location.search).get('email') || '';
  const [activeFilter, setActiveFilter] = useState("All Members");
  const [events, setEvents] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);

  const manualCategoryFilters = [
    ...new Set(
      events
        .filter((event) => event.source === 'manual')
        .map((event) => event.category)
        .filter(Boolean)
    ),
  ];

  const availableFilters = ["All Members", ...manualCategoryFilters];

  useEffect(() => {
    if (activeFilter !== "All Members" && !availableFilters.includes(activeFilter)) {
      setActiveFilter("All Members");
    }
  }, [activeFilter, availableFilters]);

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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) : 'Unknown date';

    const category = report.category || 'Consultation';
    const kindMap = {
      'Prescription': 'medication',
      'Prescriptions': 'medication',
      'Lab Report': 'alert',
      'Lab Reports': 'alert',
      'Imaging': 'imaging',
      'MRI/Scans': 'imaging',
      'Vaccination': 'immunization',
      'Immunizations': 'immunization',
    };

    const iconMap = {
      'Prescription': ClipboardList,
      'Prescriptions': ClipboardList,
      'Lab Report': FlaskConical,
      'Lab Reports': FlaskConical,
      'Imaging': ScanLine,
      'MRI/Scans': ScanLine,
      'Vaccination': Syringe,
      'Immunizations': Syringe,
      'Consultation': FileText,
    };

    const tagTone = {
      medication: 'info',
      alert: 'danger',
      imaging: 'neutral',
      immunization: 'neutral',
      upload: 'info',
    }[kindMap[category] || 'info'];

    const icon = iconMap[category] || FileText;
    const kind = kindMap[category] || 'upload';

    return {
      id: report.id || `${report.userId}-${normalizedDate}-${Math.random()}`,
      category,
      kind,
      icon,
      tag: category.toUpperCase(),
      tagTone,
      title: report.title || `${category} Report`,
      meta: `${displayDate} · ${report.hospital || 'Medical Record'}`,
      hospital: report.hospital || '',
      doctor: report.doctor || '',
      diagnosis: report.diagnosis || '',
      medicines: report.medicines || '',
      notes: report.notes,
      fileName: report.fileUrl ? report.fileUrl.split('/').pop() : report.fileName || report.file?.name || '',
      rightTitle: report.doctor || '',
      rightSub: `${report.medicines ? report.medicines : report.diagnosis || ''}`,
      stat: report.diagnosis ? { label: report.diagnosis, sub: report.medicines || '' } : undefined,
      reportDate: normalizedDate,
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
      fileUrl: file?.name || newEvent.fileUrl || null,
    };

    if (!newEvent?.id || newEvent.id.toString().startsWith('temp-')) {
      try {
        const response = await reportService.createTimelineReport(mapped, token);
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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar onUploadClick={() => setShowUploadModal(true)} />

      <main className="flex-1 px-10 py-8">
        <header className="flex items-start justify-between mb-6">
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
              {familyMembers.slice(0, 3).map((member, index) => {
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
                      className="flex h-9 min-w-[36px] items-center justify-center overflow-hidden rounded-full bg-blue-600 px-0 text-center text-xs font-medium text-white ring-2 ring-white transition-all duration-200 group-hover:min-w-[140px] group-hover:px-4"
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

        <FilterBar activeFilter={activeFilter} setActiveFilter={setActiveFilter} filters={availableFilters} />

        <TimelineList activeFilter={activeFilter} events={events} loading={loading} onSelectEvent={setSelectedEvent} />
      </main>

      {showUploadModal && (
        <UploadReports
          onClose={() => setShowUploadModal(false)}
          onSubmit={handleAddEvent}
        />
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
        />
      )}
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */
/* Copied from Dashboard.jsx / LabTrends.jsx so all pages share identical behavior. */

function Sidebar({ onUploadClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 min-h-screen px-4 py-6">
      <div className="px-2 mb-8">
        <h1 className="text-xl font-bold text-blue-700 leading-tight">
          Swastha AI
        </h1>
        <p className="text-[10px] tracking-widest text-slate-400 font-medium mt-0.5">
          CLINICAL INTELLIGENCE
        </p>
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

function FilterBar({ activeFilter, setActiveFilter, filters = ["All Members"] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-8 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-slate-100">
          <span>Aug 2023 - Aug 2024</span>
          <ChevronDown size={14} />
        </button>

        <div className="w-px h-5 bg-slate-200" />

        {filters.map((filter) => {
          const isActive = filter === activeFilter;
          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all duration-200
                ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
            >
              {filter}
              {isActive && filter !== "All Members" && (
                <X
                  size={13}
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilter("All Members");
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
          <Search size={17} />
        </button>
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
          <SlidersHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------- Timeline list -------------------------- */

function TimelineList({ activeFilter, events, loading, onSelectEvent }) {
  const filteredEvents =
    !activeFilter || activeFilter === "All Members"
      ? events
      : events.filter((event) => event.category === activeFilter);

  return (
    <div className="relative pl-4">
      <div className="absolute left-[27px] top-2 bottom-2 border-l-2 border-dashed border-slate-200" />

      {loading ? (
        <p className="text-slate-400 text-sm py-10 text-center">Loading timeline...</p>
      ) : filteredEvents.length === 0 ? (
        <p className="text-slate-400 text-sm py-10 text-center">
          No entries match this filter yet.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {filteredEvents.map((event) => (
            <TimelineRow key={event.id} event={event} onSelect={() => onSelectEvent(event)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event, onSelect }) {
  const Icon = event.icon;

  return (
    <div className="relative flex gap-5">
      {/* dot */}
      <div
        className={`relative z-10 w-11 h-11 shrink-0 rounded-full flex items-center justify-center ring-8 ring-slate-50 ${dotStyles[event.kind]}
          transition-transform duration-300 hover:scale-110 ${
            event.kind === "alert" ? "animate-[pulse_2.5s_ease-in-out_infinite]" : ""
          }`}
      >
        <Icon size={18} />
      </div>

      <button type="button" className="w-full text-left" onClick={onSelect}>
        <EventCard event={event} />
      </button>
    </div>
  );
}

function EventCard({ event }) {
  const isAccent = event.accent;

  return (
    <div
      className={`group relative flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-1
        ${isAccent ? "border-l-4 border-l-red-500" : "hover:border-blue-100"}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold tracking-wide mb-1.5 ${tagStyles[event.tagTone]}`}
          >
            {event.tag}
          </p>
          <h3 className="font-semibold text-slate-900 transition-colors duration-200 group-hover:text-blue-700">
            {event.title}
          </h3>
          <p className="text-sm text-slate-400 mt-1">{event.meta}</p>

          {event.chips && (
            <div className="flex gap-2 mt-3">
              {event.chips.map((chip) => (
                <span
                  key={chip}
                  className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-600"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* details section */}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        {event.category && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
            {event.category}
          </span>
        )}
        {event.fileName && (
          <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs text-slate-500">
            {event.fileName}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-[0.24em]">Doctor</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{event.doctor || 'Unknown'}</p>
          {event.hospital && (
            <p className="mt-1 text-xs text-slate-500">{event.hospital}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-[0.24em]">Summary</p>
          {event.diagnosis ? (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-900">{event.diagnosis}</p>
              {event.medicines && (
                <p className="mt-1 text-xs text-slate-500">{event.medicines}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No additional summary available.</p>
          )}
        </div>
      </div>

      {event.notes && (
        <p className="mt-4 text-sm leading-6 text-slate-500 line-clamp-2">
          {event.notes}
        </p>
      )}

      {event.image && (
        <div className="mt-4 relative">
          <div className="w-full h-40 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.01]">
            <ScanLine size={40} className="text-slate-400" />
          </div>

          {event.aiNote && (
            <div className="absolute -bottom-6 right-4 max-w-xs bg-white border border-blue-100 rounded-2xl shadow-md p-4 transition-all duration-300 group-hover:shadow-lg group-hover:-translate-y-1">
              <p className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold mb-1.5">
                <Sparkles size={13} />
                Swastha Intelligence
              </p>
              <p className="text-sm text-slate-600 leading-snug">
                {event.aiNote}
              </p>
            </div>
          )}
        </div>
      )}

      {event.footer && (
        <div className="flex items-center gap-5 mt-4 pt-4 border-t border-slate-50">
          {event.footer.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors duration-200 hover:text-blue-600"
            >
              <Icon size={14} />
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EventDetails({ event, onClose, onDelete }) {
  const formattedDate = event.reportDate
    ? new Date(event.reportDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
              {event.category || event.tag}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              {event.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {formattedDate} · {event.hospital || 'Medical Record'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

        {event.fileName ? (
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Attached File</p>
            <p className="mt-2 text-sm font-semibold text-slate-900 break-all">{event.fileName}</p>
          </div>
        ) : null}

        {event.notes ? (
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Notes</p>
            <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{event.notes}</p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
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

