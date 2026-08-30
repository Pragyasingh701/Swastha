import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const FAQS = [
  {
    q: "What is Swastha?",
    a: "A platform that organizes your family's medical records into one searchable timeline, and collects your medical history through an AI conversation before your clinic visit — so your doctor has it ready.",
  },
  {
    q: "Can I use it in Hindi?",
    a: "Yes. Clinic intake runs in Hindi or Indian English. Questions are read aloud and you can answer by speaking — including mixing Hindi and English naturally. You can also type at any point.",
  },
  {
    q: "Does the AI diagnose me?",
    a: "No. It asks follow-up questions and organizes your answers into a structured summary for your doctor. It does not suggest a diagnosis or treatment.",
  },
  {
    q: "What if I mention something urgent?",
    a: "If you describe symptoms that may need immediate attention, you'll see a priority alert and your session is flagged for the doctor. This is a safety prompt, not a medical assessment — in an emergency, contact emergency services directly.",
  },
  {
    q: "Who can see my records?",
    a: "Only you, unless you approve access. A doctor must send a request using your 6-digit patient code, and you accept or decline it. Adult family members authorize access by email.",
  },
  {
    q: "Can it read handwritten prescriptions?",
    a: "It extracts details from handwritten prescriptions and flags anything it couldn't read clearly for you to confirm — it won't guess.",
  },
  {
    q: "Do I need a Swastha account to check in at a clinic?",
    a: "Yes — check-in verifies your identity with a code sent to your registered email.",
  },
  {
    q: "Which doctors can use Swastha?",
    a: "Doctors practicing Allopathic or Ayurvedic medicine, verified against their medical registration certificate at signup.",
  },
  {
    q: "Is it free?",
    a: "Getting started is free.",
  },
];

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
      >
        <span className="font-bold text-on-surface">{question}</span>
        <span
          className={`material-symbols-outlined text-primary transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 text-on-surface-variant text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-on-surface font-body-md selection:bg-primary/20">
      {/* TopNavBar */}
      <header className="bg-surface/80 backdrop-blur-lg fixed top-0 w-full z-50 border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-6 py-3 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <img
              alt="Swastha Health Logo"
              className="w-10 h-10 object-contain"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJoSkUGc0Hv6hSwIbvCI4jXqfw51IEzG1-YtxI6ZPVQAgKF2gkF9bZKnreKdmbtKhGGVqaqifsmWUgklpWmQ5HOc8wCuxt1qRATJ_Lh2di1I5X4T6NAM789pr-DkSrLSej3v9HOhj7ZqEGyH6HQ8WcLrklNBJCzOHWE8w-F08fLnZHhFij-XNf_1_6ZyvNho1amapTks9-HG-P_KngfQr2YcLy_0llXOm7YKhNMA02JRcuWLpa7xSq"
            />
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              Swastha
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#features">Features</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#intake">How It Works</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#faq">FAQ</a>
            <button
              type="button"
              onClick={() => navigate("/doctor-register")}
              className="text-primary font-bold hover:text-primary/80 transition-colors font-body-md"
            >
              For Doctors &amp; Clinics
            </button>
          </nav>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/login")}
              className="hidden sm:block text-on-surface-variant font-label-md hover:text-primary transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => navigate("/register")}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label-md font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-md shadow-primary/20"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-6 lg:px-2xl py-20 lg:py-3xl max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="z-10 text-center lg:text-left">
              <h1 className="font-display text-display leading-tight mb-6">
                Your Family&apos;s Health Records. Organized. <span className="text-primary">Intelligent.</span> Always Accessible.
              </h1>
              <p className="text-body-lg text-on-surface-variant mb-10 max-w-xl mx-auto lg:mx-0">
                Stop hunting through scattered photos and dusty folders. Swastha uses AI to digitize, structure, and secure your medical history automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => navigate("/register")}
                  className="bg-primary text-on-primary px-8 py-4 rounded-xl font-label-md font-bold text-lg hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Get Started Free
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
            <div className="relative lg:block">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img
                  className="w-full h-auto"
                  alt="A sophisticated 3D isometric illustration showcasing a digital health ecosystem."
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAs_qtznSVAweD7AVjNETDxsGGLUUC0G8pCF1wQXw81veqQGkPoDI2z3S4OzwYeeaFGuoeicdlKsmnRAQDu_TQt_E6_crip__xPUTS8P6VE0vO7AoIm_0dJ7fYcVUAZFkDixZp8CNs728U8puIBCFxkX5WiNPLVRSmNeKOZdCSnjKPbhdQ2EH52sw_oBg0u7Y7XEXvoMswT2S3AmUyG3pEZihjDvTklvYqkGSS8Xyu3wPf-IJu0hnEl"
                />
              </div>
              {/* Decorative Element */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-primary/5 to-secondary/10 blur-3xl opacity-50"></div>
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="bg-surface-container-low py-12 border-y border-outline-variant/30 ">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span className="font-label-md font-bold">AI Powered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>document_scanner</span>
                <span className="font-label-md font-bold">AI Document Extraction</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                <span className="font-label-md font-bold">Secure Vault</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                <span className="font-label-md font-bold">Family Records</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
                <span className="font-label-md font-bold">Voice Intake</span>
              </div>
            </div>
          </div>
        </section>

        {/* Problem vs Solution */}
        <section className="py-20 lg:py-32 px-6 overflow-hidden" id="vault">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg text-headline-lg mb-4">Reimagining Your Medical History</h2>
              <p className="text-on-surface-variant max-w-2xl mx-auto">From chaotic digital clutter to a structured life-saving timeline.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
              {/* Problem Card */}
              <div className="p-8 rounded-3xl bg-surface-container-highest/50 border border-outline-variant/50 relative group">
                <div className="mb-6 inline-flex p-3 rounded-2xl bg-error/10 text-error">
                  <span className="material-symbols-outlined">warning</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">The Digital Mess</h3>
                <p className="text-on-surface-variant mb-8">Reports scattered across chat threads, email attachments, and lost PDFs. Finding a prescription from 6 months ago is impossible during emergencies.</p>
                <div className="space-y-4 opacity-50 grayscale group-hover:grayscale-0 transition-all">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-outline-variant/20 ">
                    <span className="material-symbols-outlined text-on-surface-variant">image</span>
                    <div className="flex-1 h-3 bg-surface-container rounded-full"></div>
                    <span className="text-xs font-mono">IMG_482.jpg</span>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-outline-variant/20 ">
                    <span className="material-symbols-outlined text-error">picture_as_pdf</span>
                    <div className="flex-1 h-3 bg-surface-container rounded-full"></div>
                    <span className="text-xs font-mono">Report_Final_V2.pdf</span>
                  </div>
                </div>
              </div>
              {/* Solution Card */}
              <div className="p-8 rounded-3xl bg-white border border-primary/20 shadow-2xl shadow-primary/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4">
                  <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold animate-pulse">AI ACTIVE</div>
                </div>
                <div className="mb-6 inline-flex p-3 rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">The Swastha Timeline</h3>
                <p className="text-on-surface-variant mb-8">AI extracts every lab value and medicine name, creating a searchable, structured health record for your whole family.</p>
                <div className="space-y-4">
                  <div className="ai-insight-glow p-4 rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white">
                      <span className="material-symbols-outlined">timeline</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Lab Trend: HbA1c</p>
                      <p className="text-xs text-on-surface-variant ">Improving trend over 12 months</p>
                    </div>
                    <span className="text-primary font-bold">5.8%</span>
                  </div>
                  <div className="p-4 bg-surface-container rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-container">
                      <span className="material-symbols-outlined">medication</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Active Medication</p>
                      <p className="text-xs text-on-surface-variant ">Metformin 500mg • Daily</p>
                    </div>
                    <span className="material-symbols-outlined text-primary">info</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="bg-surface py-20 lg:py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-end justify-between mb-16 gap-6">
              <div className="max-w-xl">
                <h2 className="font-headline-lg text-headline-lg mb-4">How It Works</h2>
                <p className="text-on-surface-variant ">From messy documents to an organized health record in four simple steps.</p>
              </div>
              <div className="flex gap-2">
                <div className="w-12 h-1 bg-primary rounded-full"></div>
                <div className="w-12 h-1 bg-outline-variant rounded-full"></div>
                <div className="w-12 h-1 bg-outline-variant rounded-full"></div>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-8 relative">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-12 left-0 w-full h-[2px] bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10 -z-0"></div>
              {/* Step 1 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">cloud_upload</span>
                </div>
                <h4 className="font-bold text-lg mb-2">1. Upload</h4>
                <p className="text-sm text-on-surface-variant ">Snap a photo, upload a PDF, or scan a physical report or prescription.</p>
              </div>
              {/* Step 2 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">scan</span>
                </div>
                <h4 className="font-bold text-lg mb-2">2. AI Extraction</h4>
                <p className="text-sm text-on-surface-variant ">AI reads lab values, medicines, and diagnoses — including handwritten prescriptions.</p>
              </div>
              {/* Step 3 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">account_tree</span>
                </div>
                <h4 className="font-bold text-lg mb-2">3. Structuring</h4>
                <p className="text-sm text-on-surface-variant ">Records are categorized by family member, doctor, and health category.</p>
              </div>
              {/* Step 4 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">auto_graph</span>
                </div>
                <h4 className="font-bold text-lg mb-2">4. Timeline</h4>
                <p className="text-sm text-on-surface-variant ">Access a unified health timeline with lab trends and instant search.</p>
              </div>
            </div>
          </div>
        </section>

        {/* AI Voice Intake / Clinic Check-in */}
        <section className="py-20 lg:py-32 px-6 bg-surface-container-lowest" id="intake">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary-container/10 text-secondary rounded-full mb-6">
                  <span className="material-symbols-outlined text-[18px]">mic</span>
                  <span className="text-label-sm uppercase tracking-wider">Clinic Check-In</span>
                </div>
                <h2 className="font-headline-lg text-headline-lg mb-6">
                  Walk into your consultation already prepared.
                </h2>
                <p className="text-on-surface-variant mb-10 max-w-xl">
                  Check in at the clinic with a front-desk code, and answer a few
                  questions before the doctor sees you — by speaking, in Hindi or
                  English. Your doctor opens a structured summary instead of
                  starting from a blank page.
                </p>

                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">record_voice_over</span>
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Speak, in your language</h4>
                      <p className="text-sm text-on-surface-variant">
                        Hindi or Indian English, spoken naturally — the AI understands
                        Hinglish too.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-11 h-11 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">priority_high</span>
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Urgent symptoms flagged instantly</h4>
                      <p className="text-sm text-on-surface-variant">
                        Checked on every turn of the conversation, so nothing urgent
                        gets buried in a busy queue.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-11 h-11 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">spa</span>
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Ayurveda-aware intake</h4>
                      <p className="text-sm text-on-surface-variant">
                        Practicing Ayurvedic doctors get a structured constitution,
                        digestion, and routine assessment built in.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate("/doctor-register")}
                  className="mt-10 inline-flex items-center gap-2 bg-secondary text-on-secondary px-6 py-3.5 rounded-xl font-label-md font-bold hover:bg-secondary/90 transition-all"
                >
                  For Doctors &amp; Clinics
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>

              {/* Mock intake conversation card */}
              <div className="relative">
                <div className="p-6 rounded-3xl bg-white border border-outline-variant/50 shadow-2xl shadow-primary/5">
                  <div className="flex items-center gap-3 pb-4 mb-4 border-b border-outline-variant/30">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                      <span className="material-symbols-outlined">smart_toy</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">Pre-visit check-in</p>
                      <p className="text-xs text-on-surface-variant">Hindi / English</p>
                    </div>
                    <span className="ml-auto flex items-center gap-1 text-xs font-bold text-error">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      Flagged
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-surface-container rounded-xl p-3 text-sm max-w-[85%]">
                      Kal se fever hai, aur body pain bhi.
                    </div>
                    <div className="bg-primary/10 rounded-xl p-3 text-sm max-w-[90%] ml-auto">
                      Got it — since yesterday, fever with body pain. Any breathing
                      difficulty?
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-outline-variant/30 text-xs text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                    Structured summary ready for the doctor
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid (Bento Style) */}
        <section className="py-20 lg:py-32 px-6 bg-surface-container-lowest " id="features">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg text-headline-lg mb-4">Smarter Healthcare for Modern Families</h2>
              <p className="text-on-surface-variant ">Real AI features built for reliability and speed.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {/* Upload Flexibility Feature */}
              <div className="md:col-span-2 p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute bottom-0 right-0 p-8 translate-y-8 translate-x-8 opacity-10 group-hover:opacity-20 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-500">
                  <span className="material-symbols-outlined text-[160px] text-primary">upload_file</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-primary">photo_camera</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md mb-4">Upload However You Have It</h3>
                  <p className="text-on-surface-variant max-w-md">Snap a photo, upload a PDF, or scan a handwritten prescription. Swastha reads it and files it in the right category automatically.</p>
                </div>
              </div>
              {/* AI Extraction Feature */}
              <div className="p-8 rounded-3xl bg-primary text-on-primary shadow-xl shadow-primary/20 flex flex-col justify-between">
                <div>
                  <span className="material-symbols-outlined text-3xl mb-6">psychology</span>
                  <h3 className="font-headline-md text-headline-md mb-4">AI Document Extraction</h3>
                  <p className="opacity-90">Reads handwritten prescriptions and complex lab panels. Anything unclear is flagged for you to confirm — never guessed.</p>
                </div>
                <div className="mt-8 pt-6 border-t border-white/20">
                  <span className="text-sm font-bold tracking-widest uppercase">Never Guesses</span>
                </div>
              </div>
              {/* Drug Interactions */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-error">pill_off</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Safety First</h3>
                <p className="text-on-surface-variant ">Automatic drug-to-drug interaction checks when you upload new prescriptions.</p>
              </div>
              {/* Lab Trends */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-secondary">trending_up</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Lab Trends</h3>
                <p className="text-on-surface-variant ">Visualize how your health metrics change over time with intuitive, auto-generated charts.</p>
              </div>
              {/* Smart Search */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-primary">search</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Ask Swastha</h3>
                <p className="text-on-surface-variant ">Ask &quot;What were my HbA1c levels last year?&quot; in plain language and get an answer grounded in your own records, with sources attached.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 lg:py-32 px-6" id="faq">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-headline-lg text-headline-lg mb-4">Frequently Asked Questions</h2>
              <p className="text-on-surface-variant">Everything you need to know before you get started.</p>
            </div>
            <div className="space-y-4">
              {FAQS.map((item) => (
                <FAQItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto rounded-3xl bg-primary-container p-12 text-center text-on-primary-container relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary mix-blend-overlay opacity-30"></div>
            <div className="relative z-10">
              <h2 className="font-display text-headline-lg mb-6">Ready to organize your family&apos;s health records?</h2>
              <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">Turn scattered documents into a searchable, structured health history — free to get started.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate("/register")}
                  className="bg-white text-primary px-10 py-4 rounded-xl font-bold text-lg hover:bg-surface-bright transition-all shadow-xl"
                >
                  Create Free Account
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="bg-transparent border-2 border-white/30 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-all"
                >
                  Log In
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}