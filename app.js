/* ============================================================
   Cue — Shared App Logic
   HIPAA/GDPR: patient IDs only, no PII in sessionStorage/localStorage
   ============================================================ */

// ── Session ──────────────────────────────────────────────────
const Session = {
  get role()      { return sessionStorage.getItem('cue_role')      || 'patient'; },
  get id()        { return sessionStorage.getItem('cue_id')        || generateId('PT'); },
  get firstName() { return sessionStorage.getItem('cue_firstname') || ''; },
  init() {
    if (!sessionStorage.getItem('cue_id')) {
      const id = generateId(this.role === 'doctor' ? 'DR' : 'PT');
      sessionStorage.setItem('cue_id', id);
      sessionStorage.setItem('cue_role', this.role);
    }
    document.querySelectorAll('#navId').forEach(el => el.textContent = this.id);
    // Show first name greeting if available
    const fn = this.firstName;
    document.querySelectorAll('.patient-greeting').forEach(el => { el.textContent = fn ? 'Hello, ' + fn : ''; });
  }
};

function generateId(prefix) {
  const num  = Math.floor(1000 + Math.random() * 9000);
  const suf  = Math.random().toString(36).substring(2,4).toUpperCase();
  return `${prefix}-${num}-${suf}`;
}

// ── Mock data store (in-memory, keyed by patient ID) ─────────
const Store = {
  _data: {},
  get(patientId) { return this._data[patientId] || (this._data[patientId] = { checkins: [], consultation: null }); },
  save(patientId, key, value) { this.get(patientId)[key] = value; },
  push(patientId, key, value) {
    const rec = this.get(patientId);
    if (!rec[key]) rec[key] = [];
    rec[key].push(value);
  }
};

// ── Audit log (HIPAA: every action logged) ───────────────────
const Audit = {
  log(action, patientId, meta = {}) {
    const entry = {
      ts: new Date().toISOString(),
      action,
      patientId: patientId || 'unknown',
      sessionId: Session.id,
      ...meta
    };
    // In production: POST to secure audit endpoint
    console.info('[AUDIT]', entry);
  }
};

// ── Mock Whisper transcription — realistic per question ──────
// In production: openai/whisper running locally (WASM or server-side)
// Returns a contextually appropriate answer for the current question index
async function transcribeAudio(lang = 'auto', questionIndex = 0) {
  await sleep(700 + Math.random() * 500);

  // Realistic patient answers mapped to each SOCRATES question slot
  const scenarios = {
    headache: [
      "I've been getting really bad headaches, mostly on the right side of my head.",
      "It started about three days ago, came on gradually over a few hours and has been getting progressively worse.",
      "The pain is throbbing, right behind my eye and temple. It pulses with my heartbeat.",
      "Currently about a 7 out of 10. It was an 8 earlier this morning. It's been fairly constant.",
      "It stays on the right side mainly, but sometimes the pain spreads across my whole forehead. It's constant.",
      "I've been sensitive to light and sound. I also felt nauseous this morning and vomited once.",
      "Lying down in a dark quiet room helps a bit. Bright light and loud noises make it much worse. Paracetamol only took the edge off.",
      "I had similar headaches about two years ago — my GP thought it might be migraines. I'm not on any regular medications. No known allergies.",
      "No chest pain, no weakness in my limbs. The headache was severe but not the worst of my life.",
    ],
    urti: [
      "I've had a sore throat and a fever for the past couple of days.",
      "It started suddenly two days ago — I woke up feeling unwell with a temperature.",
      "The throat pain is sharp when I swallow, like swallowing glass. I also have a sore head.",
      "Throat pain is about a 6 out of 10. Fever was 38.8 this morning. I feel exhausted.",
      "The throat pain stays in my throat and neck. It's constant, worse when swallowing.",
      "I've had chills, sweating, and generalised fatigue. No cough or runny nose so far.",
      "Cold drinks and throat lozenges help a bit. Paracetamol brings the fever down temporarily but it keeps coming back.",
      "No significant medical history. Not on any regular medications. Allergic to penicillin — gets a rash.",
      "No difficulty breathing, no rash, no neck stiffness. No blood.",
    ],
    gastro: [
      "I've had stomach cramps and diarrhoea since last night.",
      "It started suddenly around 10pm yesterday after dinner. Getting slightly worse overnight.",
      "Crampy, colicky pain around my belly button and lower abdomen. Comes in waves.",
      "Pain is about a 6 when it cramps. In between it's a 2-3. I've vomited twice.",
      "The pain is mainly around my belly button but shifted slightly to the right lower side this morning. Comes and goes every 20-30 minutes.",
      "Nausea, vomiting twice, watery diarrhoea about 5 times since last night. No blood in stool. Slight fever of 37.9.",
      "Lying still helps. Eating or drinking anything makes the cramps worse. No medications have helped yet.",
      "No significant past history. Not on regular medications. No allergies. My partner had similar symptoms yesterday.",
      "No blood in vomit or stool. No severe pain that won't go away. No difficulty breathing.",
    ],
  };

  const langSamples = {
    es: ["Tengo dolor de cabeza pulsátil en el lado derecho desde hace tres días.", "Empezó hace dos días, de repente, con fiebre y dolor de garganta."],
    fr: ["J'ai une migraine pulsatile côté droit depuis trois jours.", "J'ai de la fièvre et mal à la gorge depuis deux jours."],
    de: ["Ich habe seit drei Tagen pochende Kopfschmerzen auf der rechten Seite.", "Ich habe seit zwei Tagen Fieber und Halsschmerzen."],
    hi: ["मुझे तीन दिनों से दाईं तरफ धड़कते हुए सिरदर्द हो रहा है।", "दो दिनों से बुखार और गले में दर्द है।"],
    ar: ["أعاني من صداع نابض في الجانب الأيمن منذ ثلاثة أيام.", "أعاني من الحمى وألم في الحلق منذ يومين."],
    ta: ["மூன்று நாட்களாக வலது பக்கம் துடிக்கும் தலைவலி உள்ளது.", "இரண்டு நாட்களாக காய்ச்சல் மற்றும் தொண்டை வலி உள்ளது."],
  };

  if (lang !== 'auto' && lang !== 'en' && langSamples[lang]) {
    const pool = langSamples[lang];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Pick a scenario randomly on first question, then stay consistent
  if (!transcribeAudio._scenario) {
    const keys = Object.keys(scenarios);
    transcribeAudio._scenario = keys[Math.floor(Math.random() * keys.length)];
  }
  const scene = scenarios[transcribeAudio._scenario];
  return scene[Math.min(questionIndex, scene.length - 1)];
}

// ── BioMistral-7B differential diagnosis ─────────────────────
// In production: BioMistral-7B (Mistral-7B fine-tuned on PubMed Central,
// Apache 2.0) running locally via llama.cpp / Ollama.
// HuggingFace: BioMistral/BioMistral-7B
async function runDiagnosis(answers) {
  await sleep(1800 + Math.random() * 1200);
  const text = answers.map(a => a.text).join(' ').toLowerCase();

  // Extract structured features from answers
  const feat = {
    headache:     /headache|migraine|temple|throbbing|head pain|behind.*eye/.test(text),
    urti:         /sore throat|fever|tonsil|pharynx|swallow|chills|strep/.test(text),
    gastro:       /stomach|nausea|vomit|diarrh|cramp|abdom|bowel/.test(text),
    chest:        /chest|cardiac|heart|palpitat|breath|dyspnoea/.test(text),
    musculo:      /knee|joint|sprain|muscle|back pain|ankle|twisted/.test(text),
    uti:          /urine|urinary|burning.*pee|frequent.*toilet|bladder/.test(text),

    // Red flag signals from Q9 (red flag screen)
    redFlagChest: /chest pain|tightness.*chest/.test(text),
    redFlagNeuro: /sudden.*headache|worst.*ever|weakness|numb|speech|facial droop/.test(text),
    redFlagGI:    /blood.*stool|black stool|melen|haematemesis|blood.*vomit/.test(text),
    redFlagResp:  /can't breathe|difficulty breathing|unable.*breathe/.test(text),
  };

  // Collect any triggered red flags
  const redFlags = [];
  if (feat.redFlagChest) redFlags.push({ label: '🚨 Chest pain reported — urgent cardiac rule-out required (ECG, troponin)', severity: 'urgent' });
  if (feat.redFlagNeuro) redFlags.push({ label: '🚨 Sudden severe headache — subarachnoid haemorrhage must be excluded urgently', severity: 'urgent' });
  if (feat.redFlagGI)    redFlags.push({ label: '🚨 Blood in stool/vomit — urgent GI review and bloods required', severity: 'urgent' });
  if (feat.redFlagResp)  redFlags.push({ label: '🚨 Respiratory distress reported — O₂ saturation and CXR required', severity: 'urgent' });

  // Extract duration and severity from free text
  const durationMatch = text.match(/(\d+)\s*(day|hour|week|month)/);
  const durationStr   = durationMatch ? `${durationMatch[1]} ${durationMatch[2]}${+durationMatch[1]>1?'s':''}` : 'not specified';
  const severityMatch = text.match(/\b([5-9]|10)\s*(out of|\/)\s*10|\b([5-9]|10)\b.*pain/);
  const isSevere      = !!severityMatch;

  if (feat.headache) {
    const hasAura   = /visual|zigzag|flicker|aura|blind spot/.test(text);
    const bilateral = /both sides|bilateral/.test(text);
    const bandlike  = /band|tight|pressure.*head|squeezing/.test(text);
    return {
      symptoms: [
        { label: `${bilateral ? 'Bilateral' : 'Unilateral'} ${bandlike ? 'pressure-type' : 'throbbing'} headache`, severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Photophobia / phonophobia', severity: /light|sound|sensitive/.test(text) ? 'moderate' : 'not reported', duration: durationStr },
        { label: 'Nausea', severity: /nausea|sick|vomit/.test(text) ? 'mild' : 'not reported', duration: durationStr },
      ],
      diagnoses: bandlike
        ? [
            { name: 'Tension-type headache', icd: 'G44.2', confidence: 74, rationale: 'Bilateral, pressure/band-like quality without nausea' },
            { name: 'Medication-overuse headache', icd: 'G44.4', confidence: 16, rationale: 'If analgesics used >10 days/month' },
            { name: 'Migraine without aura', icd: 'G43.0', confidence: 10, rationale: 'Less likely given bilateral, non-pulsating quality' },
          ]
        : [
            { name: `Migraine ${hasAura ? 'with aura' : 'without aura'}`, icd: hasAura ? 'G43.1' : 'G43.0', confidence: 79, rationale: 'Unilateral pulsating pain, photophobia, nausea — meets ICHD-3 criteria' },
            { name: 'Tension-type headache', icd: 'G44.2', confidence: 15, rationale: 'Consider if pulsating quality absent on exam' },
            { name: 'Cluster headache', icd: 'G44.0', confidence: 6, rationale: 'Less likely — no periorbital tearing or rhinorrhoea reported' },
          ],
      notes: buildNotes(bandlike ? 'Tension-type headache' : `Migraine ${hasAura?'with':'without'} aura`, answers, 'neurology'),
      redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.headache,
    };
  }

  if (feat.urti) {
    const exudates = /white spots|pus|exudate|tonsil/.test(text);
    const allergy  = /penicillin|allerg/.test(text);
    return {
      symptoms: [
        { label: 'Sore throat — odynophagia on swallowing', severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Pyrexia', severity: /38\.|39\.|40\.|\bfever\b/.test(text) ? 'moderate' : 'mild', duration: durationStr },
        { label: 'Cervical lymphadenopathy', severity: /glands|lymph|neck.*swollen/.test(text) ? 'mild' : 'not reported', duration: durationStr },
      ],
      diagnoses: exudates
        ? [
            { name: 'Streptococcal pharyngitis (Group A)', icd: 'J02.0', confidence: 68, rationale: 'Tonsillar exudates, fever, no cough — Centor score ≥3' },
            { name: 'Infectious mononucleosis (EBV)', icd: 'B27.0', confidence: 20, rationale: 'Consider if lymphadenopathy widespread or splenomegaly' },
            { name: 'Viral pharyngitis', icd: 'J02.9', confidence: 12, rationale: 'Cannot exclude without throat swab' },
          ]
        : [
            { name: 'Viral upper respiratory tract infection', icd: 'J06.9', confidence: 72, rationale: 'Acute onset, fever, sore throat without exudates — most likely viral aetiology' },
            { name: 'Streptococcal pharyngitis', icd: 'J02.0', confidence: 20, rationale: 'Centor criteria: throat swab recommended if ≥3 criteria met' },
            { name: 'Influenza A/B', icd: 'J11.1', confidence: 8, rationale: 'Consider if myalgia and systemic features prominent' },
          ],
      notes: buildNotes('Viral URTI', answers, 'general practice'),
      redFlags: allergy ? [{ label: 'ℹ️ Penicillin allergy documented — use macrolide if antibiotic indicated', severity: 'info' }, ...redFlags] : redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.urti,
    };
  }

  if (feat.gastro) {
    const rightIliac = /right.*lower|rlq|right iliac/.test(text);
    const bloodStool = /blood.*stool|red.*stool|black stool/.test(text);
    return {
      symptoms: [
        { label: 'Colicky abdominal pain', severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Nausea and vomiting', severity: /vomit/.test(text) ? 'moderate' : 'mild', duration: durationStr },
        { label: 'Diarrhoea', severity: /diarrh|loose.*stool|watery/.test(text) ? 'moderate' : 'not reported', duration: durationStr },
      ],
      diagnoses: [
        { name: 'Acute infectious gastroenteritis', icd: 'A09', confidence: rightIliac ? 52 : 71, rationale: `Acute onset${/contact|partner|ate out/.test(text)?' with likely contact/dietary source':''}, self-limiting pattern` },
        { name: rightIliac ? 'Appendicitis (rule out urgently)' : 'Irritable bowel syndrome — acute episode', icd: rightIliac ? 'K37' : 'K58.0', confidence: rightIliac ? 33 : 19, rationale: rightIliac ? 'Pain migration to RLQ — Alvarado score calculation required' : 'Recurring pattern with stress/dietary correlation' },
        { name: 'Food poisoning (Salmonella / Campylobacter)', icd: 'A02.9', confidence: 10, rationale: 'Consider stool culture if symptoms persist >48h or systemic features' },
      ],
      notes: buildNotes('Acute infectious gastroenteritis', answers, 'general practice'),
      redFlags: [
        ...(rightIliac ? [{ label: '🚨 Pain in right iliac fossa — appendicitis must be urgently excluded. Consider surgical review.', severity: 'urgent' }] : []),
        ...(bloodStool  ? [{ label: '🚨 Blood in stool reported — urgent review for GI bleeding source', severity: 'urgent' }] : []),
        ...redFlags,
      ],
      checkinQuestions: CHECKIN_QUESTIONS.gastro,
    };
  }

  if (feat.musculo) {
    return {
      symptoms: [
        { label: 'Joint pain and swelling', severity: 'moderate', duration: durationStr },
        { label: 'Limited range of motion', severity: 'mild', duration: durationStr },
      ],
      diagnoses: [
        { name: 'Acute ligamentous sprain', icd: 'S93.4', confidence: 70, rationale: 'Mechanism of injury consistent with inversion/eversion sprain' },
        { name: 'Fracture (rule out)', icd: 'S82.9', confidence: 20, rationale: 'Ottawa rules should be applied to determine need for X-ray' },
        { name: 'Meniscal injury', icd: 'S83.2', confidence: 10, rationale: 'Consider if joint line tenderness or locking reported' },
      ],
      notes: buildNotes('Acute ligamentous sprain', answers, 'musculoskeletal'),
      redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.musculo,
    };
  }

  // Fallback
  return {
    symptoms: [
      { label: 'Systemic malaise', severity: 'mild', duration: durationStr },
      { label: 'Fatigue', severity: 'mild', duration: durationStr },
    ],
    diagnoses: [
      { name: 'Non-specific viral illness', icd: 'B34.9', confidence: 55, rationale: 'Symptoms consistent with self-limiting viral syndrome' },
      { name: 'Undifferentiated febrile illness', icd: 'R50.9', confidence: 30, rationale: 'Further history and examination required' },
      { name: 'Psychosomatic / functional disorder', icd: 'F45.9', confidence: 15, rationale: 'Consider if no organic cause identified on workup' },
    ],
    notes: buildNotes('Non-specific viral illness', answers, 'general practice'),
    redFlags,
    checkinQuestions: CHECKIN_QUESTIONS.default,
  };
}

// SOAP-format clinical notes
function buildNotes(primaryDx, answers, specialty) {
  specialty = specialty || 'general practice';
  const patientId = Session.id;
  const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const qa = answers.filter(function(a) { return a.text && a.text !== '[Not answered]'; });

  const noteRow = function(label, value) {
    return '<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<span style="min-width:130px;font-size:.75rem;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.04em;padding-top:1px">' + label + '</span>' +
      '<span style="font-size:.85rem;color:var(--text-2);flex:1;line-height:1.6">' + value + '</span>' +
    '</div>';
  };

  const sectionHead = function(label) {
    return '<div style="margin:16px 0 8px;padding:6px 10px;background:var(--surface-2);border-radius:4px;border-left:3px solid var(--accent)">' +
      '<span style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)">' + label + '</span>' +
    '</div>';
  };

  const hpcRows = qa.slice(1).map(function(a) {
    return noteRow(a.cat, a.text);
  }).join('');

  return '<div style="font-family:var(--font)">' +
    // Header
    '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid var(--border);margin-bottom:4px">' +
      '<div>' +
        '<div style="font-size:.8rem;font-weight:700;color:var(--text);margin-bottom:2px">CUE PRE-CONSULTATION NOTE</div>' +
        '<div style="font-size:.72rem;color:var(--subtle)">' + patientId + ' &nbsp;·&nbsp; ' + date + ' &nbsp;·&nbsp; ' + specialty + '</div>' +
      '</div>' +
      '<span class="badge badge-teal" style="font-size:.65rem;align-self:flex-start">BioMistral-7B</span>' +
    '</div>' +

    // S — Subjective
    sectionHead('S — Subjective') +
    noteRow('Chief complaint', qa[0] ? qa[0].text : 'Not provided.') +
    hpcRows +

    // O — Objective
    sectionHead('O — Objective') +
    noteRow('Vitals', 'Not yet assessed — to be completed at consultation') +
    noteRow('Examination', 'Pending physical examination by clinician') +

    // A — Assessment
    sectionHead('A — Assessment (AI)') +
    noteRow('Primary Dx', '<strong>' + primaryDx + '</strong>') +
    '<div style="margin:8px 0;padding:8px 12px;background:#FEF9C3;border-radius:4px;font-size:.78rem;color:#713F12">' +
      '⚠️ AI-generated draft. Must be reviewed and confirmed by the attending physician before any treatment.' +
    '</div>' +

    // P — Plan
    sectionHead('P — Plan (physician to confirm)') +
    noteRow('Step 1', 'Confirm diagnosis by history and physical examination') +
    noteRow('Step 2', 'Order investigations as indicated by clinical findings') +
    noteRow('Step 3', 'Review and action any red-flag symptoms flagged above') +
    noteRow('Step 4', 'Discuss management options and follow-up plan with patient') +

    // Footer
    '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);font-size:.7rem;color:var(--subtle)">' +
      'Generated by BioMistral-7B (Apache 2.0 · PubMed Central fine-tune) + Whisper large-v3 (MIT)' +
    '</div>' +
  '</div>';
}

// ── Condition-specific follow-up check-in questions ──────────
// These are what the voice bot asks every 2 days — tailored to the diagnosis.
const CHECKIN_QUESTIONS = {
  headache: [
    'Since our last check-in, have you had any further headache episodes — and if so, how many?',
    'When a headache occurs, how do you rate the severity compared to before — better, the same, or worse?',
    'Are you identifying any patterns or triggers — such as disrupted sleep, certain foods, stress, or screen time?',
    'Is your prescribed medication helping when you take it? Any side effects such as drowsiness or rebound headaches?',
    'Have you had any visual disturbances, weakness in your limbs, speech difficulties, or a headache described as "the worst of your life"? These need urgent review.',
  ],
  urti: [
    'How are you feeling compared to when we last spoke — better, about the same, or worse?',
    'Is your temperature back to normal? If you have checked it recently, what was the reading?',
    'How is your throat — can you swallow more comfortably, or is the pain the same or worse?',
    'Are you managing to eat and drink enough to stay hydrated? Fluids are especially important right now.',
    'Have you developed any difficulty breathing, a spreading rash, neck stiffness, or ear pain? These would need prompt review.',
  ],
  gastro: [
    'How is your stomach since we last spoke — are the cramps improving, and are you able to keep food and fluids down?',
    'How many episodes of diarrhoea or vomiting have you had in the last 24 hours?',
    'Are you managing to stay hydrated? Signs of dehydration include dry mouth, dark urine, dizziness, or feeling faint.',
    'Has the abdominal pain changed in character or location — particularly has it moved to your lower right side and become more constant?',
    'Have you noticed any blood in your stool or vomit, or developed a fever above 38.5°C? If so, you should be seen today.',
  ],
  musculo: [
    'How is the pain and swelling today compared to our last check-in — improving, the same, or worse?',
    'Are you able to bear weight on it, or is it still too painful to stand or walk?',
    'Are you managing the RICE protocol — rest, ice, compression, and elevation?',
    'Have you started any physiotherapy or gentle range-of-motion exercises as advised?',
    'Any new numbness, tingling, pins and needles, or loss of sensation around the joint? These would need review.',
  ],
  default: [
    'How are you feeling overall compared to when we last spoke — better, about the same, or worse?',
    'On a scale of 0 to 10, what is your discomfort level today, compared to your last check-in?',
    'Have any new symptoms appeared since our last conversation?',
    'Are you taking your medications as prescribed, and have you noticed any side effects?',
    'Have you had any concerning symptoms such as chest pain, difficulty breathing, or sudden worsening? If so, please seek urgent care.',
  ],
};

// ── Utility ──────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function severityColor(s) {
  if (s <= 3) return 'var(--clr-success)';
  if (s <= 6) return 'var(--clr-warning)';
  return 'var(--clr-danger)';
}

function severityLabel(s) {
  if (s <= 2) return 'Mild';
  if (s <= 5) return 'Moderate';
  if (s <= 7) return 'Severe';
  return 'Critical';
}

// ── Mock patient dataset ──────────────────────────────────────
const MOCK_PATIENTS = [
  {
    id: 'PT-2847-XK', condition: 'Migraine without aura', daysTracked: 6,
    lastCheckin: Date.now() - 1000*60*60*18,
    trend: 'improving', currentSeverity: 3.2, baseline: 7.1,
    outlier: false, status: 'active',
    checkins: generateCheckins(6, [7,6,8,5,4,3]),
    diagnosis: { name:'Migraine without aura', icd:'G43.0', confirmed: true, confirmedBy:'DR-1042-MB' },
    recommendations: [
      { type: 'medication', text: 'Sumatriptan 50mg at onset of migraine', icon: '💊' },
      { type: 'lifestyle', text: 'Maintain regular sleep schedule; avoid known triggers', icon: '🌙' },
      { type: 'monitoring', text: 'Log headache severity and duration after each episode', icon: '📊' },
    ]
  },
  {
    id: 'PT-3391-AW', condition: 'Viral URTI', daysTracked: 4,
    lastCheckin: Date.now() - 1000*60*60*36,
    trend: 'stable', currentSeverity: 5.1, baseline: 6.3,
    outlier: false, status: 'active',
    checkins: generateCheckins(4, [6,7,6,5]),
    diagnosis: { name:'Viral upper respiratory tract infection', icd:'J06.9', confirmed: true, confirmedBy:'DR-1042-MB' },
    recommendations: [
      { type: 'medication', text: 'Paracetamol 500mg every 6 hours as needed for fever/pain', icon: '💊' },
      { type: 'lifestyle', text: 'Rest, adequate hydration — at least 2L water daily', icon: '💧' },
    ]
  },
  {
    id: 'PT-5512-RJ', condition: 'Acute gastroenteritis', daysTracked: 3,
    lastCheckin: Date.now() - 1000*60*60*10,
    trend: 'worsening', currentSeverity: 7.8, baseline: 5.5,
    outlier: true, status: 'urgent',
    checkins: generateCheckins(3, [5,6,8]),
    diagnosis: { name:'Acute gastroenteritis', icd:'A09', confirmed: true, confirmedBy:'DR-1042-MB' },
    recommendations: [
      { type: 'medication', text: 'Oral rehydration salts after each loose stool', icon: '💊' },
      { type: 'alert', text: '⚠️ Severity escalating — consider in-person review', icon: '🚨' },
    ]
  },
  {
    id: 'PT-7723-LM', condition: 'Pending review', daysTracked: 0,
    lastCheckin: Date.now() - 1000*60*30,
    trend: null, currentSeverity: null, baseline: null,
    outlier: false, status: 'pending',
    checkins: [],
    diagnosis: { name:'Non-specific viral illness', icd:'B34.9', confirmed: false, confirmedBy: null },
    recommendations: []
  },
  {
    id: 'PT-9104-SZ', condition: 'Pending review', daysTracked: 0,
    lastCheckin: Date.now() - 1000*60*60*2,
    trend: null, currentSeverity: null, baseline: null,
    outlier: false, status: 'pending',
    checkins: [],
    diagnosis: { name:'Streptococcal pharyngitis', icd:'J02.0', confirmed: false, confirmedBy: null },
    recommendations: []
  },
];

function generateCheckins(n, severities) {
  return Array.from({ length: n }, (_, i) => ({
    id: `CI-${Date.now()}-${i}`,
    date: Date.now() - (n - i) * 1000*60*60*48,
    severity: severities[i] || Math.round(3 + Math.random()*5),
    symptoms: ['Fatigue','Headache','Nausea','Cough','Fever','Pain']
      .sort(() => Math.random()-.5).slice(0, 2+Math.floor(Math.random()*3)),
    notes: 'Patient report via voice check-in (Whisper transcription).',
    lang: 'en',
    outlier: severities[i] >= 8,
  }));
}

// ── Patient name registry (name → PT-ID mapping) ─────────────
// In production: server-side lookup with name hashed before transit.
// Here: client-side mock for demo. Name stored only in sessionStorage
// for greeting; all clinical data keyed by opaque PT-ID only.
const PATIENT_REGISTRY = {
  'sarah johnson':  'PT-2847-XK',
  'james wilson':   'PT-3391-AW',
  'emily chen':     'PT-5512-RJ',
  'michael patel':  'PT-7723-LM',
  'laura davies':   'PT-9104-SZ',
};

function lookupPatient(fullName) {
  const key = fullName.trim().toLowerCase();
  if (PATIENT_REGISTRY[key]) {
    return PATIENT_REGISTRY[key];
  }
  // Deterministic ID from name hash (new patients)
  let h = 1234;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  const num = 1000 + (h % 9000);
  const suf = key.replace(/[^a-z]/g, '').slice(0,2).toUpperCase() || 'XX';
  return 'PT-' + num + '-' + suf;
}

// ── Health history per patient ────────────────────────────────
const HEALTH_HISTORY = {
  'PT-2847-XK': {
    firstName: 'Sarah', ageGroup: 'Adult (30s)',
    bloodType: 'A+',
    allergies: ['Penicillin', 'Aspirin'],
    chronicConditions: [
      { label: 'Migraine without aura', since: '2019', icd: 'G43.0', status: 'ongoing' },
      { label: 'Seasonal allergic rhinitis', since: '2015', icd: 'J30.1', status: 'managed' },
    ],
    currentMedications: [
      { name: 'Sumatriptan 50mg', dose: 'At headache onset (PRN)', type: 'acute' },
      { name: 'Cetirizine 10mg', dose: 'Once daily', type: 'maintenance' },
      { name: 'Magnesium glycinate 400mg', dose: 'Nightly (preventive)', type: 'supplement' },
    ],
    vaccinations: ['COVID-19 booster (Oct 2024)', 'Influenza (Sep 2024)'],
    recentTravels: [
      { destination: 'Portugal', date: 'Sep 2024', duration: '10 days', purpose: 'Holiday' },
      { destination: 'Thailand', date: 'Feb 2024', duration: '2 weeks', purpose: 'Holiday' },
      { destination: 'Scotland', date: 'Jul 2023', duration: '5 days', purpose: 'Family visit' },
    ],
    pastConsultations: [
      { date: '2025-03-15', condition: 'Migraine — status migrainosus', icd: 'G43.01', outcome: 'Resolved', doctor: 'DR-1042-MB' },
      { date: '2024-11-02', condition: 'Viral URTI', icd: 'J06.9', outcome: 'Resolved', doctor: 'DR-1042-MB' },
      { date: '2024-07-19', condition: 'Migraine without aura', icd: 'G43.0', outcome: 'Resolved', doctor: 'DR-1042-MB' },
      { date: '2024-03-08', condition: 'Allergic rhinitis — seasonal flare', icd: 'J30.1', outcome: 'Managed', doctor: 'DR-0871-CR' },
      { date: '2023-10-21', condition: 'Migraine with visual aura', icd: 'G43.1', outcome: 'Resolved', doctor: 'DR-1042-MB' },
    ],
    notes: 'Triggers include disrupted sleep, dehydration, red wine. Neurologist review recommended if frequency increases.',
  },
  'PT-3391-AW': {
    firstName: 'James', ageGroup: 'Adult (40s)',
    bloodType: 'O+',
    allergies: ['Sulfonamides'],
    chronicConditions: [
      { label: 'Hypertension (controlled)', since: '2020', icd: 'I10', status: 'managed' },
      { label: 'Type 2 diabetes mellitus', since: '2021', icd: 'E11', status: 'managed' },
    ],
    currentMedications: [
      { name: 'Amlodipine 5mg', dose: 'Once daily (morning)', type: 'maintenance' },
      { name: 'Metformin 500mg', dose: 'Twice daily with meals', type: 'maintenance' },
      { name: 'Atorvastatin 10mg', dose: 'Once daily (evening)', type: 'maintenance' },
    ],
    vaccinations: ['COVID-19 booster (Sep 2024)', 'Influenza (Sep 2024)', 'Pneumococcal (2022)'],
    recentTravels: [
      { destination: 'India (Mumbai)', date: 'Dec 2024', duration: '3 weeks', purpose: 'Family visit' },
      { destination: 'Dubai', date: 'Mar 2024', duration: '4 days', purpose: 'Business' },
    ],
    pastConsultations: [
      { date: '2025-02-10', condition: 'Viral URTI', icd: 'J06.9', outcome: 'Resolved', doctor: 'DR-1042-MB' },
      { date: '2024-09-14', condition: 'Hypertension review', icd: 'I10', outcome: 'Medication adjusted', doctor: 'DR-1042-MB' },
      { date: '2024-06-20', condition: 'HbA1c review — stable control', icd: 'E11.9', outcome: 'Ongoing management', doctor: 'DR-0871-CR' },
      { date: '2024-01-05', condition: 'Lower back pain — musculoskeletal', icd: 'M54.5', outcome: 'Resolved', doctor: 'DR-1042-MB' },
    ],
    notes: 'Annual HbA1c and lipid panel due. BP home monitoring advised — target <130/80.',
  },
  'PT-5512-RJ': {
    firstName: 'Emily', ageGroup: 'Adult (20s)',
    bloodType: 'B-',
    allergies: ['Latex', 'Tree nuts (mild)'],
    chronicConditions: [
      { label: 'Irritable bowel syndrome', since: '2022', icd: 'K58.0', status: 'ongoing' },
    ],
    currentMedications: [
      { name: 'Mebeverine 135mg', dose: 'Three times daily before meals', type: 'maintenance' },
      { name: 'Oral rehydration salts', dose: 'After each loose stool (acute)', type: 'acute' },
    ],
    vaccinations: ['COVID-19 booster (Aug 2024)', 'Influenza (Sep 2024)', 'Hepatitis A (Jul 2024)', 'Typhoid (Jul 2024)'],
    recentTravels: [
      { destination: 'Vietnam', date: 'Aug 2024', duration: '3 weeks', purpose: 'Holiday' },
      { destination: 'Morocco', date: 'Jan 2024', duration: '10 days', purpose: 'Holiday' },
    ],
    pastConsultations: [
      { date: '2025-05-20', condition: 'Acute gastroenteritis', icd: 'A09', outcome: 'Ongoing — monitoring', doctor: 'DR-1042-MB' },
      { date: '2024-12-03', condition: 'IBS flare', icd: 'K58.0', outcome: 'Managed', doctor: 'DR-1042-MB' },
      { date: '2024-08-11', condition: 'Viral gastroenteritis', icd: 'A08.4', outcome: 'Resolved', doctor: 'DR-0871-CR' },
      { date: '2024-04-29', condition: 'IBS review', icd: 'K58.9', outcome: 'Diet plan updated', doctor: 'DR-1042-MB' },
    ],
    notes: '⚠️ Current severity escalating — consider in-person review. Low-FODMAP diet in progress.',
  },
  'PT-7723-LM': {
    firstName: 'Michael', ageGroup: 'Adult (50s)',
    bloodType: 'AB+',
    allergies: [],
    chronicConditions: [
      { label: 'Osteoarthritis (knee)', since: '2018', icd: 'M17.1', status: 'managed' },
      { label: 'Hypercholesterolaemia', since: '2019', icd: 'E78.0', status: 'managed' },
    ],
    currentMedications: [
      { name: 'Naproxen 250mg', dose: 'Twice daily with food (PRN)', type: 'acute' },
      { name: 'Rosuvastatin 10mg', dose: 'Once daily (evening)', type: 'maintenance' },
    ],
    vaccinations: ['COVID-19 booster (Oct 2024)', 'Influenza (Oct 2024)', 'Shingrix dose 1 (2023)'],
    recentTravels: [
      { destination: 'Italy (Rome)', date: 'Oct 2024', duration: '1 week', purpose: 'Holiday' },
      { destination: 'Germany', date: 'May 2024', duration: '3 days', purpose: 'Business' },
    ],
    pastConsultations: [
      { date: '2025-05-22', condition: 'Non-specific viral illness', icd: 'B34.9', outcome: 'Pending review', doctor: 'DR-1042-MB' },
      { date: '2025-01-17', condition: 'Knee osteoarthritis flare', icd: 'M17.1', outcome: 'Physiotherapy referred', doctor: 'DR-1042-MB' },
      { date: '2024-07-08', condition: 'Annual health review', icd: 'Z00.0', outcome: 'Routine', doctor: 'DR-0871-CR' },
    ],
    notes: 'Physiotherapy course completed. Weight management plan in place. Shingrix dose 2 due.',
  },
  'PT-9104-SZ': {
    firstName: 'Laura', ageGroup: 'Adult (30s)',
    bloodType: 'O-',
    allergies: ['Erythromycin'],
    chronicConditions: [],
    currentMedications: [],
    vaccinations: ['COVID-19 booster (Nov 2024)', 'Influenza (Sep 2024)'],
    recentTravels: [
      { destination: 'France (Paris)', date: 'Apr 2025', duration: '5 days', purpose: 'Holiday' },
    ],
    pastConsultations: [
      { date: '2025-05-23', condition: 'Streptococcal pharyngitis', icd: 'J02.0', outcome: 'Pending review', doctor: 'DR-1042-MB' },
      { date: '2024-10-12', condition: 'Viral pharyngitis', icd: 'J02.9', outcome: 'Resolved', doctor: 'DR-0871-CR' },
    ],
    notes: 'No chronic conditions. Up to date with vaccinations.',
  },
};

// Fallback history for unknown patients
const DEFAULT_HEALTH_HISTORY = {
  firstName: '', ageGroup: 'Adult',
  bloodType: 'Unknown', allergies: [], chronicConditions: [],
  currentMedications: [], vaccinations: [], recentTravels: [], pastConsultations: [],
  notes: 'No prior records found in this system. Please complete your pre-consultation.',
};

function getHealthHistory(ptId) {
  return HEALTH_HISTORY[ptId] || DEFAULT_HEALTH_HISTORY;
}

// Export for page scripts
window.CUE = { Session, Store, Audit, transcribeAudio, runDiagnosis, sleep, formatDate, severityColor, severityLabel, MOCK_PATIENTS, CHECKIN_QUESTIONS, PATIENT_REGISTRY, lookupPatient, getHealthHistory, HEALTH_HISTORY };

// Init on load
document.addEventListener('DOMContentLoaded', () => Session.init());
