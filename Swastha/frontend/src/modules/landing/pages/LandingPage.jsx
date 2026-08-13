import React from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-on-surface font-body-md selection:bg-primary/20">
      {/* TopNavBar */}
      <header className="bg-surface/80 dark:bg-surface-dim/80 backdrop-blur-lg fixed top-0 w-full z-50 border-b border-outline-variant/30 shadow-sm">
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
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#abha">ABHA Sync</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#vault">Vault</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md" href="#timeline">Timeline</a>
          </nav>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/login")}
              className="hidden sm:block text-on-surface-variant font-label-md hover:text-primary transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => navigate("/role-selection")}
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
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-container/10 text-primary rounded-full mb-6">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span className="text-label-sm uppercase tracking-wider">HIPAA &amp; ABHA COMPLIANT</span>
              </div>
              <h1 className="font-display text-display leading-tight mb-6">
                Your Family&apos;s Health Records. Organized. <span className="text-primary">Intelligent.</span> Always Accessible.
              </h1>
              <p className="text-body-lg text-on-surface-variant mb-10 max-w-xl mx-auto lg:mx-0">
                Stop hunting through WhatsApp chats and dusty folders. Swastha uses clinical-grade AI to digitize, structure, and secure your medical history automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => navigate("/role-selection")}
                  className="bg-primary text-on-primary px-8 py-4 rounded-xl font-label-md font-bold text-lg hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Get Started Free
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <button className="bg-surface-container border border-outline-variant text-on-surface px-8 py-4 rounded-xl font-label-md font-bold text-lg hover:bg-surface-container-high transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">play_circle</span>
                  Watch Demo
                </button>
              </div>
            </div>
            <div className="relative lg:block">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl animate-float">
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
        <section className="bg-surface-container-low py-12 border-y border-outline-variant/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
                <span className="font-label-md font-bold">ABHA Ecosystem</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span className="font-label-md font-bold">AI Powered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>document_scanner</span>
                <span className="font-label-md font-bold">OCR Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                <span className="font-label-md font-bold">Secure Vault</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                <span className="font-label-md font-bold">Family Records</span>
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
                <p className="text-on-surface-variant mb-8">Reports scattered across WhatsApp threads, email attachments, and lost PDFs. Finding a prescription from 6 months ago is impossible during emergencies.</p>
                <div className="space-y-4 opacity-50 grayscale group-hover:grayscale-0 transition-all">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-outline-variant/20">
                    <span className="material-symbols-outlined text-[#25D366]">chat</span>
                    <div className="flex-1 h-3 bg-surface-container rounded-full"></div>
                    <span className="text-xs font-mono">IMG_482.jpg</span>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-outline-variant/20">
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
                <p className="text-on-surface-variant mb-8">Clinical-grade OCR extracts every lab value and medicine name, creating a searchable, intelligent health journey for your whole family.</p>
                <div className="space-y-4">
                  <div className="ai-insight-glow p-4 rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white">
                      <span className="material-symbols-outlined">timeline</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Lab Trend: HbA1c</p>
                      <p className="text-xs text-on-surface-variant">Improving trend over 12 months</p>
                    </div>
                    <span className="text-primary font-bold">5.8%</span>
                  </div>
                  <div className="p-4 bg-surface-container rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-container">
                      <span className="material-symbols-outlined">medication</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Active Medication</p>
                      <p className="text-xs text-on-surface-variant">Metformin 500mg • Daily</p>
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
                <p className="text-on-surface-variant">From messy documents to medical intelligence in four simple steps.</p>
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
                <p className="text-sm text-on-surface-variant">Share files from WhatsApp, email, or snap a photo of a physical report.</p>
              </div>
              {/* Step 2 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">scan</span>
                </div>
                <h4 className="font-bold text-lg mb-2">2. OCR Analysis</h4>
                <p className="text-sm text-on-surface-variant">Our clinical AI extracts lab results, dosages, and diagnostic insights.</p>
              </div>
              {/* Step 3 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">account_tree</span>
                </div>
                <h4 className="font-bold text-lg mb-2">3. Structuring</h4>
                <p className="text-sm text-on-surface-variant">Records are categorized by family member, doctor, and health category.</p>
              </div>
              {/* Step 4 */}
              <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="w-20 h-20 bg-white shadow-lg rounded-2xl flex items-center justify-center mb-6 border border-outline-variant/30 group hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">auto_graph</span>
                </div>
                <h4 className="font-bold text-lg mb-2">4. Timeline</h4>
                <p className="text-sm text-on-surface-variant">Access a unified health timeline with trends, alerts, and instant search.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid (Bento Style) */}
        <section className="py-20 lg:py-32 px-6 bg-surface-container-lowest" id="features">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg text-headline-lg mb-4">Smarter Healthcare for Modern Families</h2>
              <p className="text-on-surface-variant">Advanced features designed for reliability and speed.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {/* WhatsApp Feature */}
              <div className="md:col-span-2 p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute bottom-0 right-0 p-8 translate-y-8 translate-x-8 opacity-10 group-hover:opacity-20 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-500">
                  <span className="material-symbols-outlined text-[160px] text-primary">chat_bubble</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-[#25D366]">send</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md mb-4">Forward from WhatsApp</h3>
                  <p className="text-on-surface-variant max-w-md">Just forward any report to our verified number. Our AI picks it up instantly and files it in the right vault automatically.</p>
                </div>
              </div>
              {/* AI OCR Feature */}
              <div className="p-8 rounded-3xl bg-primary text-on-primary shadow-xl shadow-primary/20 flex flex-col justify-between">
                <div>
                  <span className="material-symbols-outlined text-3xl mb-6">psychology</span>
                  <h3 className="font-headline-md text-headline-md mb-4">Deep OCR</h3>
                  <p className="opacity-90">Beyond simple text, we understand handwritten prescriptions and complex blood panel charts.</p>
                </div>
                <div className="mt-8 pt-6 border-t border-white/20">
                  <span className="text-sm font-bold tracking-widest uppercase">99.8% ACCURACY</span>
                </div>
              </div>
              {/* Drug Interactions */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-error">pill_off</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Safety First</h3>
                <p className="text-on-surface-variant">Automatic drug-to-drug interaction checks when you upload new prescriptions.</p>
              </div>
              {/* Lab Trends */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-secondary">trending_up</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Lab Trends</h3>
                <p className="text-on-surface-variant">Visualize how your health metrics change over time with intuitive, auto-generated charts.</p>
              </div>
              {/* Smart Search */}
              <div className="p-8 rounded-3xl bg-white border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-primary">search</span>
                </div>
                <h3 className="font-headline-md text-headline-md mb-4">Smart Search</h3>
                <p className="text-on-surface-variant">Search for &quot;Diabetes reports 2022&quot; or &quot;Dr. Sharma prescriptions&quot; and get results in milliseconds.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto rounded-3xl bg-primary-container p-12 text-center text-on-primary-container relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary mix-blend-overlay opacity-30"></div>
            <div className="relative z-10">
              <h2 className="font-display text-headline-lg mb-6">Ready to secure your family&apos;s health?</h2>
              <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">Join thousands of families who trust Swastha for clinical record management.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate("/role-selection")}
                  className="bg-white text-primary px-10 py-4 rounded-xl font-bold text-lg hover:bg-surface-bright transition-all shadow-xl"
                >
                  Create Free Account
                </button>
                <button className="bg-transparent border-2 border-white/30 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-all">
                  Talk to Sales
                </button>
              </div>
              <p className="mt-8 text-sm opacity-60">No credit card required • GDPR &amp; HIPAA Compliant</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-low border-t border-outline-variant/50 pt-20 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <img
                  alt="Swastha Logo"
                  className="w-8 h-8"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJoSkUGc0Hv6hSwIbvCI4jXqfw51IEzG1-YtxI6ZPVQAgKF2gkF9bZKnreKdmbtKhGGVqaqifsmWUgklpWmQ5HOc8wCuxt1qRATJ_Lh2di1I5X4T6NAM789pr-DkSrLSej3v9HOhj7ZqEGyH6HQ8WcLrklNBJCzOHWE8w-F08fLnZHhFij-XNf_1_6ZyvNho1amapTks9-HG-P_KngfQr2YcLy_0llXOm7YKhNMA02JRcuWLpa7xSq"
                />
                <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">Swastha</span>
              </div>
              <p className="text-on-surface-variant text-sm mb-6">Clinical intelligence for families. Secure, organized, and accessible health records powered by AI.</p>
              <div className="flex gap-4">
                <a className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all" href="#">
                  <span className="material-symbols-outlined text-[20px]">public</span>
                </a>
                <a className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all" href="#">
                  <span className="material-symbols-outlined text-[20px]">alternate_email</span>
                </a>
              </div>
            </div>
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest">Platform</h5>
              <ul className="space-y-4 text-sm text-on-surface-variant">
                <li><a className="hover:text-primary transition-colors" href="#">Digital Vault</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">AI Health Sync</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Family Profiles</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">OCR Capabilities</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest">Company</h5>
              <ul className="space-y-4 text-sm text-on-surface-variant">
                <li><a className="hover:text-primary transition-colors" href="#">About Us</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Privacy Architecture</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Compliance Hub</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Contact Support</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-6 text-sm uppercase tracking-widest">Legal</h5>
              <ul className="space-y-4 text-sm text-on-surface-variant">
                <li><a className="hover:text-primary transition-colors" href="#">Privacy Policy</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Terms of Service</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Security Audit</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">HIPAA Compliance</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-body-sm text-on-surface-variant">© 2024 Swastha Healthcare SaaS. HIPAA &amp; ABHA Compliant.</p>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1 text-xs font-bold text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                SYSTEMS OPERATIONAL
              </span>
              <span className="text-xs text-on-surface-variant">ISO 27001 Certified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}