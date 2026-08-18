// Pure, deterministic helpers that turn a patient's Family Vault members into a
// generation-tiered pedigree, a rule-based hereditary risk flag list, and a screening
// roadmap. No AI/network calls — everything here is computed client-side from data the
// patient already entered, and labelled as a heuristic rather than medical advice.

const TIER_BY_RELATIONSHIP = {
  grandparent: -2,
  mother: -1,
  father: -1,
  'aunt/uncle': -1,
  self: 0,
  sibling: 0,
  spouse: 0,
  cousin: 0,
  child: 1,
  'niece/nephew': 1,
  grandchild: 2,
};

const TIER_LABELS = {
  '-2': 'Grandparents',
  '-1': 'Parents',
  0: "Patient's Generation",
  1: 'Children',
  2: 'Grandchildren',
};

const FIRST_DEGREE_RELATIONSHIPS = new Set(['mother', 'father', 'sibling', 'child']);
const SECOND_DEGREE_RELATIONSHIPS = new Set(['grandparent', 'grandchild', 'aunt/uncle', 'niece/nephew']);
const NON_BLOOD_RELATIONSHIPS = new Set(['spouse', 'caregiver', 'guardian', 'other']);

export const HEREDITARY_CONDITIONS = [
  {
    id: 'diabetes',
    label: 'Type 2 Diabetes',
    keywords: ['diabetes', 't2dm', 'type 2 diabetes', 'type-2 diabetes'],
    earlyOnsetAge: 40,
    defaultScreeningAge: 45,
    screeningText: 'Fasting blood glucose / HbA1c screening',
  },
  {
    id: 'cad',
    label: 'Coronary Artery Disease',
    keywords: ['coronary', 'heart attack', 'cad', 'cardiac', 'heart disease', 'myocardial'],
    earlyOnsetAge: 55,
    defaultScreeningAge: 45,
    screeningText: 'Lipid profile & cardiac risk assessment',
  },
  {
    id: 'hypertension',
    label: 'Hypertension',
    keywords: ['hypertension', 'high blood pressure'],
    earlyOnsetAge: 45,
    defaultScreeningAge: 30,
    screeningText: 'Routine blood pressure monitoring',
  },
  {
    id: 'cancer',
    label: 'Cancer',
    keywords: ['cancer', 'carcinoma', 'tumor', 'tumour', 'oncology'],
    earlyOnsetAge: 45,
    defaultScreeningAge: 45,
    screeningText: 'Age-appropriate cancer screening (mammogram / colonoscopy / PSA as relevant)',
  },
  {
    id: 'stroke',
    label: 'Stroke',
    keywords: ['stroke', 'cerebrovascular'],
    earlyOnsetAge: 55,
    defaultScreeningAge: 45,
    screeningText: 'Blood pressure & cardiovascular risk review',
  },
];

function normalizeRelationship(relationship) {
  return String(relationship || '').trim().toLowerCase();
}

function degreeOf(relationship) {
  const normalized = normalizeRelationship(relationship);
  if (FIRST_DEGREE_RELATIONSHIPS.has(normalized)) return 'first';
  if (SECOND_DEGREE_RELATIONSHIPS.has(normalized)) return 'second';
  return null;
}

export function buildPedigreeTiers(members = []) {
  const tierMap = new Map();
  const excluded = [];

  members.forEach((member) => {
    const normalized = normalizeRelationship(member.relationship);
    const tier = TIER_BY_RELATIONSHIP[normalized];

    if (tier === undefined) {
      excluded.push(member);
      return;
    }

    const enriched = {
      ...member,
      tier,
      isSelf: normalized === 'self',
      bloodRelative: !NON_BLOOD_RELATIONSHIPS.has(normalized),
      conditions: Array.isArray(member.conditions) ? member.conditions : [],
    };

    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier).push(enriched);
  });

  const tiers = Array.from(tierMap.keys())
    .sort((a, b) => a - b)
    .map((tier) => ({
      tier,
      label: TIER_LABELS[tier] || `Generation ${tier}`,
      members: tierMap.get(tier),
    }));

  return { tiers, excluded };
}

function matchesCondition(conditionName, taxonomyEntry) {
  const normalized = String(conditionName || '').toLowerCase();
  return taxonomyEntry.keywords.some((keyword) => normalized.includes(keyword));
}

export function computeHereditaryRisks(members = []) {
  const bloodRelatives = members.filter((member) => {
    const normalized = normalizeRelationship(member.relationship);
    return normalized && normalized !== 'self' && !NON_BLOOD_RELATIONSHIPS.has(normalized);
  });

  return HEREDITARY_CONDITIONS.map((entry) => {
    const contributors = [];

    bloodRelatives.forEach((member) => {
      const matchingConditions = (Array.isArray(member.conditions) ? member.conditions : [])
        .filter((condition) => matchesCondition(condition.name, entry));

      matchingConditions.forEach((condition) => {
        contributors.push({
          memberId: member.id,
          memberName: member.name,
          relationship: member.relationship,
          degree: degreeOf(member.relationship),
          ageOfOnset: condition.ageOfOnset ?? null,
        });
      });
    });

    const firstDegreeIds = new Set(contributors.filter((c) => c.degree === 'first').map((c) => c.memberId));
    const secondDegreeIds = new Set(contributors.filter((c) => c.degree === 'second').map((c) => c.memberId));
    const onsetAges = contributors.map((c) => c.ageOfOnset).filter((age) => Number.isInteger(age));
    const earliestOnsetAge = onsetAges.length > 0 ? Math.min(...onsetAges) : null;

    let severity = 'none';
    if (firstDegreeIds.size >= 2 || (firstDegreeIds.size >= 1 && earliestOnsetAge !== null && earliestOnsetAge < entry.earlyOnsetAge)) {
      severity = 'high';
    } else if (firstDegreeIds.size === 1 || secondDegreeIds.size >= 2) {
      severity = 'moderate';
    }

    const score = severity === 'high' ? 90 : severity === 'moderate' ? 55 : contributors.length > 0 ? 25 : 5;

    return {
      id: entry.id,
      label: entry.label,
      severity,
      score,
      firstDegreeCount: firstDegreeIds.size,
      secondDegreeCount: secondDegreeIds.size,
      earliestOnsetAge,
      contributors,
      screeningText: entry.screeningText,
      defaultScreeningAge: entry.defaultScreeningAge,
    };
  });
}

export function buildScreeningRoadmap(risks = []) {
  return risks
    .filter((risk) => risk.severity === 'high' || risk.severity === 'moderate')
    .map((risk) => {
      const recommendedAge = risk.earliestOnsetAge !== null
        ? Math.max(18, Math.min(risk.defaultScreeningAge, risk.earliestOnsetAge - 10))
        : risk.defaultScreeningAge;

      const relativeSummary = risk.contributors
        .map((c) => `${c.relationship}${c.ageOfOnset !== null ? ` (onset ${c.ageOfOnset})` : ''}`)
        .join(', ');

      return {
        id: risk.id,
        label: risk.label,
        severity: risk.severity,
        recommendedAge,
        screeningText: risk.screeningText,
        rationale: `Based on ${risk.firstDegreeCount + risk.secondDegreeCount} relative(s) with this condition: ${relativeSummary}.`,
      };
    });
}

export function idsWithFlaggedConditions(risks = []) {
  const ids = new Set();
  risks
    .filter((risk) => risk.severity === 'high' || risk.severity === 'moderate')
    .forEach((risk) => risk.contributors.forEach((c) => ids.add(c.memberId)));
  return ids;
}
