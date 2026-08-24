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
// Delivered one sub-section per turn, 2-3 related fields bundled (PRD §4.5),
// in this fixed order: prakriti -> agni_ahara -> nidra_dinacharya -> manas
// -> vikruti -> history_ayurvedic.

export const AYURVEDA_SUBSECTIONS = [
  {
    key: 'prakriti',
    title: 'Prakriti (constitution)',
    fields: [
      {
        field: 'body_frame',
        question: 'How would you describe your natural body frame, even before any weight changes?',
        options: ['Thin/light-boned', 'Medium/athletic', 'Broad/heavy-set'],
        allowMultiple: false,
      },
      {
        field: 'skin_type',
        question: 'How would you describe your skin, most of the time?',
        options: ['Dry, rough, thin', 'Warm, sensitive, breakout-prone', 'Oily, smooth, cool'],
        allowMultiple: false,
      },
      {
        field: 'appetite_pattern',
        question: 'How would you describe your usual appetite?',
        options: ['Irregular, forget to eat', 'Strong, irritable if I skip meals', 'Steady but slow'],
        allowMultiple: false,
      },
      {
        field: 'temperament',
        question: 'Which best describe how you tend to react under pressure?',
        options: ['Anxious/quick-thinking', 'Driven/irritable', 'Calm/slow to react', 'Overwhelmed/withdraw'],
        allowMultiple: true,
      },
      {
        field: 'sleep_tendency',
        question: 'How would you describe your usual sleep?',
        options: ['Light, wake easily', 'Moderate, deep', 'Very heavy, groggy on waking'],
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
        question: "How's your digestion generally?",
        options: ['Weak, bloats easily', 'Strong, irregular', 'Slow but steady', 'Variable, unpredictable'],
        allowMultiple: false,
      },
      {
        field: 'bowel_pattern',
        question: 'How would you describe your bowel habits?',
        options: ['Constipated/irregular', 'Loose/frequent', 'Regular', 'Alternating'],
        allowMultiple: false,
      },
      {
        field: 'thirst_level',
        question: "How's your thirst?",
        options: ['Low/rarely thirsty', 'High/frequently thirsty', 'Moderate'],
        allowMultiple: false,
      },
      {
        field: 'taste_cravings',
        question: 'Which tastes do you find yourself craving most?',
        options: ['Sweet', 'Salty', 'Sour', 'Spicy', 'Bitter', 'Astringent'],
        allowMultiple: true,
      },
      {
        field: 'food_intolerances',
        question: "Any foods that consistently don't agree with you?",
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
        question: 'How many hours do you usually sleep?',
        options: ['<5', '5-6', '6-8', '8+'],
        allowMultiple: false,
      },
      {
        field: 'sleep_quality',
        question: 'How would you describe your sleep quality?',
        options: ['Interrupted/light', 'Deep/refreshing', 'Excessive/groggy', 'Varies night to night'],
        allowMultiple: false,
      },
      {
        field: 'wake_routine',
        question: 'Do you generally wake up at a consistent time?',
        options: ['Yes, consistent', 'Varies a lot', 'No fixed routine'],
        allowMultiple: false,
      },
      {
        field: 'activity_level',
        question: 'How active is your day-to-day routine?',
        options: ['Sedentary', 'Light', 'Moderate', 'Very active'],
        allowMultiple: false,
      },
      {
        field: 'work_stress_pattern',
        question: 'How would you describe your work/stress pattern lately?',
        options: ['Low/steady', 'Moderate', 'High/constant', 'Comes in bursts'],
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
        question: "Which of these have you been feeling lately?",
        options: ['Anxious', 'Irritable', 'Restless', 'Calm', 'Foggy/unfocused', 'Low/flat'],
        allowMultiple: true,
      },
      {
        field: 'recent_stressors',
        question: "Anything stressful going on recently you'd like to mention?",
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
        options: ['Cold/dry', 'Hot/irritated', 'Heavy/dull', 'Sharp/sudden', 'Gradual/slow-building'],
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
        options: ['None yet', 'Currently taking something', 'Tried in the past (please describe)'],
        allowMultiple: false,
        freeTextFollowUp: true, // "Tried in the past" invites a free-text follow-up, per PRD §4.5
      },
      {
        field: 'home_remedies',
        question: "Any home remedies you've tried for this?",
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
