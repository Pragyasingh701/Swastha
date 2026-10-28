// A plain keyword check for emergencies, run on what the patient types or says in
// intake BEFORE the AI sees it, so a dangerous message is caught even when the AI
// misses it, is down, or gives a degraded answer. It covers English, Hindi
// (Devanagari) and Hinglish (Hindi written in English letters).
//
// It leans toward over-flagging on purpose: a false alarm costs a doctor a quick
// look and the patient a message they can ignore, while a missed emergency can
// cost a life. It is not a diagnosis, and it does not replace the AI's own
// red-flag check, it only adds to it.
//
// The only numbers ever shown are India's: 112 (the single emergency number for
// police, fire and ambulance), 108 (ambulance, for critical cases, trauma and
// accidents) and 102 (ambulance for pregnant women and newborns).

const NUMBERS = {
  '112': { number: '112', label: 'Emergency (police, fire, ambulance)' },
  '108': { number: '108', label: 'Ambulance' },
  '102': { number: '102', label: 'Pregnancy and newborn ambulance' },
};

// "no chest pain", "chest pain nahi hai": a symptom the patient is denying. Only
// patterns marked `negatable` are skipped when one of these sits right next to
// the match. Phrases that already contain the negative ("can't breathe") never are.
const NEGATION_BEFORE = /(?:^|[\s,.;:!?])(?:no|not|never|without|don'?t have|do not have|denies|deny|nahi|nahin|nhi|koi|bina)\s+(?:any\s+|koi\s+)?$/;
const NEGATION_AFTER = /^\s*(?:is\s+|are\s+|was\s+|hai\s+|hain\s+|tha\s+)?(?:nahi|nahin|nhi|nhin|nai|नहीं|नही|not\b|no\b)/;

// "chest pain two years ago", "my mother had a stroke last year": history, not now. Only
// clear signs of the long past are used, so a symptom that started days or weeks ago
// (and may well be ongoing) is still flagged. It only counts when it sits in the SAME
// clause as the symptom: "I had chest pain years ago but now I have severe chest pain"
// is a current symptom, so the "years ago" before the "but" must not hide it.
const LONG_PAST = /\b(?:years?|yrs?) (?:ago|back)\b|\blast year\b|\bin (?:the )?(?:distant )?past\b|\bsaal pehle\b|\bsaalon pehle\b|\bfamily history\b|\bhistory of\b|साल पहले/;

// Where one clause ends and the next begins, for the history check above.
const CLAUSE_BREAK = /[.;!?,\n]|\b(?:but|however|although|though|lekin|magar|parantu|par|abhi|now|currently|today)\b|लेकिन|मगर|अभी|अब/g;

const CATEGORIES = [
  {
    id: 'self_harm',
    label: 'Self-harm or suicidal thoughts',
    numbers: ['112'],
    message:
      "You are not alone, and you deserve help right now. Please call 112 immediately, or ask someone near you to stay with you and take you to the nearest hospital.",
    patterns: [
      { re: /suicid/, negatable: true },
      { re: /\bkill(?:ing)? (?:my ?self|me)\b/ },
      { re: /\b(?:end|take) my (?:own )?life\b/ },
      { re: /\bwant(?:ed)? to die\b|\bwish i (?:was|were) (?:dead|never born)\b|\bbetter off (?:dead|without me)\b/ },
      { re: /\bdon'?t want to (?:live|be alive|exist)\b|\bno reason to live\b|\bnot want to live\b/ },
      { re: /\b(?:hurt|harm|cut)(?:ting)? my ?self\b|\bself[- ]?harm/, negatable: true },
      { re: /\bmar jana chah|\bmarna chah|\bmar jaun\b|\bmar jaoon\b|\bjeena nahi chah|\bjina nahi chah|\bjine ka (?:mann?|man) nahi|\bjeene ka (?:mann?|man) nahi/ },
      { re: /\bkhud ko (?:khatam|maar|hurt|nuksan)|\baatm ?hatya|\batmahatya|\bzindagi (?:khatam|se thak)|\bjaan de (?:dun|du|doon)/ },
      { re: /आत्महत्या|मरना चाह|मर जाना चाह|जीना नहीं चाह|जीने का मन नहीं|खुद को (?:खत्म|मार|नुकसान)|जान दे/ },
    ],
  },
  {
    id: 'pregnancy_newborn',
    label: 'Pregnancy or newborn emergency',
    numbers: ['102', '108', '112'],
    message:
      "This could be an emergency for you or your baby. Call 102 (pregnancy and newborn ambulance) now. If you can't reach 102, call 108 or 112.",
    patterns: [
      { re: /\b(?:pregnan\w*|labou?r)\b.{0,60}\b(?:bleed\w*|severe pain|convuls\w*|fits?|not moving|no movement|water (?:has )?broke|leaking)\b/ },
      { re: /\b(?:baby|fetus|foetus)\b.{0,15}\b(?:is )?(?:not moving|stopped moving|isn'?t moving)\b/ },
      { re: /\bwaters? (?:has |have )?broke\b|\blabou?r pains?\b|\bin labou?r\b/ },
      { re: /\b(?:newborn|new-?born|infant|my baby)\b.{0,50}\b(?:not breathing|isn'?t breathing|turning blue|blue|limp|unresponsive|seizure|fits|not feeding)\b/ },
      { re: /\b(?:garbh\w*|pregnan\w*|pregnancy)\b.{0,60}\b(?:khoon|bleeding|bahut dard|tez dard)\b|\bbachch?e? (?:ne )?hil\w* (?:nahi|nhi)|\bpani (?:toot|beh)|\bdelivery (?:ka )?(?:dard|pain)|\bprasav (?:peeda|dard)/ },
      { re: /गर्भ.{0,40}(?:खून|रक्त)|प्रसव (?:पीड़ा|दर्द)|बच्चा (?:नहीं )?हिल|नवजात.{0,40}(?:सांस|साँस|नीला|बेहोश)|पानी (?:टूट|निकल)/ },
    ],
  },
  {
    id: 'feels_like_dying',
    label: 'Feels they are dying',
    numbers: ['108', '112'],
    patterns: [
      { re: /\b(?:feel(?:ing)? like|think|thinking|feel) (?:i am|i'm|i will be|i might be|i'm going to be) (?:dying|going to die)\b|\bfeel(?:ing)? like (?:i('| a)m )?(?:going to )?die\b/ },
      { re: /\bmar raha hu\b|\bmar rahi hu\b|\bmera dam nikal/ },
    ],
  },
  {
    id: 'breathing',
    label: 'Severe difficulty breathing',
    numbers: ['108', '112'],
    patterns: [
      { re: /\b(?:can'?t|cannot|can not|unable to|not able to) (?:breathe|breath|catch my breath|get (?:a )?breath)\b/ },
      { re: /\b(?:difficulty|trouble|struggling|hard|problem) (?:in |to |with )?breath(?:ing|e)\b|\bshort(?:ness)? of breath\b|\bbreathless(?:ness)?\b|\bgasping\b|\bchoking\b/, negatable: true },
      { re: /\bsaans? (?:nahi|nahin|nhi) (?:aa|le|a )|\bsaans? (?:lene )?(?:mein|me|mai) (?:bahut |zyada )?(?:takleef|dikkat|problem|mushkil)|\bsans (?:nahi|nhi)|\bd[au]m (?:ghut|phool)|\bsaans phool/ },
      { re: /सा[ंँ]स (?:नहीं|नही)|सा[ंँ]स (?:लेने )?में (?:तकलीफ|दिक्कत|मुश्किल)|दम (?:घुट|फूल)/ },
    ],
  },
  {
    id: 'chest',
    label: 'Chest pain or possible heart attack',
    numbers: ['108', '112'],
    patterns: [
      { re: /\bchest (?:pain|tightness|pressure|heaviness|hurts?|is hurting|aches?|burning)\b|\bpain in (?:my |the )?chest\b|\bpressure (?:on|in) (?:my |the )?chest\b|\bheart attack\b/, negatable: true },
      { re: /\b(?:seene|sine|chhati|chhaati|chaati|chati)(?: ?(?:me|mein|mai|main|ka|ki))? (?:\w+ ){0,2}(?:dard|pain|bhaari|bhari|jakdan|jalan)\b/, negatable: true },
      { re: /\b(?:dil|heart)(?: ?(?:me|mein|mai|main|ka|ki))? (?:\w+ ){0,2}(?:dard|pain)\b/, negatable: true },
      { re: /(?:सीने|छाती|दिल)(?: में| मे| का| की)? (?:\S+ ){0,2}(?:दर्द|भारीपन|जकड़न)|दिल का दौरा|हार्ट अटैक/, negatable: true },
    ],
  },
  {
    id: 'stroke',
    label: 'Possible stroke',
    numbers: ['108', '112'],
    patterns: [
      { re: /\bslurred speech\b|\b(?:face|mouth) (?:is )?droop|\bsudden(?:ly)? (?:weak|numb)|\bparalys(?:is|ed)\b|\bcan'?t speak\b/, negatable: true },
      { re: /\b(?:can'?t|cannot|unable to) (?:move|lift|feel) (?:my )?(?:arm|leg|hand|face|one side)\b|\b(?:one|half)[- ]side(?:d)?\b.{0,25}\b(?:weak|numb|paraly)/ },
      { re: /\bstroke\b/, negatable: true },
      { re: /\blakwa\b|\blaqwa\b|\bek (?:taraf|side)\b.{0,20}\b(?:kamzor|sunn)|\bzubaan (?:lad|ladkha)|\bbol nahi pa/ },
      { re: /लकवा|बोल नहीं पा|एक तरफ.{0,20}(?:कमजोर|सुन्न)|जुबान लड़खड़ा|ज़ुबान लड़खड़ा/ },
    ],
  },
  {
    id: 'unconscious_seizure',
    label: 'Fainting, loss of consciousness or seizure',
    numbers: ['108', '112'],
    patterns: [
      { re: /\b(?:lost|loss of) consciousness\b|\bpassed out\b|\bfaint(?:ed|ing)\b|\bblacked out\b|\bunconscious\b|\bunresponsive\b/, negatable: true },
      { re: /\bseizures?\b|\bconvulsions?\b|\bhaving (?:a )?fits?\b/, negatable: true },
      { re: /\bbehosh\b|\bhosh (?:nahi|kho)|\bchakkar (?:aa )?(?:ke|kar) gir|\bdaura pad|\bmirgi\b|\bfits? (?:aa|pad)/, negatable: true },
      { re: /बेहोश|होश (?:नहीं|खो)|दौरा पड़|मिर्गी|चक्कर आकर गिर/, negatable: true },
    ],
  },
  {
    id: 'bleeding',
    label: 'Severe bleeding',
    numbers: ['108', '112'],
    patterns: [
      { re: /\bbleeding (?:that )?(?:won'?t|will not|doesn'?t|does not|can'?t|cannot) stop\b|\b(?:heavy|severe|profuse|uncontrolled|a lot of) bleeding\b|\bbleeding (?:heavily|profusely|a lot)\b/, negatable: true },
      { re: /\bvomit(?:ing)? blood\b|\bcough(?:ing)? (?:up )?blood\b/ },
      { re: /\bkhoon (?:nahi|nhi) ruk|\b(?:bahut|zyada|jyada) khoon (?:beh|nikal|aa)|\bkhoon (?:ki )?ulti|\bkhoon (?:thook|khans)/ },
      { re: /खून (?:नहीं|नही) (?:रुक|बंद)|(?:बहुत|ज्यादा|ज़्यादा) खून|खून की उल्टी/ },
    ],
  },
  {
    id: 'poison_injury',
    label: 'Poisoning, overdose, burn, bite or serious injury',
    numbers: ['108', '112'],
    patterns: [
      { re: /\bpoison(?:ed|ing)?\b|\boverdos(?:e|ed)\b|\bswallowed (?:something|pills|poison|bleach|acid)\b|\bsnake ?bite\b|\bbitten by (?:a )?snake\b|\belectric shock\b|\bdrown(?:ed|ing)\b/, negatable: true },
      { re: /\b(?:head|serious|severe) injury\b|\bburn(?:ed|t)? (?:badly|severely)\b/, negatable: true },
      { re: /\bzeher (?:kha|pi)|\bsaanp (?:ne )?(?:kaat|kata)|\bcurrent (?:lag|laga)/ },
      { re: /जहर (?:खा|पी)|सा[ंँ]प ने काट|करंट लग/ },
    ],
  },
  {
    id: 'allergic',
    label: 'Severe allergic reaction',
    numbers: ['108', '112'],
    patterns: [
      { re: /\b(?:throat|tongue|lips?|face) (?:is |are )?(?:swell\w*|swollen|closing)\b|\banaphyla|\b(?:can'?t|cannot|difficulty|trouble) swallow/, negatable: true },
      { re: /\bgala (?:band|sooj)|\b(?:honth|hont|zubaan|chehra) sooj/ },
      { re: /गला (?:बंद|सूज)|होंठ.{0,10}सूज/ },
    ],
  },
  {
    id: 'severe_headache',
    label: 'Sudden severe headache',
    numbers: ['108', '112'],
    patterns: [
      { re: /\bworst headache\b|\bthunderclap\b|\bsudden severe headache\b|\bsevere sudden headache\b/ },
      { re: /\bsabse (?:bura|tez|zyada) (?:sir|sar) ?dard\b/ },
      { re: /सबसे (?:तेज|बुरा|भयंकर) (?:सिर|सर) ?दर्द|अचानक.{0,15}(?:तेज|भयंकर) (?:सिर|सर) ?दर्द/ },
    ],
  },
];

const DEFAULT_MESSAGE =
  "This could be a medical emergency. Call 108 for an ambulance now (or 112). Don't wait for the clinic to reply.";

// The clause around [start, end): from the nearest break before it to the nearest after.
function clauseAround(text, start, end) {
  const before = text.slice(Math.max(0, start - 120), start);
  let from = Math.max(0, start - 120);
  for (const m of before.matchAll(CLAUSE_BREAK)) from = Math.max(0, start - 120) + m.index + m[0].length;
  const after = text.slice(end, end + 120);
  CLAUSE_BREAK.lastIndex = 0;
  const next = CLAUSE_BREAK.exec(after);
  CLAUSE_BREAK.lastIndex = 0;
  return text.slice(from, next ? end + next.index : end + after.length);
}

// True when the match at [start, end) is a symptom the patient is denying, or history.
function isNegated(text, start, end) {
  return NEGATION_BEFORE.test(text.slice(Math.max(0, start - 30), start))
    || NEGATION_AFTER.test(text.slice(end, end + 20))
    || LONG_PAST.test(clauseAround(text, start, end));
}

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Looks for an emergency in what the patient said.
 *
 * @param {string} message
 * @returns {null | {
 *   category: string, reason: string, message: string,
 *   numbers: Array<{ number: string, label: string }>
 * }}
 */
export function detectEmergency(message) {
  const text = normalise(message);
  if (!text.trim()) return null;

  for (const category of CATEGORIES) {
    for (const { re, negatable } of category.patterns) {
      const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
      const scan = new RegExp(re.source, flags);
      let match;
      while ((match = scan.exec(text)) !== null) {
        if (match[0].length === 0) {
          scan.lastIndex += 1;
          continue;
        }
        if (negatable && isNegated(text, match.index, match.index + match[0].length)) continue;
        return {
          category: category.id,
          reason: `${category.label} (patient's words matched)`,
          message: category.message || DEFAULT_MESSAGE,
          numbers: category.numbers.map((n) => NUMBERS[n]),
        };
      }
    }
  }
  return null;
}
