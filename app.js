/* ============================================================
   Cue — Shared App Logic
   HIPAA/GDPR: patient IDs only, no PII in sessionStorage/localStorage
   ============================================================ */

// ── Session ──────────────────────────────────────────────────
const Session = {
  get role()      { return localStorage.getItem('cue_role')      || 'patient'; },
  get id()        { return localStorage.getItem('cue_id')        || generateId('PT'); },
  get firstName() { return localStorage.getItem('cue_firstname') || ''; },
  get isLoggedIn(){ return !!localStorage.getItem('cue_id'); },
  init() {
    if (!localStorage.getItem('cue_id')) {
      const id = generateId(this.role === 'doctor' ? 'DR' : 'PT');
      localStorage.setItem('cue_id', id);
      localStorage.setItem('cue_role', this.role);
    }
    document.querySelectorAll('#navId').forEach(el => el.textContent = this.id);
    const fn = this.firstName;
    document.querySelectorAll('.patient-greeting').forEach(el => { el.textContent = fn ? 'Hello, ' + fn : ''; });
    document.querySelectorAll('.nav-user-name').forEach(el => {
      el.textContent = fn || '';
      el.style.display = fn ? '' : 'none';
    });
  },
  logout() {
    ['cue_role','cue_id','cue_name','cue_firstname'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    window.location.href = 'index.html';
  }
};

function generateId(prefix) {
  const num  = Math.floor(1000 + Math.random() * 9000);
  const suf  = Math.random().toString(36).substring(2,4).toUpperCase();
  return `${prefix}-${num}-${suf}`;
}

// ── Data store — localStorage-backed, keyed by patient ID ────
const Store = {
  _data: (function() {
    try { return JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) { return {}; }
  })(),
  get(patientId) {
    if (!this._data[patientId]) this._data[patientId] = { checkins: [], consultation: null };
    return this._data[patientId];
  },
  save(patientId, key, value) {
    this.get(patientId)[key] = value;
    this._persist();
  },
  push(patientId, key, value) {
    const rec = this.get(patientId);
    if (!rec[key]) rec[key] = [];
    rec[key].push(value);
    this._persist();
  },
  _persist() {
    try { localStorage.setItem('cue_store', JSON.stringify(this._data)); } catch(e) {}
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

  // ── Per-answer text (not one giant blob) — preserves question context ──
  const answerTexts = answers.map(a => (a.text || '').toLowerCase());
  const fullText    = answerTexts.join(' ');

  // ── Negation-aware signal tester ───────────────────────────────────────
  // Tests that a pattern matches AND is not immediately preceded by a
  // negation word ("no", "not", "without", "never", "denies", etc.)
  function sig(pattern, text) {
    text = text || fullText;
    const negation = /\b(no|not|without|never|denies|deny|absent|negative for|haven'?t|hasn'?t)\b.{0,30}$/i;
    const rx = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    let found = false;
    // Scan sentence by sentence to keep negation scoping tight
    const sentences = text.split(/[.!?;]+/);
    for (const sent of sentences) {
      const m = rx.exec(sent);
      if (!m) continue;
      const before = sent.slice(0, m.index);
      if (negation.test(before)) continue; // negated
      found = true;
      break;
    }
    return found;
  }

  // ── Duration / severity extraction ─────────────────────────────────────
  const durationMatch = fullText.match(/(\d+)\s*(day|hour|week|month)/);
  const durationStr   = durationMatch
    ? `${durationMatch[1]} ${durationMatch[2]}${+durationMatch[1] > 1 ? 's' : ''}`
    : 'not specified';
  // Severity: look for explicit "X/10" or "X out of 10"
  const sevMatch = fullText.match(/\b([6-9]|10)\s*(?:\/|out\s+of)\s*10/);
  const isSevere = !!sevMatch;
  const sevScore = sevMatch ? parseInt(sevMatch[1]) : 5;

  // ── Score each diagnostic category ────────────────────────────────────
  // We score every category, then pick the winner by highest score.
  // Each signal that fires adds to the raw score; strong/specific signals
  // are worth more. Scores are normalised to confidences that sum to 100.

  const scores = {
    headache: 0, urti: 0, gastro: 0, chest: 0, musculo: 0, uti: 0,
  };

  // Headache signals
  if (sig(/headache|head\s*pain|pain.*head/))              scores.headache += 10;
  if (sig(/migraine/))                                     scores.headache += 8;
  if (sig(/temple|behind.*eye|periorbital/))               scores.headache += 5;
  if (sig(/throb|pulsating|pulsing/))                      scores.headache += 4;
  if (sig(/nausea|vomit/) && scores.headache > 0)          scores.headache += 3;
  if (sig(/light.*sensitive|photophobia|sound.*sensitive|phonophobia/)) scores.headache += 4;
  if (sig(/aura|visual|zigzag|blind\s*spot/))              scores.headache += 3;

  // URTI signals
  if (sig(/sore\s*throat|throat.*pain|pain.*throat/))      scores.urti += 10;
  if (sig(/fever|temperature|pyrexia/) && !sig(/no fever/)) scores.urti += 6;
  if (sig(/swallow.*pain|painful.*swallow|odynophagia/))   scores.urti += 5;
  if (sig(/tonsil|pharynx|strep/))                         scores.urti += 5;
  if (sig(/cough|runny\s*nose|congestion|rhinorrhoea/))    scores.urti += 3;
  if (sig(/chills|sweating|rigors/))                       scores.urti += 3;
  if (sig(/lymph|glands.*neck|neck.*swollen/))             scores.urti += 3;
  if (sig(/white\s*spots|exudate|pus.*tonsil/))            scores.urti += 6;
  if (sig(/flu|influenza|myalgia|body\s*ache/))            scores.urti += 3;

  // Gastro signals
  if (sig(/stomach\s*pain|abdom.*pain|belly\s*pain|tummy/)) scores.gastro += 8;
  if (sig(/diarrh|loose\s*stool|watery\s*stool/))          scores.gastro += 7;
  if (sig(/vomit|vomiting/) && scores.gastro > 0)          scores.gastro += 5;
  if (sig(/nausea/) && scores.gastro > 0)                  scores.gastro += 3;
  if (sig(/cramp|cramps|colicky/))                         scores.gastro += 4;
  if (sig(/bowel|stool|diarrh/))                           scores.gastro += 3;
  if (sig(/food\s*poison|ate\s*out|dodgy.*food|contact.*ill/)) scores.gastro += 4;

  // Chest / cardiac signals
  if (sig(/chest\s*pain|pain.*chest|tightness.*chest/))   scores.chest += 12;
  if (sig(/palpitat|racing\s*heart|heart\s*pound/))       scores.chest += 7;
  if (sig(/short.*breath|difficulty.*breath|breathless|dyspnoea/)) scores.chest += 7;
  if (sig(/wheez|asthma/))                                scores.chest += 5;
  if (sig(/cardiac|heart\s*attack|angina/))               scores.chest += 8;
  if (sig(/leg.*swollen|ankle.*swollen/) && scores.chest > 0) scores.chest += 4;

  // Musculoskeletal signals
  if (sig(/knee|ankle|wrist|elbow|shoulder|hip/))         scores.musculo += 7;
  if (sig(/sprain|twist|strain|pulled\s*muscle/))         scores.musculo += 8;
  if (sig(/back\s*pain|lower\s*back/))                    scores.musculo += 7;
  if (sig(/joint.*pain|pain.*joint/))                     scores.musculo += 5;
  if (sig(/swollen.*joint|joint.*swollen/))               scores.musculo += 4;
  if (sig(/fell|fall|injury|accident|trauma/))            scores.musculo += 4;

  // UTI signals
  if (sig(/burning.*pee|burning.*urinat|pain.*urinat/))   scores.uti += 10;
  if (sig(/frequent.*toilet|urgency.*urinat|urinary\s*urgency/)) scores.uti += 7;
  if (sig(/urine|urinary/))                               scores.uti += 3;
  if (sig(/bladder|cystitis/))                            scores.uti += 7;
  if (sig(/cloudy.*urine|blood.*urine|haematuria/))       scores.uti += 6;
  if (sig(/loin\s*pain|flank\s*pain|kidney/))             scores.uti += 5;

  // ── Find winning category ──────────────────────────────────────────────
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const category = winner[1] >= 5 ? winner[0] : 'fallback';

  // ── Red flags (negation-aware) ─────────────────────────────────────────
  const redFlags = [];
  if (sig(/chest\s*pain|tightness.*chest/))
    redFlags.push({ label: '🚨 Chest pain reported — urgent cardiac rule-out required (ECG, troponin)', severity: 'urgent' });
  if (sig(/sudden.*headache|worst.*headache.*ever|thunderclap/))
    redFlags.push({ label: '🚨 Sudden severe headache — subarachnoid haemorrhage must be excluded urgently', severity: 'urgent' });
  if (sig(/blood.*stool|black.*stool|melaena|haematemesis|blood.*vomit/))
    redFlags.push({ label: '🚨 Blood in stool/vomit — urgent GI review and bloods required', severity: 'urgent' });
  if (sig(/can'?t\s*breathe|unable.*breathe|respiratory\s*distress/))
    redFlags.push({ label: '🚨 Respiratory distress reported — O₂ saturation and CXR required', severity: 'urgent' });
  if (sig(/weakness|numbness|facial\s*droop|slurred\s*speech/))
    redFlags.push({ label: '🚨 Neurological deficit — urgent stroke screen required (FAST assessment)', severity: 'urgent' });

  // ── Build result per category ──────────────────────────────────────────

  if (category === 'headache') {
    const hasAura   = sig(/visual|zigzag|flicker|aura|blind\s*spot/);
    const bilateral = sig(/both\s*sides|bilateral|both\s*temples/);
    const bandlike  = sig(/band|pressure.*head|tight.*head|squeezing/);
    const photophobia = sig(/light.*sensitive|photophobia/);
    const phonophobia = sig(/sound.*sensitive|phonophobia/);
    const nausea    = sig(/nausea|sick|vomit/);
    // Dynamic confidence: migrate scores to percentages
    let migraineScore = 40;
    if (!bilateral)   migraineScore += 15;
    if (!bandlike)    migraineScore += 10;
    if (photophobia)  migraineScore += 10;
    if (phonophobia)  migraineScore += 5;
    if (nausea)       migraineScore += 8;
    if (hasAura)      migraineScore += 5;
    if (isSevere)     migraineScore += 7;
    let tensionScore  = 100 - migraineScore - 6;
    const clusterScore = 6;
    if (bandlike) { tensionScore += 25; migraineScore -= 25; }
    if (bilateral){ tensionScore += 15; migraineScore -= 15; }
    // Clamp
    migraineScore = Math.max(5, Math.min(90, migraineScore));
    tensionScore  = Math.max(5, Math.min(90, tensionScore));
    const total = migraineScore + tensionScore + clusterScore;
    const norm  = v => Math.round(v / total * 100);

    return {
      symptoms: [
        { label: `${bilateral ? 'Bilateral' : 'Unilateral'} ${bandlike ? 'pressure-type' : 'throbbing'} headache`, severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Photophobia / phonophobia', severity: photophobia || phonophobia ? 'moderate' : 'not reported', duration: durationStr },
        { label: 'Nausea', severity: nausea ? 'mild' : 'not reported', duration: durationStr },
      ],
      diagnoses: bandlike
        ? [
            { name: 'Tension-type headache', icd: 'G44.2', confidence: norm(tensionScore), rationale: 'Pressure/band-like quality' + (bilateral ? ', bilateral distribution' : '') + ' — ICHD-3 tension-type criteria met' },
            { name: 'Medication-overuse headache', icd: 'G44.4', confidence: norm(migraineScore * 0.3), rationale: 'If analgesics taken >10 days/month; review medication history' },
            { name: `Migraine ${hasAura ? 'with aura' : 'without aura'}`, icd: hasAura ? 'G43.1' : 'G43.0', confidence: norm(migraineScore * 0.7), rationale: 'Less likely given non-pulsating, bilateral quality' },
          ]
        : [
            { name: `Migraine ${hasAura ? 'with aura' : 'without aura'}`, icd: hasAura ? 'G43.1' : 'G43.0', confidence: norm(migraineScore), rationale: `Unilateral${!bilateral?'':''} pulsating pain${photophobia?', photophobia':''}${phonophobia?', phonophobia':''}${nausea?', nausea':''} — ICHD-3 criteria` + (hasAura ? ' — aura features reported' : '') },
            { name: 'Tension-type headache', icd: 'G44.2', confidence: norm(tensionScore), rationale: 'Cannot exclude without clinical examination; consider if pulsating quality absent on exam' },
            { name: 'Cluster headache', icd: 'G44.0', confidence: norm(clusterScore), rationale: 'Less likely — no periorbital tearing, rhinorrhoea, or autonomic features reported' },
          ],
      notes: buildNotes(bandlike ? 'Tension-type headache' : `Migraine ${hasAura ? 'with' : 'without'} aura`, answers, 'neurology'),
      redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.headache,
      conditionKey: 'headache',
    };
  }

  if (category === 'urti') {
    const exudates  = sig(/white\s*spots|pus|exudate|tonsil.*pus/);
    const highFever  = sig(/38\.[5-9]|39\.|40\.|\b39\b|\b40\b/);
    const cough      = sig(/cough/);
    const flu        = sig(/myalgia|body\s*ache|flu|influenza/);
    const monoSigns  = sig(/widespread.*lymph|spleen|mono|glandular\s*fever/);
    const allergy    = sig(/penicillin|allerg/);
    // Centor-like scoring for strep vs viral
    let centorScore = 0;
    if (exudates)  centorScore += 1;
    if (highFever) centorScore += 1;
    if (!cough)    centorScore += 1;
    if (sig(/tender.*gland|lymph.*tender|anterior.*lymph/)) centorScore += 1;
    // Confidence breakdown
    const isStrep     = centorScore >= 3;
    const isMono      = monoSigns;
    let viralConf  = isStrep ? 18 : 68;
    let strepConf  = isStrep ? 62 : 22;
    let monoConf   = isMono  ? 20 : 5;
    let fluConf    = flu     ? 12 : 5;
    const total = viralConf + strepConf + monoConf + (flu ? fluConf : 0);
    const norm  = v => Math.round(v / total * 100);
    const dxList = isStrep
      ? [
          { name: 'Streptococcal pharyngitis (Group A)', icd: 'J02.0', confidence: norm(strepConf), rationale: `Centor score ${centorScore}/4 — exudates${exudates?'':''}, fever, no cough${centorScore>=3?' — antibiotic likely indicated':''}`  },
          isMono
            ? { name: 'Infectious mononucleosis (EBV)', icd: 'B27.0', confidence: norm(monoConf), rationale: 'Lymphadenopathy pattern or systemic features — monospot / EBV serology recommended' }
            : { name: 'Viral pharyngitis', icd: 'J02.9', confidence: norm(viralConf), rationale: 'Viral aetiology cannot be excluded without throat swab' },
          { name: flu ? 'Influenza A/B' : 'Viral URTI', icd: flu ? 'J11.1' : 'J06.9', confidence: norm(flu ? fluConf : viralConf * 0.4), rationale: flu ? 'Prominent myalgia and systemic features — consider rapid flu test' : 'Less likely given Centor criteria' },
        ]
      : [
          { name: 'Viral upper respiratory tract infection', icd: 'J06.9', confidence: norm(viralConf), rationale: `Acute onset, ${highFever?'fever, ':''} sore throat without exudates — Centor score ${centorScore}/4, most likely viral` },
          { name: 'Streptococcal pharyngitis (Group A)', icd: 'J02.0', confidence: norm(strepConf), rationale: `Centor score ${centorScore}/4 — throat swab recommended if symptoms worsen or persist >48 h` },
          { name: flu ? 'Influenza A/B' : 'Infectious mononucleosis (EBV)', icd: flu ? 'J11.1' : 'B27.0', confidence: norm(flu ? fluConf : monoConf), rationale: flu ? 'Systemic/myalgia features — consider rapid flu test' : 'Consider if lymphadenopathy widespread or fatigue prominent' },
        ];

    return {
      symptoms: [
        { label: 'Sore throat — odynophagia on swallowing', severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Pyrexia', severity: highFever ? 'severe' : sig(/fever/) ? 'moderate' : 'not reported', duration: durationStr },
        { label: 'Cervical lymphadenopathy', severity: sig(/glands|lymph|neck.*swollen/) ? 'mild' : 'not reported', duration: durationStr },
      ],
      diagnoses: dxList,
      notes: buildNotes(isStrep ? 'Streptococcal pharyngitis' : 'Viral URTI', answers, 'general practice'),
      redFlags: allergy ? [{ label: 'ℹ️ Penicillin allergy documented — use macrolide (clarithromycin) if antibiotic indicated', severity: 'info' }, ...redFlags] : redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.urti,
      conditionKey: 'urti',
    };
  }

  if (category === 'gastro') {
    const rightIliac  = sig(/right.*lower|rlq|right\s*iliac|pain.*right\s*side.*lower/);
    const bloodStool  = sig(/blood.*stool|red.*stool|black\s*stool|melaena/);
    const dietary     = sig(/food\s*poison|ate\s*out|dodgy.*food|takeaway|restaurant/);
    const contact     = sig(/contact.*ill|someone.*ill|partner.*ill|child.*ill/);
    const vomiting    = sig(/vomit/);
    const diarrhoea   = sig(/diarrh|loose\s*stool|watery/);
    const chronicHist = sig(/recurring|happens\s*again|before.*similar|stress.*stomach/);
    // Confidence scoring
    let gasConf  = 55;
    let ibsConf  = chronicHist ? 25 : 10;
    let appConf  = rightIliac  ? 30 : 5;
    let foodConf = (dietary || contact) ? 20 : 8;
    if (vomiting)   gasConf += 5;
    if (diarrhoea)  gasConf += 8;
    if (rightIliac) { gasConf -= 20; appConf += 15; }
    const total = gasConf + ibsConf + appConf + foodConf;
    const norm  = v => Math.max(0, Math.round(v / total * 100));
    const dxList = rightIliac
      ? [
          { name: 'Appendicitis (urgent exclusion required)', icd: 'K37', confidence: norm(appConf), rationale: 'Pain localised to right iliac fossa — Alvarado score calculation required; surgical review urgent' },
          { name: 'Acute infectious gastroenteritis', icd: 'A09', confidence: norm(gasConf), rationale: 'Vomiting/diarrhoea pattern consistent with gastroenteritis, but RIF pain must be excluded first' },
          { name: 'Mesenteric adenitis', icd: 'I88.0', confidence: norm(ibsConf), rationale: 'RIF pain with infective features — commoner in children/young adults; CT/USS may be needed' },
        ]
      : [
          { name: 'Acute infectious gastroenteritis', icd: 'A09', confidence: norm(gasConf), rationale: `Acute onset${dietary ? ' — dietary source probable' : contact ? ' — likely person-to-person transmission' : ''}, self-limiting pattern expected` },
          { name: chronicHist ? 'Irritable bowel syndrome — acute flare' : 'Food poisoning (Salmonella / Campylobacter)', icd: chronicHist ? 'K58.0' : 'A02.9', confidence: norm(chronicHist ? ibsConf : foodConf), rationale: chronicHist ? 'Recurring pattern — IBS exacerbation possible; dietary/stress diary advised' : 'Consider stool culture if symptoms persist >48 h or fever develops' },
          { name: 'Viral gastroenteritis (norovirus)', icd: 'A08.1', confidence: norm(foodConf * 0.7), rationale: 'Sudden onset vomiting/diarrhoea without blood — norovirus cluster common in communities' },
        ];

    return {
      symptoms: [
        { label: `Colicky abdominal pain${rightIliac ? ' — right iliac fossa' : ''}`, severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Nausea and vomiting', severity: vomiting ? 'moderate' : 'mild', duration: durationStr },
        { label: 'Diarrhoea', severity: diarrhoea ? 'moderate' : 'not reported', duration: durationStr },
      ],
      diagnoses: dxList,
      notes: buildNotes(rightIliac ? 'Right iliac fossa pain — appendicitis excluded' : 'Acute infectious gastroenteritis', answers, 'general practice'),
      redFlags: [
        ...(rightIliac ? [{ label: '🚨 Pain in right iliac fossa — appendicitis must be urgently excluded. Surgical review required.', severity: 'urgent' }] : []),
        ...(bloodStool  ? [{ label: '🚨 Blood in stool reported — urgent review for GI bleeding source; FBC, CRP, stool culture', severity: 'urgent' }] : []),
        ...redFlags,
      ],
      checkinQuestions: CHECKIN_QUESTIONS.gastro,
      conditionKey: 'gastro',
    };
  }

  if (category === 'chest') {
    const pleuritic   = sig(/worse.*breath|pleuritic|sharp.*chest/);
    const exertional  = sig(/worse.*exercise|exertion|walking|climbing/);
    const palpitations = sig(/palpitat|racing|irregular.*heart|skipping/);
    const wheeze      = sig(/wheez|asthma|inhaler/);
    const cough       = sig(/cough/);
    // Cardiac vs respiratory differentiation
    let acsConf  = exertional ? 45 : 20;
    let peConf   = pleuritic  ? 25 : 8;
    let msConf   = 20;  // musculoskeletal chest pain (most common)
    let asthConf = wheeze ? 25 : 5;
    let palpConf = palpitations ? 30 : 5;
    const total = acsConf + peConf + msConf + (wheeze ? asthConf : palpConf);
    const norm  = v => Math.max(0, Math.round(v / total * 100));
    const dxList = palpitations && !sig(/chest\s*pain/)
      ? [
          { name: 'Palpitations — benign cause (ectopic beats / SVT)', icd: 'R00.2', confidence: 60, rationale: 'Racing/irregular heartbeat without associated chest pain — ECG required to characterise rhythm' },
          { name: 'Atrial fibrillation', icd: 'I48.9', confidence: 25, rationale: 'New-onset AF must be excluded with 12-lead ECG; especially if irregular rhythm' },
          { name: 'Anxiety / panic disorder', icd: 'F41.0', confidence: 15, rationale: 'Palpitations with autonomic features — consider if associated with anxiety' },
        ]
      : wheeze
      ? [
          { name: 'Acute asthma exacerbation', icd: 'J45.901', confidence: 55, rationale: 'Wheeze and breathlessness — PEFR measurement required; step-up bronchodilator therapy' },
          { name: 'Acute bronchitis', icd: 'J20.9', confidence: 30, rationale: 'Cough with wheeze — CXR if consolidation suspected' },
          { name: 'Cardiac asthma (LVF)', icd: 'I50.1', confidence: 15, rationale: 'Nocturnal wheeze with exertional dyspnoea — BNP and echo if suspected' },
        ]
      : [
          { name: 'Musculoskeletal chest pain', icd: 'M79.3', confidence: norm(msConf + 10), rationale: 'Commonest cause of chest pain in primary care; reproducible on palpation' },
          { name: exertional ? 'Acute coronary syndrome (urgent exclusion)' : 'Pleuritis / pulmonary embolism screen', icd: exertional ? 'I24.9' : 'J90', confidence: norm(exertional ? acsConf : peConf + 10), rationale: exertional ? 'Exertional chest pain — urgent 12-lead ECG and troponin required' : 'Pleuritic character — D-dimer, Wells score; CXR' },
          { name: 'GORD / oesophageal spasm', icd: 'K21.0', confidence: norm(acsConf * 0.5), rationale: 'Non-exertional chest pain relieved by antacids — consider trial of PPI' },
        ];

    return {
      symptoms: [
        { label: `Chest pain${pleuritic?' — pleuritic character':exertional?' — exertional':''}`, severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Dyspnoea', severity: sig(/breathless|short.*breath/) ? 'moderate' : 'not reported', duration: durationStr },
        { label: 'Palpitations', severity: palpitations ? 'moderate' : 'not reported', duration: durationStr },
      ],
      diagnoses: dxList,
      notes: buildNotes('Chest pain — cardiac and PE excluded pending tests', answers, 'cardiology'),
      redFlags: [
        { label: '🚨 Chest pain requires urgent 12-lead ECG and troponin to exclude ACS', severity: 'urgent' },
        ...(pleuritic ? [{ label: '🚨 Pleuritic features — Wells score for PE; D-dimer if low/intermediate probability', severity: 'urgent' }] : []),
        ...redFlags,
      ],
      checkinQuestions: CHECKIN_QUESTIONS.default,
      conditionKey: 'chest',
    };
  }

  if (category === 'uti') {
    const upperTract = sig(/loin\s*pain|flank\s*pain|kidney|back.*pain.*fever|fever.*back.*pain/);
    const haematuria = sig(/blood.*urine|haematuria|cloudy\s*urine|pink\s*urine/);
    const male       = sig(/\bhe\b|male|man|his\b/);  // rough proxy; production would use profile
    return {
      symptoms: [
        { label: 'Dysuria — burning on urination', severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Urinary frequency / urgency', severity: sig(/frequent|urgency/) ? 'moderate' : 'mild', duration: durationStr },
        { label: haematuria ? 'Haematuria' : 'Lower abdominal discomfort', severity: haematuria ? 'moderate' : 'mild', duration: durationStr },
      ],
      diagnoses: upperTract
        ? [
            { name: 'Pyelonephritis (upper UTI)', icd: 'N10', confidence: 65, rationale: 'Loin pain, fever and urinary symptoms — urine MC&S essential; IV antibiotics if systemically unwell' },
            { name: 'Cystitis (lower UTI)', icd: 'N30.0', confidence: 25, rationale: 'Lower UTI cannot be excluded without urine dip; ascended infection possible' },
            { name: 'Renal calculus', icd: 'N20.0', confidence: 10, rationale: 'Loin-to-groin pain pattern — urinalysis, KUB X-ray or CT KUB' },
          ]
        : male
        ? [
            { name: 'Urethritis / prostatitis', icd: 'N41.0', confidence: 55, rationale: 'UTI in males warrants further evaluation; STI screen if sexually active' },
            { name: 'Cystitis (lower UTI)', icd: 'N30.0', confidence: 35, rationale: 'Less common in males — urine MC&S; consider structural cause' },
            { name: 'Urethral stricture', icd: 'N35.9', confidence: 10, rationale: 'If poor stream or hesitancy reported — urology referral' },
          ]
        : [
            { name: 'Cystitis (lower UTI)', icd: 'N30.0', confidence: 72, rationale: 'Classic triad of dysuria, frequency and urgency — urine dip; empirical antibiotic treatment' },
            { name: 'Urethritis (STI screen)', icd: 'N34.1', confidence: 18, rationale: 'Consider if sexually active or discharge reported — NAAT/STI screen' },
            { name: 'Interstitial cystitis', icd: 'N30.1', confidence: 10, rationale: 'If recurrent with negative cultures — cystoscopy referral' },
          ],
      notes: buildNotes(upperTract ? 'Pyelonephritis' : 'Cystitis (lower UTI)', answers, 'general practice'),
      redFlags: [
        ...(upperTract ? [{ label: '🚨 Upper tract signs (loin pain + fever) — urgent urine MC&S and consider IV antibiotics if systemically unwell', severity: 'urgent' }] : []),
        ...(haematuria ? [{ label: '⚠️ Haematuria noted — urine microscopy required; consider flexible cystoscopy if >40 y/o', severity: 'warning' }] : []),
        ...redFlags,
      ],
      checkinQuestions: CHECKIN_QUESTIONS.default,
      conditionKey: 'uti',
    };
  }

  if (category === 'musculo') {
    const location  = sig(/knee/) ? 'knee' : sig(/ankle/) ? 'ankle' : sig(/back|lumbar|spine/) ? 'back' : sig(/shoulder/) ? 'shoulder' : sig(/wrist/) ? 'wrist' : 'joint';
    const traumatic = sig(/fell|fall|twist|injury|accident|sprain|trauma/);
    const chronic   = sig(/months|years|recurring|before.*similar|arthritis/);
    const locking   = sig(/locking|giving\s*way|instability/);
    return {
      symptoms: [
        { label: `${location.charAt(0).toUpperCase() + location.slice(1)} pain${traumatic ? ' — post-injury' : chronic ? ' — recurring' : ''}`, severity: isSevere ? 'severe' : 'moderate', duration: durationStr },
        { label: 'Swelling / oedema', severity: sig(/swollen|swelling|oedema/) ? 'moderate' : 'not reported', duration: durationStr },
        { label: 'Limited range of motion', severity: sig(/can'?t move|stiff|limited/) ? 'moderate' : 'mild', duration: durationStr },
      ],
      diagnoses: traumatic
        ? [
            { name: `Acute ligamentous sprain — ${location}`, icd: location === 'knee' ? 'S83.4' : location === 'ankle' ? 'S93.4' : 'S33.5', confidence: 65, rationale: 'Mechanism of injury consistent with sprain; Ottawa rules should be applied' },
            { name: `Fracture — ${location} (rule out)`, icd: location === 'knee' ? 'S82.0' : location === 'ankle' ? 'S82.6' : 'S32.0', confidence: 25, rationale: `Ottawa rules: X-ray if unable to weight-bear or bony tenderness at ${location}` },
            { name: locking ? `Meniscal / cartilage injury — ${location}` : `Muscle strain — ${location}`, icd: locking ? 'S83.2' : 'M62.6', confidence: 10, rationale: locking ? 'Locking or giving-way reported — MRI referral indicated' : 'Soft tissue injury; RICE protocol' },
          ]
        : chronic
        ? [
            { name: `Osteoarthritis — ${location}`, icd: 'M19.9', confidence: 55, rationale: 'Chronic recurring joint pain in older patient — X-ray; consider physio referral' },
            { name: `Inflammatory arthropathy (RA / gout)`, icd: 'M06.9', confidence: 30, rationale: 'Multiple joint involvement or acute flare — CRP, ESR, uric acid, RF, anti-CCP' },
            { name: `Bursitis — ${location}`, icd: 'M70.9', confidence: 15, rationale: 'Localised swelling around joint — USS guided aspiration if tense' },
          ]
        : [
            { name: `Musculoskeletal pain — ${location}`, icd: 'M79.3', confidence: 60, rationale: 'No clear traumatic mechanism — exclude inflammatory cause with bloods' },
            { name: 'Inflammatory arthropathy', icd: 'M06.9', confidence: 25, rationale: 'Joint pain ± swelling without trauma — CRP, ESR, RF if suspected' },
            { name: 'Referred pain', icd: 'M54.9', confidence: 15, rationale: `${location === 'back' ? 'Nerve root compression — neurological exam; MRI if red flags' : 'Consider referred pain from adjacent structure'}` },
          ],
      notes: buildNotes(`${location.charAt(0).toUpperCase() + location.slice(1)} pain — ${traumatic ? 'post-traumatic' : chronic ? 'chronic' : 'atraumatic'}`, answers, 'musculoskeletal'),
      redFlags,
      checkinQuestions: CHECKIN_QUESTIONS.musculo,
      conditionKey: 'musculo',
    };
  }

  // ── Fallback — insufficient discriminating features ────────────────────
  return {
    symptoms: [
      { label: 'Systemic malaise / fatigue', severity: 'mild', duration: durationStr },
      { label: 'Generalised symptoms', severity: 'mild', duration: durationStr },
    ],
    diagnoses: [
      { name: 'Non-specific viral illness', icd: 'B34.9', confidence: 50, rationale: 'Symptoms consistent with self-limiting viral syndrome; watchful waiting appropriate' },
      { name: 'Undifferentiated febrile illness', icd: 'R50.9', confidence: 30, rationale: 'Further focused history and physical examination required to narrow differential' },
      { name: 'Functional / psychosomatic disorder', icd: 'F45.9', confidence: 20, rationale: 'Consider biopsychosocial assessment if no organic cause identified on workup' },
    ],
    notes: buildNotes('Non-specific viral illness', answers, 'general practice'),
    redFlags,
    checkinQuestions: CHECKIN_QUESTIONS.default,
    conditionKey: 'default',
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
  // Restore any patient-edited overrides from localStorage
  try {
    const edits = JSON.parse(localStorage.getItem('cue_health_edits') || '{}');
    if (edits[ptId]) Object.assign(HEALTH_HISTORY[ptId] || (HEALTH_HISTORY[ptId] = Object.assign({}, DEFAULT_HEALTH_HISTORY)), edits[ptId]);
  } catch(e) {}
  return HEALTH_HISTORY[ptId] || DEFAULT_HEALTH_HISTORY;
}

function persistHealthEdit(ptId, data) {
  try {
    const edits = JSON.parse(localStorage.getItem('cue_health_edits') || '{}');
    edits[ptId] = data;
    localStorage.setItem('cue_health_edits', JSON.stringify(edits));
  } catch(e) {}
}

// ── Claude API (browser-direct, requires user-supplied key) ──────
async function callClaude(messages, systemPrompt) {
  const apiKey = localStorage.getItem('cue_api_key');
  if (!apiKey) throw new Error('NO_API_KEY');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1400,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

// Parse the structured XML output from the clinical agent
function parseClinicalResponse(text) {
  const respMatch  = text.match(/<response>([\s\S]*?)<\/response>/);
  const synthMatch = text.match(/<synthesize>([\s\S]*?)<\/synthesize>/);
  return {
    response:   respMatch  ? respMatch[1].trim()  : text.trim(),
    synthesize: synthMatch ? synthMatch[1].trim() : null,
  };
}

// ── Clinical Reasoning System Prompt ─────────────────────────
const CLINICAL_SYSTEM_PROMPT = `# System Prompt: Clinical Reasoning & Dynamic History-Taking Agent

## 1. Core Persona & Identity
You are a highly analytical, empathetic, and systematically structured Clinical AI Assistant. Your objective is not simply to classify static symptoms, but to conduct dynamic, multi-turn clinical history-taking—modelling the diagnostic acumen of an expert physician (Zhou et al., 2026). You operate under the Dual-Process Theory of clinical cognition, actively balancing rapid intuitive pattern recognition (System 1) with systematic, rule-based algorithmic reasoning (System 2) to eliminate diagnostic bias and premature cognitive closure (Lee et al., 2024).

## 2. Fundamental Architectural Principles
You must strictly execute your medical interviewing across four distinct phases, transitioning gracefully through an information-gathering "funnel" (Berdahl et al., 2022):

1. **The Funnel Approach:** Always initiate with open-ended prompts allowing the patient to describe their Chief Complaint (CC) and History of Present Illness (HPI) in their own words. Transition to targeted, closed-ended questions only after the patient establishes their initial narrative.
2. **Dynamic Differential Hypothesis Generation:** Formulate a tentative internal DDx list within the first two patient turns. Every subsequent question must serve as a deliberate probe to confirm or rule out a specific hypothesis.
3. **Information Density & Conversation Efficiency:** Never ask compound "double-barrelled" questions. Ask exactly ONE question at a time.

## 3. Interview Framework Implementation (OPQRST & ICE)
Systematically explore any somatic complaint using OPQRST. Do not ask these as a rigid script — weave them into natural conversation.

- **Onset (O):** Sudden (vascular/mechanical) or gradual (infectious/inflammatory)?
- **Provocation / Palliation (P):** What exacerbates or alleviates the symptom?
- **Quality (Q):** Sharp/pleuritic, dull/visceral, burning/neuropathic, squeezing/ischaemic.
- **Radiation (R):** Does it migrate along anatomical dermatomes or pathways?
- **Severity (S):** Subjective 0–10 scale.
- **Timing (T):** Constant, intermittent, cyclic, diurnal, or nocturnal?

### Patient-Centred Care (ICE)
- **Ideas (I):** What does the patient suspect is occurring?
- **Concerns (C):** Their primary anxieties or fears.
- **Expectations (E):** What outcome do they anticipate?

## 4. Differential Synthesis & Sorting Logic (VINDICATE)
Internally categorise potential etiologies using VINDICATE: **V**ascular, **I**nfectious, **N**eoplastic, **D**egenerative, **I**atrogenic/Idiopathic, **C**ongenital, **A**utoimmune, **T**raumatic, **E**ndocrine/Metabolic.

### Three-Basket Prioritisation
1. **Most Likely ("Horses"):** Highest statistical pre-test probability.
2. **Must-Not-Miss ("Zebras with Weapons"):** Life-threatening emergencies — rule out BEFORE favouring benign diagnoses.
3. **Less Likely ("Zebras"):** Lower probability, on the periphery unless primaries are disproven.

## 5. Pertinent Negatives & Red Flag Surveillance
- Systematically query for the *absence* of features that accompany suspected disease states.
- If emergency threshold criteria are met, immediately interrupt regular history-taking to screen for life-threatening pathologies.

## 6. Output Formatting Protocol
Every conversational turn MUST follow this exact XML structure:

\`\`\`xml
<response>
Acknowledge the patient's prior input with natural, peer-level warmth and empathy. Avoid robotic transitions or overly formal clinical phrasing.
Ask EXACTLY ONE clear, un-compounded question to advance the diagnostic funnel.
</response>
\`\`\`

## 7. Synthesis — When to Stop and Generate Output
After gathering sufficient information (typically 6–10 questions, never fewer than 5), output a synthesis block INSTEAD of another question. First briefly acknowledge the patient in a <response> block, then immediately output:

<synthesize>
{
  "diagnoses": [
    {"name": "Full clinical name", "icd": "ICD-10 code", "confidence": 75, "rationale": "One-sentence clinical rationale citing specific findings"},
    {"name": "Second diagnosis", "icd": "ICD-10 code", "confidence": 20, "rationale": "Rationale"},
    {"name": "Third diagnosis", "icd": "ICD-10 code", "confidence": 5, "rationale": "Rationale"}
  ],
  "symptoms": [
    {"label": "Primary symptom description", "duration": "X days/weeks", "severity": "mild"},
    {"label": "Associated symptom", "duration": "X days", "severity": "moderate"}
  ],
  "redFlags": [
    {"label": "🚨 Description of urgent finding requiring action", "severity": "urgent"}
  ],
  "conditionKey": "headache",
  "soap": {
    "subjective": "Chief complaint and HPI as the patient described it.",
    "objective": "Vitals and examination findings pending at consultation.",
    "assessment": "Primary and differential diagnoses with clinical reasoning.",
    "plan": "Recommended investigations, management, and follow-up."
  }
}
</synthesize>

Rules:
- conditionKey must be one of: headache, urti, gastro, chest, musculo, uti, general
- confidence values must sum to exactly 100
- redFlags may be an empty array []
- The <synthesize> block must contain only valid JSON — no trailing commas`;

// Export for page scripts
window.CUE = { Session, Store, Audit, transcribeAudio, runDiagnosis, callClaude, parseClinicalResponse, CLINICAL_SYSTEM_PROMPT, sleep, formatDate, severityColor, severityLabel, MOCK_PATIENTS, CHECKIN_QUESTIONS, PATIENT_REGISTRY, lookupPatient, getHealthHistory, persistHealthEdit, HEALTH_HISTORY };

// Init on load
document.addEventListener('DOMContentLoaded', () => Session.init());
