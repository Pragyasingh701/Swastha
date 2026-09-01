// Ayurvedic question set — verbatim patient-facing copy + option lists from
// PRD "Swasthya — Clinic Check-In & Treatment-Method-Aware AI Intake" §4.5.
// Kept as data, separate from intakeService.js's prompt-building/dialogue
// logic, so the exact wording can be reviewed/updated on its own (same
// reasoning as intakeService.js's RED_FLAG_TRIGGERS list).
//
// Sanskrit terms are used ONLY as internal field names (matching PRD §4.4's
// ayurveda_profile shape) — every `question` string below is the plain-
// language patient-facing copy, per PRD §4.5's "Sanskrit terms used only as
// internal field names; patient-facing copy stays plain-language."
//
// Wording style (reworded from the reference MediKiosk Ayurveda/AYUSH
// Dashavidha Pariksha questionnaire — a standard clinical Prakriti/Vikriti
// intake format): short, direct "How is your X?" / "How is your X
// normally/usually?" framing, single-attribute options (one adjective/
// phrase per choice, not stacked "A/B/C" compounds), neutral clinical tone
// — no casual asides or parentheticals. Schema (fields, sub-section
// grouping, free-text/skippable/multi-select flags) is unchanged; only the
// phrasing moved closer to that reference.
//
// Delivered one sub-section per turn, 2-3 related fields bundled (PRD §4.5),
// in this fixed order: prakriti -> agni_ahara -> nidra_dinacharya -> manas
// -> vikruti -> history_ayurvedic.
//
// LANGUAGE: every field carries `question_hi` (and `options_hi`, where it
// has options) alongside its English copy, following the same convention
// intakeService.js's HPI_FALLBACK_QUESTIONS/DRUG_ALLERGY_FALLBACK_QUESTIONS
// already use. These are not optional niceties — this copy is injected into
// the generation prompt as literal quoted strings and is ALSO served
// directly to the patient on the dedup/backfill substitution paths, so an
// English-only entry is a question that reaches a Hindi patient in English
// (observed live: "How is your digestion generally?" mid-way through an
// otherwise fully-Hindi session). Any field added here needs both.

export const AYURVEDA_SUBSECTIONS = [
  {
    key: 'prakriti',
    title: 'Prakriti (constitution)',
    fields: [
      {
        field: 'body_frame',
        question: 'How is your natural body frame?',
        question_hi: 'आपके शरीर की बनावट स्वाभाविक रूप से कैसी है?',
        options: ['Thin and light', 'Medium and well-built', 'Broad and heavy'],
        options_hi: ['पतला और हल्का', 'मध्यम और गठीला', 'चौड़ा और भारी'],
        allowMultiple: false,
      },
      {
        field: 'skin_type',
        question: 'How is your skin usually?',
        question_hi: 'आपकी त्वचा आमतौर पर कैसी रहती है?',
        options: ['Dry and rough', 'Warm and sensitive', 'Oily and smooth'],
        options_hi: ['रूखी और खुरदुरी', 'गर्म और संवेदनशील', 'तैलीय और चिकनी'],
        allowMultiple: false,
      },
      {
        field: 'appetite_pattern',
        question: 'How is your appetite normally?',
        question_hi: 'आपकी भूख सामान्य रूप से कैसी रहती है?',
        options: ['Irregular — sometimes hungry, sometimes not', 'Strong — I get hungry regularly', 'Moderate — I can easily skip meals'],
        options_hi: ['अनियमित — कभी भूख लगती है, कभी नहीं', 'तेज़ — नियमित रूप से भूख लगती है', 'मध्यम — बिना खाए भी रह सकते हैं'],
        allowMultiple: false,
      },
      {
        field: 'temperament',
        question: 'How is your usual temperament?',
        question_hi: 'आपका स्वभाव आमतौर पर कैसा रहता है?',
        options: ['Quick, active, sometimes anxious', 'Focused, ambitious, sometimes irritable', 'Calm, patient, relaxed', 'Overwhelmed, tends to withdraw'],
        options_hi: ['तेज़, सक्रिय, कभी-कभी घबराहट', 'एकाग्र, महत्वाकांक्षी, कभी-कभी चिड़चिड़ापन', 'शांत, धैर्यवान, सहज', 'परेशान, अकेले रहने का मन'],
        allowMultiple: true,
      },
      {
        field: 'sleep_tendency',
        question: 'How is your sleep normally?',
        question_hi: 'आपकी नींद सामान्य रूप से कैसी रहती है?',
        options: ['Light — easily disturbed', 'Moderate', 'Deep and long'],
        options_hi: ['हल्की — आसानी से खुल जाती है', 'मध्यम', 'गहरी और लंबी'],
        allowMultiple: false,
      },
    ],
  },
  {
    key: 'agni_ahara',
    title: 'Agni & Ahara (digestion & diet)',
    fields: [
      {
        field: 'digestion_strength',
        question: 'How is your digestion generally?',
        question_hi: 'आपका पाचन आमतौर पर कैसा रहता है?',
        options: ['Weak — bloats easily', 'Strong but irregular', 'Slow but steady', 'Variable — unpredictable'],
        options_hi: ['कमज़ोर — जल्दी गैस या पेट फूलना', 'तेज़ पर अनियमित', 'धीमा पर ठीक', 'बदलता रहता है — कुछ तय नहीं'],
        allowMultiple: false,
      },
      {
        field: 'bowel_pattern',
        question: 'How would you describe your bowel habits?',
        question_hi: 'आपको शौच कैसा होता है?',
        options: ['Constipated or irregular', 'Loose or frequent', 'Regular', 'Alternating'],
        options_hi: ['कब्ज़ या अनियमित', 'पतला या बार-बार', 'नियमित', 'कभी कुछ, कभी कुछ'],
        allowMultiple: false,
      },
      {
        field: 'thirst_level',
        question: 'How is your thirst?',
        question_hi: 'आपको प्यास कैसी लगती है?',
        options: ['Low — rarely thirsty', 'High — frequently thirsty', 'Moderate'],
        options_hi: ['कम — बहुत कम प्यास लगती है', 'ज़्यादा — बार-बार प्यास लगती है', 'मध्यम'],
        allowMultiple: false,
      },
      {
        field: 'taste_cravings',
        question: 'Which tastes do you find yourself craving most?',
        question_hi: 'आपका मन सबसे ज़्यादा किस स्वाद का करता है?',
        options: ['Sweet', 'Salty', 'Sour', 'Spicy', 'Bitter', 'Astringent'],
        options_hi: ['मीठा', 'नमकीन', 'खट्टा', 'तीखा', 'कड़वा', 'कसैला'],
        allowMultiple: true,
      },
      {
        field: 'food_intolerances',
        question: 'Are there foods that consistently cause you discomfort?',
        question_hi: 'क्या कोई ऐसी चीज़ है जो खाने पर आपको हमेशा तकलीफ़ होती है?',
        options: [],
        allowMultiple: false,
        freeText: true,
        skippable: true,
      },
    ],
  },
  {
    key: 'nidra_dinacharya',
    title: 'Nidra & Dinacharya (sleep & routine)',
    fields: [
      {
        field: 'sleep_hours',
        question: 'What is your usual sleep duration?',
        question_hi: 'आप आमतौर पर कितने घंटे सोते हैं?',
        options: ['Less than 5 hours', '5–6 hours', '6–8 hours', 'More than 8 hours'],
        options_hi: ['5 घंटे से कम', '5–6 घंटे', '6–8 घंटे', '8 घंटे से ज़्यादा'],
        allowMultiple: false,
      },
      {
        field: 'sleep_quality',
        question: 'How has your sleep quality been?',
        question_hi: 'आपकी नींद की गुणवत्ता कैसी रही है?',
        options: ['Interrupted or light', 'Deep and refreshing', 'Excessive — groggy on waking', 'Varies night to night'],
        options_hi: ['बीच में टूटती है या हल्की', 'गहरी और ताज़गी भरी', 'ज़रूरत से ज़्यादा — उठने पर सुस्ती', 'हर रात अलग'],
        allowMultiple: false,
      },
      {
        field: 'wake_routine',
        question: 'Do you generally wake up at a consistent time?',
        question_hi: 'क्या आप आमतौर पर एक ही समय पर उठते हैं?',
        options: ['Yes, consistent', 'Varies a lot', 'No fixed routine'],
        options_hi: ['हाँ, एक ही समय पर', 'काफ़ी बदलता रहता है', 'कोई तय समय नहीं'],
        allowMultiple: false,
      },
      {
        field: 'activity_level',
        question: 'How physically active is your day-to-day routine?',
        question_hi: 'आपकी रोज़ की दिनचर्या में शारीरिक गतिविधि कितनी रहती है?',
        options: ['Very little', 'Light activity', 'Moderate activity', 'High activity'],
        options_hi: ['बहुत कम', 'हल्की गतिविधि', 'मध्यम गतिविधि', 'ज़्यादा गतिविधि'],
        allowMultiple: false,
      },
      {
        field: 'work_stress_pattern',
        question: 'How would you describe your work or stress pattern lately?',
        question_hi: 'आजकल आपके काम या तनाव का स्तर कैसा रहा है?',
        options: ['Low and steady', 'Moderate', 'High and constant', 'Comes in bursts'],
        options_hi: ['कम और एक जैसा', 'मध्यम', 'ज़्यादा और लगातार', 'कभी-कभी अचानक बढ़ जाता है'],
        allowMultiple: false,
      },
    ],
  },
  {
    key: 'manas',
    title: 'Manas (mental-emotional state)',
    fields: [
      {
        field: 'current_mood',
        question: 'Which of these have you been feeling lately?',
        question_hi: 'आजकल आप इनमें से क्या महसूस कर रहे हैं?',
        options: ['Anxious', 'Irritable', 'Restless', 'Calm', 'Foggy or unfocused', 'Low or flat'],
        options_hi: ['घबराहट', 'चिड़चिड़ापन', 'बेचैनी', 'शांत', 'ध्यान न लगना', 'उदासी या मन न लगना'],
        allowMultiple: true,
      },
      {
        field: 'recent_stressors',
        question: 'Is there anything stressful going on recently you would like to mention?',
        question_hi: 'क्या हाल में कोई ऐसी बात है जिससे आपको तनाव हो रहा हो और आप बताना चाहें?',
        options: [],
        allowMultiple: false,
        freeText: true,
        skippable: true,
      },
    ],
  },
  {
    key: 'vikruti',
    title: 'Vikruti (framing of current complaint)',
    // vikruti_qualities lives at the top level of ayurveda_profile (PRD
    // §4.4), not nested under a "vikruti" object — this sub-section's
    // `field` is the flat key the merge logic writes to directly.
    fields: [
      {
        field: 'vikruti_qualities',
        question: 'Which best describes how your current problem feels?',
        question_hi: 'आपकी अभी की तकलीफ़ सबसे ज़्यादा कैसी महसूस होती है?',
        options: ['Cold and dry', 'Hot and irritated', 'Heavy and dull', 'Sharp and sudden', 'Gradual and slow-building'],
        options_hi: ['ठंडी और सूखी', 'गर्म और जलन वाली', 'भारी और सुस्त', 'तेज़ और अचानक', 'धीरे-धीरे बढ़ने वाली'],
        allowMultiple: true,
      },
    ],
  },
  {
    key: 'history_ayurvedic',
    title: 'History (prior Ayurvedic treatment)',
    fields: [
      {
        field: 'prior_treatments',
        question: 'Have you tried any Ayurvedic treatments for this before?',
        question_hi: 'क्या आपने इसके लिए पहले कोई आयुर्वेदिक इलाज लिया है?',
        options: ['None yet', 'Currently taking something', 'Tried in the past (please describe)'],
        options_hi: ['अभी तक नहीं', 'अभी कुछ ले रहे हैं', 'पहले लिया था (कृपया बताएं)'],
        allowMultiple: false,
        freeTextFollowUp: true, // "Tried in the past" invites a free-text follow-up, per PRD §4.5
      },
      {
        field: 'home_remedies',
        question: 'Have you tried any home remedies for this?',
        question_hi: 'क्या आपने इसके लिए कोई घरेलू नुस्खा आज़माया है?',
        options: [],
        allowMultiple: false,
        freeText: true,
        skippable: true,
      },
    ],
  },
];

// Flat lookup of every ayurveda_profile leaf field -> which top-level group
// it nests under (or null for vikruti_qualities, which is flat). Used by
// ayurvedaComplete()/mergeStructuredHistory() in intakeService.js so those
// stay in sync with this question set automatically rather than duplicating
// the field list.
export const AYURVEDA_FIELD_GROUPS = {
  body_frame: 'prakriti',
  skin_type: 'prakriti',
  appetite_pattern: 'prakriti',
  temperament: 'prakriti',
  sleep_tendency: 'prakriti',
  digestion_strength: 'agni_ahara',
  bowel_pattern: 'agni_ahara',
  thirst_level: 'agni_ahara',
  taste_cravings: 'agni_ahara',
  food_intolerances: 'agni_ahara',
  sleep_hours: 'nidra_dinacharya',
  sleep_quality: 'nidra_dinacharya',
  wake_routine: 'nidra_dinacharya',
  activity_level: 'nidra_dinacharya',
  work_stress_pattern: 'nidra_dinacharya',
  current_mood: 'manas',
  recent_stressors: 'manas',
  vikruti_qualities: null, // flat, top-level array field
  prior_treatments: 'history_ayurvedic',
  home_remedies: 'history_ayurvedic',
};

// Fields that may legitimately be empty (skippable free text / multi-select
// with zero selections) — completeness treats "explicitly asked, patient
// declined/skipped" the same as "answered", per PRD §4.4's asked:true/
// value:null convention. Multi-select array fields count as answered once
// they're an array (even empty), matching hpiComplete()'s treatment of
// associated_symptoms in intakeService.js.
export const AYURVEDA_ARRAY_FIELDS = new Set(['temperament', 'taste_cravings', 'current_mood', 'vikruti_qualities']);
export const AYURVEDA_SKIPPABLE_FIELDS = new Set(['food_intolerances', 'recent_stressors', 'home_remedies']);
