/* ============================================================
   Cue — Patient page logic  v12
   Home (sickness cards) → Thread timeline → Per-thread tracking
   Onboarding survey → Medical profile
   ============================================================ */

const _p = window.CUE;

// ── Global UI state ───────────────────────────────────────────
let selectedLang     = 'auto';
let isRecording      = false;
let recTimer         = null;
let _currentView     = 'grid';     // 'grid' | 'list'
let _currentFilter   = 'all';

// ── Active thread ─────────────────────────────────────────────
let _activeThread    = null;

// ── Onboarding draft ──────────────────────────────────────────
let _obStep          = 1;
const OB_TOTAL       = 7;
let _obDraft         = {
  ageGroup: '', sex: '', bloodType: '', ethnicity: '',
  familyHistory: { conditions: [], relations: {}, notes: '' },
  chronicConditions: [], surgeries: [],
  currentMedications: [], allergies: [],
  socialHistory: { smoking: 'never', alcohol: 'never', exercise: 'sedentary', diet: 'balanced', occupation: '' },
  vaccinations: [], recentTravels: [],
};

// ── HR edit state ─────────────────────────────────────────────
let _hrEditMode = false;
let _hrDraft    = null;

// ── Static questions ──────────────────────────────────────────
var QUESTIONS = [];

// ── Family history conditions list ───────────────────────────
const FH_CONDITIONS = [
  'Type 2 Diabetes','Heart Disease','High Blood Pressure','Stroke',
  'Breast Cancer','Colon Cancer','Prostate Cancer','Lung Cancer',
  'Depression / Anxiety','Schizophrenia','Alzheimer\'s / Dementia',
  'Asthma / Allergies','Autoimmune Disease','Kidney Disease',
  'Osteoporosis','Sickle Cell Disease','Haemophilia',
];
const FH_RELATIONS = ['Mother','Father','Sibling','Maternal Grandparent','Paternal Grandparent'];

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  _p.Session.init();
  var id = _p.Session.id;
  var fn = _p.Session.firstName;
  document.querySelectorAll('#sidebarId').forEach(function (el) { el.textContent = id; });
  document.querySelectorAll('#logPatientId').forEach(function (el) { el.textContent = id; });

  // Decide first screen
  var onboarded = localStorage.getItem('cue_onboarded');
  if (!onboarded) {
    navTo('onboarding');
  } else {
    navTo('home');
  }
});

function onLangChange() { selectedLang = document.getElementById('langSelect').value; }

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function navTo(screen) {
  ['sec-onboarding','sec-home','sec-thread','sec-profile'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var el = document.getElementById('sec-' + screen);
  if (el) el.style.display = '';

  // Sidebar pills
  document.querySelectorAll('.step-pill').forEach(function (p) { p.classList.remove('active'); });
  if (screen === 'home')    { var p = document.getElementById('pill-home');    if (p) p.classList.add('active'); }
  if (screen === 'profile') { var p = document.getElementById('pill-profile'); if (p) p.classList.add('active'); }

  if (screen === 'home')    renderHome();
  if (screen === 'profile') renderProfile();

  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
function renderOnboarding() {
  // Build family history conditions grid
  var grid = document.getElementById('fh-conditions-grid');
  if (grid && grid.children.length === 0) {
    grid.innerHTML = FH_CONDITIONS.map(function (c) {
      return '<label class="check-item" onclick="toggleFHCondition(this,\'' + c.replace(/'/g, '&#39;') + '\')">' +
        '<input type="checkbox" style="accent-color:var(--accent)">' +
        '<span>' + c + '</span>' +
      '</label>';
    }).join('');
  }
  // Build family relations rows
  var relDiv = document.getElementById('fh-relations');
  if (relDiv && relDiv.children.length === 0) {
    relDiv.innerHTML = FH_RELATIONS.map(function (r) {
      return '<div class="fh-row">' +
        '<span class="relation">' + r + '</span>' +
        '<input class="form-input" placeholder="e.g. Type 2 Diabetes, Heart Disease" ' +
          'id="fh-rel-' + r.replace(/\s+/g,'-').toLowerCase() + '" style="flex:1;height:32px;font-size:.82rem" />' +
      '</div>';
    }).join('');
  }
}

function toggleFHCondition(label, condition) {
  var cb = label.querySelector('input');
  if (!cb) return;
  label.classList.toggle('checked', cb.checked);
  var list = _obDraft.familyHistory.conditions;
  if (cb.checked) { if (!list.includes(condition)) list.push(condition); }
  else { var i = list.indexOf(condition); if (i >= 0) list.splice(i, 1); }
}

function obNext() {
  // Collect current step data
  collectObStep(_obStep);
  if (_obStep < OB_TOTAL) {
    _obStep++;
    showObStep(_obStep);
  }
}
function obBack() {
  if (_obStep > 1) { _obStep--; showObStep(_obStep); }
}

function showObStep(n) {
  document.querySelectorAll('.onboard-step').forEach(function (el) { el.classList.remove('active'); });
  var step = document.getElementById('ob-step-' + n);
  if (step) step.classList.add('active');
  document.getElementById('onboardStepLabel').textContent = 'Step ' + n + ' of ' + OB_TOTAL;
  document.getElementById('onboardProgress').style.width = ((n - 1) / (OB_TOTAL - 1) * 100) + '%';
  document.getElementById('onboardBackBtn').style.display = n > 1 ? '' : 'none';
  document.getElementById('onboardNextBtn').style.display = n < OB_TOTAL ? '' : 'none';
  document.getElementById('onboardNavRow').style.display = n === OB_TOTAL ? 'none' : '';

  if (n === 2) renderOnboarding();
}

function collectObStep(n) {
  if (n === 1) {
    _obDraft.ageGroup  = v('ob-ageGroup')  || '';
    _obDraft.sex       = v('ob-sex')       || '';
    _obDraft.bloodType = v('ob-bloodType') || 'Unknown';
    _obDraft.ethnicity = v('ob-ethnicity') || '';
  }
  if (n === 2) {
    FH_RELATIONS.forEach(function (r) {
      var input = document.getElementById('fh-rel-' + r.replace(/\s+/g,'-').toLowerCase());
      if (input && input.value.trim()) {
        _obDraft.familyHistory.relations[r] = input.value.trim();
      }
    });
    _obDraft.familyHistory.notes = v('ob-fhNotes') || '';
  }
  if (n === 5) {
    _obDraft.socialHistory.smoking    = v('ob-smoking') || 'never';
    _obDraft.socialHistory.alcohol    = v('ob-alcohol') || 'never';
    _obDraft.socialHistory.exercise   = v('ob-exercise') || 'sedentary';
    _obDraft.socialHistory.diet       = v('ob-diet') || 'balanced';
    _obDraft.socialHistory.occupation = v('ob-occupation') || '';
  }
}

function v(id) { var el = document.getElementById(id); return el ? el.value : ''; }

// ob list helpers
var _obSurgeries   = [];
var _obMeds        = [];
var _obAllergies   = [];
var _obVacc        = [];
var _obTravels     = [];

function obAddStr(field, inputId) {
  var el = document.getElementById(inputId);
  if (!el || !el.value.trim()) return;
  var val = el.value.trim();
  el.value = '';
  if (field === 'surgeries')   { _obSurgeries.push(val);  renderObSurgeries(); }
  if (field === 'allergies')   { _obAllergies.push(val);  renderObAllergies(); }
  if (field === 'vaccinations'){ _obVacc.push(val);       renderObVacc(); }
}
function obAddCondition() {
  var label = v('ob-condLabel').trim();
  if (!label) return;
  _obDraft.chronicConditions.push({ label: label, icd: v('ob-condIcd').trim() || 'N/A', since: v('ob-condSince').trim() || new Date().getFullYear().toString(), status: v('ob-condStatus') || 'ongoing' });
  ['ob-condLabel','ob-condIcd','ob-condSince'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value=''; });
  renderObConditions();
}
function obAddMed() {
  var name = v('ob-medName').trim();
  if (!name) return;
  _obMeds.push({ name: name, dose: v('ob-medDose').trim() || 'As directed', type: v('ob-medType') || 'maintenance' });
  ['ob-medName','ob-medDose'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value=''; });
  renderObMeds();
}
function obAddTravel() {
  var dest = v('ob-travelDest').trim();
  if (!dest) return;
  _obTravels.push({ destination: dest, date: v('ob-travelDate').trim() || 'Date not specified', duration: v('ob-travelDur').trim() || 'Duration not specified', purpose: 'Holiday' });
  ['ob-travelDest','ob-travelDate','ob-travelDur'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value=''; });
  renderObTravels();
}
function renderObSurgeries() {
  var el = document.getElementById('ob-surgList');
  if (!el) return;
  el.innerHTML = _obSurgeries.map(function(s,i){ return '<div class="hr-structured-item"><span class="text-sm">🔪 '+s+'</span><button class="hr-remove" onclick="_obSurgeries.splice('+i+',1);renderObSurgeries()">×</button></div>'; }).join('');
}
function renderObConditions() {
  var el = document.getElementById('ob-condList');
  if (!el) return;
  el.innerHTML = _obDraft.chronicConditions.map(function(c,i){
    return '<div class="hr-structured-item"><div><div class="text-sm font-600">'+c.label+'</div><div class="text-xs font-mono" style="color:var(--muted)">'+c.icd+' · since '+c.since+'</div></div>' +
    '<div class="flex items-center gap-6"><span class="badge badge-amber">'+c.status+'</span><button class="hr-remove" onclick="_obDraft.chronicConditions.splice('+i+',1);renderObConditions()">×</button></div></div>';
  }).join('');
}
function renderObMeds() {
  var el = document.getElementById('ob-medList');
  if (!el) return;
  el.innerHTML = _obMeds.map(function(m,i){
    return '<div class="hr-structured-item"><div><div class="text-sm font-600">💊 '+m.name+'</div><div class="text-xs" style="color:var(--muted)">'+m.dose+'</div></div>' +
    '<div class="flex items-center gap-6"><span class="badge badge-blue">'+m.type+'</span><button class="hr-remove" onclick="_obMeds.splice('+i+',1);renderObMeds()">×</button></div></div>';
  }).join('');
}
function renderObAllergies() {
  var el = document.getElementById('ob-allergyChips');
  if (!el) return;
  el.innerHTML = _obAllergies.length ? _obAllergies.map(function(a,i){
    return '<span class="hr-chip-item danger">⚠️ '+a+'<button class="hr-remove" onclick="_obAllergies.splice('+i+',1);renderObAllergies()">×</button></span>';
  }).join('') : '<span style="font-size:.82rem;color:var(--muted)">None added yet.</span>';
}
function renderObVacc() {
  var el = document.getElementById('ob-vaccChips');
  if (!el) return;
  el.innerHTML = _obVacc.length ? _obVacc.map(function(v,i){
    return '<span class="hr-chip-item accent">✓ '+v+'<button class="hr-remove" onclick="_obVacc.splice('+i+',1);renderObVacc()">×</button></span>';
  }).join('') : '<span style="font-size:.82rem;color:var(--muted)">No vaccinations added yet.</span>';
}
function renderObTravels() {
  var el = document.getElementById('ob-travelList');
  if (!el) return;
  el.innerHTML = _obTravels.map(function(t,i){
    return '<div class="hr-travel-card" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><span>✈️</span><div><div class="text-sm font-600">'+t.destination+'</div><div class="text-xs" style="color:var(--muted)">'+t.date+' · '+t.duration+'</div></div></div><button class="hr-remove" onclick="_obTravels.splice('+i+',1);renderObTravels()">×</button></div>';
  }).join('');
}

function skipOnboarding() {
  localStorage.setItem('cue_onboarded', 'true');
  navTo('home');
}

function finishOnboarding() {
  // Collect final step
  collectObStep(_obStep);

  // Build health record from draft
  var ptId = _p.Session.id;
  var h = _p.getHealthHistory(ptId);

  if (_obDraft.ageGroup)  h.ageGroup  = _obDraft.ageGroup;
  if (_obDraft.bloodType) h.bloodType = _obDraft.bloodType;
  if (_obDraft.sex)       h.sex       = _obDraft.sex;
  if (_obDraft.ethnicity) h.ethnicity = _obDraft.ethnicity;

  h.familyHistory       = _obDraft.familyHistory;
  h.socialHistory       = _obDraft.socialHistory;
  h.surgeries           = _obSurgeries;

  if (_obDraft.chronicConditions.length)  h.chronicConditions  = _obDraft.chronicConditions;
  if (_obMeds.length)                     h.currentMedications = _obMeds;
  if (_obAllergies.length)                h.allergies          = _obAllergies;
  if (_obVacc.length)                     h.vaccinations       = _obVacc;
  if (_obTravels.length)                  h.recentTravels      = _obTravels;

  _p.persistHealthEdit(ptId, h);
  localStorage.setItem('cue_onboarded', 'true');
  navTo('home');
  showToast('✓ Profile saved');
}

// ═══════════════════════════════════════════════════════════════
// HOME — SICKNESS CARDS
// ═══════════════════════════════════════════════════════════════
function renderHome() {
  var fn = _p.Session.firstName;
  var greeting = document.getElementById('homeGreeting');
  if (greeting) greeting.textContent = fn ? 'Hello, ' + fn : 'My Health';

  var allList      = getConsultations(_p.Session.id);
  // Submitted = sent to doctor; these appear as cards
  var submitted    = allList.filter(isSubmitted);
  // Unfinished = interview not yet sent; shown as a resumable draft banner
  var draft        = allList.find(function(t) { return !isSubmitted(t); });

  updateBadge(submitted.length);
  renderDraftBanner(draft);
  renderSicknessCards(submitted, _currentFilter, _currentView);
}

// A consultation only appears in the list once the patient has sent it to the doctor
function isSubmitted(t) {
  return !!t.submittedAt;
}

function renderDraftBanner(draft) {
  var container = document.getElementById('sicknessContainer');
  // Remove existing banner if any
  var existing = document.getElementById('draftBanner');
  if (existing) existing.remove();

  if (!draft) return;
  var banner = document.createElement('div');
  banner.id = 'draftBanner';
  banner.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--accent-bg);border:1.5px solid var(--accent-mid);border-radius:var(--r);margin-bottom:14px;cursor:pointer;';
  banner.onclick = function() { openThread(draft.id); };
  banner.innerHTML =
    '<span style="font-size:1.2rem">📝</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:.875rem;font-weight:600;color:var(--accent-h)">You have an unfinished interview</div>' +
      '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px">' + escapeHtml(draft.title || 'New consultation') + ' — tap to continue</div>' +
    '</div>' +
    '<button onclick="event.stopPropagation();discardDraft(\'' + draft.id + '\')" style="background:none;border:none;cursor:pointer;font-size:.75rem;color:var(--muted);padding:4px 6px;border-radius:4px;flex-shrink:0" title="Discard">✕ Discard</button>' +
    '<span style="color:var(--accent-h);font-size:1rem;flex-shrink:0">›</span>';
  if (container) container.insertAdjacentElement('beforebegin', banner);
}

function discardDraft(id) {
  if (!confirm('Discard this unfinished interview?')) return;
  var ptId = _p.Session.id;
  var list = getConsultations(ptId).filter(function(t) { return t.id !== id; });
  saveConsultations(ptId, list);
  if (_activeThread && _activeThread.id === id) _activeThread = null;
  renderHome();
  showToast('Interview discarded');
}

function renderSicknessCards(list, filter, view) {
  var container = document.getElementById('sicknessContainer');
  if (!container) return;

  var filtered = filter === 'all'
    ? list
    : list.filter(function(t) { return t.status === filter || (filter === 'ongoing' && t.status === 'pending'); });

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div style="font-size:3rem;margin-bottom:14px">' + (list.length === 0 ? '💊' : '🔍') + '</div>' +
        '<h3 style="margin-bottom:8px">' + (list.length === 0 ? 'No consultations yet' : 'No items match this filter') + '</h3>' +
        '<p class="text-sm mb-20" style="color:var(--muted)">' + (list.length === 0 ? 'Start a new consultation to document a health concern. It will appear here once you\'ve sent it to your doctor.' : 'Try selecting a different filter.') + '</p>' +
        (list.length === 0 ? '<button class="btn btn-primary" onclick="createNewConsultation()">+ New Consultation</button>' : '') +
      '</div>';
    return;
  }

  var wrapClass = view === 'list' ? 'sickness-card-list' : 'sickness-grid';
  container.innerHTML = '<div class="' + wrapClass + '">' + filtered.map(function(t) {
    return buildSicknessCard(t);
  }).join('') + '</div>';
}

function buildSicknessCard(t) {
  var statusLabel = { new:'New', pending:'Pending review', ongoing:'Ongoing', archived:'Archived' }[t.status] || 'New';
  var statusCls   = { new:'badge-teal', pending:'badge-amber', ongoing:'badge-green', archived:'badge-gray' }[t.status] || 'badge-gray';
  var icon        = { new:'🩺', pending:'🔍', ongoing:'📈', archived:'✅' }[t.status] || '🩺';
  var date        = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  var checkins    = (t.checkins || []).length;
  var lastSev     = checkins ? t.checkins[t.checkins.length - 1].severity : null;
  var sevColor    = lastSev !== null ? (lastSev >= 7 ? '#EF4444' : lastSev >= 4 ? '#F59E0B' : '#10B981') : 'var(--border-2)';
  var subtitle    = t.status === 'archived' && t.resolvedReason
    ? t.resolvedReason
    : t.diagResult && t.doctorReview && t.doctorReview.confirmed
      ? t.diagResult.diagnoses[0].name
      : t.diagResult
        ? 'AI summary ready — awaiting doctor'
        : 'Sent to doctor — awaiting review';

  // "Feeling better" button shown on new, pending, and ongoing threads
  var canResolve = t.status === 'new' || t.status === 'pending' || t.status === 'ongoing';
  var resolveBtn = canResolve
    ? '<button onclick="event.stopPropagation();markHealthy(\'' + t.id + '\')" ' +
        'style="display:flex;align-items:center;gap:4px;background:none;border:1.5px solid #BBF7D0;' +
        'color:#15803D;border-radius:var(--r-full);padding:3px 10px;font-size:.72rem;font-weight:600;' +
        'cursor:pointer;font-family:var(--font);white-space:nowrap;transition:background .12s;" ' +
        'onmouseover="this.style.background=\'#F0FDF4\'" onmouseout="this.style.background=\'none\'" ' +
        'title="Mark as resolved — feeling better">✓ Feeling better</button>'
    : '';

  return '<div class="sickness-card status-' + t.status + '" onclick="openThread(\'' + t.id + '\')">' +
    '<div class="flex items-center justify-between mb-8">' +
      '<div class="flex items-center gap-8" style="min-width:0">' +
        '<span style="font-size:1.3rem;flex-shrink:0">' + icon + '</span>' +
        '<span style="font-size:.875rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(t.title || 'Consultation') + '</span>' +
      '</div>' +
      '<span class="badge ' + statusCls + '" style="flex-shrink:0;margin-left:8px">' + statusLabel + '</span>' +
    '</div>' +
    '<p style="font-size:.8rem;color:var(--text-2);margin-bottom:10px">' + escapeHtml(subtitle) + '</p>' +
    '<div class="flex items-center justify-between">' +
      '<span style="font-size:.72rem;color:var(--muted)">' + date + (checkins ? ' · ' + checkins + ' check-in' + (checkins !== 1 ? 's' : '') : '') + '</span>' +
      resolveBtn +
    '</div>' +
    (lastSev !== null ? '<div class="severity-bar-mini"><div class="severity-bar-mini-fill" style="width:' + (lastSev * 10) + '%;background:' + sevColor + '"></div></div>' : '') +
  '</div>';
}

function markHealthy(id) {
  var ptId = _p.Session.id;
  var list = getConsultations(ptId);
  var t    = list.find(function(c) { return c.id === id; });
  if (!t) return;
  t.status     = 'archived';
  t.resolvedAt = new Date().toISOString();
  t.resolvedReason = 'Patient marked as feeling better';
  saveConsultations(ptId, list);
  _p.Audit.log('thread_resolved_by_patient', ptId, { id: id });
  renderHome();
  showToast('✓ Marked as resolved — glad you\'re feeling better!');
}

function filterSickness(filter, btn) {
  _currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var list = getConsultations(_p.Session.id);
  renderSicknessCards(list, filter, _currentView);
}

function setView(view) {
  _currentView = view;
  document.getElementById('viewGrid').classList.toggle('active', view === 'grid');
  document.getElementById('viewList').classList.toggle('active', view === 'list');
  var list = getConsultations(_p.Session.id);
  renderSicknessCards(list, _currentFilter, view);
}

function updateBadge(count) {
  var badge = document.getElementById('consultBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// CONSULTATIONS — DATA
// ═══════════════════════════════════════════════════════════════
function generateThreadId() { return 'PC-' + Math.floor(10000 + Math.random() * 90000); }

function getConsultations(ptId) {
  var stored = _p.Store.get(ptId);
  var list   = stored.consultations || [];
  // Migrate legacy single consultation
  if (!list.length && stored.consultation && stored.consultation.diagnosis) {
    list = [{
      id: 'PC-00001', title: stored.consultation.diagnosis.diagnoses[0].name || 'Consultation',
      status: 'ongoing', phase: 'tracking', createdAt: stored.consultation.submittedAt || new Date().toISOString(),
      answers: stored.consultation.answers || [], clinicalMsgs: [], dynamicMode: false, currentQ: 0,
      diagResult: stored.consultation.diagnosis, doctorReview: { confirmed: true, notes: '', confirmedAt: new Date().toISOString() },
      trackingEnabled: true, submittedAt: stored.consultation.submittedAt || null,
      checkins: stored.checkins || [],
    }];
    _p.Store.save(ptId, 'consultations', list);
  }
  return list;
}

function saveConsultations(ptId, list) { _p.Store.save(ptId, 'consultations', list); }

function saveActiveThread() {
  if (!_activeThread) return;
  var ptId = _p.Session.id;
  var list = getConsultations(ptId);
  var idx  = list.findIndex(function (c) { return c.id === _activeThread.id; });
  if (idx >= 0) list[idx] = _activeThread;
  else          list.unshift(_activeThread);
  saveConsultations(ptId, list);
}

function createNewConsultation() {
  // If a draft (unsubmitted interview) already exists, resume it rather than create a second
  var existing = getConsultations(_p.Session.id).find(function(t) { return !isSubmitted(t); });
  if (existing) {
    openThread(existing.id);
    return;
  }
  _activeThread = {
    id: generateThreadId(), title: 'New Consultation',
    status: 'new', phase: 'consent', createdAt: new Date().toISOString(),
    answers: [], clinicalMsgs: [], dynamicMode: false, currentQ: 0,
    diagResult: null,
    doctorReview: { confirmed: false, notes: '', confirmedAt: null },
    trackingEnabled: false, submittedAt: null, checkins: [],
  };
  saveActiveThread();
  openThread(_activeThread.id);
}

// ═══════════════════════════════════════════════════════════════
// THREAD DETAIL
// ═══════════════════════════════════════════════════════════════
function openThread(id) {
  var list = getConsultations(_p.Session.id);
  var t    = list.find(function (c) { return c.id === id; });
  if (!t) return;
  _activeThread = t;
  renderThreadView();
  navToThread();
}

function navToThread() {
  ['sec-onboarding','sec-home','sec-profile'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  document.getElementById('sec-thread').style.display = '';
  document.querySelectorAll('.step-pill').forEach(function (p) { p.classList.remove('active'); });
  window.scrollTo(0, 0);
}

function backToHome() {
  _activeThread = null;
  navTo('home');
}

function renderThreadView() {
  if (!_activeThread) return;
  var t = _activeThread;
  var statusLabel = { new:'New', pending:'Awaiting review', ongoing:'Ongoing', archived:'Archived' }[t.status] || 'New';
  var statusCls   = { new:'badge-teal', pending:'badge-amber', ongoing:'badge-green', archived:'badge-gray' }[t.status] || 'badge-gray';
  var date        = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  var checkins    = (t.checkins||[]).length;

  setText('threadTitle', t.title || 'Consultation');
  var badgeEl = document.getElementById('threadStatusBadge');
  if (badgeEl) { badgeEl.textContent = statusLabel; badgeEl.className = 'badge ' + statusCls; }
  var metaEl = document.getElementById('threadMeta');
  if (metaEl) metaEl.textContent = date + (checkins ? ' · ' + checkins + ' check-in' + (checkins!==1?'s':'') : '');

  var actionsEl = document.getElementById('threadActions');
  if (actionsEl) {
    actionsEl.innerHTML = t.status !== 'archived'
      ? '<button class="btn btn-ghost btn-sm" onclick="archiveThread()" style="color:var(--muted)">Archive</button>'
      : '<button class="btn btn-ghost btn-sm" onclick="unarchiveThread()">Reopen</button>';
  }

  buildThreadStages();
}

function buildThreadStages() {
  var t = document.getElementById('threadStages');
  if (!t || !_activeThread) return;
  t.innerHTML = '';

  var th = _activeThread;
  var phase = th.phase || 'consent';
  var submitted = !!th.submittedAt;
  var confirmed = th.doctorReview && th.doctorReview.confirmed;

  // STAGE 1 — Pre-Consultation
  var s1done   = phase !== 'consent' && phase !== 'chat' && phase !== 'analysis';
  var s1active = phase === 'consent' || phase === 'chat' || phase === 'analysis';
  appendStage(t, {
    id: 'stage-preconsult',
    dot: s1done ? 'done' : s1active ? 'active' : 'locked',
    label: 'Pre-Consultation',
    labelClass: '',
    date: s1done ? fmtDate(th.createdAt) : '',
    body: buildPreconsultBody(phase, s1done),
  });

  // STAGE 2 — Doctor Review (hidden diagnosis)
  var s2done   = confirmed;
  var s2active = submitted && !confirmed;
  var s2locked = !submitted;
  appendStage(t, {
    id: 'stage-doctor',
    dot: s2done ? 'done' : s2active ? 'pending' : 'locked',
    label: 'Doctor Review',
    labelClass: s2locked ? 'locked' : '',
    date: s2done ? fmtDate(th.doctorReview.confirmedAt) : '',
    body: buildDoctorBody(s2locked, s2active, s2done),
  });

  // STAGE 3 — Treatment Plan
  var s3done   = confirmed && (phase === 'treatment' || phase === 'tracking');
  var s3active = confirmed && phase === 'treatment';
  var s3locked = !confirmed;
  appendStage(t, {
    id: 'stage-treatment',
    dot: s3done ? 'done' : s3active ? 'active' : 'locked',
    label: 'Treatment Plan',
    labelClass: s3locked ? 'locked' : '',
    date: '',
    body: buildTreatmentBody(s3locked, confirmed),
  });

  // STAGE 4 — Symptom Tracking
  var s4active = phase === 'tracking';
  var s4locked = !confirmed;
  appendStage(t, {
    id: 'stage-tracking',
    dot: s4active ? 'active' : s4locked ? 'locked' : 'done',
    label: 'Symptom Tracking',
    labelClass: s4locked ? 'locked' : '',
    date: '',
    body: buildTrackingBody(s4locked),
    last: true,
  });
}

function appendStage(container, opts) {
  var wrap = document.createElement('div');
  wrap.className = 'stage-wrap';
  if (opts.last) wrap.style.paddingBottom = '0';
  wrap.id = opts.id;
  wrap.innerHTML =
    '<div class="stage-dot ' + opts.dot + '">' +
      (opts.dot === 'done' ? '✓' : opts.dot === 'active' ? '●' : '') +
    '</div>' +
    '<div class="stage-header">' +
      '<span class="stage-label ' + (opts.labelClass||'') + '">' + opts.label + '</span>' +
      (opts.date ? '<span class="stage-date">' + opts.date + '</span>' : '') +
    '</div>' +
    '<div class="stage-body">' + opts.body + '</div>';
  container.appendChild(wrap);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}

// ── Stage body builders ───────────────────────────────────────
function buildPreconsultBody(phase, done) {
  if (done) {
    var t = _activeThread;
    var summary = t.diagResult
      ? 'AI summary generated · ' + (t.answers.length || (t.clinicalMsgs.length > 1 ? 'Dynamic interview' : '')) + ' questions answered'
      : (t.answers.length ? t.answers.length + ' questions answered' : 'Completed');
    return '<div class="stage-collapsed" onclick="expandPreconsult()">' +
      '🩺 ' + summary + ' <span style="float:right;color:var(--accent-h)">Review ↓</span>' +
    '</div>' +
    '<div id="preconsult-expanded" style="display:none;margin-top:10px">' + buildPreconsultExpanded() + '</div>';
  }
  if (phase === 'consent') {
    var tpl = document.getElementById('tpl-consent');
    var clone = tpl ? tpl.content.cloneNode(true) : null;
    var div = document.createElement('div');
    if (clone) div.appendChild(clone);
    // Restore API key status
    var statusEl = div.querySelector('.api-key-status');
    var key = localStorage.getItem('cue_api_key') || '';
    if (statusEl) {
      statusEl.textContent = key.startsWith('sk-ant') ? '● AI interview enabled' : '● Standard questionnaire';
      statusEl.className = 'badge ' + (key.startsWith('sk-ant') ? 'badge-teal' : 'badge-gray') + ' api-key-status';
    }
    var keyInput = div.querySelector('.api-key-input');
    if (keyInput) keyInput.addEventListener('input', function() { onApiKeyInputEl(this); });
    return div.innerHTML;
  }
  if (phase === 'chat' || phase === 'analysis') {
    var tpl2 = document.getElementById('tpl-chat');
    return tpl2 ? tpl2.innerHTML : '';
  }
  return '';
}

function buildPreconsultExpanded() {
  if (!_activeThread || !_activeThread.diagResult) return '<p class="text-sm" style="color:var(--muted)">No summary available.</p>';
  var dr = _activeThread.diagResult;
  return '<div class="card" style="font-size:.82rem">' +
    '<div class="hr-section-label" style="margin-bottom:8px">Symptoms reported</div>' +
    dr.symptoms.map(function(s){
      return '<div class="info-row"><span class="info-label">' + s.label + '</span><span class="info-val">' + s.duration + '</span></div>';
    }).join('') +
    '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">' +
      '<div class="hr-section-label" style="margin-bottom:6px">Your words</div>' +
      (_activeThread.answers.slice(0,2).map(function(a){
        return '<p style="color:var(--text-2);margin-bottom:4px">• ' + escapeHtml(a.text) + '</p>';
      }).join('')) +
    '</div>' +
  '</div>';
}

function expandPreconsult() {
  var el = document.getElementById('preconsult-expanded');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

function buildDoctorBody(locked, active, done) {
  if (locked) return '<div class="stage-locked-body">🔒 Awaiting your pre-consultation</div>';
  if (active) {
    var tpl = document.getElementById('tpl-doctor-review');
    return tpl ? tpl.innerHTML : '';
  }
  if (done) {
    var dr = _activeThread.doctorReview;
    return '<div class="card">' +
      '<div class="flex items-center gap-8 mb-10"><span class="badge badge-green">✓ Confirmed</span>' +
        '<span class="text-xs" style="color:var(--muted)">' + fmtDate(dr.confirmedAt) + '</span>' +
      '</div>' +
      '<div class="info-row"><span class="info-label">Diagnosis</span><span class="info-val font-600">' +
        (_activeThread.diagResult ? _activeThread.diagResult.diagnoses[0].name : '—') + '</span></div>' +
      (dr.notes ? '<div class="info-row"><span class="info-label">Doctor\'s notes</span><span class="info-val text-sm">' + escapeHtml(dr.notes) + '</span></div>' : '') +
    '</div>';
  }
  return '';
}

function buildTreatmentBody(locked, confirmed) {
  if (locked) return '<div class="stage-locked-body">🔒 Awaiting doctor confirmation</div>';
  if (!_activeThread || !_activeThread.diagResult) return '';
  var tpl = document.getElementById('tpl-treatment');
  var html = tpl ? tpl.innerHTML : '';
  // Will be populated by renderTreatmentContent after DOM insertion
  setTimeout(renderTreatmentContent, 50);
  return html;
}

function buildTrackingBody(locked) {
  if (locked) return '<div class="stage-locked-body">🔒 Available after doctor confirms</div>';
  var tpl = document.getElementById('tpl-tracking');
  var html = tpl ? tpl.innerHTML : '';
  setTimeout(function() { renderTrackingContent(); renderChart(); }, 100);
  return html;
}

// ── Post-render content populators ────────────────────────────
function renderTreatmentContent() {
  if (!_activeThread || !_activeThread.diagResult) return;
  var dx = _activeThread.diagResult.diagnoses[0];
  var wrap = document.querySelector('#stage-treatment .treatment-content');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="info-row"><span class="info-label">Confirmed Dx</span><span class="info-val font-600">' + dx.name + '</span></div>' +
    '<div class="info-row"><span class="info-label">ICD-10</span><span class="info-val font-mono text-xs">' + dx.icd + '</span></div>' +
    '<div class="info-row"><span class="info-label">Medication</span><span class="info-val">As prescribed by your physician — follow dosage instructions.</span></div>' +
    '<div class="info-row"><span class="info-label">Monitoring</span><span class="info-val">Log symptoms every other day via the tracker below.</span></div>' +
    '<div class="info-row"><span class="info-label">Next call</span><span class="info-val">' + _p.formatDate(Date.now() + 1000*60*60*48) + '</span></div>';
}

function renderTrackingContent() {
  if (!_activeThread) return;
  var checkins = _activeThread.checkins || [];
  var daysEl   = document.querySelector('#stage-tracking .track-days');
  var sevEl    = document.querySelector('#stage-tracking .track-avg-sev');
  var trendEl  = document.querySelector('#stage-tracking .track-trend');
  var nextEl   = document.getElementById('trakNext');

  if (daysEl) daysEl.textContent = checkins.length;
  if (sevEl) {
    if (!checkins.length) { sevEl.textContent = '—'; }
    else {
      var avg = checkins.reduce(function(s,c){return s+(c.severity||0);},0)/checkins.length;
      sevEl.textContent = avg.toFixed(1);
    }
  }
  if (trendEl && checkins.length >= 2) {
    var d = checkins[checkins.length-1].severity - checkins[0].severity;
    trendEl.textContent = d < 0 ? '↓ Improving' : d > 0 ? '↑ Worsening' : '→ Stable';
  }
  if (nextEl) {
    if (!checkins.length) { nextEl.textContent = 'Now'; }
    else {
      var ms = Date.now() - new Date(checkins[checkins.length-1].date).getTime();
      var left = 1000*60*60*48 - ms;
      nextEl.textContent = left <= 0 ? 'Due now' : Math.floor(left/3600000) + 'h';
    }
  }
  renderTimeline();
}

function renderTimeline(filter) {
  filter = filter || 'all';
  if (!_activeThread) return;
  var checkins = _activeThread.checkins || [];
  var list = filter === 'outlier'   ? checkins.filter(function(c){return c.severity>=7;})
           : filter === 'improving' ? checkins.filter(function(c){return c.severity<7;})
           : checkins;

  var el = document.querySelector('#stage-tracking .tracking-timeline');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.82rem">No entries yet — tap <strong>+ Log now</strong> to start.</div>';
    return;
  }
  el.innerHTML = list.slice().reverse().map(function(c) {
    var sev = c.severity || 0;
    var dateStr = c.date ? new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + ' ' + new Date(c.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
    return '<div class="tl-item">' +
      '<div class="tl-dot"></div>' +
      '<div class="tl-date">' + dateStr + '</div>' +
      '<div class="tl-card">' +
        '<div class="flex items-center gap-8 mb-6">' +
          '<span class="badge ' + (sev>=7?'badge-red':sev>=4?'badge-amber':'badge-green') + '">Severity ' + sev + '/10</span>' +
          (sev>=7 ? '<span class="badge badge-red">⚠️ High</span>' : '') +
        '</div>' +
        (c.symptoms&&c.symptoms.length ? '<div class="flex gap-4 flex-wrap mb-4">' + c.symptoms.map(function(s){return '<span class="badge badge-gray">'+s+'</span>';}).join('') + '</div>' : '') +
        (c.notes ? '<p class="text-sm" style="color:var(--text-2)">' + escapeHtml(c.notes) + '</p>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function renderChart() {
  var canvas = document.querySelector('#stage-tracking .severity-chart');
  if (!canvas || !_activeThread) return;
  var checkins = _activeThread.checkins || [];
  var ctx = canvas.getContext('2d');
  var W = canvas.offsetWidth || 560; canvas.width = W; canvas.height = 150;
  ctx.clearRect(0,0,W,150);

  if (!checkins.length) {
    ctx.fillStyle = '#9CA3AF'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No data yet', W/2, 75); return;
  }

  var pad = {t:10,r:16,b:28,l:30};
  var cw = W-pad.l-pad.r, ch = 150-pad.t-pad.b;
  var data = checkins.map(function(c){return c.severity||0;});
  var n = data.length;

  // threshold line
  ctx.setLineDash([4,3]); ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 1;
  var ty = pad.t + ch - (7/10)*ch;
  ctx.beginPath(); ctx.moveTo(pad.l,ty); ctx.lineTo(pad.l+cw,ty); ctx.stroke();
  ctx.setLineDash([]);

  // area fill
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t+ch-(data[0]/10)*ch);
  data.forEach(function(v,i){ ctx.lineTo(pad.l+(n===1?cw/2:(i/(n-1))*cw), pad.t+ch-(v/10)*ch); });
  ctx.lineTo(pad.l+cw, pad.t+ch); ctx.lineTo(pad.l, pad.t+ch); ctx.closePath();
  ctx.fillStyle = 'rgba(13,148,136,.07)'; ctx.fill();

  // line
  ctx.beginPath(); ctx.strokeStyle = '#0D9488'; ctx.lineWidth = 2;
  data.forEach(function(v,i){ var x=pad.l+(n===1?cw/2:(i/(n-1))*cw),y=pad.t+ch-(v/10)*ch; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.stroke();

  // dots
  data.forEach(function(v,i){
    var x=pad.l+(n===1?cw/2:(i/(n-1))*cw), y=pad.t+ch-(v/10)*ch;
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle = v>=7?'#EF4444':'#0D9488'; ctx.fill();
    ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke();
  });

  // x labels
  ctx.fillStyle='#9CA3AF'; ctx.font='10px sans-serif'; ctx.textAlign='center';
  data.forEach(function(_,i){
    if (n<=6 || i%Math.ceil(n/6)===0) {
      var x=pad.l+(n===1?cw/2:(i/(n-1))*cw);
      var lbl = checkins[i].date ? new Date(checkins[i].date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : ('D'+(i+1));
      ctx.fillText(lbl, x, 150-4);
    }
  });
}

function archiveThread() {
  if (!_activeThread) return;
  _activeThread.status = 'archived'; saveActiveThread();
  renderThreadView(); showToast('Archived');
}
function unarchiveThread() {
  if (!_activeThread) return;
  _activeThread.status = _activeThread.diagResult ? 'ongoing' : 'new'; saveActiveThread();
  renderThreadView(); showToast('Reopened');
}

// ── Doctor simulation (demo) ──────────────────────────────────
function simulateDoctorConfirm() {
  if (!_activeThread || !_activeThread.diagResult) return;
  _activeThread.doctorReview = {
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    notes: 'Reviewed the AI summary. Diagnosis appears consistent with the reported symptoms. Prescribing treatment as outlined. Follow-up in two weeks.',
  };
  _activeThread.status = 'ongoing';
  _activeThread.phase  = 'treatment';
  saveActiveThread();
  renderThreadView();
  showToast('✓ Doctor has confirmed your diagnosis');
}

// ═══════════════════════════════════════════════════════════════
// PRE-CONSULTATION CHAT
// ═══════════════════════════════════════════════════════════════
function proceedFromConsent(btn) {
  var stage = btn ? btn.closest('.stage-body') : document.querySelector('#stage-preconsult .stage-body');
  if (!stage) return;

  var c1 = stage.querySelector('.consent-check-1');
  var c2 = stage.querySelector('.consent-check-2');
  if (!c1 || !c2 || !c1.checked || !c2.checked) {
    alert('Please agree to both consent statements to continue.'); return;
  }

  var keyInput = stage.querySelector('.api-key-input');
  if (keyInput && keyInput.value.trim().startsWith('sk-ant')) {
    localStorage.setItem('cue_api_key', keyInput.value.trim());
  }
  _p.Audit.log('consent_given', _p.Session.id);

  // Replace consent body with chat UI
  var tpl = document.getElementById('tpl-chat');
  if (tpl) {
    stage.innerHTML = tpl.innerHTML;
    // Fix up dot
    var dot = document.querySelector('#stage-preconsult .stage-dot');
    if (dot) { dot.className = 'stage-dot active'; dot.textContent = '●'; }
  }

  _activeThread.phase = 'chat';
  saveActiveThread();

  var hasKey = !!localStorage.getItem('cue_api_key');
  if (hasKey) startDynamicInterview(); else startStaticInterview();
}

// ── Chat helpers ──────────────────────────────────────────────
function getChatContainer()   { return document.querySelector('.chat-container'); }
function getQuickRepliesBar() { return document.querySelector('.quick-replies-bar'); }

function addAIBubble(text, category, quickReplies) {
  clearQuickReplies();
  var container = getChatContainer(); if (!container) return;

  var typingWrap = document.createElement('div');
  typingWrap.className = 'chat-row'; typingWrap.id = 'typingIndicator';
  typingWrap.innerHTML = '<div class="avatar ai">🩺</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  container.appendChild(typingWrap); scrollChat();

  setTimeout(function() {
    var ti = document.getElementById('typingIndicator'); if (ti) ti.remove();
    if (category) { var ce = document.querySelector('.question-category'); if (ce) ce.textContent = category; }
    var wrap = document.createElement('div');
    wrap.className = 'chat-row';
    wrap.innerHTML = '<div class="avatar ai">🩺</div><div><div class="bubble ai">' + escapeHtml(text) + '</div><div class="bubble-time">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div>';
    container.appendChild(wrap); scrollChat();
    if (quickReplies && quickReplies.length) renderQuickReplies(quickReplies);
    setTimeout(function(){ var inp = document.querySelector('.chat-type-input'); if (inp && !inp.disabled) inp.focus(); }, 120);
  }, 600 + Math.random()*200);
}

function addUserBubble(text) {
  clearQuickReplies();
  var container = getChatContainer(); if (!container) return;
  var wrap = document.createElement('div');
  wrap.className = 'chat-row user';
  wrap.innerHTML = '<div><div class="bubble user">' + escapeHtml(text) + '</div><div class="bubble-time" style="text-align:left">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div></div><div class="avatar user">👤</div>';
  container.appendChild(wrap); scrollChat();
}

function renderQuickReplies(replies) {
  var bar = getQuickRepliesBar(); if (!bar) return;
  bar.innerHTML = '<div class="quick-replies">' + replies.map(function(r){
    var s = r.replace(/'/g,"&#39;");
    return '<button class="quick-reply-chip" onclick="pickQuickReply(\''+s+'\')">'+r+'</button>';
  }).join('') + '</div>';
}
function clearQuickReplies() { var b = getQuickRepliesBar(); if (b) b.innerHTML = ''; }
function pickQuickReply(text) {
  clearQuickReplies();
  var inp = document.querySelector('.chat-type-input'); if (inp) inp.value = text;
  sendTyped();
}
function scrollChat() {
  var c = getChatContainer(); if (c) setTimeout(function(){ c.scrollTop = c.scrollHeight; }, 50);
}
function setInputEnabled(enabled) {
  var inp = document.querySelector('.chat-type-input');
  var snd = document.querySelector('.chat-send-btn');
  var rec = document.querySelector('.chat-record-btn');
  if (inp) inp.disabled = !enabled;
  if (snd) snd.disabled = !enabled;
  if (rec) rec.disabled = !enabled;
}
function showTypingIndicator() {
  if (document.getElementById('typingIndicator')) return;
  var c = getChatContainer(); if (!c) return;
  var w = document.createElement('div'); w.className = 'chat-row'; w.id = 'typingIndicator';
  w.innerHTML = '<div class="avatar ai">🩺</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  c.appendChild(w); scrollChat();
}
function removeTypingIndicator() { var el = document.getElementById('typingIndicator'); if (el) el.remove(); }

function updateProgress(pct) {
  var fill = document.querySelector('.chat-progress'); if (fill) fill.style.width = pct + '%';
  var counter = document.querySelector('.question-counter'); if (!_activeThread || !counter) return;
  counter.textContent = _activeThread.dynamicMode
    ? _activeThread.currentQ + ' answered'
    : (_activeThread.currentQ+1) + ' / ' + (QUESTIONS.length||9);
}

// ── API key helper (inline in consent card) ───────────────────
function onApiKeyInputEl(inputEl) {
  var val = inputEl.value.trim();
  var statusEl = inputEl.closest('[class*=accent-bg]') ? inputEl.closest('[class*=accent-bg]').querySelector('.api-key-status') : null;
  if (!statusEl) statusEl = document.querySelector('.api-key-status');
  if (!statusEl) return;
  if (val.startsWith('sk-ant')) {
    statusEl.textContent = '● AI interview enabled'; statusEl.className = 'badge badge-teal api-key-status';
  } else {
    statusEl.textContent = '● Standard questionnaire'; statusEl.className = 'badge badge-gray api-key-status';
  }
}

// ── Dynamic interview ─────────────────────────────────────────
function buildPatientContext(h) {
  var lines = ['PATIENT HEALTH RECORD (pre-loaded — personalise questions, do not read back verbatim):'];
  lines.push('Age group: ' + (h.ageGroup||'Not specified'));
  lines.push('Blood type: ' + (h.bloodType||'Unknown'));
  if (h.sex) lines.push('Biological sex: ' + h.sex);
  if (h.allergies&&h.allergies.length) lines.push('Allergies: ' + h.allergies.join(', '));
  if (h.chronicConditions&&h.chronicConditions.length)
    lines.push('Chronic conditions: ' + h.chronicConditions.map(function(c){return c.label+'('+c.status+')';}).join('; '));
  if (h.currentMedications&&h.currentMedications.length)
    lines.push('Medications: ' + h.currentMedications.map(function(m){return m.name+' — '+m.dose;}).join('; '));
  if (h.familyHistory&&h.familyHistory.conditions&&h.familyHistory.conditions.length)
    lines.push('Family history: ' + h.familyHistory.conditions.join(', '));
  if (h.recentTravels&&h.recentTravels.length)
    lines.push('Recent travel: ' + h.recentTravels.map(function(t){return t.destination+' ('+t.date+')';}).join('; '));
  lines.push('Patient first name: ' + (h.firstName||localStorage.getItem('cue_firstname')||'not known'));
  return lines.join('\n');
}

async function startDynamicInterview() {
  if (!_activeThread) return;
  _activeThread.dynamicMode = true; _activeThread.clinicalMsgs = []; _activeThread.answers = []; _activeThread.currentQ = 0;
  saveActiveThread();
  var h = _p.getHealthHistory(_p.Session.id);
  var systemFull = _p.CLINICAL_SYSTEM_PROMPT + '\n\n' + buildPatientContext(h);
  updateProgress(0); setInputEnabled(false); showTypingIndicator();
  try {
    _activeThread.clinicalMsgs.push({ role:'user', content:'[BEGIN INTERVIEW — greet the patient and ask your opening question]' });
    var raw = await _p.callClaude(_activeThread.clinicalMsgs, systemFull);
    var parsed = _p.parseClinicalResponse(raw);
    _activeThread.clinicalMsgs.push({ role:'assistant', content:raw });
    saveActiveThread(); removeTypingIndicator();
    addAIBubble(parsed.response, 'Chief Complaint'); setInputEnabled(true); updateProgress(5);
  } catch(err) { removeTypingIndicator(); handleApiError(err); }
}

async function sendDynamicAnswer(text) {
  if (!_activeThread) return;
  addUserBubble(text);
  _activeThread.answers.push({ question:'(dynamic)', cat:'AI interview', text:text });
  _activeThread.currentQ++; setInputEnabled(false); showTypingIndicator();
  var h = _p.getHealthHistory(_p.Session.id);
  var systemFull = _p.CLINICAL_SYSTEM_PROMPT + '\n\n' + buildPatientContext(h);
  _activeThread.clinicalMsgs.push({ role:'user', content:text });
  try {
    var raw = await _p.callClaude(_activeThread.clinicalMsgs, systemFull);
    var parsed = _p.parseClinicalResponse(raw);
    _activeThread.clinicalMsgs.push({ role:'assistant', content:raw });
    saveActiveThread(); removeTypingIndicator();
    if (parsed.synthesize) {
      if (parsed.response) addAIBubble(parsed.response, 'Summary');
      updateProgress(100); await _p.sleep(900); applySynthesis(parsed.synthesize);
    } else {
      addAIBubble(parsed.response, 'Question '+(_activeThread.currentQ+1));
      updateProgress(Math.min(90, _activeThread.currentQ*12)); setInputEnabled(true);
    }
  } catch(err) { removeTypingIndicator(); handleApiError(err); setInputEnabled(true); }
}

function applySynthesis(jsonStr) {
  try {
    var data = JSON.parse(jsonStr);
    data.checkinQuestions = _p.CHECKIN_QUESTIONS[data.conditionKey] || _p.CHECKIN_QUESTIONS.default;
    data.notes = buildSoapNotes(data.soap, data.diagnoses);
    _activeThread.diagResult = data;
    if (data.diagnoses && data.diagnoses[0]) _activeThread.title = data.diagnoses[0].name;
    saveActiveThread(); startAnalysis(true);
  } catch(e) {
    _p.runDiagnosis(_activeThread.answers||[]).then(function(r){
      _activeThread.diagResult = r; autoTitleThread(); saveActiveThread(); startAnalysis(true);
    });
  }
}

// ── Static fallback ───────────────────────────────────────────
function buildTailoredQuestions(h) {
  // These questions are deliberately general — we do NOT assume the current complaint
  // is related to the patient's existing conditions, medications, or travel history.
  // That connection is the doctor's job after reviewing the full picture.
  var fn = h.firstName || localStorage.getItem('cue_firstname') || 'there';

  return [
    {
      cat: 'Chief complaint',
      q: 'Hi ' + fn + ' 👋 I\'m here to take a quick history before your appointment. In your own words, what\'s been going on?',
      quickReplies: null,
    },
    {
      cat: 'Onset',
      q: 'When did this start?',
      quickReplies: ['Today', 'Yesterday', '2–3 days ago', 'About a week ago', 'Longer than a week'],
    },
    {
      cat: 'Location',
      q: 'Where exactly do you feel it — can you point to or describe the area?',
      quickReplies: null,
    },
    {
      cat: 'Character',
      q: 'How would you describe it — sharp, dull, throbbing, burning, pressure, or something else?',
      quickReplies: ['Sharp / stabbing', 'Dull / aching', 'Throbbing / pulsing', 'Burning', 'Cramping', 'Pressure / tightness'],
    },
    {
      cat: 'Severity',
      q: 'On a scale of 0 to 10, how bad is it right now — 0 being no discomfort, 10 the worst imaginable?',
      quickReplies: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    },
    {
      cat: 'Associated symptoms',
      q: 'Any other symptoms alongside this?',
      quickReplies: ['No, just this', 'Fever / chills', 'Nausea / vomiting', 'Dizziness', 'Shortness of breath', 'Fatigue'],
    },
    {
      cat: 'Timing',
      q: 'Is it constant, or does it come and go?',
      quickReplies: ['Constant', 'Comes and goes', 'Getting worse over time', 'Getting better', 'About the same throughout'],
    },
    {
      cat: 'Modifying factors',
      q: 'Is there anything that makes it better or worse — rest, movement, eating, posture, temperature?',
      quickReplies: ['Rest helps', 'Movement makes it worse', 'Food makes a difference', 'Heat helps', 'Cold helps', 'Nothing helps'],
    },
    {
      cat: 'Safety check',
      q: 'Last one — any chest pain, difficulty breathing, sudden weakness or numbness, or a headache you\'d call the worst you\'ve ever had?',
      quickReplies: ['None of these', 'Yes — at least one applies'],
    },
  ];
}

function startStaticInterview() {
  if (!_activeThread) return;
  _activeThread.dynamicMode = false;
  var h = _p.getHealthHistory(_p.Session.id);
  QUESTIONS = buildTailoredQuestions(h);
  _activeThread.currentQ = 0; _activeThread.answers = [];
  saveActiveThread();
  addAIBubble(QUESTIONS[0].q, QUESTIONS[0].cat, QUESTIONS[0].quickReplies);
  updateProgress(0);
}

function sendTyped() {
  var inp = document.querySelector('.chat-type-input');
  var text = inp ? inp.value.trim() : '';
  if (!text) return;
  if (inp) inp.value = '';
  var lb = document.querySelector('.lang-badge'); if (lb) lb.style.display = 'none';
  if (_activeThread && _activeThread.dynamicMode) sendDynamicAnswer(text);
  else submitStaticAnswer(text);
}

function submitStaticAnswer(text) {
  if (!_activeThread) return;
  addUserBubble(text);
  _activeThread.answers.push({ question:QUESTIONS[_activeThread.currentQ].q, cat:QUESTIONS[_activeThread.currentQ].cat, text:text });
  _activeThread.currentQ++;
  updateProgress(Math.round(_activeThread.currentQ/QUESTIONS.length*100));
  saveActiveThread();
  if (_activeThread.currentQ < QUESTIONS.length) {
    var q = QUESTIONS[_activeThread.currentQ];
    setTimeout(function(){ addAIBubble(q.q, q.cat, q.quickReplies); }, 400);
  } else {
    autoTitleThread();
    setTimeout(function(){
      addAIBubble('Thank you — I have everything I need. Analysing your responses now…', null);
      setTimeout(function(){ startAnalysis(false); }, 1200);
    }, 400);
  }
}

function skipQuestion() {
  if (_activeThread && _activeThread.dynamicMode) sendDynamicAnswer('[Skipped]');
  else submitStaticAnswer('[Not answered]');
}

function autoTitleThread() {
  if (!_activeThread || _activeThread.title !== 'New Consultation') return;
  if (_activeThread.answers && _activeThread.answers[0]) {
    var t = _activeThread.answers[0].text;
    _activeThread.title = t.length>45 ? t.substring(0,45).trim()+'…' : t;
    saveActiveThread();
  }
}

// ── Analysis ──────────────────────────────────────────────────
async function startAnalysis(preComputed) {
  if (!_activeThread) return;
  // Replace chat body with analysis UI
  var stagePreconsult = document.querySelector('#stage-preconsult .stage-body');
  if (stagePreconsult) {
    var tpl = document.getElementById('tpl-analysis');
    if (tpl) stagePreconsult.innerHTML = tpl.innerHTML;
  }

  var steps = ['astep1','astep2','astep3','astep4'];
  var delay = preComputed ? 520 : 900;
  for (var i=0; i<steps.length; i++) {
    await _p.sleep(delay);
    var el = document.getElementById(steps[i]);
    if (el) el.innerHTML = el.innerHTML.replace('⏳','✅');
    if (i+1<steps.length) { var n=document.getElementById(steps[i+1]); if(n) n.style.opacity='1'; }
  }
  if (!preComputed) {
    _activeThread.diagResult = await _p.runDiagnosis(_activeThread.answers);
    autoTitleThread(); saveActiveThread();
  }
  _p.Audit.log('analysis_complete', _p.Session.id, { dx: _activeThread.diagResult.diagnoses[0].name });

  // Show summary stage — rebuild the full thread view so stages update
  _activeThread.phase = 'summary';
  saveActiveThread();
  renderThreadView();
  // Populate summary
  setTimeout(renderSummaryContent, 50);
}

function renderSummaryContent() {
  if (!_activeThread || !_activeThread.diagResult) return;
  var dr = _activeThread.diagResult;

  var symEl = document.querySelector('#stage-preconsult .symptom-summary');
  if (symEl) symEl.innerHTML = dr.symptoms.map(function(s){
    return '<div class="info-row"><span class="info-label">'+s.label+'</span><div style="flex:1"><span class="info-val">'+s.duration+'</span><span class="badge '+(s.severity==='mild'?'badge-green':s.severity==='moderate'?'badge-amber':'badge-red')+'" style="margin-left:8px">'+s.severity+'</span></div></div>';
  }).join('') + ((dr.redFlags||[]).map(function(f){return '<div class="alert alert-danger mt-8" style="font-size:.8rem"><span>🚩</span><p>'+f.label+'</p></div>';})).join('');

  var dxEl = document.querySelector('#stage-preconsult .diagnosis-list');
  if (dxEl) dxEl.innerHTML = dr.diagnoses.map(function(d,i){
    return '<div class="dx-card '+(i===0?'primary':'')+'">' +
      '<div class="flex items-center justify-between mb-6"><div><div class="font-600 text-sm">'+d.name+'</div><div class="text-xs font-mono" style="color:var(--muted)">ICD-10: '+d.icd+'</div></div>' +
      '<span class="badge '+(i===0?'badge-teal':'badge-gray')+'">'+d.confidence+'%</span></div>' +
      '<div class="flex items-center gap-8"><div class="conf-bar"><div class="conf-fill" style="width:'+d.confidence+'%;background:'+(i===0?'var(--accent)':'var(--subtle)')+'"></div></div>' +
      '<span class="text-xs" style="color:var(--muted)">'+d.confidence+'%</span></div></div>';
  }).join('');

  var notesEl = document.querySelector('#stage-preconsult .clinical-notes');
  if (notesEl) notesEl.innerHTML = dr.notes;
}

function submitConsultation() {
  if (!_activeThread) return;
  var trackEl = document.querySelector('.enable-tracking');
  _activeThread.trackingEnabled = trackEl ? trackEl.checked : false;
  _activeThread.submittedAt     = new Date().toISOString();
  _activeThread.status          = 'pending';
  _activeThread.phase           = 'doctor_review';
  saveActiveThread();
  _p.Audit.log('consultation_submitted', _p.Session.id);
  renderThreadView();
}

// ── SOAP notes ────────────────────────────────────────────────
function buildSoapNotes(soap, diagnoses) {
  if (!soap) return '<p style="color:var(--muted)">Notes not available.</p>';
  var primaryDx = diagnoses&&diagnoses[0] ? diagnoses[0].name : 'Pending';
  var ptId = _p.Session.id;
  var date = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  function row(l,v){ return '<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)"><span style="min-width:120px;font-size:.75rem;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.04em;padding-top:1px">'+l+'</span><span style="font-size:.85rem;color:var(--text-2);flex:1;line-height:1.6">'+v+'</span></div>'; }
  function sh(l){ return '<div style="margin:14px 0 6px;padding:5px 10px;background:var(--surface-2);border-radius:4px;border-left:3px solid var(--accent)"><span style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)">'+l+'</span></div>'; }
  return '<div style="font-family:var(--font)"><div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid var(--border);margin-bottom:4px"><div><div style="font-size:.8rem;font-weight:700;color:var(--text)">CUE PRE-CONSULTATION NOTE</div><div style="font-size:.72rem;color:var(--subtle)">'+ptId+' · '+date+' · AI</div></div><span class="badge badge-teal" style="font-size:.65rem">Claude Clinical AI</span></div>'+sh('S — Subjective')+row('HPI',soap.subjective||'—')+sh('O — Objective')+row('Findings',soap.objective||'Pending exam')+sh('A — Assessment')+row('Primary Dx','<strong>'+primaryDx+'</strong>')+row('Reasoning',soap.assessment||'—')+'<div style="margin:8px 0;padding:8px 12px;background:#FEF9C3;border-radius:4px;font-size:.78rem;color:#713F12">⚠️ AI draft — must be confirmed by physician.</div>'+sh('P — Plan')+row('Plan',soap.plan||'—')+'<div style="margin-top:12px;font-size:.7rem;color:var(--subtle)">Generated by Claude Clinical AI (OPQRST + VINDICATE)</div></div>';
}

function handleApiError(err) {
  var msg = err.message||'Unknown error';
  if (msg==='NO_API_KEY'||msg.includes('401')) {
    addAIBubble('I need an Anthropic API key for the AI-powered interview. Please go back and enter your key, or continue without one.','Error');
    localStorage.removeItem('cue_api_key');
  } else if (msg.includes('429')) {
    addAIBubble('The AI is a bit busy right now. Please wait a moment and try again.','Notice');
  } else {
    addAIBubble('There was a connection issue. Please try sending again.','Notice');
  }
  setInputEnabled(true);
}

// ── Recording ─────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) { clearTimeout(recTimer); await finishRecording(); }
  else { startRecording(); }
}
function startRecording() {
  isRecording = true;
  var btn = document.querySelector('.chat-record-btn'); if (btn) { btn.classList.add('recording'); btn.textContent = '⏹'; }
  var wf = document.querySelector('.chat-waveform'); if (wf) wf.classList.remove('idle');
  var wl = document.querySelector('.wave-label'); if (wl) wl.textContent = 'Recording…';
  recTimer = setTimeout(function(){ if(isRecording) finishRecording(); }, 5000+Math.random()*3000);
}
async function finishRecording() {
  isRecording = false;
  var btn = document.querySelector('.chat-record-btn'); if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙️'; }
  var wf = document.querySelector('.chat-waveform'); if (wf) wf.classList.add('idle');
  var wl = document.querySelector('.wave-label'); if (wl) wl.textContent = 'Transcribing…';
  var q = _activeThread ? _activeThread.currentQ : 0;
  var text = await _p.transcribeAudio(selectedLang==='auto'?'en':selectedLang, q);
  if (wl) wl.textContent = 'Tap mic to speak';
  var inp = document.querySelector('.chat-type-input'); if (inp) inp.value = text;
  var lb = document.querySelector('.lang-badge'); if (lb) { lb.textContent = '🌐 Transcribed'; lb.style.display = ''; }
}

// ═══════════════════════════════════════════════════════════════
// LOG MODAL (thread-scoped check-ins)
// ═══════════════════════════════════════════════════════════════
var _checkinStep = 0, _checkinAnswers = [], _checkinQs = [], _logRec = false;

function openLogModal() {
  if (!_activeThread) return;
  _checkinStep = 0; _checkinAnswers = [];
  var condKey = 'default';
  if (_activeThread.diagResult) {
    condKey = _activeThread.diagResult.conditionKey || (_activeThread.diagResult.diagnoses&&_activeThread.diagResult.diagnoses[0]&&_activeThread.diagResult.diagnoses[0].conditionKey) || 'default';
  }
  _checkinQs = (_p.CHECKIN_QUESTIONS[condKey]||_p.CHECKIN_QUESTIONS.default).slice();
  document.getElementById('logModal').classList.add('open');
  document.getElementById('checkinChat').innerHTML = '';
  document.getElementById('checkinSubmitRow').style.display = 'none';
  document.getElementById('checkinCancelRow').style.display = '';
  document.getElementById('checkinProgress').style.width = '0%';
  document.getElementById('checkinProgressLabel').textContent = '0 / ' + _checkinQs.length;
  if (_checkinQs.length) addCheckinBubble(_checkinQs[0]);
}
function closeLogModal() { document.getElementById('logModal').classList.remove('open'); }

function addCheckinBubble(text) {
  var chat = document.getElementById('checkinChat');
  var div = document.createElement('div'); div.className = 'chat-row';
  div.innerHTML = '<div class="avatar ai" style="width:26px;height:26px;font-size:.75rem">🩺</div><div class="bubble ai" style="font-size:.84rem">'+escapeHtml(text)+'</div>';
  chat.appendChild(div); chat.scrollTop = chat.scrollHeight;
}
function sendCheckinTyped() {
  var inp = document.getElementById('checkinInput'); var text = inp.value.trim(); if (!text) return; inp.value = '';
  var chat = document.getElementById('checkinChat');
  var div = document.createElement('div'); div.className = 'chat-row user';
  div.innerHTML = '<div class="bubble user" style="font-size:.84rem">'+escapeHtml(text)+'</div>';
  chat.appendChild(div); chat.scrollTop = chat.scrollHeight;
  _checkinAnswers.push({ question:_checkinQs[_checkinStep], answer:text }); _checkinStep++;
  var pct = Math.round(_checkinStep/_checkinQs.length*100);
  document.getElementById('checkinProgress').style.width = pct+'%';
  document.getElementById('checkinProgressLabel').textContent = _checkinStep+' / '+_checkinQs.length;
  if (_checkinStep < _checkinQs.length) { setTimeout(function(){ addCheckinBubble(_checkinQs[_checkinStep]); }, 300); }
  else { setTimeout(function(){ addCheckinBubble('Thanks — now rate your overall severity below and save.'); document.getElementById('checkinSubmitRow').style.display=''; document.getElementById('checkinCancelRow').style.display='none'; }, 300); }
}
function submitLog() {
  if (!_activeThread) return;
  var sev = parseInt(document.getElementById('overallSeverity').value);
  var notes = document.getElementById('logNotes').value.trim();
  var sympSet = new Set();
  _checkinAnswers.forEach(function(a){ var t=a.answer.toLowerCase(); if(t.includes('head')||t.includes('migrain'))sympSet.add('Headache'); if(t.includes('naus'))sympSet.add('Nausea'); if(t.includes('fever'))sympSet.add('Fever'); if(t.includes('tired')||t.includes('fatigue'))sympSet.add('Fatigue'); if(t.includes('pain')||t.includes('ache'))sympSet.add('Pain'); });
  var symptoms = sympSet.size ? Array.from(sympSet) : [];
  var entry = { date:new Date().toISOString(), severity:sev, symptoms:symptoms, notes:notes, answers:_checkinAnswers };
  if (!_activeThread.checkins) _activeThread.checkins = [];
  _activeThread.checkins.push(entry);
  _activeThread.status = 'ongoing'; saveActiveThread();
  _p.Audit.log('checkin_logged', _p.Session.id, { severity:sev });
  closeLogModal(); showToast('✓ Check-in saved');
  renderTrackingContent(); setTimeout(renderChart, 100);
  renderThreadView(); // refresh header
}
async function toggleLogRecording() {
  _logRec = !_logRec;
  var btn = document.getElementById('logRecordBtn');
  if (_logRec) { if(btn){btn.classList.add('recording');btn.textContent='⏹';}
    setTimeout(async function(){ var text=await _p.transcribeAudio('en',_checkinStep); document.getElementById('checkinInput').value=text; _logRec=false; if(btn){btn.classList.remove('recording');btn.textContent='🎙️';} }, 2000+Math.random()*1000);
  } else { if(btn){btn.classList.remove('recording');btn.textContent='🎙️';} }
}

// ═══════════════════════════════════════════════════════════════
// PROFILE / HEALTH RECORD
// ═══════════════════════════════════════════════════════════════
function renderProfile() {
  var ptId = _p.Session.id;
  var h = _p.getHealthHistory(ptId);
  renderHRForm(h);
}

function renderHRForm(h) {
  var body = document.getElementById('hrBody');
  var btns = document.getElementById('hrBtnArea');
  if (!body) return;
  if (_hrEditMode) {
    body.innerHTML = buildHREdit(_hrDraft);
    if (btns) btns.innerHTML = '<div class="flex gap-8"><button class="btn btn-ghost btn-sm" onclick="cancelHREdit()">Cancel</button><button class="btn btn-primary btn-sm" onclick="saveHRForm()">Save changes</button></div>';
  } else {
    body.innerHTML = buildHRView(h);
    if (btns) btns.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="enterHREditMode()">✏️ Edit</button>';
  }
}
function enterHREditMode() {
  _hrDraft = JSON.parse(JSON.stringify(_p.getHealthHistory(_p.Session.id)));
  if (!_hrDraft.recentTravels) _hrDraft.recentTravels = [];
  if (!_hrDraft.vaccinations)  _hrDraft.vaccinations  = [];
  _hrEditMode = true; renderHRForm(_hrDraft);
}
function cancelHREdit() { _hrEditMode = false; _hrDraft = null; renderHRForm(_p.getHealthHistory(_p.Session.id)); }
function saveHRForm() {
  var btEl = document.getElementById('hrBloodType'); var agEl = document.getElementById('hrAgeGroup');
  if (btEl) _hrDraft.bloodType = btEl.value; if (agEl) _hrDraft.ageGroup = agEl.value;
  var ptId = _p.Session.id;
  if (!_p.HEALTH_HISTORY[ptId]) _p.HEALTH_HISTORY[ptId] = JSON.parse(JSON.stringify(_hrDraft));
  var h = _p.HEALTH_HISTORY[ptId];
  ['bloodType','ageGroup','allergies','chronicConditions','currentMedications','vaccinations','recentTravels','familyHistory','socialHistory','surgeries'].forEach(function(k){ if(_hrDraft[k]!==undefined) h[k]=_hrDraft[k]; });
  _p.persistHealthEdit(ptId, h);
  _hrEditMode = false; _hrDraft = null;
  renderProfile(); showToast('✓ Profile saved');
}

// ── HR view ───────────────────────────────────────────────────
function buildHRView(h) {
  var fhHtml = '';
  if (h.familyHistory && (h.familyHistory.conditions||[]).length) {
    fhHtml = hrSection('Family history',
      '<div class="hr-chips">' + h.familyHistory.conditions.map(function(c){ return '<span class="hr-chip-item warning">⚑ '+c+'</span>'; }).join('') + '</div>' +
      (h.familyHistory.notes ? '<p class="text-sm mt-8" style="color:var(--text-2)">'+escapeHtml(h.familyHistory.notes)+'</p>' : '')
    );
  }
  var shHtml = '';
  if (h.socialHistory) {
    var sh = h.socialHistory;
    shHtml = hrSection('Lifestyle', '<div class="hr-field-grid">' +
      (sh.smoking   ? '<div><div class="hr-section-label" style="margin-bottom:4px">Smoking</div><span class="hr-chip-item">'+sh.smoking+'</span></div>' : '') +
      (sh.alcohol   ? '<div><div class="hr-section-label" style="margin-bottom:4px">Alcohol</div><span class="hr-chip-item">'+sh.alcohol+'</span></div>' : '') +
      (sh.exercise  ? '<div><div class="hr-section-label" style="margin-bottom:4px">Exercise</div><span class="hr-chip-item">'+sh.exercise+'</span></div>' : '') +
      (sh.diet      ? '<div><div class="hr-section-label" style="margin-bottom:4px">Diet</div><span class="hr-chip-item">'+sh.diet+'</span></div>' : '') +
    '</div>');
  }
  var bloodBadge = (h.bloodType&&h.bloodType!=='Unknown') ? '<span class="hr-chip-item accent" style="font-weight:700">'+h.bloodType+'</span>' : '<span style="color:var(--subtle);font-size:.85rem">Not set</span>';
  var ageBadge   = h.ageGroup ? '<span class="hr-chip-item">'+h.ageGroup+'</span>' : '<span style="color:var(--subtle);font-size:.85rem">Not set</span>';
  var allergyHtml = (!h.allergies||!h.allergies.length) ? '<span class="hr-chip-item accent">✓ None known</span>' : h.allergies.map(function(a){ return '<span class="hr-chip-item danger">⚠️ '+a+'</span>'; }).join('');
  var condHtml = (!h.chronicConditions||!h.chronicConditions.length) ? '<span class="text-sm" style="color:var(--muted)">None on record</span>' : h.chronicConditions.map(function(c){ var sc=c.status==='ongoing'?'badge-amber':c.status==='resolved'?'badge-green':'badge-teal'; return '<div class="hr-structured-item"><div><div class="text-sm font-600">'+c.label+'</div><div class="text-xs font-mono" style="color:var(--muted)">'+c.icd+' · since '+c.since+'</div></div><span class="badge '+sc+'">'+c.status+'</span></div>'; }).join('');
  var medsHtml = (!h.currentMedications||!h.currentMedications.length) ? '<span class="text-sm" style="color:var(--muted)">None on record</span>' : h.currentMedications.map(function(m){ var tc=m.type==='acute'?'badge-amber':m.type==='supplement'?'badge-gray':'badge-blue'; return '<div class="hr-structured-item"><div><div class="text-sm font-600">💊 '+m.name+'</div><div class="text-xs" style="color:var(--muted)">'+m.dose+'</div></div><span class="badge '+tc+'">'+m.type+'</span></div>'; }).join('');
  var vaccHtml = (!h.vaccinations||!h.vaccinations.length) ? '<span class="text-sm" style="color:var(--muted)">No records on file</span>' : '<div class="hr-chips">'+h.vaccinations.map(function(v){ return '<span class="hr-chip-item accent">✓ '+v+'</span>'; }).join('')+'</div>';
  var travHtml = (!h.recentTravels||!h.recentTravels.length) ? '<span class="text-sm" style="color:var(--muted)">No travel history</span>' : h.recentTravels.map(function(t){ return '<div class="hr-travel-card"><span>✈️</span><div><div class="text-sm font-600">'+t.destination+'</div><div class="text-xs" style="color:var(--muted)">'+t.date+' · '+t.duration+'</div></div></div>'; }).join('');

  return [
    hrSection('Personal info','<div class="hr-field-grid"><div><div class="hr-section-label" style="margin-bottom:6px">Blood type</div>'+bloodBadge+'</div><div><div class="hr-section-label" style="margin-bottom:6px">Age group</div>'+ageBadge+'</div></div>'),
    fhHtml,
    hrSection('Allergies & intolerances','<div class="hr-chips">'+allergyHtml+'</div>'),
    hrSection('Chronic conditions',condHtml),
    hrSection('Current medications',medsHtml),
    shHtml,
    hrSection('Vaccinations',vaccHtml),
    hrSection('Recent travels',travHtml),
  ].join('');
}

// ── HR edit ───────────────────────────────────────────────────
function buildHREdit(h) {
  var btypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
  var ages   = ['Child (under 12)','Teen (12–17)','Young adult (18–25)','Adult (26–35)','Adult (36–45)','Adult (46–55)','Adult (56–65)','Senior (66+)'];
  var profileHtml = '<div class="hr-field-grid"><div class="form-group" style="margin:0"><label class="form-label">Blood type</label><select class="form-select" id="hrBloodType">'+btypes.map(function(b){return '<option'+(b===h.bloodType?' selected':'')+'>'+b+'</option>';}).join('')+'</select></div><div class="form-group" style="margin:0"><label class="form-label">Age group</label><select class="form-select" id="hrAgeGroup">'+ages.map(function(a){return '<option'+(a===h.ageGroup?' selected':'')+'>'+a+'</option>';}).join('')+'</select></div></div>';
  var allergyItems = (h.allergies||[]).map(function(a,i){ return '<span class="hr-chip-item danger">⚠️ '+a+'<button class="hr-remove" onclick="hrRemove(\'allergies\','+i+')">×</button></span>'; }).join('');
  var allergyHtml = '<div class="hr-chips" id="hrAllergyChips">'+(allergyItems||'<span class="text-xs" style="color:var(--muted)">None</span>')+'</div><div class="hr-add-row"><input class="form-input" id="hrAllergyInput" placeholder="e.g. Penicillin, Latex…" onkeydown="if(event.key===\'Enter\')hrAddStr(\'allergies\',\'hrAllergyInput\')" /><button class="btn btn-outline btn-sm" onclick="hrAddStr(\'allergies\',\'hrAllergyInput\')">+ Add</button></div>';
  var condItems = (h.chronicConditions||[]).map(function(c,i){ return '<div class="hr-structured-item"><div><div class="text-sm font-600">'+c.label+'</div><div class="text-xs font-mono" style="color:var(--muted)">'+c.icd+' · since '+c.since+'</div></div><div class="flex items-center gap-6"><span class="badge '+(c.status==='ongoing'?'badge-amber':'badge-teal')+'">'+c.status+'</span><button class="hr-remove" onclick="hrRemove(\'chronicConditions\','+i+')">×</button></div></div>'; }).join('')||'<p class="text-sm" style="color:var(--muted)">None.</p>';
  var condHtml = '<div id="hrCondList">'+condItems+'</div><div class="hr-add-block"><div class="hr-add-block-label">Add condition</div><input class="form-input" id="condLabel" placeholder="Condition name" /><div class="flex gap-8"><input class="form-input" id="condIcd" placeholder="ICD-10" style="flex:1" /><input class="form-input" id="condSince" placeholder="Since year" style="flex:1" /><select class="form-select" id="condStatus" style="flex:1"><option value="ongoing">Ongoing</option><option value="managed">Managed</option><option value="resolved">Resolved</option></select></div><button class="btn btn-outline btn-sm" style="align-self:flex-start" onclick="hrAddCondition()">+ Add</button></div>';
  var medItems = (h.currentMedications||[]).map(function(m,i){ return '<div class="hr-structured-item"><div><div class="text-sm font-600">💊 '+m.name+'</div><div class="text-xs" style="color:var(--muted)">'+m.dose+'</div></div><div class="flex items-center gap-6"><span class="badge '+(m.type==='acute'?'badge-amber':m.type==='supplement'?'badge-gray':'badge-blue')+'">'+m.type+'</span><button class="hr-remove" onclick="hrRemove(\'currentMedications\','+i+')">×</button></div></div>'; }).join('')||'<p class="text-sm" style="color:var(--muted)">None.</p>';
  var medsHtml = '<div id="hrMedList">'+medItems+'</div><div class="hr-add-block"><div class="hr-add-block-label">Add medication</div><input class="form-input" id="medName" placeholder="Name" /><input class="form-input" id="medDose" placeholder="Frequency" /><div class="flex gap-8"><select class="form-select" id="medType" style="flex:1"><option value="maintenance">Maintenance</option><option value="acute">Acute (PRN)</option><option value="supplement">Supplement</option></select><button class="btn btn-outline btn-sm" onclick="hrAddMed()">+ Add</button></div></div>';
  var vaccItems = (h.vaccinations||[]).map(function(v,i){ return '<span class="hr-chip-item accent">✓ '+v+'<button class="hr-remove" onclick="hrRemove(\'vaccinations\','+i+')">×</button></span>'; }).join('');
  var vaccHtml = '<div class="hr-chips" id="hrVaccChips">'+(vaccItems||'<span class="text-xs" style="color:var(--muted)">None</span>')+'</div><div class="hr-add-row"><input class="form-input" id="hrVaccInput" placeholder="e.g. Flu vaccine (Oct 2024)" onkeydown="if(event.key===\'Enter\')hrAddStr(\'vaccinations\',\'hrVaccInput\')" /><button class="btn btn-outline btn-sm" onclick="hrAddStr(\'vaccinations\',\'hrVaccInput\')">+ Add</button></div>';
  var travItems = (h.recentTravels||[]).map(function(t,i){ return '<div class="hr-travel-card" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><span>✈️</span><div><div class="text-sm font-600">'+t.destination+'</div><div class="text-xs" style="color:var(--muted)">'+t.date+' · '+t.duration+'</div></div></div><button class="hr-remove" onclick="hrRemove(\'recentTravels\','+i+')">×</button></div>'; }).join('')||'<p class="text-sm" style="color:var(--muted)">None.</p>';
  var travHtml = '<div id="hrTravelList">'+travItems+'</div><div class="hr-add-block"><div class="hr-add-block-label">Add trip</div><input class="form-input" id="travelDest" placeholder="Destination" /><div class="flex gap-8"><input class="form-input" id="travelDate" placeholder="Month & year" style="flex:1" /><input class="form-input" id="travelDur" placeholder="Duration" style="flex:1" /></div><div class="flex gap-8"><select class="form-select" id="travelPurpose" style="flex:1"><option>Holiday</option><option>Business</option><option>Family visit</option><option>Medical</option></select><button class="btn btn-outline btn-sm" onclick="hrAddTravel()">+ Add</button></div></div>';
  return [hrSection('Personal info',profileHtml),hrSection('Allergies & intolerances',allergyHtml),hrSection('Chronic conditions',condHtml),hrSection('Current medications',medsHtml),hrSection('Vaccinations',vaccHtml),hrSection('Recent travels',travHtml)].join('');
}

function hrSection(label,content){ return '<div class="hr-section"><div class="hr-section-label">'+label+'</div>'+content+'</div>'; }

function hrRemove(field,idx){ _hrDraft[field].splice(idx,1); var bt=document.getElementById('hrBloodType');if(bt)_hrDraft.bloodType=bt.value; var ag=document.getElementById('hrAgeGroup');if(ag)_hrDraft.ageGroup=ag.value; renderHRForm(_hrDraft); }
function hrAddStr(field,inputId){ var val=document.getElementById(inputId).value.trim();if(!val)return;if(!_hrDraft[field])_hrDraft[field]=[];_hrDraft[field].push(val);var bt=document.getElementById('hrBloodType');if(bt)_hrDraft.bloodType=bt.value;var ag=document.getElementById('hrAgeGroup');if(ag)_hrDraft.ageGroup=ag.value;renderHRForm(_hrDraft); }
function hrAddCondition(){ var label=document.getElementById('condLabel').value.trim();if(!label)return;if(!_hrDraft.chronicConditions)_hrDraft.chronicConditions=[];_hrDraft.chronicConditions.push({label:label,icd:document.getElementById('condIcd').value.trim()||'N/A',since:document.getElementById('condSince').value.trim()||new Date().getFullYear().toString(),status:document.getElementById('condStatus').value});var bt=document.getElementById('hrBloodType');if(bt)_hrDraft.bloodType=bt.value;var ag=document.getElementById('hrAgeGroup');if(ag)_hrDraft.ageGroup=ag.value;renderHRForm(_hrDraft); }
function hrAddMed(){ var name=document.getElementById('medName').value.trim();if(!name)return;if(!_hrDraft.currentMedications)_hrDraft.currentMedications=[];_hrDraft.currentMedications.push({name:name,dose:document.getElementById('medDose').value.trim()||'As directed',type:document.getElementById('medType').value});var bt=document.getElementById('hrBloodType');if(bt)_hrDraft.bloodType=bt.value;var ag=document.getElementById('hrAgeGroup');if(ag)_hrDraft.ageGroup=ag.value;renderHRForm(_hrDraft); }
function hrAddTravel(){ var dest=document.getElementById('travelDest').value.trim();if(!dest)return;if(!_hrDraft.recentTravels)_hrDraft.recentTravels=[];_hrDraft.recentTravels.unshift({destination:dest,date:document.getElementById('travelDate').value.trim()||'Date not specified',duration:document.getElementById('travelDur').value.trim()||'Duration not specified',purpose:document.getElementById('travelPurpose').value});var bt=document.getElementById('hrBloodType');if(bt)_hrDraft.bloodType=bt.value;var ag=document.getElementById('hrAgeGroup');if(ag)_hrDraft.ageGroup=ag.value;renderHRForm(_hrDraft); }

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function setText(id,val){ var el=document.getElementById(id);if(el)el.textContent=val; }
function showToast(msg){ var t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2500); }
function filterTimeline(val){ renderTimeline(val); }
