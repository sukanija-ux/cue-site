/* ============================================================
   Cue — Patient page logic
   Health History → SOCRATES intake → Summary → Treatment → Tracking
   ============================================================ */

const _p = window.CUE;

// QUESTIONS is built dynamically per patient — see buildTailoredQuestions()
var QUESTIONS = [];

// ── Build tailored questions based on patient health history ──
function buildTailoredQuestions(history) {
  var fn        = history.firstName || localStorage.getItem('cue_firstname') || '';
  var conditions = history.chronicConditions || [];
  var meds       = history.currentMedications || [];
  var allergies  = history.allergies || [];
  var travels    = history.recentTravels || [];

  var condNames  = conditions.map(function(c) { return c.label; });
  var medNames   = meds.map(function(m) { return m.name; });
  var allergyNames = allergies.slice();

  var hasConds    = condNames.length > 0;
  var hasMeds     = medNames.length > 0;
  var hasAllergies = allergyNames.length > 0;
  var hasTravels  = travels.length > 0;

  var recentTravel = hasTravels ? travels[0] : null;

  // Q1 — personalised greeting + context
  var q1 = 'Hi ' + (fn || 'there') + ' — I\'m Cue\'s clinical AI, here to take a quick history before your appointment. ';
  if (hasConds) {
    var condStr = condNames.slice(0, 2).join(' and ');
    q1 += 'Your record shows a history of ' + condStr + '. ';
  }
  if (hasMeds && medNames.length <= 3) {
    q1 += 'I can see you\'re currently on ' + medNames.join(', ') + '. ';
  } else if (hasMeds) {
    q1 += 'I can see you\'re on several regular medications. ';
  }
  q1 += 'I\'ll ask nine short questions — please answer as freely as you like. What\'s brought you in today?';

  // Q3 — site/character, tailored to known conditions
  var q3 = 'Where exactly do you feel it? ';
  if (condNames.some(function(c) { return /migraine|headache/i.test(c); })) {
    q3 += 'Is it in the same location as your usual migraines, or somewhere different? ';
  } else if (condNames.some(function(c) { return /bowel|gastro|IBS/i.test(c); })) {
    q3 += 'Is the discomfort localised, or spread across your abdomen? ';
  } else if (condNames.some(function(c) { return /arthritis|knee|joint/i.test(c); })) {
    q3 += 'Is this affecting the same joint as your usual arthritis, or a new area? ';
  }
  q3 += 'How would you describe the sensation — sharp, dull, burning, throbbing, cramping, pressure, or tightness?';

  // Q7 — modifying factors, including medications they're on
  var q7 = 'Is there anything that makes it better or worse — rest, movement, eating, heat, cold, or position? ';
  if (hasMeds) {
    q7 += 'Have you tried any of your usual medications — ' + medNames.slice(0, 2).join(' or ') + ' — and if so, did they help?';
  } else {
    q7 += 'Have you taken any over-the-counter medication or supplements for it?';
  }

  // Q8 — medical history, pre-filled with what we know
  var q8 = '';
  if (hasConds) {
    q8 = 'Aside from your known ' + condNames.slice(0, 2).join(' and ') + ', have you had any other significant illnesses, hospitalisations, or surgeries recently? ';
  } else {
    q8 = 'Do you have any other known medical conditions or recent hospitalisations? ';
  }
  if (hasMeds) {
    q8 += 'Are you still taking ' + medNames.slice(0, 2).join(' and ') + ' as prescribed, or has anything changed? ';
  } else {
    q8 += 'Are you on any medications, supplements, or over-the-counter drugs? ';
  }
  if (hasAllergies) {
    q8 += 'I have ' + allergyNames.join(' and ') + ' on your allergy record — please confirm this is still accurate, and mention any new reactions.';
  } else {
    q8 += 'Do you have any drug allergies or intolerances I should flag for your doctor?';
  }

  // Q9 — red flag screen, tailored to their risk profile
  var q9 = 'Last set of safety questions — important ones. ';
  if (condNames.some(function(c) { return /migraine/i.test(c); })) {
    q9 += 'Have you had a headache that feels different from your usual migraines — sudden, severe, "worst of your life", or associated with neck stiffness? ';
  }
  if (condNames.some(function(c) { return /hypertension|diabetes|heart/i.test(c); })) {
    q9 += 'Any chest tightness, palpitations, or sudden shortness of breath? ';
  }
  if (recentTravel) {
    q9 += 'Given your recent trip to ' + recentTravel.destination + ' — any fever, unusual rash, or gastrointestinal symptoms that started after you returned? ';
  }
  q9 += 'Also: any weakness or numbness in your face or limbs, blood in your urine, stool or vomit, or loss of consciousness? If yes to any of these, please seek emergency care immediately.';

  return [
    { cat: 'Chief Complaint',        q: q1 },
    { cat: 'Onset & Duration',       q: 'When exactly did this start? Was it sudden — coming on in minutes or hours — or did it build up gradually over days or weeks? Has it been getting better, worse, or staying the same since it started?' },
    { cat: 'Site & Character',       q: q3 },
    { cat: 'Severity',               q: 'On a scale of 0 to 10 — where 0 is nothing and 10 is the worst you can imagine — how bad is it right now? ' + (hasConds ? 'How does this compare to what you usually experience with your ' + condNames[0] + '?' : 'Is it affecting your ability to work, sleep, or carry out daily tasks?') },
    { cat: 'Radiation & Pattern',    q: 'Does it stay in one place, or does it spread anywhere else? Is it constant, or does it come and go in waves or episodes? If it comes and goes — how long do episodes last?' },
    { cat: 'Associated Symptoms',    q: 'Have you noticed any other symptoms alongside this — such as fever, chills, night sweats, nausea, vomiting, shortness of breath, dizziness, unusual fatigue, or a rash? Even things that seem unrelated can be useful.' },
    { cat: 'Modifying Factors',      q: q7 },
    { cat: 'Medical History',        q: q8 },
    { cat: 'Safety Screen',          q: q9 },
  ];
}

let currentSection = 0;
let currentQ       = 0;
let answers        = [];
let isRecording    = false;
let recTimer       = null;
let selectedLang   = 'auto';
let diagResult     = null;

const unlockedTo = { 0: true, 1: true, 2: false, 3: false, 4: false };

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  _p.Session.init();

  // Sidebar ID + greeting
  var id = _p.Session.id;
  var fn = _p.Session.firstName;
  var sidebarId = document.getElementById('sidebarId');
  if (sidebarId) sidebarId.textContent = id;

  // Consent screen ID
  var consentId = document.getElementById('consentId');
  if (consentId) consentId.textContent = id;

  // Render health history
  renderHealthHistory(id, fn);

  // Restore consultation state from sessionStorage (persists across navigation)
  var stored = _p.Store.get(id);
  if (stored && stored.consultation && stored.consultation.diagnosis) {
    diagResult = stored.consultation.diagnosis;
    answers    = stored.consultation.answers || [];
    unlockedTo[2] = true;
    unlockedTo[3] = true;
    unlockedTo[4] = stored.consultation.trackingEnabled || false;
    // Re-render the summary so it's ready when patient visits sec2
    renderReview();
    // Show treatment panel
    setTimeout(showMockTreatment, 50);
  }

  // Start on section 0
  navToSection(0);

  // Tracker init
  if (typeof initTracker === 'function') initTracker();
});

function onLangChange() {
  selectedLang = document.getElementById('langSelect').value;
}

// ── Health History ────────────────────────────────────────────
function renderHealthHistory(ptId, firstName) {
  var h = _p.getHealthHistory(ptId);

  // Greeting
  var greeting = document.getElementById('historyGreeting');
  if (greeting) greeting.textContent = (firstName || h.firstName || '') ? 'Hello, ' + (firstName || h.firstName) + ' — your health record' : 'Health History';

  // Profile strip
  setText('histBlood', h.bloodType || '—');
  setText('histAge', h.ageGroup || '—');
  setText('histAllergyCount', h.allergies.length ? h.allergies.length + (h.allergies.length === 1 ? ' allergy' : ' allergies') : 'None known');
  setText('histCondCount', h.chronicConditions.length ? h.chronicConditions.length + ' condition' + (h.chronicConditions.length > 1 ? 's' : '') : 'None');

  // Allergies
  var allergyEl = document.getElementById('histAllergies');
  if (allergyEl) {
    if (h.allergies.length === 0) {
      allergyEl.innerHTML = '<span class="badge badge-green">None known</span>';
    } else {
      allergyEl.innerHTML = h.allergies.map(function(a) {
        return '<span class="badge badge-red" style="padding:4px 10px;font-size:.78rem">⚠️ ' + a + '</span>';
      }).join('');
    }
  }

  // Chronic conditions
  var chronicEl = document.getElementById('histChronic');
  if (chronicEl) {
    if (h.chronicConditions.length === 0) {
      chronicEl.innerHTML = '<p class="text-sm" style="color:var(--muted)">No chronic conditions on record.</p>';
    } else {
      chronicEl.innerHTML = h.chronicConditions.map(function(c) {
        return '<div class="info-row">' +
          '<span class="info-label">' + c.label + '</span>' +
          '<div class="flex items-center gap-8">' +
            '<span class="info-val text-xs font-mono">ICD-10: ' + c.icd + '</span>' +
            '<span class="badge ' + (c.status === 'ongoing' ? 'badge-amber' : 'badge-teal') + '">' + c.status + '</span>' +
            '<span class="text-xs" style="color:var(--subtle)">since ' + c.since + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Medications
  var medsEl = document.getElementById('histMeds');
  if (medsEl) {
    if (h.currentMedications.length === 0) {
      medsEl.innerHTML = '<p class="text-sm" style="color:var(--muted)">No current medications on record.</p>';
    } else {
      medsEl.innerHTML = h.currentMedications.map(function(m) {
        var typeColor = m.type === 'acute' ? 'badge-amber' : m.type === 'supplement' ? 'badge-gray' : 'badge-blue';
        return '<div class="info-row">' +
          '<span class="info-label">' + m.name + '</span>' +
          '<div class="flex items-center gap-8">' +
            '<span class="info-val text-sm">' + m.dose + '</span>' +
            '<span class="badge ' + typeColor + '">' + m.type + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Vaccinations — structured rows
  var vaccEl = document.getElementById('histVacc');
  if (vaccEl) {
    if (h.vaccinations.length === 0) {
      vaccEl.innerHTML = '<p class="text-sm" style="color:var(--muted)">No vaccination records on file.</p>';
    } else {
      vaccEl.innerHTML = h.vaccinations.map(function(v) {
        return '<div class="vacc-row">' +
          '<span style="color:var(--accent);font-size:.85rem">✓</span>' +
          '<span class="text-sm flex-1">' + v + '</span>' +
        '</div>';
      }).join('');
    }
  }

  // Recent travels
  var travelsEl = document.getElementById('histTravels');
  if (travelsEl) {
    var travels = h.recentTravels || [];
    if (travels.length === 0) {
      travelsEl.innerHTML = '<p class="text-sm" style="color:var(--muted)">No travel history recorded.</p>';
    } else {
      travelsEl.innerHTML = travels.map(function(t) {
        return '<div class="travel-badge">' +
          '<span style="font-size:1rem">✈️</span>' +
          '<div>' +
            '<div class="font-600 text-sm">' + t.destination + '</div>' +
            '<div class="text-xs" style="color:var(--muted)">' + t.date + ' · ' + t.duration + ' · ' + t.purpose + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Past consultations timeline
  var timelineEl = document.getElementById('histTimeline');
  var countEl    = document.getElementById('histConsultCount');
  if (timelineEl) {
    if (h.pastConsultations.length === 0) {
      timelineEl.innerHTML = '<p class="text-sm" style="color:var(--muted)">No prior consultations found.</p>';
    } else {
      if (countEl) countEl.textContent = h.pastConsultations.length + ' records';
      timelineEl.innerHTML = h.pastConsultations.map(function(c) {
        var outcomeColor = c.outcome.includes('Pending') ? 'badge-amber' : c.outcome.includes('Resolved') ? 'badge-green' : 'badge-blue';
        return '<div class="tl-item">' +
          '<div class="tl-dot"></div>' +
          '<div class="tl-date">' + c.date + '</div>' +
          '<div class="tl-card">' +
            '<div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:6px">' +
              '<span class="font-600 text-sm">' + c.condition + '</span>' +
              '<span class="badge ' + outcomeColor + '">' + c.outcome + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-12">' +
              '<span class="text-xs font-mono" style="color:var(--muted)">ICD-10: ' + c.icd + '</span>' +
              '<span class="text-xs" style="color:var(--subtle)">Reviewed by ' + c.doctor + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Doctor notes
  var notesEl = document.getElementById('histNotes');
  if (notesEl) notesEl.textContent = h.notes || 'No notes on file.';
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Section navigation ────────────────────────────────────────
function navToSection(n) {
  if (!unlockedTo[n]) return;
  currentSection = n;

  // Show/hide sections
  [0,1,2,3,4].forEach(function(i) {
    var sec = document.getElementById('sec' + i);
    if (sec) sec.style.display = i === n ? '' : 'none';
  });

  // Update pills
  [0,1,2,3,4].forEach(function(i) {
    var pill = document.getElementById('pill' + i);
    if (!pill) return;
    pill.classList.remove('active','done','locked');
    if (i < n && i > 0)   pill.classList.add('done');
    if (i === n)           pill.classList.add('active');
    if (!unlockedTo[i])    pill.classList.add('locked');

    var snum = document.getElementById('snum' + i);
    if (!snum) return;
    if (i === 0)      snum.textContent = n === 0 ? '📋' : '✓';
    else if (i < n)   snum.textContent = '✓';
    else              snum.textContent = i;
  });

  window.scrollTo(0,0);
}

function unlockSection(n) {
  unlockedTo[n] = true;
  navToSection(n);
}

// ── Consent ───────────────────────────────────────────────────
function proceedFromConsent() {
  if (!document.getElementById('check1').checked || !document.getElementById('check2').checked) {
    alert('Please agree to both consent statements to continue.');
    return;
  }
  // Build tailored questions from patient's health history
  var h = _p.getHealthHistory(_p.Session.id);
  QUESTIONS = buildTailoredQuestions(h);

  _p.Audit.log('consent_given', _p.Session.id);
  document.getElementById('consentCard').style.display = 'none';
  document.getElementById('chatCard').style.display = '';
  currentQ = 0;
  answers  = [];
  addAIBubble(QUESTIONS[0].q, QUESTIONS[0].cat);
  updateProgress();
}

// ── Chat helpers ──────────────────────────────────────────────
function addAIBubble(text, category) {
  var container = document.getElementById('chatContainer');
  if (category) {
    var label = document.createElement('div');
    label.style.cssText = 'font-size:.65rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--subtle);margin:4px 0 2px 36px';
    label.textContent = category;
    container.appendChild(label);
  }
  var wrap = document.createElement('div');
  wrap.className = 'chat-row';
  wrap.innerHTML = '<div class="avatar ai">🤖</div><div><div class="bubble ai">' + text + '</div><div class="bubble-time">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div>';

  var typingWrap = document.createElement('div');
  typingWrap.className = 'chat-row';
  typingWrap.innerHTML = '<div class="avatar ai">🤖</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  container.appendChild(typingWrap);
  scrollChat();
  setTimeout(function() {
    container.removeChild(typingWrap);
    container.appendChild(wrap);
    scrollChat();
  }, 550);
}

function addUserBubble(text) {
  var container = document.getElementById('chatContainer');
  var wrap = document.createElement('div');
  wrap.className = 'chat-row user';
  wrap.innerHTML = '<div><div class="bubble user">' + text + '</div><div class="bubble-time" style="text-align:left">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div><div class="avatar user">👤</div>';
  container.appendChild(wrap);
  scrollChat();
}

function scrollChat() {
  var c = document.getElementById('chatContainer');
  setTimeout(function() { c.scrollTop = c.scrollHeight; }, 50);
}

// ── Recording ─────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) { clearTimeout(recTimer); await finishRecording(); }
  else { startRecording(); }
}

function startRecording() {
  isRecording = true;
  var btn = document.getElementById('recordBtn');
  btn.classList.add('recording'); btn.textContent = '⏹';
  document.getElementById('waveform').classList.remove('idle');
  document.getElementById('waveLabel').textContent = 'Recording…';
  _p.Audit.log('recording_start', _p.Session.id, { q: currentQ });
  recTimer = setTimeout(function() { if (isRecording) finishRecording(); }, 5000 + Math.random()*3000);
}

async function finishRecording() {
  isRecording = false;
  var btn = document.getElementById('recordBtn');
  btn.classList.remove('recording'); btn.textContent = '🎙️';
  document.getElementById('waveform').classList.add('idle');
  document.getElementById('waveLabel').textContent = 'Transcribing…';
  var lang = selectedLang === 'auto' ? 'en' : selectedLang;
  var text = await _p.transcribeAudio(lang, currentQ);
  document.getElementById('waveLabel').textContent = 'Tap mic to speak';
  document.getElementById('typeInput').value = text;
  var langNames = { en:'English', es:'Español', fr:'Français', de:'Deutsch', hi:'Hindi', ar:'Arabic', ta:'Tamil' };
  var badge = document.getElementById('langBadge');
  badge.textContent = '🌐 ' + (langNames[lang] || 'English');
  badge.style.display = '';
  _p.Audit.log('recording_transcribed', _p.Session.id, { q: currentQ, chars: text.length });
}

function sendTyped() {
  var input = document.getElementById('typeInput');
  var text  = input.value.trim();
  if (!text) return;
  input.value = '';
  submitAnswer(text);
}

function submitAnswer(text) {
  addUserBubble(text);
  answers.push({ question: QUESTIONS[currentQ].q, cat: QUESTIONS[currentQ].cat, text: text });
  currentQ++;
  updateProgress();
  document.getElementById('langBadge').style.display = 'none';
  if (currentQ < QUESTIONS.length) {
    setTimeout(function() {
      document.getElementById('questionCategory').textContent = QUESTIONS[currentQ].cat;
      document.getElementById('questionCounter').textContent  = (currentQ + 1) + ' / ' + QUESTIONS.length;
      addAIBubble(QUESTIONS[currentQ].q, QUESTIONS[currentQ].cat);
    }, 400);
  } else {
    setTimeout(function() {
      addAIBubble('Thank you — I have everything I need. Let me now analyse your responses…', null);
      setTimeout(function() { startAnalysis(); }, 1200);
    }, 400);
  }
}

function skipQuestion() { submitAnswer('[Not answered]'); }

function updateProgress() {
  var pct = (currentQ / QUESTIONS.length * 100).toFixed(0);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('questionCounter').textContent = (currentQ + 1) + ' / ' + QUESTIONS.length;
}

// ── Analysis ──────────────────────────────────────────────────
async function startAnalysis() {
  unlockSection(2);
  _p.Audit.log('analysis_start', _p.Session.id);
  var steps = ['astep1','astep2','astep3','astep4'];
  for (var i = 0; i < steps.length; i++) {
    await _p.sleep(900);
    document.getElementById(steps[i]).innerHTML = document.getElementById(steps[i]).innerHTML.replace('⏳','✅');
    if (i + 1 < steps.length) document.getElementById(steps[i+1]).style.opacity = '1';
  }
  diagResult = await _p.runDiagnosis(answers);
  _p.Audit.log('analysis_complete', _p.Session.id, { dx: diagResult.diagnoses[0].name });
  renderReview();
  document.getElementById('analysisPanel').style.display = 'none';
  document.getElementById('summaryPanel').style.display = '';
}

// ── Review render ─────────────────────────────────────────────
function renderReview() {
  var symptoms  = diagResult.symptoms;
  var diagnoses = diagResult.diagnoses;
  var notes     = diagResult.notes;
  var redFlags  = diagResult.redFlags;

  document.getElementById('symptomSummary').innerHTML =
    symptoms.map(function(s) {
      return '<div class="info-row"><span class="info-label">' + s.label + '</span>' +
        '<div style="flex:1"><span class="info-val">' + s.duration + '</span>' +
        '<span class="badge ' + (s.severity==='mild'?'badge-green':s.severity==='moderate'?'badge-amber':'badge-red') + '" style="margin-left:8px">' + s.severity + '</span></div></div>';
    }).join('') +
    (redFlags.length ? redFlags.map(function(f) {
      return '<div class="alert alert-danger mt-8" style="font-size:.8rem"><span>🚩</span><p>' + f.label + '</p></div>';
    }).join('') : '');

  document.getElementById('diagnosisList').innerHTML = diagnoses.map(function(d, i) {
    return '<div class="dx-card ' + (i===0?'primary':'') + '">' +
      '<div class="flex items-center justify-between mb-6">' +
        '<div><div class="font-600 text-sm">' + d.name + '</div>' +
        '<div class="text-xs font-mono" style="color:var(--muted)">ICD-10: ' + d.icd + '</div></div>' +
        '<span class="badge ' + (i===0?'badge-teal':'badge-gray') + '">' + d.confidence + '%</span>' +
      '</div>' +
      '<div class="flex items-center gap-8"><div class="conf-bar"><div class="conf-fill" style="width:' + d.confidence + '%;background:' + (i===0?'var(--accent)':'var(--subtle)') + '"></div></div>' +
      '<span class="text-xs" style="color:var(--muted)">' + d.confidence + '%</span></div>' +
    '</div>';
  }).join('');

  document.getElementById('clinicalNotes').innerHTML = notes;
}

// ── Submit ────────────────────────────────────────────────────
function submitConsultation() {
  _p.Store.save(_p.Session.id, 'consultation', {
    answers: answers, diagnosis: diagResult,
    trackingEnabled: document.getElementById('enableTracking').checked,
    submittedAt: new Date().toISOString(),
  });
  _p.Audit.log('consultation_submitted', _p.Session.id);
  unlockedTo[3] = true;
  unlockedTo[4] = document.getElementById('enableTracking').checked;
  navToSection(3);
  setTimeout(showMockTreatment, 1200);
}

function showMockTreatment() {
  if (!diagResult) return;
  var dx = diagResult.diagnoses[0];
  document.getElementById('awaitingDoctor').style.display = 'none';
  document.getElementById('treatmentPanel').style.display = '';
  document.getElementById('confirmedDx').innerHTML =
    '<div class="info-row"><span class="info-label">Diagnosis</span><div><span class="info-val font-600">' + dx.name + '</span><span class="badge badge-teal" style="margin-left:8px">Confirmed</span></div></div>' +
    '<div class="info-row"><span class="info-label">ICD-10</span><span class="info-val font-mono">' + dx.icd + '</span></div>';
  document.getElementById('treatmentMeds').innerHTML =
    '<div class="info-row"><span class="info-label">Medication</span><span class="info-val">As prescribed by your physician. Follow the dosage instructions provided at your appointment.</span></div>' +
    '<div class="info-row"><span class="info-label">Monitoring</span><span class="info-val">Check in every other day via Cue\'s symptom log. Your doctor will review the data remotely.</span></div>';
  document.getElementById('treatmentFollowup').innerHTML =
    '<div class="info-row"><span class="info-label">Next call</span><span class="info-val">' + _p.formatDate(Date.now() + 1000*60*60*48) + '</span></div>' +
    '<div class="info-row"><span class="info-label">Review apt.</span><span class="info-val">' + _p.formatDate(Date.now() + 1000*60*60*24*14) + '</span></div>';
  unlockedTo[4] = true;
  var pill4 = document.getElementById('pill4');
  if (pill4) pill4.classList.remove('locked');
}

// ── Health Record Edit Modal ──────────────────────────────────
var _editSection = null;
var _editHistory = null;

function openEditModal(section) {
  _editSection = section;
  _editHistory = JSON.parse(JSON.stringify(_p.getHealthHistory(_p.Session.id)));
  if (!_editHistory.recentTravels) _editHistory.recentTravels = [];

  var titles = {
    profile: 'Edit Profile', allergies: 'Allergies & Intolerances',
    conditions: 'Chronic Conditions', medications: 'Current Medications',
    vaccinations: 'Vaccinations', travels: 'Recent Travels',
  };
  document.getElementById('editModalTitle').textContent = '✏️ ' + (titles[section] || 'Edit');
  document.getElementById('editModalBody').innerHTML = buildEditBody(section);
  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  _editSection = null;
  _editHistory = null;
}

function buildEditBody(section) {
  var h = _editHistory;

  if (section === 'profile') {
    var btypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
    var ages   = ['Child (under 12)','Teen (12–17)','Young adult (18–25)',
                  'Adult (20s)','Adult (30s)','Adult (40s)','Adult (50s)','Adult (60s)','Senior (70+)'];
    return '<div class="stack-12">' +
      '<div class="form-group"><label class="form-label">Blood type</label>' +
        '<select class="form-select" id="editBloodType">' +
          btypes.map(function(b) { return '<option' + (b===h.bloodType?' selected':'') + '>' + b + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="form-group"><label class="form-label">Age group</label>' +
        '<select class="form-select" id="editAgeGroup">' +
          ages.map(function(a) { return '<option' + (a===h.ageGroup?' selected':'') + '>' + a + '</option>'; }).join('') +
        '</select></div>' +
    '</div>';
  }

  if (section === 'allergies') {
    return buildStringListEdit('allergies', h.allergies, 'editAllergyInput', 'e.g. Latex, Codeine, Iodine…', '⚠️ ');
  }

  if (section === 'vaccinations') {
    return buildStringListEdit('vaccinations', h.vaccinations, 'editVaccInput', 'e.g. Hepatitis A (Jan 2025)…', '✓ ');
  }

  if (section === 'conditions') {
    var condRows = h.chronicConditions.length === 0
      ? '<p class="text-sm" style="color:var(--muted)">No chronic conditions on record.</p>'
      : h.chronicConditions.map(function(c, i) {
          return '<div class="edit-item-row">' +
            '<div><div class="text-sm font-600">' + c.label + '</div>' +
            '<div class="text-xs" style="color:var(--muted)">ICD-10: ' + c.icd + ' · since ' + c.since + '</div></div>' +
            '<button class="edit-remove-btn" onclick="removeEditCondition(' + i + ')">×</button>' +
          '</div>';
        }).join('');
    return '<div class="stack-8" id="editCondList">' + condRows + '</div>' +
      '<div class="stack-8 mt-12" style="padding:12px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border)">' +
        '<p class="text-xs font-600" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em">Add condition</p>' +
        '<input class="form-input" id="condLabel" placeholder="Condition name (e.g. Asthma)" />' +
        '<div class="flex gap-8">' +
          '<input class="form-input" id="condIcd" placeholder="ICD-10 code" style="flex:1" />' +
          '<input class="form-input" id="condSince" placeholder="Since year" style="flex:1" />' +
          '<select class="form-select" id="condStatus" style="flex:1"><option value="ongoing">Ongoing</option><option value="managed">Managed</option><option value="resolved">Resolved</option></select>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" onclick="addEditCondition()">Add condition</button>' +
      '</div>';
  }

  if (section === 'medications') {
    var medRows = h.currentMedications.length === 0
      ? '<p class="text-sm" style="color:var(--muted)">No medications on record.</p>'
      : h.currentMedications.map(function(m, i) {
          var chip = m.type==='acute'?'badge-amber':m.type==='supplement'?'badge-gray':'badge-blue';
          return '<div class="edit-item-row">' +
            '<div><div class="text-sm font-600">' + m.name + ' <span class="badge ' + chip + '">' + m.type + '</span></div>' +
            '<div class="text-xs" style="color:var(--muted)">' + m.dose + '</div></div>' +
            '<button class="edit-remove-btn" onclick="removeEditMed(' + i + ')">×</button>' +
          '</div>';
        }).join('');
    return '<div class="stack-8" id="editMedList">' + medRows + '</div>' +
      '<div class="stack-8 mt-12" style="padding:12px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border)">' +
        '<p class="text-xs font-600" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em">Add medication</p>' +
        '<input class="form-input" id="medName" placeholder="Name & dose (e.g. Ibuprofen 400mg)" />' +
        '<input class="form-input" id="medDose" placeholder="Frequency (e.g. Twice daily with food)" />' +
        '<select class="form-select" id="medType"><option value="maintenance">Maintenance</option><option value="acute">Acute (PRN)</option><option value="supplement">Supplement</option></select>' +
        '<button class="btn btn-outline btn-sm" onclick="addEditMed()">Add medication</button>' +
      '</div>';
  }

  if (section === 'travels') {
    var travelRows = (!h.recentTravels || h.recentTravels.length === 0)
      ? '<p class="text-sm" style="color:var(--muted)">No travel history recorded.</p>'
      : h.recentTravels.map(function(t, i) {
          return '<div class="edit-item-row">' +
            '<div><div class="text-sm font-600">✈️ ' + t.destination + '</div>' +
            '<div class="text-xs" style="color:var(--muted)">' + t.date + ' · ' + t.duration + ' · ' + t.purpose + '</div></div>' +
            '<button class="edit-remove-btn" onclick="removeEditTravel(' + i + ')">×</button>' +
          '</div>';
        }).join('');
    return '<div class="stack-8" id="editTravelList">' + travelRows + '</div>' +
      '<div class="stack-8 mt-12" style="padding:12px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border)">' +
        '<p class="text-xs font-600" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em">Add trip</p>' +
        '<input class="form-input" id="travelDest" placeholder="Destination (e.g. Japan, Tokyo)" />' +
        '<div class="flex gap-8">' +
          '<input class="form-input" id="travelDate" placeholder="Month & year (e.g. Apr 2025)" style="flex:1" />' +
          '<input class="form-input" id="travelDur" placeholder="Duration" style="flex:1" />' +
        '</div>' +
        '<select class="form-select" id="travelPurpose">' +
          '<option value="Holiday">Holiday</option><option value="Business">Business</option>' +
          '<option value="Family visit">Family visit</option><option value="Volunteer">Volunteer</option><option value="Medical">Medical</option>' +
        '</select>' +
        '<button class="btn btn-outline btn-sm" onclick="addEditTravel()">Add trip</button>' +
      '</div>';
  }

  return '<p class="text-sm text-muted">Nothing to edit here.</p>';
}

function buildStringListEdit(field, arr, inputId, placeholder, prefix) {
  var rows = arr.length === 0
    ? '<p class="text-sm" style="color:var(--muted)">None recorded.</p>'
    : arr.map(function(v, i) {
        return '<div class="edit-item-row">' +
          '<span class="text-sm">' + prefix + v + '</span>' +
          '<button class="edit-remove-btn" onclick="removeEditStr(\'' + field + '\',' + i + ')">×</button>' +
        '</div>';
      }).join('');
  return '<div class="stack-8" id="editStrList">' + rows + '</div>' +
    '<div class="flex gap-8 mt-10">' +
      '<input class="form-input" id="' + inputId + '" placeholder="' + placeholder + '" style="flex:1" onkeydown="if(event.key===\'Enter\')addEditStr(\'' + field + '\',\'' + inputId + '\')" />' +
      '<button class="btn btn-outline btn-sm" onclick="addEditStr(\'' + field + '\',\'' + inputId + '\')">Add</button>' +
    '</div>';
}

// ── Edit helpers ──────────────────────────────────────────────
function removeEditStr(field, idx) {
  _editHistory[field].splice(idx, 1);
  document.getElementById('editModalBody').innerHTML = buildEditBody(_editSection);
}
function addEditStr(field, inputId) {
  var val = document.getElementById(inputId).value.trim();
  if (!val) return;
  _editHistory[field].push(val);
  document.getElementById('editModalBody').innerHTML = buildEditBody(_editSection);
}
function removeEditCondition(idx) {
  _editHistory.chronicConditions.splice(idx, 1);
  document.getElementById('editModalBody').innerHTML = buildEditBody('conditions');
}
function addEditCondition() {
  var label = document.getElementById('condLabel').value.trim();
  if (!label) return;
  _editHistory.chronicConditions.push({
    label: label,
    icd:   document.getElementById('condIcd').value.trim() || 'N/A',
    since: document.getElementById('condSince').value.trim() || new Date().getFullYear().toString(),
    status: document.getElementById('condStatus').value,
  });
  document.getElementById('editModalBody').innerHTML = buildEditBody('conditions');
}
function removeEditMed(idx) {
  _editHistory.currentMedications.splice(idx, 1);
  document.getElementById('editModalBody').innerHTML = buildEditBody('medications');
}
function addEditMed() {
  var name = document.getElementById('medName').value.trim();
  if (!name) return;
  _editHistory.currentMedications.push({
    name: name,
    dose: document.getElementById('medDose').value.trim() || 'As directed',
    type: document.getElementById('medType').value,
  });
  document.getElementById('editModalBody').innerHTML = buildEditBody('medications');
}
function removeEditTravel(idx) {
  _editHistory.recentTravels.splice(idx, 1);
  document.getElementById('editModalBody').innerHTML = buildEditBody('travels');
}
function addEditTravel() {
  var dest = document.getElementById('travelDest').value.trim();
  if (!dest) return;
  _editHistory.recentTravels.unshift({
    destination: dest,
    date:    document.getElementById('travelDate').value.trim() || 'Date not specified',
    duration: document.getElementById('travelDur').value.trim() || 'Duration not specified',
    purpose: document.getElementById('travelPurpose').value,
  });
  document.getElementById('editModalBody').innerHTML = buildEditBody('travels');
}

function saveEdit() {
  var ptId = _p.Session.id;

  // Ensure the patient has a writable record in HEALTH_HISTORY (create if unknown)
  if (!_p.HEALTH_HISTORY[ptId]) {
    _p.HEALTH_HISTORY[ptId] = JSON.parse(JSON.stringify(_editHistory));
  }

  var h = _p.HEALTH_HISTORY[ptId]; // always the live reference

  if (_editSection === 'profile') {
    h.bloodType = document.getElementById('editBloodType').value;
    h.ageGroup  = document.getElementById('editAgeGroup').value;
  } else {
    ['allergies','vaccinations','chronicConditions','currentMedications','recentTravels'].forEach(function(field) {
      if (_editHistory[field] !== undefined) h[field] = _editHistory[field];
    });
  }

  _p.Audit.log('health_record_edited', ptId, { section: _editSection });

  // Persist edits so they survive page navigation
  _p.persistHealthEdit(ptId, h);

  // Re-render
  var fn = localStorage.getItem('cue_firstname') || h.firstName || '';
  renderHealthHistory(ptId, fn);
  closeEditModal();

  // Toast
  var t = document.getElementById('toast');
  if (t) { t.textContent = '✓ Record updated'; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 2500); }
}
