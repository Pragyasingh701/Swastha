import React, { useEffect, useMemo, useState } from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import {
  Users,
  Video,
  Activity,
  UserPlus,
  FileCheck2,
  Trophy,
} from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import { useAuth } from "../../../context/AuthContext";
import { getDoctorPatients } from "../../../services/doctorPatients";
import { getTimelineReports } from "../../../api/reports";
import CheckInCodeCard from "../components/CheckInCodeCard";

/* -----------------------------------------------------------
   Sidebar nav — Appointments, Consultations, and Schedule
   removed per request.

   Every number on this page is derived from real data:
   - patients: getDoctorPatients() (accepted doctor-patient links)
   - reports: getTimelineReports() per accepted patient, aggregated

   There is no backend concept (yet) of scheduled appointments, a
   report-review queue, or patient satisfaction ratings, so those
   cards were removed rather than filled with placeholder numbers.
------------------------------------------------------------ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function useDoctorDashboardData() {
  const { token, user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const linkedPatients = await getDoctorPatients();
        const acceptedPatients = linkedPatients.filter(
          (p) => (p.linkStatus || "accepted") === "accepted"
        );

        const reportLists = await Promise.all(
          acceptedPatients.map((patient) => {
            const patientUserId =
              patient.patientUserId || patient.patientId || patient.id;
            return getTimelineReports(token, patient.email || "", patientUserId)
              .then((res) => res.reports || [])
              .catch(() => []);
          })
        );

        if (cancelled) return;
        setPatients(acceptedPatients);
        setReports(reportLists.flat());
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load dashboard data.");
          setPatients([]);
          setReports([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { patients, reports, isLoading, error, doctorName: user?.name };
}

export default function DoctorDashboard() {
  const { patients, reports, isLoading, error, doctorName } =
    useDoctorDashboardData();

  const stats = useMemo(() => computeStats(patients, reports), [patients, reports]);

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <PageHeader doctorName={doctorName} />

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 grid grid-cols-1 gap-8">
              <section>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Overview
                </h3>
                <StatGrid stats={stats} isLoading={isLoading} />
              </section>

              <section>
                <WeeklyActivitySummary stats={stats} isLoading={isLoading} />
              </section>
            </div>

            <section className="lg:col-span-1">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Clinic Check-In
              </h3>
              <CheckInCodeCard />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/* --------------------------- Stat computation --------------------------- */

function computeStats(patients, reports) {
  const now = new Date();
  const today = startOfDay(now);
  const sevenDaysAgo = new Date(today.getTime() - 7 * MS_PER_DAY);
  const fourteenDaysAgo = new Date(today.getTime() - 14 * MS_PER_DAY);

  const reportDate = (r) => new Date(r.createdAt || r.reportDate || 0);

  const reportsThisWeek = reports.filter((r) => reportDate(r) >= sevenDaysAgo).length;
  const reportsPrevWeek = reports.filter((r) => {
    const d = reportDate(r);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  }).length;

  const newPatientsThisWeek = patients.filter((p) => {
    if (!p.linkedAt) return false;
    return new Date(p.linkedAt) >= sevenDaysAgo;
  }).length;

  const prescriptionsThisWeek = reports.filter((r) => {
    const isPrescription = r.category === "Prescription" || r.category === "Prescriptions";
    return isPrescription && reportDate(r) >= sevenDaysAgo;
  }).length;

  return {
    totalPatients: patients.length,
    totalReports: reports.length,
    reportsThisWeek,
    reportsPrevWeek,
    newPatientsThisWeek,
    prescriptionsThisWeek,
  };
}

/* ---------------------------- Sidebar ---------------------------- */

function Sidebar() {
  return <DoctorSidebar />;
}

/* ----------------------------- Top bar ----------------------------- */

function TopBar() {
  return (
    <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white shadow-sm">
      <NotificationBell />
      <ProfileDropdown />
    </header>
  );
}

/* --------------------------- Page header --------------------------- */

function PageHeader({ doctorName }) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const greetingName = doctorName ? `Dr. ${doctorName}` : "Doctor";

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
          Good Morning, {greetingName}
        </h2>
        <p className="text-slate-500 ">
          Here is your clinical overview for today, {today}.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Stat grid --------------------------- */

function StatGrid({ stats, isLoading }) {
  const statCards = [
    {
      icon: Users,
      label: "Total Patients",
      value: isLoading ? "—" : String(stats.totalPatients),
    },
    {
      icon: Video,
      label: "Reports Logged",
      value: isLoading ? "—" : String(stats.totalReports),
      accent: true,
    },
    {
      icon: Activity,
      label: "Reports This Week",
      value: isLoading ? "—" : String(stats.reportsThisWeek),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {statCards.map((card) => (
        <StatCard key={card.label} card={card} />
      ))}
    </div>
  );
}

function StatCard({ card }) {
  const Icon = card.icon;
  return (
    <div
      className={`group relative bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        card.accent ? "ring-1 ring-blue-100" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <Icon size={18} />
        </div>
        {card.badge && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${card.badge.tone}`}
          >
            {card.badge.text}
          </span>
        )}
      </div>
      <h3 className="text-3xl font-bold text-slate-900 leading-none">
        {card.value}
      </h3>
      <p className="text-sm text-slate-500 mt-1.5">{card.label}</p>
    </div>
  );
}

/* --------------------------- Weekly activity --------------------------- */

function WeeklyActivitySummary({ stats, isLoading }) {
  const trendPercent = stats.reportsPrevWeek
    ? Math.round(
        ((stats.reportsThisWeek - stats.reportsPrevWeek) / stats.reportsPrevWeek) * 100
      )
    : null;

  const metrics = [
    {
      icon: FileCheck2,
      value: stats.reportsThisWeek,
      label: "Reports logged",
    },
    {
      icon: UserPlus,
      value: stats.newPatientsThisWeek,
      label: "New patients linked",
    },
    {
      icon: Activity,
      value: stats.prescriptionsThisWeek,
      label: "Prescriptions logged",
    },
  ];

  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-blue-50/60" />

      <div className="relative z-10 flex items-start justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Your Week in Review
            </h3>
            <p className="text-sm text-slate-500">This week</p>
          </div>
        </div>

        {!isLoading && trendPercent !== null && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              trendPercent >= 0
                ? "bg-emerald-50 text-emerald-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {trendPercent >= 0 ? "+" : ""}
            {trendPercent}% reports vs last week
          </span>
        )}
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 transition-colors duration-200 hover:bg-blue-50/50"
          >
            <div className="w-9 h-9 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <Icon size={16} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {isLoading ? "—" : value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
