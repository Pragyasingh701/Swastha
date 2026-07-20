import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

// Mock profiles data matching the family vault concept
const MOCK_PROFILES = {
  "self": { name: "Piyush Kumar", age: 26, relationship: "Self", avatar: "👨" },
  "mother": { name: "Suman Devi", age: 52, relationship: "Mother", avatar: "👩" },
  "father": { name: "Rajendra Prasad", age: 58, relationship: "Father", avatar: "👨‍🦳" }
};

// Mock clinical records database for search query matches
const MOCK_RECORDS = [
  {
    id: "rec-1",
    title: "Annual Comprehensive Health Report",
    date: "12 May 2026",
    doctor: "Dr. Arvind Mehta (Cardiology)",
    category: "Lab Report",
    tags: ["hba1c", "cholesterol", "lipid", "diabetes"],
    insights: "HbA1c level is at 5.8% (Pre-diabetic threshold is 5.7%). Total Cholesterol is 210 mg/dL, slightly elevated.",
    summary: "Your annual blood report shows a stable glycemic index (HbA1c 5.8%), but a marginal increase in LDL cholesterol. Suggested lifestyle modification: reduce saturated fats and aim for 150 minutes of aerobic exercise weekly.",
    sourceFile: "annual_report_2026.pdf"
  },
  {
    id: "rec-2",
    title: "Prescription: Acute Cough & Fever",
    date: "04 June 2026",
    doctor: "Dr. Shruti Sharma (General Medicine)",
    category: "Prescription",
    tags: ["cough", "fever", "paracetamol", "amoxicillin"],
    insights: "Prescribed Amoxicillin 500mg (Antibiotic) and Paracetamol 650mg for symptoms.",
    summary: "Treatment plan for upper respiratory tract infection. Note: Complete the 5-day course of Amoxicillin even if symptoms resolve. Monitor temperature twice daily.",
    sourceFile: "prescription_june_2026.jpg"
  },
  {
    id: "rec-3",
    title: "Lipid Profile Trend Analysis",
    date: "18 January 2026",
    doctor: "Metro Diagnostics",
    category: "Lab Report",
    tags: ["cholesterol", "lipid", "triglycerides"],
    insights: "Triglycerides: 185 mg/dL (High). HDL: 42 mg/dL (Low).",
    summary: "Lipid panel indicates mild hypertriglyceridemia. Heart healthy diet, omega-3 supplementation, and regular cardio recommended.",
    sourceFile: "lipid_panel_jan.pdf"
  },
  {
    id: "rec-4",
    title: "Orthopedic Evaluation & Prescription",
    date: "10 April 2026",
    doctor: "Dr. Vikas Reddy (Orthopedics)",
    category: "Prescription",
    tags: ["back pain", "ibuprofen", "physiotherapy"],
    insights: "Lower back muscle spasm. Prescribed Ibuprofen 400mg (as needed) and 10 days of physical therapy.",
    summary: "Focus on core strengthening exercises and avoiding lifting heavy weights. Apply heat pack to the lumbar region twice daily.",
    sourceFile: "ortho_physio_prescription.pdf"
  }
];

export default function AISearch() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const currentProfile = MOCK_PROFILES[profileId] || MOCK_PROFILES["self"];

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [aiAnswer, setAiAnswer] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Suggested prompt chips
  const SUGGESTED_PROMPTS = [
    { text: "HbA1c & Diabetes Risk", query: "diabetes hba1c report" },
    { text: "Cough & Fever Medications", query: "cough fever prescription" },
    { text: "Cholesterol & Lipid trends", query: "lipid cholesterol" },
    { text: "Back pain guidelines", query: "back pain prescription" }
  ];

  const handleSearch = (searchQuery) => {
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);
    setIsSearching(true);
    setHasSearched(true);
    setAiAnswer("");
    setSearchResults([]);

    setTimeout(() => {
      // Filter records based on tags or title or text
      const filtered = MOCK_RECORDS.filter(rec =>
        rec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.doctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        rec.summary.toLowerCase().includes(searchQuery.toLowerCase())
      );

      setSearchResults(filtered);
      setIsSearching(false);

      // Generate conversational AI response based on matches
      if (filtered.length > 0) {
        const docNames = filtered.map(f => `[${f.title}]`).join(", ");
        setAiAnswer(
          `Based on the documents found (${docNames}):\n\n` +
          filtered.map(f => `• **${f.title} (${f.date})**: ${f.summary}`).join("\n\n") +
          `\n\n*Would you like me to translate this explanation to Hindi or analyze any specific metric trend?*`
        );
      } else {
        setAiAnswer(
          `I couldn't find any specific records matching "${searchQuery}" in ${currentProfile.name}'s vault.\n\n` +
          `Try searching for keywords like "lipid", "fever", "cough", "hba1c", or "physiotherapy".`
        );
      }
    }, 800);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-outline-variant/30">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <span className="font-headline-md text-headline-md font-extrabold text-primary tracking-tight">
              Swastha
            </span>
            <div className="h-4 w-[1px] bg-outline-variant/50 mx-1" />
            <span className="font-label-md text-label-md text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md">
              AI SEARCH
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Profile badge */}
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-xl border border-outline-variant/20">
              <span className="text-xl">{currentProfile.avatar}</span>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-on-surface leading-tight">{currentProfile.name}</p>
                <p className="text-[10px] text-on-surface-variant leading-none">{currentProfile.relationship} ({currentProfile.age} yrs)</p>
              </div>
            </div>
            
            <button 
              onClick={() => navigate("/role-selection")}
              className="bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/50 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            >
              Exit Search
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow pt-24 pb-16 px-6 z-10 max-w-4xl w-full mx-auto flex flex-col justify-start">
        {/* Header Introduction */}
        <div className="text-center mt-6 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full mb-3">
            <span className="material-symbols-outlined text-[18px]">psychology</span>
            <span className="text-label-sm uppercase tracking-wider font-semibold">Semantic RAG Intelligence</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface mb-2">
            Ask Swastha AI Anything
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Retrieve records, clarify symptoms, map lab trends, or translate reports to regional languages instantly.
          </p>
        </div>

        {/* Search Bar Container */}
        <div className="w-full relative mb-8">
          <div className="ai-search-glow rounded-2xl p-0.5 bg-gradient-to-r from-primary via-secondary-container to-primary shadow-lg">
            <div className="bg-white rounded-[14px] flex items-center p-2">
              <span className="material-symbols-outlined text-outline px-2 text-2xl">search</span>
              <input
                type="text"
                placeholder="Ask e.g. 'What did Dr. Sharma prescribe for my cough?' or 'Show my cholesterol level'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                className="flex-1 py-3 px-2 text-on-surface focus:outline-none placeholder-outline text-body-md border-0 bg-transparent ring-0 focus:ring-0"
              />
              <button
                onClick={() => handleSearch(query)}
                disabled={isSearching}
                className="bg-primary hover:bg-primary/95 text-on-primary font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 active:scale-95"
              >
                {isSearching ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Query</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          <span className="text-xs text-on-surface-variant font-medium py-1.5 self-center">Try asking:</span>
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <button
              key={index}
              onClick={() => handleSearch(prompt.query)}
              className="bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px] text-primary">chat_bubble</span>
              {prompt.text}
            </button>
          ))}
        </div>

        {/* Search & AI Results */}
        {hasSearched && (
          <div className="space-y-8 animate-fade-in">
            {/* AI conversational response */}
            <div className="bg-white rounded-2xl border border-primary/20 p-6 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide">
                  CLINICAL INSIGHT
                </span>
              </div>
              
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <span className="material-symbols-outlined">auto_awesome</span>
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="font-headline-md text-body-lg font-bold text-on-surface">Swastha AI Assistant</h3>
                  
                  {isSearching ? (
                    <div className="space-y-2 py-2">
                      <div className="h-4 bg-surface-container rounded w-3/4 animate-pulse" />
                      <div className="h-4 bg-surface-container rounded w-5/6 animate-pulse" />
                      <div className="h-4 bg-surface-container rounded w-1/2 animate-pulse" />
                    </div>
                  ) : (
                    <p className="text-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                      {aiAnswer}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Document Sources */}
            {!isSearching && searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-on-surface-variant tracking-wider uppercase">
                  Grounded Medical Records ({searchResults.length})
                </h3>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  {searchResults.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className="bg-primary-fixed text-on-primary-fixed-variant text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                            {rec.category}
                          </span>
                          <span className="text-xs text-on-surface-variant font-medium">{rec.date}</span>
                        </div>
                        <h4 className="font-bold text-base text-on-surface mb-1">{rec.title}</h4>
                        <p className="text-xs text-on-surface-variant mb-3">Issued by: {rec.doctor}</p>
                        <p className="text-xs text-on-surface-variant line-clamp-2 italic bg-surface-container-low p-2 rounded">
                          &quot;{rec.insights}&quot;
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-outline-variant/20 flex justify-between items-center">
                        <span className="text-xs text-primary font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">attachment</span>
                          {rec.sourceFile}
                        </span>
                        <button className="text-xs bg-primary text-on-primary px-3 py-1.5 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all">
                          View PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Decorative Atmosphere Elements */}
      <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Custom Styles */}
      <style>{`
        .ai-search-glow {
          box-shadow: 0 0 25px rgba(0, 74, 198, 0.15);
        }
        .ai-search-glow:focus-within {
          box-shadow: 0 0 35px rgba(0, 74, 198, 0.3);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
