import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  PlusCircle,
  Search,
  ShieldCheck,
  FileText,
  History,
  Cloud,
  Sparkles,
  FlaskConical,
  CalendarClock,
  FolderDown,
  SlidersHorizontal,
  Download,
  Lock,
  ArrowUpRight,
  TrendingUp as TrendUpIcon,
} from "lucide-react";

/* -----------------------------------------------------------
   Static nav + vault data.
   Swap for real values fetched from the vault API.
------------------------------------------------------------ */

// Same nav list as Dashboard.jsx / Timeline.jsx / LabTrends.jsx, with Medical Vault active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, active: true, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

const summaryCards = [
  {
    icon: FileText,
    label: "Total Documents",
    value: "142",
    footNote: "+12 this month",
    footTone: "text-emerald-600",
    footIcon: TrendUpIcon,
  },
  {
    icon: History,
    label: "Recent Uploads",
    stack: ["PDF", "JPG", "DICOM"],
    extra: "+8",
    footNote: "Last updated 2 hours ago",
    footTone: "text-slate-400",
  },
  {
    icon: Cloud,
    label: "Vault Storage",
    value: "4.2",
    unit: "GB used",
    total: "of 10 GB",
    progress: 42,
  },
];

const categories = [
  { icon: ClipboardList, title: "Prescriptions", meta: "42 Items · 12MB" },
  { icon: FlaskConical, title: "Lab Reports", meta: "58 Items · 850MB" },
  { icon: CalendarClock, title: "Scans & Imaging", meta: "12 Items · 3.2GB" },
  { icon: FolderDown, title: "Discharge Summaries", meta: "8 Items · 45MB" },
];

const recentDocs = [
  {
    icon: FileText,
    name: "Annual_Blood_Work_2024.pdf",
    source: "Quest Diagnostics",
    type: "Lab Report",
    typeTone: "bg-blue-50 text-blue-600",
    date: "Oct 14, 2024",
    action: "AI Summary",
    actionStyle: "primary",
  },
  {
    icon: FolderDown,
    name: "MRI_Lower_Lumbar.dicom",
    source: "City Radiology Center",
    type: "Scan",
    typeTone: "bg-orange-50 text-orange-600",
    date: "Oct 12, 2024",
    action: "Preview",
    actionStyle: "secondary",
  },
  {
    icon: FileText,
    name: "Cardio_Discharge_Summary.pdf",
    source: "Saint Luke's Hospital",
    type: "Discharge",
    typeTone: "bg-slate-100 text-slate-600",
    date: "Oct 05, 2024",
    action: "AI Summary",
    actionStyle: "primary",
  },
];

export default function MedicalVault() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />

      <main className="flex-1 px-8 py-8">
        <TopBar />
        <SummaryRow />
        <SmartCategorization />
        <RecentActivity />
        <Footer />
      </main>
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */
/* Same shared sidebar used across Dashboard / Timeline / LabTrends. */

function Sidebar() {
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
          onClick={() => navigate("/upload")}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-colors text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          <PlusCircle size={18} />
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

/* ----------------------------- Top bar ----------------------------- */

function TopBar() {
  return (
    <header className="flex items-center gap-4 mb-6">
      <div className="flex-1 relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Search clinical documents, doctor names, or symptoms..."
          className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
        />
      </div>

      <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-2 rounded-full whitespace-nowrap transition-transform duration-200 hover:scale-105">
        <ShieldCheck size={14} />
        HIPAA SECURE
      </span>

      <img
        src="https://i.pravatar.cc/80?img=12"
        alt="User"
        className="w-10 h-10 rounded-full object-cover transition-transform duration-200 hover:scale-110"
      />
    </header>
  );
}

/* --------------------------- Summary cards --------------------------- */

function SummaryRow() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
      {summaryCards.map((card) => (
        <SummaryCard key={card.label} card={card} />
      ))}
    </div>
  );
}

function SummaryCard({ card }) {
  const Icon = card.icon;

  return (
    <div className="group bg-white border border-slate-200 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{card.label}</p>
        <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-50 group-hover:text-blue-600">
          <Icon size={16} />
        </div>
      </div>

      {card.value && !card.unit && (
        <p className="text-3xl font-bold text-slate-900">{card.value}</p>
      )}

      {card.unit && (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900">
            {card.value}
          </span>
          <span className="text-sm text-slate-400">{card.unit}</span>
        </div>
      )}

      {card.stack && (
        <div className="flex items-center -space-x-2 mt-1">
          {card.stack.map((label) => (
            <span
              key={label}
              className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-slate-500 transition-transform duration-200 hover:scale-110 hover:z-10"
            >
              {label.slice(0, 3)}
            </span>
          ))}
          <span className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-white">
            {card.extra}
          </span>
        </div>
      )}

      {card.progress && (
        <div className="mt-3">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${card.progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">{card.total}</p>
        </div>
      )}

      <div className="flex items-center gap-1 mt-3">
        {card.footIcon && (
          <card.footIcon size={12} className={card.footTone} />
        )}
        <p className={`text-xs ${card.footTone}`}>{card.footNote}</p>
      </div>
    </div>
  );
}

/* ----------------------- AI smart categorization ----------------------- */

function SmartCategorization() {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles size={16} className="text-blue-600" />
            AI Smart Categorization
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Documents are automatically tagged and filed using Swastha
            Vision AI.
          </p>
        </div>
        <button className="flex items-center gap-1 text-sm font-medium text-blue-600 transition-all duration-200 hover:gap-2">
          Manage Folders
          <ArrowUpRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map(({ icon: Icon, title, meta }) => (
          <div
            key={title}
            className="group bg-white border border-slate-200 rounded-2xl p-5 min-h-[160px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-200 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:rotate-6">
              <Icon size={18} />
            </div>
            <div>
              <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors duration-200">
                {title}
              </p>
              <p className="text-sm text-slate-400 mt-0.5">{meta}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Recent activity --------------------------- */

function RecentActivity() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-shadow duration-300 hover:shadow-lg">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-slate-900">Recent Activity</h3>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
            <SlidersHorizontal size={16} />
          </button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="pb-3 font-medium">Document Name</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Date Uploaded</th>
              <th className="pb-3 font-medium">Security</th>
              <th className="pb-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {recentDocs.map((doc) => (
              <DocRow key={doc.name} doc={doc} />
            ))}
          </tbody>
        </table>
      </div>

      <button className="w-full text-center text-sm font-medium text-blue-600 mt-5 pt-4 border-t border-slate-100 transition-colors duration-200 hover:text-blue-700">
        View All Documents
      </button>
    </div>
  );
}

function DocRow({ doc }) {
  const Icon = doc.icon;

  return (
    <tr className="group border-b border-slate-50 last:border-0 transition-colors duration-200 hover:bg-slate-50/60">
      <td className="py-4 pr-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110">
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">{doc.name}</p>
            <p className="text-xs text-slate-400">{doc.source}</p>
          </div>
        </div>
      </td>
      <td className="py-4 pr-4">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${doc.typeTone}`}
        >
          {doc.type}
        </span>
      </td>
      <td className="py-4 pr-4 text-slate-500 whitespace-nowrap">
        {doc.date}
      </td>
      <td className="py-4 pr-4">
        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium whitespace-nowrap">
          <Lock size={12} />
          AES-256
        </span>
      </td>
      <td className="py-4 text-right">
        <button
          className={`text-xs font-semibold px-3.5 py-2 rounded-lg whitespace-nowrap transition-all duration-200 ${
            doc.actionStyle === "primary"
              ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {doc.action}
        </button>
      </td>
    </tr>
  );
}

/* -------------------------------- Footer -------------------------------- */

function Footer() {
  return (
    <footer className="mt-10 pt-8 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h5 className="text-lg font-bold text-blue-700 mb-2">Swastha</h5>
          <p className="text-sm text-slate-500 leading-relaxed">
            Secure AI-driven health data management. HIPAA, GDPR, and ABHA
            compliant medical vault for patient and practitioner
            collaboration.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            © 2024 Swastha Healthcare SaaS. HIPAA &amp; ABHA Compliant.
          </p>
        </div>

        <FooterColumn
          title="Resources"
          links={["Privacy Policy", "Terms of Service", "Security Architecture"]}
        />
        <FooterColumn
          title="Support"
          links={["Contact Support", "Documentation", "API Status"]}
        />
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h6 className="text-xs font-semibold text-slate-800 tracking-wide mb-3">
        {title.toUpperCase()}
      </h6>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link}>
            <a
              href="#"
              className="text-sm text-slate-500 transition-colors duration-200 hover:text-blue-600"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}