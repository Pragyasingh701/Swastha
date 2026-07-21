import React from "react";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Search,
  Bell,
  Settings,
  HelpCircle,
  PlusCircle,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ---- Mock data (swap with real API data later) ----
const hba1cData = [
  { month: "Jan", value: 6.9 },
  { month: "Feb", value: 6.7 },
  { month: "Mar", value: 6.5 },
  { month: "Apr", value: 6.6 },
  { month: "May", value: 6.5 },
  { month: "Jun", value: 6.8 },
];

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, active: true },
  { label: "Health Timeline", icon: TrendingUp },
  { label: "Medical Vault", icon: Folder },
  { label: "Family Records", icon: Users },
  { label: "Medicine Safety", icon: ClipboardList },
  { label: "Lab Insights", icon: TrendingUp },
];

const recentUploads = [
  {
    icon: FileText,
    title: "Complete Blood Count (CBC)",
    subtitle: "Apollo Diagnostics • Oct 12, 2024",
    status: "AI Processed",
  },
  {
    icon: ClipboardList,
    title: "Cardiology Prescription",
    subtitle: "Dr. Sarah Williams • Oct 10, 2024",
    status: "AI Processed",
  },
];

const medications = [
  {
    name: "Telmisartan 40mg",
    schedule: "Daily • After Breakfast",
    color: "bg-blue-600",
  },
  {
    name: "Metformin 500mg",
    schedule: "Twice Daily • With Meals",
    color: "bg-orange-500",
  },
];

const statCards = [
  {
    icon: FileText,
    tag: "+3 this week",
    value: "24",
    label: "Total Reports",
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    icon: Users,
    tag: null,
    value: "4",
    label: "Family Members",
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    icon: AlertTriangle,
    tag: "Action Required",
    tagColor: "text-orange-600",
    value: "2",
    label: "Medicine Alerts",
    iconBg: "bg-orange-50 text-orange-600",
  },
  {
    icon: ClipboardList,
    tag: "In 2 days",
    value: "1",
    label: "Upcoming Checkups",
    iconBg: "bg-blue-50 text-blue-600",
  },
];

function Sidebar() {
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
        {navItems.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="space-y-3 pt-4">
        <button className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-colors text-white text-sm font-semibold py-2.5 rounded-lg">
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

function Header() {
  return (
    <header className="flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white">
      <div className="flex-1 relative max-w-xl">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Search medical history, labs, or insights..."
          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <button className="relative p-2 rounded-lg hover:bg-slate-100">
        <Bell size={20} className="text-slate-600" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
      </button>

      <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-slate-800">
            Dr. Arjun Mehta
          </p>
          <p className="text-xs text-slate-400">Personal Health Profile</p>
        </div>
        <img
          src="https://i.pravatar.cc/80?img=12"
          alt="Dr. Arjun Mehta"
          className="w-9 h-9 rounded-full object-cover"
        />
      </div>
    </header>
  );
}

function StatCard({ icon: Icon, tag, tagColor, value, label, iconBg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon size={18} />
        </div>
        {tag && (
          <span className={`text-xs font-medium ${tagColor || "text-slate-400"}`}>
            {tag}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function Hba1cChart() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            HbA1c Lab Trends
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Clinical tracking over last 6 months
          </p>
        </div>
        <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full">
          Normal Range
        </span>
      </div>

      <div className="h-56 mt-4 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={hba1cData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#2563eb" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-3 bg-slate-50 rounded-lg p-4 mt-2">
        <Sparkles size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">AI Observation: </span>
          Your HbA1c has decreased by 0.4% since last quarter. This indicates
          excellent glycemic control through your recent dietary changes.
        </p>
      </div>
    </div>
  );
}

function SafetyAlert() {
  return (
    <div className="bg-orange-50 border border-orange-100 rounded-xl p-5">
      <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold mb-3">
        <AlertTriangle size={16} />
        SAFETY INTERACTION ALERT
      </div>
      <h4 className="text-lg font-bold text-slate-900 mb-2">
        Metformin + Grapefruit Juice
      </h4>
      <p className="text-sm text-slate-600 mb-4">
        High risk of interaction detected in your last prescription.
        Grapefruit juice may increase drug concentration in your bloodstream.
      </p>
      <div className="flex items-center gap-2">
        <button className="flex-1 bg-orange-600 hover:bg-orange-700 transition-colors text-white text-sm font-semibold py-2.5 rounded-lg">
          Talk to Pharmacist
        </button>
        <button className="w-10 h-10 flex items-center justify-center rounded-lg border border-orange-200 text-orange-500 bg-white">
          i
        </button>
      </div>
    </div>
  );
}

function RecentUploads() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Recent Uploads
        </h3>
        <button className="text-sm font-medium text-blue-600 hover:underline">
          View All
        </button>
      </div>

      <div className="space-y-3">
        {recentUploads.map(({ icon: Icon, title, subtitle, status }) => (
          <div
            key={title}
            className="flex items-center gap-4 border border-slate-100 rounded-lg p-4 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {title}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            </div>
            <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full whitespace-nowrap">
              {status}
            </span>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentMedications() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900">
          Current Medications
        </h3>
        <button className="text-xs font-semibold text-blue-600 hover:underline">
          REFILL ALL
        </button>
      </div>

      <div className="space-y-3">
        {medications.map(({ name, schedule, color }) => (
          <div key={name} className="flex items-center gap-3">
            <span className={`w-1.5 h-10 rounded-full ${color}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{schedule}</p>
            </div>
            <span className="w-5 h-5 rounded-full border-2 border-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DietaryInsight() {
  return (
    <div
      className="relative rounded-xl overflow-hidden p-5 min-h-[180px] flex flex-col justify-end text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.75)), url('https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=800&auto=format&fit=crop')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <p className="text-[10px] tracking-widest font-semibold text-blue-200 mb-1">
        DIETARY AI INSIGHT
      </p>
      <h4 className="text-lg font-bold leading-snug mb-3">
        Improve your glucose levels naturally.
      </h4>
      <button className="self-start bg-white text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
        Get Plan
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 lg:px-8 py-10 mt-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <h5 className="text-lg font-bold text-blue-700 mb-2">Swastha</h5>
          <p className="text-sm text-slate-500 leading-relaxed">
            The future of clinical intelligence, empowering patients and
            doctors through AI-driven insights.
          </p>
        </div>
        <div>
          <h6 className="text-sm font-semibold text-slate-800 mb-3">
            Privacy &amp; Security
          </h6>
          <ul className="space-y-2 text-sm text-slate-500">
            <li>Privacy Policy</li>
            <li>Terms of Service</li>
            <li>Security Architecture</li>
          </ul>
        </div>
        <div>
          <h6 className="text-sm font-semibold text-slate-800 mb-3">
            Resources
          </h6>
          <ul className="space-y-2 text-sm text-slate-500">
            <li>ABHA Guide</li>
            <li>Clinical Papers</li>
            <li>Contact Support</li>
          </ul>
        </div>
        <div>
          <h6 className="text-sm font-semibold text-slate-800 mb-3">
            Compliance
          </h6>
          <div className="flex gap-2">
            <span className="text-xs font-medium border border-slate-200 rounded-md px-2 py-1 text-slate-500">
              HIPAA
            </span>
            <span className="text-xs font-medium border border-slate-200 rounded-md px-2 py-1 text-slate-500">
              ISO 27001
            </span>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 mt-10">
        © 2024 Swastha Healthcare SaaS. HIPAA &amp; ABHA Compliant.
      </p>
    </footer>
  );
}

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Welcome back, Arjun
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Your clinical intelligence overview for today.
              </p>
            </div>
            <span className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-2 rounded-lg">
              <ShieldCheck size={16} />
              ABHA Synced
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <Hba1cChart />
              <RecentUploads />
            </div>

            <div className="space-y-6">
              <SafetyAlert />
              <CurrentMedications />
              <DietaryInsight />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}