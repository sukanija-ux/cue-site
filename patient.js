/* ============================================================
   Cue — Patient page logic
   Health History → Dynamic AI intake → Summary → Treatment → Tracking
   ============================================================ */

const _p = window.CUE;

// ── State ─────────────────────────────────────────────────────
let currentSection  = 0;
let currentQ        = 0;          // used only in static fallback mode
let answers         = [];         // [{question, cat, text}] — static fallback
let _clinicalMsgs   = [];         // [{role, content}] — LLM conversation history
let _dynamicMode    = false;      // true when LLM interview is active
let isRecording     = false;
let recTimer        = null;
let selectedLang    = 'auto';
let diagResult      = null;

const unlockedTo = { 0: true, 1: true, 2: false, 3: false, 4: false };

// ── Static fallback questions (used when no API key) ─────────
var QUESTIONS = [];

function buildTailoredQuestions(history) {
  var fn        = history.firstName || localStorage.getItem('cue_firstname') || 'there';
  var condNames = (history.chronicConditions || []).map(function(c) { return c.label; });
  var medNames  = (history.currentMedications || []).map(function(m) { return m.name; });
  var hasConds  = condNames.length > 0;
  var hasMeds   = medNames.length > 0;
  var recentTravel = (history.recentTravels || [])[0];

  // Q1 — warm opener, no clinical data dump
  var q1 = 'Hi ' + fn + ' 👋 I\'m here to take a quick history before your appointment — just a few questions to help your doctor prepare. In your own words, what\'s been going on?';

  // Q3 — location only (character asked separately in Q4)
  var q3 = 'Where exactly do you feel it?';
  if (condNames.some(function(c) { return /migraine|headache/i.test(c); }))
    q3 = 'Is the pain in the same spot as your usual migraines, or somewhere different this time?';
  else if (condNames.some(function(c) { return /IBS|bowel|gastro|crohn/i.test(c); }))
    q3 = 'Is the discomfort in the same area as usual, or somewhere new?';

  // Q7 — modifying factors, personalised to meds
  var q7 = 'Is there anything that makes it better or worse?';
  if (hasMeds && medNames.length === 1)
    q7 = 'Have you tried ' + medNames[0] + ' for it — and did it help?';
  else if (hasMeds)
    q7 = 'Have you tried any of your usual medications for it, or anything over the counter — did it help?';

  // Q8 — context, tailored to what we know
  var q8 = 'Any other conditions, recent illnesses, or medications I should know about?';
  if (hasConds)
    q8 = 'Does this feel similar to your usual ' + condNames[0] + ', or is it a bit different this time?';
  else if (recentTravel)
    q8 = 'You recently travelled to ' + recentTravel.destination + ' — did the symptoms start around that time, or were they there before?';

  // Q9 — safety screen, short and calm
  var q9 = 'Last question — any chest pain, difficulty breathing, weakness or numbness in your arms or face, or a headache you\'d call the worst you\'ve ever had?';
  if (recentTravel && !hasConds)
    q9 = 'Since your trip to ' + recentTravel.destination + ' — have you had any fever, rash, or stomach symptoms that started after you got back?';

  return [
    { cat: 'How are you today?',        q: q1,  quickReplies: null },
    { cat: 'When did it start?',        q: 'When did this start?',
      quickReplies: ['Today', 'Yesterday', '2–3 days ago', 'About a week ago', 'Longer'] },
    { cat: 'Where is it?',              q: q3,
      quickReplies: hasConds ? ['Same as usual', 'Somewhere different', 'Both'] : null },
    { cat: 'What does it feel like?',   q: 'How would you describe the sensation — sharp, dull, throbbing, burning, cramping, or pressure?',
      quickReplies: ['Sharp / stabbing', 'Dull / aching', 'Throbbing / pulsing', 'Burning', 'Cramping', 'Pressure'] },
    { cat: 'How bad is it?',            q: 'On a scale of 0–10, how would you rate it right now — 0 being nothing at all, 10 the worst imaginable?',
      quickReplies: ['1','2','3','4','5','6','7','8','9','10'] },
    { cat: 'Anything else going on?',   q: 'Any other symptoms alongside this?',
      quickReplies: ['No, just this', 'Fever / chills', 'Nausea / vomiting', 'Dizziness', 'Breathlessness', 'Fatigue'] },
    { cat: 'What helps or makes it worse?', q: q7,
      quickReplies: hasMeds
        ? ['Yes, helped a lot', 'Helped a little', 'No effect', 'Made it worse', "Haven't tried"]
        : ['Rest helps', 'Heat helps', 'Cold helps', 'Nothing helps', 'Not sure'] },
    { cat: 'Background',                q: q8,
      quickReplies: hasConds ? ['Very similar', 'A bit different', 'Quite different'] : null },
    { cat: 'Safety check',              q: q9,
      quickReplies: ['None of these', 'Yes — at least one'] },
  ];
}

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

  // API key status badge
  onApiKeyInput(localStorage.getItem('cue_api_key') || '');
  var clearBtn = document.getElementById('clearKeyBtn');
  if (clearBtn) clearBtn.style.display = localStorage.getItem('cue_api_key') ? '' : 'none';

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
var _hrEditMode = false;
var _hrDraft    = null;

function renderHealthHistory(ptId, firstName) {
  var h = _p.getHealthHistory(ptId);

  // Greeting
  var greeting = document.getElementById('historyGreeting');
  if (greeting) greeting.textContent = (firstName || h.firstName) ? 'Hello, ' + (firstName || h.firstName) + ' — your health record' : 'Health History';

  // Render inline form
  renderHRForm(h);

  // Past consultations
  var timelineEl = document.getElementById('histTimeline');
  var countEl    = document.getElementById('histConsultCount');
  if (timelineEl) {
    if (!h.pastConsultations || h.pastConsultations.length === 0) {
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

function renderHRForm(h) {
  var body = document.getElementById('hrBody');
  var btns = document.getElementById('hrBtnArea');
  if (!body) return;

  if (_hrEditMode) {
    body.innerHTML = buildHREdit(_hrDraft);
    if (btns) btns.innerHTML =
      '<div class="flex gap-8">' +
        '<button class="btn btn-ghost btn-sm" onclick="cancelHREdit()">Cancel</button>' +
        '<button class="btn btn-primary btn-sm" onclick="saveHRForm()">Save changes</button>' +
      '</div>';
  } else {
    body.innerHTML = buildHRView(h);
    if (btns) btns.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="enterHREditMode()">✏️ Edit</button>';
  }
}

function enterHREditMode() {
  _hrDraft = JSON.parse(JSON.stringify(_p.getHealthHistory(_p.Session.id)));
  if (!_hrDraft.recentTravels) _hrDraft.recentTravels = [];
  if (!_hrDraft.vaccinations)  _hrDraft.vaccinations  = [];
  _hrEditMode = true;
  renderHRForm(_hrDraft);
}

function cancelHREdit() {
  _hrEditMode = false;
  _hrDraft    = null;
  renderHRForm(_p.getHealthHistory(_p.Session.id));
}

function saveHRForm() {
  // Collect simple selects
  var btEl = document.getElementById('hrBloodType');
  var agEl = document.getElementById('hrAgeGroup');
  if (btEl) _hrDraft.bloodType = btEl.value;
  if (agEl) _hrDraft.ageGroup  = agEl.value;

  // Persist
  var ptId = _p.Session.id;
  if (!_p.HEALTH_HISTORY[ptId]) _p.HEALTH_HISTORY[ptId] = JSON.parse(JSON.stringify(_hrDraft));
  var h = _p.HEALTH_HISTORY[ptId];
  ['bloodType','ageGroup','allergies','chronicConditions','currentMedications','vaccinations','recentTravels'].forEach(function(k) {
    if (_hrDraft[k] !== undefined) h[k] = _hrDraft[k];
  });
  _p.persistHealthEdit(ptId, h);
  _p.Audit.log('health_record_edited', ptId, { section: 'inline_form' });

  _hrEditMode = false;
  _hrDraft    = null;
  var fn = localStorage.getItem('cue_firstname') || h.firstName || '';
  renderHealthHistory(ptId, fn);
  showToast('✓ Record saved');
}

// ── View mode ─────────────────────────────────────────────────
function buildHRView(h) {
  var btypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
  var bloodBadge = (h.bloodType && h.bloodType !== 'Unknown')
    ? '<span class="hr-chip-item accent" style="font-size:.95rem;font-weight:700">' + h.bloodType + '</span>'
    : '<span style="color:var(--subtle);font-size:.85rem">Not set</span>';
  var ageBadge = h.ageGroup
    ? '<span class="hr-chip-item">' + h.ageGroup + '</span>'
    : '<span style="color:var(--subtle);font-size:.85rem">Not set</span>';

  // Allergies
  var allergyHtml = (!h.allergies || h.allergies.length === 0)
    ? '<span class="hr-chip-item accent">✓ None known</span>'
    : h.allergies.map(function(a) { return '<span class="hr-chip-item danger">⚠️ ' + a + '</span>'; }).join('');

  // Chronic conditions
  var condHtml = (!h.chronicConditions || h.chronicConditions.length === 0)
    ? '<span class="text-sm" style="color:var(--muted)">None on record</span>'
    : h.chronicConditions.map(function(c) {
        var statusCls = c.status === 'ongoing' ? 'badge-amber' : c.status === 'resolved' ? 'badge-green' : 'badge-teal';
        return '<div class="hr-structured-item" style="margin-bottom:6px">' +
          '<div><div class="text-sm font-600" style="color:var(--text)">' + c.label + '</div>' +
          '<div class="text-xs font-mono" style="color:var(--muted);margin-top:2px">ICD-10: ' + c.icd + ' · since ' + c.since + '</div></div>' +
          '<span class="badge ' + statusCls + '">' + c.status + '</span>' +
        '</div>';
      }).join('');

  // Medications
  var medsHtml = (!h.currentMedications || h.currentMedications.length === 0)
    ? '<span class="text-sm" style="color:var(--muted)">None on record</span>'
    : h.currentMedications.map(function(m) {
        var typeColor = m.type === 'acute' ? 'badge-amber' : m.type === 'supplement' ? 'badge-gray' : 'badge-blue';
        return '<div class="hr-structured-item">' +
          '<div><div class="text-sm font-600" style="color:var(--text)">💊 ' + m.name + '</div>' +
          '<div class="text-xs" style="color:var(--muted);margin-top:2px">' + m.dose + '</div></div>' +
          '<span class="badge ' + typeColor + '">' + m.type + '</span>' +
        '</div>';
      }).join('');

  // Vaccinations
  var vaccHtml = (!h.vaccinations || h.vaccinations.length === 0)
    ? '<span class="text-sm" style="color:var(--muted)">No records on file</span>'
    : '<div class="hr-chips">' + h.vaccinations.map(function(v) {
        return '<span class="hr-chip-item accent">✓ ' + v + '</span>';
      }).join('') + '</div>';

  // Travels
  var travelsHtml = (!h.recentTravels || h.recentTravels.length === 0)
    ? '<span class="text-sm" style="color:var(--muted)">No travel history recorded</span>'
    : h.recentTravels.map(function(t) {
        return '<div class="hr-travel-card">' +
          '<span style="font-size:1.1rem">✈️</span>' +
          '<div><div class="text-sm font-600" style="color:var(--text)">' + t.destination + '</div>' +
          '<div class="text-xs" style="color:var(--muted);margin-top:1px">' + t.date + ' · ' + t.duration + ' · ' + t.purpose + '</div></div>' +
        '</div>';
      }).join('');

  return [
    hrSection('Personal info', '<div class="hr-field-grid">' +
      '<div><div class="hr-section-label" style="margin-bottom:6px">Blood type</div>' + bloodBadge + '</div>' +
      '<div><div class="hr-section-label" style="margin-bottom:6px">Age group</div>' + ageBadge + '</div>' +
    '</div>'),
    hrSection('Allergies & intolerances', '<div class="hr-chips">' + allergyHtml + '</div>'),
    hrSection('Chronic conditions', condHtml),
    hrSection('Current medications', medsHtml),
    hrSection('Vaccinations', vaccHtml),
    hrSection('Recent travels', travelsHtml),
  ].join('');
}

function hrSection(label, content) {
  return '<div class="hr-section"><div class="hr-section-label">' + label + '</div>' + content + '</div>';
}

// ── Edit mode ─────────────────────────────────────────────────
function buildHREdit(h) {
  var btypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
  var ages   = ['Child (under 12)','Teen (12–17)','Young adult (18–25)',
                'Adult (20s)','Adult (30s)','Adult (40s)','Adult (50s)','Adult (60s)','Senior (70+)'];

  // Personal info
  var profileHtml = '<div class="hr-field-grid">' +
    '<div class="form-group" style="margin:0">' +
      '<label class="form-label">Blood type</label>' +
      '<select class="form-select" id="hrBloodType">' +
        btypes.map(function(b) { return '<option' + (b === h.bloodType ? ' selected' : '') + '>' + b + '</option>'; }).join('') +
      '</select>' +
    '</div>' +
    '<div class="form-group" style="margin:0">' +
      '<label class="form-label">Age group</label>' +
      '<select class="form-select" id="hrAgeGroup">' +
        ages.map(function(a) { return '<option' + (a === h.ageGroup ? ' selected' : '') + '>' + a + '</option>'; }).join('') +
      '</select>' +
    '</div>' +
  '</div>';

  // Allergies list + add
  var allergyItems = (h.allergies || []).map(function(a, i) {
    return '<span class="hr-chip-item danger">⚠️ ' + a +
      '<button class="hr-remove" onclick="hrRemove(\'allergies\',' + i + ')">×</button></span>';
  }).join('');
  var allergyHtml = '<div class="hr-chips" id="hrAllergyChips">' +
    (allergyItems || '<span class="text-xs" style="color:var(--muted)">None added yet</span>') +
  '</div>' +
  '<div class="hr-add-row">' +
    '<input class="form-input" id="hrAllergyInput" placeholder="e.g. Penicillin, Latex…" onkeydown="if(event.key===\'Enter\')hrAddStr(\'allergies\',\'hrAllergyInput\')" />' +
    '<button class="btn btn-outline btn-sm" onclick="hrAddStr(\'allergies\',\'hrAllergyInput\')">+ Add</button>' +
  '</div>';

  // Chronic conditions
  var condItems = (h.chronicConditions || []).map(function(c, i) {
    return '<div class="hr-structured-item">' +
      '<div><div class="text-sm font-600">' + c.label + '</div>' +
      '<div class="text-xs font-mono" style="color:var(--muted)">ICD-10: ' + c.icd + ' · since ' + c.since + '</div></div>' +
      '<div class="flex items-center gap-6">' +
        '<span class="badge ' + (c.status === 'ongoing' ? 'badge-amber' : 'badge-teal') + '">' + c.status + '</span>' +
        '<button class="hr-remove" onclick="hrRemove(\'chronicConditions\',' + i + ')">×</button>' +
      '</div>' +
    '</div>';
  }).join('') || '<p class="text-sm" style="color:var(--muted)">None on record.</p>';
  var condHtml = '<div id="hrCondList">' + condItems + '</div>' +
    '<div class="hr-add-block">' +
      '<div class="hr-add-block-label">Add condition</div>' +
      '<input class="form-input" id="condLabel" placeholder="Condition name (e.g. Asthma)" />' +
      '<div class="flex gap-8">' +
        '<input class="form-input" id="condIcd" placeholder="ICD-10 code" style="flex:1" />' +
        '<input class="form-input" id="condSince" placeholder="Since year" style="flex:1" />' +
        '<select class="form-select" id="condStatus" style="flex:1"><option value="ongoing">Ongoing</option><option value="managed">Managed</option><option value="resolved">Resolved</option></select>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" style="align-self:flex-start" onclick="hrAddCondition()">+ Add</button>' +
    '</div>';

  // Medications
  var medItems = (h.currentMedications || []).map(function(m, i) {
    var typeColor = m.type === 'acute' ? 'badge-amber' : m.type === 'supplement' ? 'badge-gray' : 'badge-blue';
    return '<div class="hr-structured-item">' +
      '<div><div class="text-sm font-600">💊 ' + m.name + '</div>' +
      '<div class="text-xs" style="color:var(--muted)">' + m.dose + '</div></div>' +
      '<div class="flex items-center gap-6">' +
        '<span class="badge ' + typeColor + '">' + m.type + '</span>' +
        '<button class="hr-remove" onclick="hrRemove(\'currentMedications\',' + i + ')">×</button>' +
      '</div>' +
    '</div>';
  }).join('') || '<p class="text-sm" style="color:var(--muted)">None on record.</p>';
  var medsHtml = '<div id="hrMedList">' + medItems + '</div>' +
    '<div class="hr-add-block">' +
      '<div class="hr-add-block-label">Add medication</div>' +
      '<input class="form-input" id="medName" placeholder="Name (e.g. Ibuprofen 400mg)" />' +
      '<input class="form-input" id="medDose" placeholder="Frequency (e.g. Twice daily with food)" />' +
      '<div class="flex gap-8">' +
        '<select class="form-select" id="medType" style="flex:1"><option value="maintenance">Maintenance</option><option value="acute">Acute (PRN)</option><option value="supplement">Supplement</option></select>' +
        '<button class="btn btn-outline btn-sm" onclick="hrAddMed()">+ Add</button>' +
      '</div>' +
    '</div>';

  // Vaccinations
  var vaccItems = (h.vaccinations || []).map(function(v, i) {
    return '<span class="hr-chip-item accent">✓ ' + v +
      '<button class="hr-remove" onclick="hrRemove(\'vaccinations\',' + i + ')">×</button></span>';
  }).join('');
  var vaccHtml = '<div class="hr-chips" id="hrVaccChips">' +
    (vaccItems || '<span class="text-xs" style="color:var(--muted)">None added yet</span>') +
  '</div>' +
  '<div class="hr-add-row">' +
    '<input class="form-input" id="hrVaccInput" placeholder="e.g. Flu vaccine (Oct 2024)…" onkeydown="if(event.key===\'Enter\')hrAddStr(\'vaccinations\',\'hrVaccInput\')" />' +
    '<button class="btn btn-outline btn-sm" onclick="hrAddStr(\'vaccinations\',\'hrVaccInput\')">+ Add</button>' +
  '</div>';

  // Travels
  var travelItems = (h.recentTravels || []).map(function(t, i) {
    return '<div class="hr-travel-card" style="justify-content:space-between">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span>✈️</span>' +
        '<div><div class="text-sm font-600">' + t.destination + '</div>' +
        '<div class="text-xs" style="color:var(--muted)">' + t.date + ' · ' + t.duration + ' · ' + t.purpose + '</div></div>' +
      '</div>' +
      '<button class="hr-remove" onclick="hrRemove(\'recentTravels\',' + i + ')">×</button>' +
    '</div>';
  }).join('') || '<p class="text-sm" style="color:var(--muted)">No travel history recorded.</p>';
  var travelsHtml = '<div id="hrTravelList">' + travelItems + '</div>' +
    '<div class="hr-add-block">' +
      '<div class="hr-add-block-label">Add trip</div>' +
      '<input class="form-input" id="travelDest" placeholder="Destination (e.g. Japan, Tokyo)" />' +
      '<div class="flex gap-8">' +
        '<input class="form-input" id="travelDate" placeholder="Month & year (e.g. Apr 2025)" style="flex:1" />' +
        '<input class="form-input" id="travelDur" placeholder="Duration (e.g. 2 weeks)" style="flex:1" />' +
      '</div>' +
      '<div class="flex gap-8">' +
        '<select class="form-select" id="travelPurpose" style="flex:1">' +
          '<option value="Holiday">Holiday</option><option value="Business">Business</option>' +
          '<option value="Family visit">Family visit</option><option value="Volunteer">Volunteer</option><option value="Medical">Medical</option>' +
        '</select>' +
        '<button class="btn btn-outline btn-sm" onclick="hrAddTravel()">+ Add</button>' +
      '</div>' +
    '</div>';

  return [
    hrSection('Personal info', profileHtml),
    hrSection('Allergies & intolerances', allergyHtml),
    hrSection('Chronic conditions', condHtml),
    hrSection('Current medications', medsHtml),
    hrSection('Vaccinations', vaccHtml),
    hrSection('Recent travels', travelsHtml),
  ].join('');
}

// ── Inline edit helpers ────────────────────────────────────────
function hrRemove(field, idx) {
  _hrDraft[field].splice(idx, 1);
  // read current select values before re-render
  var bt = document.getElementById('hrBloodType'); if (bt) _hrDraft.bloodType = bt.value;
  var ag = document.getElementById('hrAgeGroup');  if (ag) _hrDraft.ageGroup  = ag.value;
  renderHRForm(_hrDraft);
}

function hrAddStr(field, inputId) {
  var val = document.getElementById(inputId).value.trim();
  if (!val) return;
  if (!_hrDraft[field]) _hrDraft[field] = [];
  _hrDraft[field].push(val);
  var bt = document.getElementById('hrBloodType'); if (bt) _hrDraft.bloodType = bt.value;
  var ag = document.getElementById('hrAgeGroup');  if (ag) _hrDraft.ageGroup  = ag.value;
  renderHRForm(_hrDraft);
}

function hrAddCondition() {
  var label = document.getElementById('condLabel').value.trim();
  if (!label) return;
  if (!_hrDraft.chronicConditions) _hrDraft.chronicConditions = [];
  _hrDraft.chronicConditions.push({
    label:  label,
    icd:    document.getElementById('condIcd').value.trim()    || 'N/A',
    since:  document.getElementById('condSince').value.trim()  || new Date().getFullYear().toString(),
    status: document.getElementById('condStatus').value,
  });
  var bt = document.getElementById('hrBloodType'); if (bt) _hrDraft.bloodType = bt.value;
  var ag = document.getElementById('hrAgeGroup');  if (ag) _hrDraft.ageGroup  = ag.value;
  renderHRForm(_hrDraft);
}

function hrAddMed() {
  var name = document.getElementById('medName').value.trim();
  if (!name) return;
  if (!_hrDraft.currentMedications) _hrDraft.currentMedications = [];
  _hrDraft.currentMedications.push({
    name: name,
    dose: document.getElementById('medDose').value.trim() || 'As directed',
    type: document.getElementById('medType').value,
  });
  var bt = document.getElementById('hrBloodType'); if (bt) _hrDraft.bloodType = bt.value;
  var ag = document.getElementById('hrAgeGroup');  if (ag) _hrDraft.ageGroup  = ag.value;
  renderHRForm(_hrDraft);
}

function hrAddTravel() {
  var dest = document.getElementById('travelDest').value.trim();
  if (!dest) return;
  if (!_hrDraft.recentTravels) _hrDraft.recentTravels = [];
  _hrDraft.recentTravels.unshift({
    destination: dest,
    date:     document.getElementById('travelDate').value.trim()    || 'Date not specified',
    duration: document.getElementById('travelDur').value.trim()     || 'Duration not specified',
    purpose:  document.getElementById('travelPurpose').value,
  });
  var bt = document.getElementById('hrBloodType'); if (bt) _hrDraft.bloodType = bt.value;
  var ag = document.getElementById('hrAgeGroup');  if (ag) _hrDraft.ageGroup  = ag.value;
  renderHRForm(_hrDraft);
}

function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
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

// ── API key helpers ───────────────────────────────────────────
function onApiKeyInput(val) {
  var stored = localStorage.getItem('cue_api_key') || '';
  var badge  = document.getElementById('apiKeyStatus');
  var clear  = document.getElementById('clearKeyBtn');
  if (!badge) return;
  if (val.trim().startsWith('sk-ant')) {
    badge.textContent = '● AI interview enabled';
    badge.className = 'badge badge-teal';
  } else if (stored.startsWith('sk-ant')) {
    badge.textContent = '● Saved key active';
    badge.className = 'badge badge-teal';
  } else {
    badge.textContent = '● Standard questionnaire';
    badge.className = 'badge badge-gray';
  }
  if (clear) clear.style.display = stored ? '' : 'none';
}

function clearApiKey() {
  localStorage.removeItem('cue_api_key');
  var input = document.getElementById('apiKeyInput');
  if (input) input.value = '';
  onApiKeyInput('');
}

// ── Consent ───────────────────────────────────────────────────
function proceedFromConsent() {
  if (!document.getElementById('check1').checked || !document.getElementById('check2').checked) {
    alert('Please agree to both consent statements to continue.');
    return;
  }

  // Save API key if provided in the input
  var keyInput = document.getElementById('apiKeyInput');
  if (keyInput && keyInput.value.trim().startsWith('sk-ant')) {
    localStorage.setItem('cue_api_key', keyInput.value.trim());
  }

  _p.Audit.log('consent_given', _p.Session.id);
  document.getElementById('consentCard').style.display = 'none';
  document.getElementById('chatCard').style.display = '';

  var hasKey = !!localStorage.getItem('cue_api_key');
  if (hasKey) {
    startDynamicInterview();
  } else {
    startStaticInterview();
  }
}

// ── Dynamic AI interview ──────────────────────────────────────
function buildPatientContext(h) {
  var lines = ['PATIENT HEALTH RECORD (pre-loaded — use to personalise your questions, do not read it back verbatim):'];
  lines.push('Age group: ' + (h.ageGroup || 'Not specified'));
  lines.push('Blood type: ' + (h.bloodType || 'Unknown'));
  if (h.allergies && h.allergies.length)
    lines.push('Known allergies: ' + h.allergies.join(', '));
  if (h.chronicConditions && h.chronicConditions.length)
    lines.push('Chronic conditions: ' + h.chronicConditions.map(function(c) { return c.label + ' (' + c.status + ', since ' + c.since + ')'; }).join('; '));
  if (h.currentMedications && h.currentMedications.length)
    lines.push('Current medications: ' + h.currentMedications.map(function(m) { return m.name + ' — ' + m.dose; }).join('; '));
  if (h.recentTravels && h.recentTravels.length)
    lines.push('Recent travels: ' + h.recentTravels.map(function(t) { return t.destination + ' (' + t.date + ', ' + t.duration + ')'; }).join('; '));
  if (h.pastConsultations && h.pastConsultations.length)
    lines.push('Recent consultations: ' + h.pastConsultations.slice(0,3).map(function(c) { return c.condition + ' (' + c.date + ')'; }).join('; '));
  lines.push('Patient first name: ' + (h.firstName || localStorage.getItem('cue_firstname') || 'not known'));
  return lines.join('\n');
}

async function startDynamicInterview() {
  _dynamicMode   = true;
  _clinicalMsgs  = [];
  answers        = [];
  currentQ       = 0;

  var h          = _p.getHealthHistory(_p.Session.id);
  var context    = buildPatientContext(h);
  var systemFull = _p.CLINICAL_SYSTEM_PROMPT + '\n\n' + context;

  updateProgress(0);
  setInputEnabled(false);
  showTypingIndicator();

  try {
    // Seed: ask Claude to open the interview
    _clinicalMsgs.push({ role: 'user', content: '[BEGIN INTERVIEW — greet the patient and ask your opening question]' });
    var raw     = await _p.callClaude(_clinicalMsgs, systemFull);
    var parsed  = _p.parseClinicalResponse(raw);
    _clinicalMsgs.push({ role: 'assistant', content: raw });
    removeTypingIndicator();
    addAIBubble(parsed.response, 'Chief Complaint');
    setInputEnabled(true);
    updateProgress(5);
  } catch (err) {
    removeTypingIndicator();
    handleApiError(err);
  }
}

async function sendDynamicAnswer(text) {
  addUserBubble(text);
  answers.push({ question: '(dynamic)', cat: 'AI interview', text: text });
  currentQ++;
  setInputEnabled(false);
  showTypingIndicator();

  var h          = _p.getHealthHistory(_p.Session.id);
  var systemFull = _p.CLINICAL_SYSTEM_PROMPT + '\n\n' + buildPatientContext(h);
  _clinicalMsgs.push({ role: 'user', content: text });

  try {
    var raw    = await _p.callClaude(_clinicalMsgs, systemFull);
    var parsed = _p.parseClinicalResponse(raw);
    _clinicalMsgs.push({ role: 'assistant', content: raw });
    removeTypingIndicator();

    if (parsed.synthesize) {
      // Show the farewell response then transition to analysis
      if (parsed.response) addAIBubble(parsed.response, 'Summary');
      updateProgress(100);
      await _p.sleep(900);
      applySynthesis(parsed.synthesize);
    } else {
      addAIBubble(parsed.response, 'Question ' + (currentQ + 1));
      updateProgress(Math.min(90, currentQ * 12));
      setInputEnabled(true);
    }
  } catch (err) {
    removeTypingIndicator();
    handleApiError(err);
    setInputEnabled(true);
  }
}

function applySynthesis(jsonStr) {
  try {
    var data = JSON.parse(jsonStr);
    // Attach checkin questions from the static bank
    data.checkinQuestions = _p.CHECKIN_QUESTIONS[data.conditionKey] || _p.CHECKIN_QUESTIONS.default;
    // Build SOAP notes HTML from the structured soap object
    data.notes = buildSoapNotes(data.soap, data.diagnoses);
    diagResult = data;
    startAnalysis(true); // true = skip the fake loading, result is already computed
  } catch (e) {
    console.error('Synthesis parse error', e, jsonStr);
    // Fall back to rule-based diagnosis on parse failure
    _p.runDiagnosis(answers).then(function(r) { diagResult = r; startAnalysis(true); });
  }
}

function buildSoapNotes(soap, diagnoses) {
  if (!soap) return '<p style="color:var(--muted)">Notes not available.</p>';
  var primaryDx = diagnoses && diagnoses[0] ? diagnoses[0].name : 'Pending';
  var ptId = _p.Session.id;
  var date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  function row(label, value) {
    return '<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<span style="min-width:130px;font-size:.75rem;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.04em;padding-top:1px">' + label + '</span>' +
      '<span style="font-size:.85rem;color:var(--text-2);flex:1;line-height:1.6">' + value + '</span>' +
    '</div>';
  }
  function shead(label) {
    return '<div style="margin:16px 0 8px;padding:6px 10px;background:var(--surface-2);border-radius:4px;border-left:3px solid var(--accent)">' +
      '<span style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)">' + label + '</span>' +
    '</div>';
  }

  return '<div style="font-family:var(--font)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid var(--border);margin-bottom:4px">' +
      '<div>' +
        '<div style="font-size:.8rem;font-weight:700;color:var(--text);margin-bottom:2px">CUE PRE-CONSULTATION NOTE</div>' +
        '<div style="font-size:.72rem;color:var(--subtle)">' + ptId + ' &nbsp;·&nbsp; ' + date + ' &nbsp;·&nbsp; AI-powered</div>' +
      '</div>' +
      '<span class="badge badge-teal" style="font-size:.65rem">Claude Clinical AI</span>' +
    '</div>' +
    shead('S — Subjective') + row('HPI', soap.subjective || '—') +
    shead('O — Objective')  + row('Findings', soap.objective  || 'Pending physical examination at consultation') +
    shead('A — Assessment') + row('Primary Dx', '<strong>' + primaryDx + '</strong>') +
      row('Reasoning', soap.assessment || '—') +
      '<div style="margin:8px 0;padding:8px 12px;background:#FEF9C3;border-radius:4px;font-size:.78rem;color:#713F12">⚠️ AI-generated draft. Must be confirmed by the attending physician before any treatment.</div>' +
    shead('P — Plan')       + row('Recommended', soap.plan || '—') +
    '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);font-size:.7rem;color:var(--subtle)">Generated by Claude Clinical AI (Dynamic OPQRST + VINDICATE reasoning)</div>' +
  '</div>';
}

function handleApiError(err) {
  var msg = err.message || 'Unknown error';
  if (msg === 'NO_API_KEY' || msg.includes('401')) {
    addAIBubble('I need an Anthropic API key to conduct the AI-powered interview. Please go back and enter your key, or continue with the standard questionnaire.', 'Error');
    localStorage.removeItem('cue_api_key');
  } else if (msg.includes('429')) {
    addAIBubble('The AI is a bit busy right now. Please wait a moment and try sending your response again.', 'Notice');
  } else {
    addAIBubble('There was a connection issue (' + msg + '). Your response was recorded — please try sending again.', 'Notice');
  }
  setInputEnabled(true);
}

function setInputEnabled(enabled) {
  var input   = document.getElementById('typeInput');
  var sendBtn = document.querySelector('.chat-input-bar .btn-primary');
  var recBtn  = document.getElementById('recordBtn');
  if (input)   input.disabled   = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled;
  if (recBtn)  recBtn.disabled  = !enabled;
}

function showTypingIndicator() {
  if (document.getElementById('typingIndicator')) return;
  var container = document.getElementById('chatContainer');
  var wrap = document.createElement('div');
  wrap.className = 'chat-row';
  wrap.id = 'typingIndicator';
  wrap.innerHTML = '<div class="avatar ai">🤖</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  container.appendChild(wrap);
  scrollChat();
}

function removeTypingIndicator() {
  var el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

// ── Static fallback interview (no API key) ────────────────────
function startStaticInterview() {
  _dynamicMode = false;
  var h = _p.getHealthHistory(_p.Session.id);
  QUESTIONS = buildTailoredQuestions(h);
  currentQ  = 0;
  answers   = [];
  addAIBubble(QUESTIONS[0].q, QUESTIONS[0].cat);
  updateProgress(0);
}

// ── Chat helpers ──────────────────────────────────────────────
function addAIBubble(text, category, quickReplies) {
  // Clear existing quick replies
  clearQuickReplies();

  var container = document.getElementById('chatContainer');

  // Show typing indicator first
  var typingWrap = document.createElement('div');
  typingWrap.className = 'chat-row';
  typingWrap.id = 'typingIndicator';
  typingWrap.innerHTML = '<div class="avatar ai">🩺</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  container.appendChild(typingWrap);
  scrollChat();

  setTimeout(function() {
    // Remove typing indicator
    var ti = document.getElementById('typingIndicator');
    if (ti) ti.remove();

    // Update category label
    if (category) {
      var catEl = document.getElementById('questionCategory');
      if (catEl) catEl.textContent = category;
    }

    // Add AI bubble
    var wrap = document.createElement('div');
    wrap.className = 'chat-row';
    wrap.innerHTML = '<div class="avatar ai">🩺</div><div><div class="bubble ai">' + escapeHtml(text) + '</div><div class="bubble-time">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div>';
    container.appendChild(wrap);
    scrollChat();

    // Render quick reply chips
    if (quickReplies && quickReplies.length) {
      renderQuickReplies(quickReplies);
    }

    // Auto-focus input
    setTimeout(function() {
      var inp = document.getElementById('typeInput');
      if (inp && !inp.disabled) inp.focus();
    }, 120);
  }, 600 + Math.random() * 200);
}

function addUserBubble(text) {
  clearQuickReplies();
  var container = document.getElementById('chatContainer');
  var wrap = document.createElement('div');
  wrap.className = 'chat-row user';
  wrap.innerHTML = '<div><div class="bubble user">' + escapeHtml(text) + '</div><div class="bubble-time" style="text-align:left">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div><div class="avatar user">👤</div>';
  container.appendChild(wrap);
  scrollChat();
}

function renderQuickReplies(replies) {
  var bar = document.getElementById('quickRepliesBar');
  if (!bar) return;
  var chips = replies.map(function(r) {
    var safe = r.replace(/'/g, '&#39;');
    return '<button class="quick-reply-chip" onclick="pickQuickReply(\'' + safe + '\')">' + r + '</button>';
  }).join('');
  bar.innerHTML = '<div class="quick-replies">' + chips + '</div>';
}

function clearQuickReplies() {
  var bar = document.getElementById('quickRepliesBar');
  if (bar) bar.innerHTML = '';
}

function pickQuickReply(text) {
  clearQuickReplies();
  var input = document.getElementById('typeInput');
  if (input) input.value = text;
  sendTyped();
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  document.getElementById('langBadge').style.display = 'none';
  if (_dynamicMode) {
    sendDynamicAnswer(text);
  } else {
    submitStaticAnswer(text);
  }
}

// Static interview answer handler
function submitStaticAnswer(text) {
  addUserBubble(text);
  answers.push({ question: QUESTIONS[currentQ].q, cat: QUESTIONS[currentQ].cat, text: text });
  currentQ++;
  updateProgress(Math.round(currentQ / QUESTIONS.length * 100));
  if (currentQ < QUESTIONS.length) {
    setTimeout(function() {
      document.getElementById('questionCategory').textContent = QUESTIONS[currentQ].cat;
      document.getElementById('questionCounter').textContent  = (currentQ + 1) + ' / ' + QUESTIONS.length;
      addAIBubble(QUESTIONS[currentQ].q, QUESTIONS[currentQ].cat);
    }, 400);
  } else {
    setTimeout(function() {
      addAIBubble('Thank you — I have everything I need. Analysing your responses now…', null);
      setTimeout(function() { startAnalysis(false); }, 1200);
    }, 400);
  }
}

function skipQuestion() {
  if (_dynamicMode) {
    sendDynamicAnswer('[Skipped]');
  } else {
    submitStaticAnswer('[Not answered]');
  }
}

function updateProgress(pct) {
  if (pct === undefined) pct = _dynamicMode ? 50 : Math.round(currentQ / (QUESTIONS.length || 9) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  if (!_dynamicMode) {
    document.getElementById('questionCounter').textContent = (currentQ + 1) + ' / ' + (QUESTIONS.length || 9);
  } else {
    document.getElementById('questionCounter').textContent = currentQ + ' answered';
  }
}

// ── Analysis ──────────────────────────────────────────────────
// preComputed=true skips the rule-based engine (synthesis already set diagResult)
async function startAnalysis(preComputed) {
  unlockSection(2);
  _p.Audit.log('analysis_start', _p.Session.id);
  var steps = ['astep1','astep2','astep3','astep4'];

  if (preComputed && diagResult) {
    // Fast-track: animate steps briefly then show result
    for (var i = 0; i < steps.length; i++) {
      await _p.sleep(520);
      document.getElementById(steps[i]).innerHTML = document.getElementById(steps[i]).innerHTML.replace('⏳','✅');
      if (i + 1 < steps.length) document.getElementById(steps[i+1]).style.opacity = '1';
    }
  } else {
    for (var i = 0; i < steps.length; i++) {
      await _p.sleep(900);
      document.getElementById(steps[i]).innerHTML = document.getElementById(steps[i]).innerHTML.replace('⏳','✅');
      if (i + 1 < steps.length) document.getElementById(steps[i+1]).style.opacity = '1';
    }
    diagResult = await _p.runDiagnosis(answers);
  }

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

