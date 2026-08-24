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

export const AYURVEDA_SUBSECTIONS = [
  {
    key: 'prakriti',
    title: 'Prakriti (constitution)',
    fields: [
      {
        field: 'body_frame',
        question: 'How is your natural body frame?',
        options: ['Thin and light', 'Medium and well-built', 'Broad and heavy'],
        allowMultiple: false,
      },
      {
        field: 'skin_type',
        question: 'How is your skin usually?',
        options: ['Dry and rough', 'Warm and sensitive', 'Oily and smooth'],
        allowMultiple: false,
      },
      {
        field: 'appetite_pattern',
        question: 'How is your appetite normally?',
        options: ['Irregular — sometimes hungry, sometimes not', 'Strong — I get hungry regularly', 'Moderate — I can easily skip meals'],
        allowMultiple: false,
      },
      {
        field: 'temperament',
        question: 'How is your usual temperament?',
        options: ['Quick, active, sometimes anxious', 'Focused, ambitious, sometimes irritable', 'Calm, patient, relaxed', 'Overwhelmed, tends to withdraw'],
        allowMultiple: true,
      },
      {
        field: 'sleep_tendency',
        question: 'How is your sleep normally?',
        options: ['Light — easily disturbed', 'Moderate', 'Deep and long'],
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
        options: ['Weak — bloats easily', 'Strong but irregular', 'Slow but steady', 'Variable — unpredictable'],
        allowMultiple: false,
      },
      {
        field: 'bowel_pattern',
        question: 'How would you describe your bowel habits?',
        options: ['Constipated or irregular', 'Loose or frequent', 'Regular', 'Alternating'],
        allowMultiple: false,
      },
      {
        field: 'thirst_level',
        question: 'How is your thirst?',
        options: ['Low — rarely thirsty', 'High — frequently thirsty', 'Moderate'],
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
        question: 'Are there foods that consistently cause you discomfort?',
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
        options: ['Less than 5 hours', '5–6 hours', '6–8 hours', 'More than 8 hours'],
        allowMultiple: false,
      },
      {
        field: 'sleep_quality',
        question: 'How has your sleep quality been?',
        options: ['Interrupted or light', 'Deep and refreshing', 'Excessive — groggy on waking', 'Varies night to night'],
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
        question: 'How physically active is your day-to-day routine?',
        options: ['Very little', 'Light activity', 'Moderate activity', 'High activity'],
        allowMultiple: false,
      },
      {
        field: 'work_stress_pattern',
        question: 'How would you describe your work or stress pattern lately?',
        options: ['Low and steady', 'Moderate', 'High and constant', 'Comes in bursts'],
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
        options: ['Anxious', 'Irritable', 'Restless', 'Calm', 'Foggy or unfocused', 'Low or flat'],
        allowMultiple: true,
      },
      {
        field: 'recent_stressors',
        question: 'Is there anything stressful going on recently you would like to mention?',
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
        options: ['Cold and dry', 'Hot and irritated', 'Heavy and dull', 'Sharp and sudden', 'Gradual and slow-building'],
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
        question: 'Have you tried any home remedies for this?',
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
