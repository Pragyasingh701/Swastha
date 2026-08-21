import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ScanLine,
  ShieldCheck,
  Users,
  TrendingUp,
  UploadCloud,
  GitBranch,
  Activity,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Pill,
  MessageCircle,
  Menu,
  X,
  Bot,
} from "lucide-react";
import Logo from "../../../components/Common/Logo";

const capabilities = [
  { icon: ShieldCheck, label: "Verified Doctors" },
  { icon: MessageCircle, label: "Grounded AI Search" },
  { icon: ScanLine, label: "AI Document Extraction" },
  { icon: Users, label: "Family Vault" },
  { icon: TrendingUp, label: "Lab Trend Tracking" },
];

const steps = [
  {
    icon: UploadCloud,
    title: "1. Upload",
    body: "Upload a photo, PDF, or scan of any report, prescription, or lab result.",
  },
  {
    icon: ScanLine,
    title: "2. AI Extraction",
    body: "Our AI reads the document — including handwritten prescriptions — and pulls out lab values, medicines, and diagnoses automatically.",
  },
  {
    icon: GitBranch,
    title: "3. Structuring",
    body: "Records are organized by family member, category, and date, with anything unclear flagged for your review.",
  },
  {
    icon: Activity,
    title: "4. Search & Insights",
    body: "Ask Swastha anything about your health history in plain language, view lab trends, and get AI-generated summaries instantly.",
  },
];

const features = [
  {
    icon: MessageCircle,
    title: "Ask Swastha",
    body: "Ask questions like “What were my HbA1c levels last year?” in plain language and get grounded answers with sources — Swastha understands your entire medical history, not just keywords.",
    span: true,
  },
  {
    icon: ScanLine,
    title: "AI Document Extraction",
    body: "Upload any report or prescription — including handwritten ones — and Swastha extracts lab values, medicines, and diagnoses automatically. Anything unclear is flagged for your review.",
    highlight: true,
  },
  {
    icon: ShieldCheck,
    title: "Verified Doctors",
    body: "Every doctor account is verified against their medical registration certificate using AI before they can access any patient records.",
  },
  {
    icon: TrendingUp,
    title: "Lab Trends",
    body: "Visualize how your health metrics change over time with automatically generated trend charts.",
  },
  {
    icon: Users,
    title: "Family Vault",
    body: "Manage health records for your whole family, and grant secure, consent-based access for adult members via email authorization.",
  },
];

function useInView(options) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // Fail-safe: if IntersectionObserver never fires (unsupported browser, a
    // capture tool that renders without dispatching real scroll events, a
    // race on mount), force content visible anyway — this is decoration, the
    // content itself must never depend on it to appear.
    const fallback = setTimeout(() => setInView(true), 1500);

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return () => clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          clearTimeout(fallback);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px", ...options }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return [ref, inView];
}

function Reveal({ children, delay = 0, className = "" }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: inView ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function TopNav({ navigate }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white/90 backdrop-blur-lg fixed top-0 w-full z-50 border-b border-slate-200">
      <div className="flex justify-between items-center w-full px-6 py-2.5 max-w-7xl mx-auto">
        <Logo className="h-11 w-auto" />
        <nav className="hidden md:flex items-center gap-8">
          <a className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors" href="#features">
            Features
          </a>
          <a className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors" href="#how-it-works">
            How It Works
          </a>
        </nav>
        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => navigate("/register")}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
          >
            Get Started
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          className="md:hidden text-slate-600 p-2 -mr-2"
          aria-label="Toggle navigation menu"
        >
          {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {isMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 flex flex-col gap-4">
          <a className="text-sm font-medium text-slate-600" href="#features" onClick={() => setIsMenuOpen(false)}>
            Features
          </a>
          <a className="text-sm font-medium text-slate-600" href="#how-it-works" onClick={() => setIsMenuOpen(false)}>
            How It Works
          </a>
          <button onClick={() => navigate("/login")} className="text-left text-sm font-medium text-slate-600">
            Login
          </button>
          <button
            onClick={() => navigate("/register")}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Get Started
          </button>
        </div>
      )}
    </header>
  );
}

function FloatingBadge({ icon: Icon, label, className, delay }) {
  return (
    <div
      className={`hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-white shadow-lg border border-slate-100 animate-float-slow ${className}`}
      style={{ animationDelay: delay }}
    >
      <Icon size={15} className="text-blue-700" />
      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{label}</span>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative py-6">
      {/* Ambient gradient blobs — subtle, not the focal point */}
      <div className="absolute -z-10 -top-10 -right-6 w-64 h-64 bg-blue-200/25 rounded-full blur-3xl animate-blob" />
      <div
        className="absolute -z-10 bottom-0 -left-10 w-64 h-64 bg-blue-100/40 rounded-full blur-3xl animate-blob"
        style={{ animationDelay: "3s" }}
      />

      <FloatingBadge icon={ShieldCheck} label="Verified Doctors" className="absolute -top-4 -left-6 z-20" delay="0s" />

      {/* Secondary card: lab trend sparkline */}
      <div className="absolute top-10 -right-6 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl p-4 rotate-6 animate-float">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500">HbA1c Trend</span>
          <span className="text-xs font-bold text-blue-700">5.8%</span>
        </div>
        <svg viewBox="0 0 120 40" className="w-full h-10" fill="none">
          <defs>
            <linearGradient id="sparkline-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <path
            d="M2,32 C18,30 28,26 40,22 C55,17 65,10 80,8 C95,6 105,4 118,2"
            stroke="url(#sparkline-grad)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="118" cy="2" r="3.5" fill="#1d4ed8" className="animate-pulse" />
        </svg>
      </div>

      {/* Primary card: Ask Swastha preview */}
      <div className="relative rounded-2xl bg-white border border-slate-200 shadow-2xl p-5 max-w-md">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center text-white shrink-0">
            <Bot size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Ask Swastha</p>
            <p className="text-xs text-slate-500">Grounded AI search across your records</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            AI
          </span>
        </div>

        <div className="space-y-3">
          <div className="ml-auto max-w-[85%] bg-slate-100 text-slate-700 text-sm rounded-2xl rounded-tr-sm px-4 py-2.5">
            What were my HbA1c levels last year?
          </div>
          <div className="max-w-[92%] bg-blue-50 border border-blue-100 text-slate-800 text-sm rounded-2xl rounded-tl-sm px-4 py-3">
            Your HbA1c improved from 6.4% to 5.8% between Jan–Dec 2025, based on 3 lab reports.
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <FileText size={13} />
              View sources (3)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-white text-slate-900">
      <TopNav navigate={navigate} />

      <main className="pt-20">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-6 pb-16 lg:pt-10 lg:pb-20 max-w-7xl mx-auto">
          <div className="absolute -z-10 top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-br from-blue-50 to-transparent rounded-full blur-3xl opacity-60" />
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-7 text-slate-900">
                Your Family&apos;s Health Records.{" "}
                <span className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent">
                  Organized. Intelligent.
                </span>{" "}
                Always Accessible.
              </h1>
              <p className="text-xl text-slate-600 mb-10 max-w-xl mx-auto lg:mx-0">
                Stop hunting through scattered PDFs, photos, and old folders. Swastha uses AI to
                digitize, structure, and organize your family&apos;s medical history — searchable
                in seconds.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => navigate("/register")}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-4 rounded-lg font-semibold text-base transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  Get Started Free
                  <ArrowRight size={18} />
                </button>
                <a
                  href="#how-it-works"
                  className="bg-white border border-slate-200 text-slate-700 px-8 py-4 rounded-lg font-semibold text-base hover:bg-slate-50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                >
                  See How It Works
                </a>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* Capability strip */}
        <section className="bg-slate-50 py-12 border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-4">
              {capabilities.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <Icon size={17} className="text-blue-700" />
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Problem vs Solution */}
        <section className="py-14 lg:py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <Reveal className="text-center mb-12">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 mb-3">Why Swastha</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
                Reimagining Your Medical History
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                From chaotic digital clutter to a structured, searchable timeline.
              </p>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
              {/* Problem Card */}
              <Reveal className="p-8 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="mb-6 inline-flex p-3.5 rounded-xl bg-slate-900 text-white">
                  <AlertTriangle size={22} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">The Digital Mess</h3>
                <p className="text-slate-600 mb-8 text-base">
                  Reports scattered across email attachments, phone galleries, and paper files.
                  Finding a prescription from 6 months ago is impossible during emergencies.
                </p>
                <div className="space-y-3 opacity-60">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                    <ImageIcon size={18} className="text-slate-400" />
                    <div className="flex-1 h-3 bg-slate-100 rounded-full" />
                    <span className="text-xs font-mono text-slate-400">IMG_2481.jpg</span>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                    <FileText size={18} className="text-red-400" />
                    <div className="flex-1 h-3 bg-slate-100 rounded-full" />
                    <span className="text-xs font-mono text-slate-400">Report_Final_v2.pdf</span>
                  </div>
                </div>
              </Reveal>
              {/* Solution Card */}
              <Reveal
                delay={150}
                className="p-8 rounded-2xl bg-white border border-blue-200 shadow-xl relative overflow-hidden"
              >
                <div className="absolute -z-10 -top-16 -right-16 w-56 h-56 bg-blue-50 rounded-full blur-3xl" />
                <div className="absolute top-0 right-0 p-4">
                  <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                    AI ACTIVE
                  </div>
                </div>
                <div className="mb-6 inline-flex p-3.5 rounded-xl bg-blue-700 text-white">
                  <CheckCircle2 size={22} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">The Swastha Timeline</h3>
                <p className="text-slate-600 mb-8 text-base">
                  AI extracts every lab value and medicine name, creating a searchable, structured
                  health record for your whole family.
                </p>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-700 flex items-center justify-center text-white shrink-0">
                      <Activity size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">Lab Trend: HbA1c</p>
                      <p className="text-xs text-slate-500">Improving trend over 12 months</p>
                    </div>
                    <span className="text-blue-700 font-bold">5.8%</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                      <Pill size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">Active Medication</p>
                      <p className="text-xs text-slate-500">Metformin 500mg • Daily</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="relative overflow-hidden bg-slate-50 py-14 lg:py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <Reveal className="max-w-xl mb-12">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 mb-3">The Process</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">How It Works</h2>
              <p className="text-lg text-slate-600">
                From messy documents to a searchable medical history in four simple steps.
              </p>
            </Reveal>
            <div className="grid md:grid-cols-4 gap-8 relative">
              <div className="hidden md:block absolute top-10 left-0 w-full h-px bg-slate-200 -z-0" />
              {steps.map(({ icon: Icon, title, body }, i) => (
                <Reveal
                  key={title}
                  delay={i * 100}
                  className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left"
                >
                  <div className="w-16 h-16 bg-white shadow-sm border border-slate-200 rounded-2xl flex items-center justify-center mb-6 text-blue-700">
                    <Icon size={24} />
                  </div>
                  <h4 className="font-bold text-lg mb-2 text-slate-900">{title}</h4>
                  <p className="text-sm text-slate-600">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section id="features" className="py-14 lg:py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <Reveal className="text-center mb-12">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 mb-3">Capabilities</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
                Smarter Healthcare for Modern Families
              </h2>
              <p className="text-lg text-slate-600">Real AI features built for reliability and speed.</p>
            </Reveal>
            <div className="grid md:grid-cols-3 gap-5">
              {features.map(({ icon: Icon, title, body, span, highlight }, i) => (
                <Reveal
                  key={title}
                  delay={i * 80}
                  className={`p-8 rounded-2xl border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                    span ? "md:col-span-2" : ""
                  } ${
                    highlight
                      ? "bg-blue-700 text-white border-blue-700 shadow-xl shadow-blue-600/20"
                      : "bg-white border-slate-200 shadow-sm hover:shadow-lg"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -z-0 -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
                  )}
                  <div
                    className={`relative w-11 h-11 rounded-xl flex items-center justify-center mb-6 ${
                      highlight ? "bg-white/15 text-white" : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <h3 className="relative text-xl font-bold mb-3">{title}</h3>
                  <p className={`relative text-[15px] leading-relaxed ${highlight ? "text-white/90" : "text-slate-600"}`}>
                    {body}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pt-6 pb-16 lg:pb-20 px-6">
          <Reveal className="max-w-5xl mx-auto rounded-3xl cta-gradient animate-gradient-flow p-12 lg:p-16 text-center text-white relative overflow-hidden">
            <div className="relative">
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-6">
                Ready to organize your family&apos;s health records?
              </h2>
              <p className="text-lg text-slate-300 mb-10 max-w-xl mx-auto">
                Turn scattered documents into a searchable, structured health history — free to get
                started.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate("/register")}
                  className="bg-white text-slate-900 px-10 py-4 rounded-lg font-bold text-lg hover:bg-slate-100 hover:-translate-y-0.5 transition-all shadow-lg"
                >
                  Create Free Account
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="bg-white/10 border border-white/30 text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-white/20 hover:-translate-y-0.5 transition-all"
                >
                  Log In
                </button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
