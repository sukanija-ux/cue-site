/* ============================================================
   Cue — Doctor Dashboard
   Patient list | Queue | Calendar | Alerts | Detail panel
   ============================================================ */

const _d = window.CUE;

let activePatientId  = null;
let activeThreadId   = null;   // set when reviewing a real thread
let selectedUrgency  = 'medium';
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDay = null;

// ── Real consultation data from localStorage ──────────────────
function getRealConsultations() {
  // Returns array of { ptId, thread } for all submitted, unconfirmed threads
  var store = {};
  try { store = JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) {}
  var results = [];
  Object.keys(store).forEach(function(ptId) {
    var consultations = (store[ptId] && store[ptId].consultations) || [];
    consultations.forEach(function(t) {
      if (t.submittedAt) {  // only submitted threads appear in the queue
        results.push({ ptId: ptId, thread: t });
      }
    });
  });
  // Newest first
  results.sort(function(a,b){ return new Date(b.thread.submittedAt) - new Date(a.thread.submittedAt); });
  return results;
}

function confirmRealThread(ptId, threadId) {
  // Write doctorReview.confirmed = true back into cue_store
  var store = {};
  try { store = JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) {}
  if (!store[ptId] || !store[ptId].consultations) return false;
  var t = store[ptId].consultations.find(function(x){ return x.id === threadId; });
  if (!t) return false;
  t.doctorReview = t.doctorReview || {};
  t.doctorReview.confirmed    = true;
  t.doctorReview.confirmedAt  = new Date().toISOString();
  t.doctorReview.confirmedBy  = _d.Session.id;
  t.status = 'ongoing';
  try { localStorage.setItem('cue_store', JSON.stringify(store)); } catch(e) {}
  return true;
}

function overrideRealThread(ptId, threadId, diagName, notes) {
  var store = {};
  try { store = JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) {}
  if (!store[ptId] || !store[ptId].consultations) return false;
  var t = store[ptId].consultations.find(function(x){ return x.id === threadId; });
  if (!t) return false;
  t.doctorReview = t.doctorReview || {};
  t.doctorReview.confirmed    = true;
  t.doctorReview.confirmedAt  = new Date().toISOString();
  t.doctorReview.confirmedBy  = _d.Session.id;
  t.doctorReview.overriddenDx = diagName;
  t.doctorReview.notes        = notes;
  t.status = 'ongoing';
  try { localStorage.setItem('cue_store', JSON.stringify(store)); } catch(e) {}
  return true;
}

function toggleDrMenu(e) {
  if (e) e.stopPropagation();
  var menu = document.getElementById('profileMenu');
  if (menu) menu.classList.toggle('open');
}
document.addEventListener('click', function(e) {
  var dd = document.getElementById('profileDd');
  if (dd && !dd.contains(e.target)) {
    var menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('open');
  }
});

document.addEventListener('DOMContentLoaded', function() {
  _d.Session.init();
  renderPatientList();
  renderQueue();
  updateCounts();
});

// ── Counts ────────────────────────────────────────────────────
function updateCounts() {
  var mockPending  = MOCK_PATIENTS.filter(function(p){ return !p.diagnosis.confirmed; }).length;
  var realPending  = getRealConsultations().filter(function(r){ return !r.thread.doctorReview || !r.thread.doctorReview.confirmed; }).length;
  var pending  = mockPending + realPending;
  var outliers = MOCK_PATIENTS.filter(function(p){ return p.outlier; }).length;
  document.getElementById('queueCount').textContent  = pending;
  document.getElementById('alertCount').textContent  = outliers;
  document.getElementById('statQueue').textContent   = pending;
  document.getElementById('statAlerts').textContent  = outliers;
}

// ── Patient list (sidebar) ────────────────────────────────────
function renderPatientList(query) {
  query = (query || '').toLowerCase();

  // Real patients from localStorage — one row per patient (latest thread)
  var realRows = getRealConsultations().reduce(function(acc, r) {
    if (!acc.find(function(x){ return x.ptId === r.ptId; })) acc.push(r);
    return acc;
  }, []);

  var realHtml = realRows.filter(function(r){
    return !query || r.ptId.toLowerCase().includes(query) || (r.thread.title||'').toLowerCase().includes(query);
  }).map(function(r) {
    var t   = r.thread;
    var confirmed = t.doctorReview && t.doctorReview.confirmed;
    var badge = confirmed ? '<span class="badge badge-teal" style="font-size:.6rem">Confirmed</span>'
                          : '<span class="badge badge-amber" style="font-size:.6rem">Pending</span>';
    var active = (activePatientId === r.ptId && activeThreadId === t.id) ? 'active' : '';
    return '<div class="pt-row ' + active + '" onclick="selectRealThread(\'' + r.ptId + '\',\'' + t.id + '\')">' +
      '<div class="flex items-center justify-between mb-4">' +
        '<span class="pt-row-id">' + r.ptId + '</span>' + badge +
      '</div>' +
      '<div class="pt-row-cond truncate">' + escapeHtml(t.title || 'Consultation') + '</div>' +
      '<div class="text-xs mt-4" style="color:var(--subtle)">' + new Date(t.submittedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) + '</div>' +
    '</div>';
  }).join('');

  var pts = query
    ? MOCK_PATIENTS.filter(function(p){ return p.id.toLowerCase().includes(query) || p.condition.toLowerCase().includes(query); })
    : MOCK_PATIENTS;

  var mockHtml = pts.map(function(p) {
    var sev = p.currentSeverity;
    var bars = p.checkins.slice(-5).map(function(c) {
      return '<div class="spark-bar ' + (c.severity>=7?'high':'') + '" style="height:' + Math.max(3, c.severity/10*20) + 'px"></div>';
    }).join('');
    return '<div class="pt-row ' + (p.id === activePatientId && !activeThreadId ? 'active' : '') + '" onclick="selectPatient(\'' + p.id + '\')">' +
      '<div class="flex items-center justify-between mb-4">' +
        '<span class="pt-row-id">' + p.id + '</span>' +
        (p.outlier ? '<span class="badge badge-red" style="font-size:.6rem">Alert</span>' :
         !p.diagnosis.confirmed ? '<span class="badge badge-amber" style="font-size:.6rem">Pending</span>' : '') +
      '</div>' +
      '<div class="pt-row-cond truncate">' + p.condition + '</div>' +
      '<div class="flex items-center justify-between mt-6">' +
        '<div class="sparkline" style="height:20px">' + bars + '</div>' +
        '<span class="text-xs font-600" style="color:' + severityColor(sev) + '">' + (sev != null ? sev + '/10' : '—') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  // Real patients first with a divider if present
  var separator = realRows.length && pts.length
    ? '<div style="padding:6px 12px;font-size:.65rem;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.07em;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface-2);margin-top:4px">Demo patients</div>'
    : '';
  document.getElementById('patientList').innerHTML = realHtml + separator + mockHtml;
}

function filterPatientList(q) { renderPatientList(q); }

// Select a real (localStorage) patient thread
function selectRealThread(ptId, threadId) {
  activePatientId = ptId;
  activeThreadId  = threadId;
  renderPatientList(document.getElementById('ptSearch').value);
  renderRealThreadDetail(ptId, threadId);
}

function renderRealThreadDetail(ptId, threadId) {
  var store = {};
  try { store = JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) {}
  var consultations = (store[ptId] && store[ptId].consultations) || [];
  var t = consultations.find(function(x){ return x.id === threadId; });
  if (!t) return;

  var confirmed = t.doctorReview && t.doctorReview.confirmed;
  var dx = (t.diagResult && t.diagResult.diagnoses && t.diagResult.diagnoses[0]) || null;
  var dxName = dx ? dx.label : 'AI analysis pending';
  var dxConf = dx ? (dx.confidence || 75) : 0;
  var answers = (t.answers || []).slice(0, 6);
  var checkins = t.checkins || [];

  var answerRows = answers.length
    ? answers.map(function(a){ return '<div class="info-row"><span class="info-label" style="font-size:.68rem">' + escapeHtml(a.cat||'Q') + '</span><span class="info-val text-sm">' + escapeHtml(a.text||a.answer||'—') + '</span></div>'; }).join('')
    : '<p class="text-sm" style="color:var(--muted)">No answers recorded.</p>';

  var sevChips = checkins.slice(-5).map(function(c){
    return '<div style="text-align:center;padding:4px 8px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border)">' +
      '<div style="font-size:.58rem;color:var(--subtle)">' + new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + '</div>' +
      '<div style="font-weight:700;font-size:.82rem;color:' + severityColor(c.severity) + '">' + c.severity + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('detailPanel').innerHTML =
    '<div class="stack-12">' +
      '<div>' +
        '<div class="flex items-center gap-8 mb-6" style="flex-wrap:wrap">' +
          '<span class="font-mono font-700 text-sm">' + ptId + '</span>' +
          '<span class="badge badge-gray" style="font-size:.6rem">🔒 ID only</span>' +
          (confirmed ? '<span class="badge badge-teal">✓ Confirmed</span>' : '<span class="badge badge-amber">⏳ Pending</span>') +
        '</div>' +
        '<div class="text-xs mb-12" style="color:var(--subtle)">Submitted ' + new Date(t.submittedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) + '</div>' +
      '</div>' +
      (dx ? '<div class="dx-card primary mb-8">' +
        '<div class="font-600 text-sm mb-4">' + escapeHtml(dxName) + '</div>' +
        '<div class="flex items-center gap-8"><div class="conf-bar"><div class="conf-fill" style="width:' + dxConf + '%"></div></div><span class="text-xs" style="color:var(--muted)">' + dxConf + '%</span></div>' +
      '</div>' : '<div class="card-sm mb-8"><p class="text-sm" style="color:var(--muted)">AI analysis not yet available.</p></div>') +
      (checkins.length ? '<div class="mb-8"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Check-ins</div><div class="flex gap-6" style="flex-wrap:wrap">' + sevChips + '</div></div>' : '') +
      '<div class="mb-8"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Interview answers</div>' + answerRows + '</div>' +
      (!confirmed ? '<button class="btn btn-primary btn-sm" style="width:100%" onclick="openRealConfirmModal(\'' + ptId + '\',\'' + threadId + '\')">Review &amp; Confirm →</button>' : '<div class="alert alert-success" style="font-size:.78rem"><span>✓</span><p>Confirmed by <span class="font-mono">' + (t.doctorReview.confirmedBy||'—') + '</span></p></div>') +
    '</div>';
}

function selectPatient(id) {
  activePatientId = id;
  activeThreadId  = null;
  renderPatientList(document.getElementById('ptSearch').value);
  renderDetailPanel(id);
}

// ── Detail panel (right column) ───────────────────────────────
function renderDetailPanel(patientId) {
  var p = MOCK_PATIENTS.find(function(x){ return x.id === patientId; });
  if (!p) return;

  var severityChips = p.checkins.map(function(c) {
    return '<div style="text-align:center;padding:5px 8px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border)">' +
      '<div style="font-size:.6rem;color:var(--subtle)">' + new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + '</div>' +
      '<div style="font-weight:700;font-size:.85rem;color:' + severityColor(c.severity) + '">' + c.severity + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('detailPanel').innerHTML =
    '<div class="stack-12">' +
      '<div>' +
        '<div class="font-mono font-700 text-sm">' + p.id + '</div>' +
        '<div class="flex gap-6 mt-6" style="flex-wrap:wrap">' +
          (p.outlier ? '<span class="badge badge-red">🚨 Outlier</span>' : '') +
          (!p.diagnosis.confirmed ? '<span class="badge badge-amber">⏳ Pending</span>' : '<span class="badge badge-teal">✓ Confirmed</span>') +
        '</div>' +
      '</div>' +
      '<hr class="divider">' +
      '<div>' +
        '<div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Condition</div>' +
        '<div class="text-sm font-600">' + p.condition + '</div>' +
        '<div class="text-xs font-mono" style="color:var(--muted);margin-top:2px">' + p.diagnosis.icd + '</div>' +
      '</div>' +
      (p.checkins.length > 0 ? '<div>' +
        '<div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Severity history</div>' +
        '<div class="flex gap-4" style="flex-wrap:wrap">' + severityChips + '</div>' +
      '</div>' : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div style="background:var(--surface-2);border-radius:8px;padding:10px">' +
          '<div class="text-xs" style="color:var(--subtle)">Days tracked</div>' +
          '<div class="font-700" style="font-size:1.2rem;margin-top:2px">' + p.daysTracked + '</div>' +
        '</div>' +
        '<div style="background:var(--surface-2);border-radius:8px;padding:10px">' +
          '<div class="text-xs" style="color:var(--subtle)">Trend</div>' +
          '<div class="font-600 text-sm mt-4">' + (p.trend === 'improving' ? '↓ Improving' : p.trend === 'worsening' ? '↑ Worsening' : '→ Stable') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-full btn-sm" onclick="openConfirmModal(\'' + p.id + '\')">' +
        (!p.diagnosis.confirmed ? 'Review & Confirm →' : 'View Notes →') +
      '</button>' +
      (p.outlier ? '<button class="btn btn-danger btn-full btn-sm" onclick="openOutlierFlag(\'' + p.id + '\')">🚨 Schedule Follow-up</button>' : '') +
    '</div>';
}

// ── Section switching ─────────────────────────────────────────
function showSection(s) {
  var sections = ['queue','patients','calendar','alerts'];
  sections.forEach(function(id) {
    var sec = document.getElementById('section' + cap(id));
    var nav = document.getElementById('nav' + cap(id));
    if (sec) sec.style.display = id === s ? '' : 'none';
    if (nav) { nav.classList.remove('active'); if (id === s) nav.classList.add('active'); }
  });
  if (s === 'patients') renderPatientsTable();
  if (s === 'calendar') renderCalendar();
  if (s === 'alerts')   renderOutliers();
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Queue ─────────────────────────────────────────────────────
function renderQueue(filter) {
  filter = filter || 'all';

  // ── Real consultations from localStorage ──
  var realConsults = getRealConsultations();
  if (filter === 'pending')   realConsults = realConsults.filter(function(r){ return !r.thread.doctorReview || !r.thread.doctorReview.confirmed; });
  if (filter === 'confirmed') realConsults = realConsults.filter(function(r){ return r.thread.doctorReview && r.thread.doctorReview.confirmed; });

  var realQueueHtml = realConsults.map(function(r) {
    var t         = r.thread;
    var confirmed = t.doctorReview && t.doctorReview.confirmed;
    var dx        = t.diagResult && t.diagResult.diagnoses && t.diagResult.diagnoses[0];
    var dxName    = dx ? dx.label : 'Awaiting AI analysis';
    var dxConf    = dx ? (dx.confidence || 75) : null;
    var submitted = new Date(t.submittedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    var borderColor = confirmed ? 'var(--accent)' : 'var(--amber)';

    return '<div class="card" style="border-left:3px solid ' + borderColor + ';margin-bottom:0">' +
      '<div class="flex items-center justify-between mb-10" style="flex-wrap:wrap;gap:8px">' +
        '<div class="flex items-center gap-8" style="flex-wrap:wrap">' +
          '<span class="font-mono font-700 text-sm">' + r.ptId + '</span>' +
          '<span class="badge badge-gray" style="font-size:.6rem">🔒 Real patient</span>' +
          (confirmed ? '<span class="badge badge-teal">✓ Confirmed</span>' : '<span class="badge badge-amber">⏳ Pending review</span>') +
        '</div>' +
        '<div class="flex gap-8">' +
          '<button class="btn ' + (!confirmed ? 'btn-primary' : 'btn-ghost') + ' btn-sm" onclick="openRealConfirmModal(\'' + r.ptId + '\',\'' + t.id + '\')">' +
            (!confirmed ? 'Review &amp; Confirm' : 'View') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="text-sm mb-4"><strong>Complaint:</strong> ' + escapeHtml(t.title || 'New Consultation') + '</div>' +
      (dx ? '<div class="text-sm mb-4"><strong>AI Diagnosis:</strong> ' + escapeHtml(dxName) +
        (dxConf ? ' <span class="text-xs font-mono" style="color:var(--muted)">' + dxConf + '% confidence</span>' : '') + '</div>' : '') +
      '<div class="text-xs" style="color:var(--muted)">Submitted ' + submitted + '</div>' +
    '</div>';
  }).join('');

  var realSectionHtml = realConsults.length
    ? '<div class="stack-12 mb-16">' +
        '<div class="text-xs font-600" style="color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">🔴 Live pre-consultations</div>' +
        realQueueHtml +
      '</div>'
    : '';

  var pts = filter === 'pending'   ? MOCK_PATIENTS.filter(function(p){ return !p.diagnosis.confirmed; })
          : filter === 'confirmed' ? MOCK_PATIENTS.filter(function(p){ return p.diagnosis.confirmed; })
          : MOCK_PATIENTS;

  var mockSectionLabel = realConsults.length
    ? '<div class="text-xs font-600" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Demo patients</div>'
    : '';

  var mockHtml = pts.map(function(p) {
    var accentColor = !p.diagnosis.confirmed ? 'var(--amber)' : p.outlier ? 'var(--red)' : 'var(--accent)';
    var bars = p.checkins.slice(-6).map(function(c) {
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">' +
        '<div style="font-weight:700;font-size:.75rem;color:' + severityColor(c.severity) + '">' + c.severity + '</div>' +
        '<div style="font-size:.6rem;color:var(--subtle)">' + new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + '</div>' +
      '</div>';
    }).join('');

    return '<div class="card" style="border-left:3px solid ' + accentColor + '">' +
      '<div class="flex items-center justify-between mb-10" style="flex-wrap:wrap;gap:8px">' +
        '<div class="flex items-center gap-8" style="flex-wrap:wrap">' +
          '<span class="font-mono font-700 text-sm">' + p.id + '</span>' +
          (p.outlier ? '<span class="badge badge-red">🚨 Outlier</span>' : '') +
          (!p.diagnosis.confirmed ? '<span class="badge badge-amber">⏳ Pending</span>' : '<span class="badge badge-teal">✓ Confirmed</span>') +
        '</div>' +
        '<div class="flex gap-8">' +
          '<button class="btn ' + (!p.diagnosis.confirmed ? 'btn-primary' : 'btn-ghost') + ' btn-sm" onclick="openConfirmModal(\'' + p.id + '\')">' +
            (!p.diagnosis.confirmed ? 'Review & Confirm' : 'View Notes') +
          '</button>' +
          (p.outlier ? '<button class="btn btn-danger btn-sm" onclick="openOutlierFlag(\'' + p.id + '\')">Flag</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="text-sm mb-4"><strong>AI Diagnosis:</strong> ' + p.diagnosis.name +
        ' <span class="font-mono text-xs" style="color:var(--muted);margin-left:4px">' + p.diagnosis.icd + '</span>' +
      '</div>' +
      '<div class="text-xs mb-10" style="color:var(--muted)">Severity: <strong style="color:' + severityColor(p.currentSeverity) + '">' + (p.currentSeverity != null ? p.currentSeverity + '/10' : '—') + '</strong> · ' + (p.daysTracked || 0) + ' days tracked' +
        (p.diagnosis.confirmed ? ' · Confirmed by <span class="font-mono">' + (p.diagnosis.confirmedBy||'DR-???') + '</span>' : '') +
      '</div>' +
      (p.checkins.length > 0 ? '<hr class="divider mb-10"><div class="flex gap-12" style="flex-wrap:wrap">' + bars + '</div>' : '') +
    '</div>';
  }).join('');

  document.getElementById('queueList').innerHTML = realSectionHtml + mockSectionLabel + mockHtml;
}
function filterQueue(val) { renderQueue(val); }

// ── All patients table ────────────────────────────────────────
function renderPatientsTable() {
  document.getElementById('patientsTable').innerHTML = MOCK_PATIENTS.map(function(p) {
    var bars = p.checkins.slice(-5).map(function(c) {
      return '<div class="spark-bar ' + (c.severity>=7?'high':'') + '" style="height:' + Math.max(3,c.severity/10*18) + 'px"></div>';
    }).join('');

    return '<tr' + (p.outlier ? ' class="row-alert"' : '') + '>' +
      '<td class="font-mono">' + p.id + '</td>' +
      '<td>' + p.condition + '</td>' +
      '<td>' + p.daysTracked + '</td>' +
      '<td><div class="sparkline" style="height:18px">' + bars + '</div></td>' +
      '<td>' + formatDate(p.lastCheckin) + '</td>' +
      '<td>' + (p.status==='urgent' ? '<span class="badge badge-red">Urgent</span>' : p.status==='pending' ? '<span class="badge badge-amber">Pending</span>' : '<span class="badge badge-teal">Active</span>') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="openConfirmModal(\'' + p.id + '\')">View</button>' +
        (p.outlier ? ' <button class="btn btn-danger btn-sm" onclick="openOutlierFlag(\'' + p.id + '\')">Flag</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');
}

// ── Calendar ──────────────────────────────────────────────────
function renderCalendar() {
  var now  = new Date();
  var firstDay = new Date(calYear, calMonth, 1);
  var lastDay  = new Date(calYear, calMonth + 1, 0);
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  document.getElementById('calTitle').textContent = months[calMonth] + ' ' + calYear;

  // Build checkin map: day → [patients]
  var dayMap = {};
  MOCK_PATIENTS.forEach(function(p) {
    // Scheduled check-ins every 2 days from lastCheckin
    for (var i = 1; i <= 4; i++) {
      var d = new Date(p.lastCheckin + i * 2 * 24 * 60 * 60 * 1000);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        var key = d.getDate();
        if (!dayMap[key]) dayMap[key] = [];
        dayMap[key].push({ id: p.id, outlier: p.outlier, sev: p.currentSeverity });
      }
    }
    // Past check-ins
    p.checkins.forEach(function(c) {
      var d2 = new Date(c.date);
      if (d2.getFullYear() === calYear && d2.getMonth() === calMonth) {
        var key2 = d2.getDate();
        if (!dayMap[key2]) dayMap[key2] = [];
        dayMap[key2].push({ id: p.id, outlier: c.outlier, sev: c.severity, past: true });
      }
    });
  });

  var html = '<div class="cal-header">Sun</div><div class="cal-header">Mon</div><div class="cal-header">Tue</div><div class="cal-header">Wed</div><div class="cal-header">Thu</div><div class="cal-header">Fri</div><div class="cal-header">Sat</div>';

  var startDow = firstDay.getDay();
  for (var i = 0; i < startDow; i++) {
    html += '<div class="cal-cell other-month"></div>';
  }

  for (var day = 1; day <= lastDay.getDate(); day++) {
    var isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
    var isSel   = day === calSelectedDay;
    var events  = dayMap[day] || [];
    var evHtml  = events.slice(0,3).map(function(e) {
      return '<span class="cal-event ' + (e.outlier ? 'alert' : e.past ? '' : 'pending') + '">' + e.id.substring(0,7) + '</span>';
    }).join('');
    if (events.length > 3) evHtml += '<span class="cal-event" style="background:var(--surface-2)">+' + (events.length-3) + '</span>';

    html += '<div class="cal-cell' + (isToday?' today':'') + (isSel?' today':'') + '" onclick="selectCalDay(' + day + ',' + JSON.stringify(events) + ')">' +
      '<div class="cal-day-num">' + day + '</div>' + evHtml +
    '</div>';
  }

  document.getElementById('calGrid').innerHTML = html;

  // Show today's appointments by default
  selectCalDay(now.getDate(), dayMap[now.getDate()] || []);
}

function selectCalDay(day, events) {
  calSelectedDay = day;
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calDayLabel').textContent = months[calMonth] + ' ' + day;

  if (!events || events.length === 0) {
    document.getElementById('calDayList').innerHTML = '<p class="text-sm text-muted">No scheduled check-ins this day.</p>';
    return;
  }

  document.getElementById('calDayList').innerHTML = events.map(function(e) {
    var p = MOCK_PATIENTS.find(function(x){ return x.id === e.id; });
    if (!p) return '';
    return '<div class="card card-sm flex items-center gap-12">' +
      '<div style="flex:1">' +
        '<div class="flex items-center gap-8 mb-4">' +
          '<span class="font-mono text-sm font-600">' + e.id + '</span>' +
          (e.outlier ? '<span class="badge badge-red">Alert</span>' : '') +
          (e.past ? '<span class="badge badge-gray">Past</span>' : '<span class="badge badge-amber">Scheduled</span>') +
        '</div>' +
        '<div class="text-xs" style="color:var(--muted)">' + (p.condition || '—') + ' · Severity ' + e.sev + '/10</div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" onclick="selectPatient(\'' + e.id + '\')">View →</button>' +
    '</div>';
  }).join('');

  // Re-render grid to highlight selected day
  renderCalendar();
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
}

// ── Outliers ──────────────────────────────────────────────────
function renderOutliers() {
  var outliers = MOCK_PATIENTS.filter(function(p){ return p.outlier; });
  document.getElementById('outliersList').innerHTML = outliers.length === 0
    ? '<div class="card"><p class="text-sm text-muted">No outliers at this time.</p></div>'
    : outliers.map(function(p) {
      return '<div class="card" style="border:1.5px solid var(--red-border)">' +
        '<div class="flex items-center justify-between mb-12" style="flex-wrap:wrap;gap:8px">' +
          '<div class="flex items-center gap-8">' +
            '<span class="font-mono font-700">' + p.id + '</span>' +
            '<span class="badge badge-red">🚨 Outlier</span>' +
          '</div>' +
          '<div class="flex gap-8">' +
            '<button class="btn btn-ghost btn-sm" onclick="openConfirmModal(\'' + p.id + '\')">View notes</button>' +
            '<button class="btn btn-danger btn-sm" onclick="openOutlierFlag(\'' + p.id + '\')">Schedule follow-up</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<div><div class="text-xs" style="color:var(--subtle)">Condition</div><div class="text-sm mt-2">' + p.condition + '</div></div>' +
          '<div><div class="text-xs" style="color:var(--subtle)">Current severity</div><div class="text-sm font-700 mt-2" style="color:' + severityColor(p.currentSeverity) + '">' + p.currentSeverity + '/10</div></div>' +
          '<div><div class="text-xs" style="color:var(--subtle)">Baseline</div><div class="text-sm mt-2">' + p.baseline + '/10</div></div>' +
          '<div><div class="text-xs" style="color:var(--subtle)">Last check-in</div><div class="text-sm mt-2">' + formatDate(p.lastCheckin) + '</div></div>' +
        '</div>' +
        '<div class="alert alert-danger mt-12" style="font-size:.8rem">' +
          '<span>📈</span>' +
          '<p>Severity increased ' + p.baseline + ' → ' + p.currentSeverity + ' over ' + p.daysTracked + ' days. Immediate follow-up recommended.</p>' +
        '</div>' +
      '</div>';
    }).join('');
}

// ── Real thread confirm modal ─────────────────────────────────
function openRealConfirmModal(ptId, threadId) {
  activePatientId = ptId;
  activeThreadId  = threadId;

  var store = {};
  try { store = JSON.parse(localStorage.getItem('cue_store') || '{}'); } catch(e) {}
  var consultations = (store[ptId] && store[ptId].consultations) || [];
  var t = consultations.find(function(x){ return x.id === threadId; });
  if (!t) return;

  var confirmed = t.doctorReview && t.doctorReview.confirmed;
  var dx  = t.diagResult && t.diagResult.diagnoses && t.diagResult.diagnoses[0];
  var dxName  = dx ? dx.label : 'AI analysis pending';
  var dxConf  = dx ? (dx.confidence || 75) : null;
  var answers = (t.answers || []).slice(0, 8);
  var checkins = t.checkins || [];

  var sevChips = checkins.map(function(c) {
    return '<div style="text-align:center;padding:6px 10px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border)">' +
      '<div style="font-size:.62rem;color:var(--subtle)">' + new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + '</div>' +
      '<div style="font-weight:700;color:' + severityColor(c.severity) + '">' + c.severity + '/10</div>' +
    '</div>';
  }).join('');

  var answerRows = answers.length
    ? answers.map(function(a) {
        return '<div class="info-row"><span class="info-label" style="font-size:.68rem">' + escapeHtml(a.cat||a.question||'Q') + '</span><span class="info-val text-sm">' + escapeHtml(a.text||a.answer||'—') + '</span></div>';
      }).join('')
    : '<p class="text-sm" style="color:var(--muted)">No interview answers recorded.</p>';

  var symptomChips = (t.diagResult && t.diagResult.diagnoses && t.diagResult.diagnoses[0] && t.diagResult.diagnoses[0].symptoms || []).map(function(s) {
    return '<span class="badge badge-gray">' + escapeHtml(s) + '</span>';
  }).join('');

  document.getElementById('modalContent').innerHTML =
    '<div class="flex items-center gap-8 mb-4" style="flex-wrap:wrap">' +
      '<span class="font-mono font-700">' + ptId + '</span>' +
      '<span class="badge badge-gray" style="font-size:.68rem">🔒 Real patient</span>' +
      (confirmed ? '<span class="badge badge-teal">✓ Already confirmed</span>' : '<span class="badge badge-amber">⏳ Awaiting review</span>') +
    '</div>' +
    '<div class="text-xs mb-10" style="color:var(--subtle)">Submitted ' + new Date(t.submittedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) + '</div>' +
    (dx
      ? '<div class="dx-card primary mb-4">' +
          '<div class="flex items-center justify-between mb-6">' +
            '<div><div class="font-600">' + escapeHtml(dxName) + '</div>' +
            (dx.icd ? '<div class="text-xs font-mono" style="color:var(--muted)">ICD-10: ' + dx.icd + '</div>' : '') + '</div>' +
            '<span class="badge badge-teal">AI · ' + dxConf + '%</span>' +
          '</div>' +
          '<div class="flex items-center gap-8"><div class="conf-bar"><div class="conf-fill" style="width:' + dxConf + '%"></div></div><span class="text-xs" style="color:var(--muted)">' + dxConf + '%</span></div>' +
          (symptomChips ? '<div class="flex gap-6 mt-8" style="flex-wrap:wrap">' + symptomChips + '</div>' : '') +
        '</div>'
      : '<div class="card card-sm mb-4"><p class="text-sm" style="color:var(--muted)">AI analysis not yet available.</p></div>') +
    (checkins.length ? '<div class="mb-4"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Severity history</div><div class="flex gap-6" style="flex-wrap:wrap">' + sevChips + '</div></div>' : '') +
    '<div class="mb-4"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Interview answers</div>' + answerRows + '</div>' +
    '<div class="alert alert-warning"><span>⚕️</span><p>Your confirmation is recorded in the audit log with your provider ID and timestamp (HIPAA § 164.312(b)).</p></div>';

  document.getElementById('overridePanel').style.display = 'none';
  document.getElementById('confirmModal').classList.add('open');
  _d.Audit.log('real_consultation_viewed', ptId, { reviewer: _d.Session.id, threadId: threadId });
}

// ── Confirm modal ─────────────────────────────────────────────
function openConfirmModal(patientId) {
  activeThreadId = null;  // clear any real thread context
  activePatientId = patientId;
  selectPatient(patientId);
  var p = MOCK_PATIENTS.find(function(x){ return x.id === patientId; });
  if (!p) return;

  var chips = (p.checkins[0] && p.checkins[0].symptoms || ['Awaiting check-in']).map(function(s) {
    return '<span class="badge badge-gray">' + s + '</span>';
  }).join('');

  var sevChips = p.checkins.map(function(c) {
    return '<div style="text-align:center;padding:6px 10px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border)">' +
      '<div style="font-size:.62rem;color:var(--subtle)">' + new Date(c.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + '</div>' +
      '<div style="font-weight:700;color:' + severityColor(c.severity) + '">' + c.severity + '/10</div>' +
    '</div>';
  }).join('');

  document.getElementById('modalContent').innerHTML =
    '<div class="flex items-center gap-8 mb-4" style="flex-wrap:wrap">' +
      '<span class="font-mono font-700">' + p.id + '</span>' +
      '<span class="badge badge-gray" style="font-size:.68rem">🔒 ID only</span>' +
      (p.outlier ? '<span class="badge badge-red">🚨 Outlier</span>' : '') +
    '</div>' +
    '<div class="dx-card primary mb-4">' +
      '<div class="flex items-center justify-between mb-6">' +
        '<div><div class="font-600">' + p.diagnosis.name + '</div>' +
        '<div class="text-xs font-mono" style="color:var(--muted)">ICD-10: ' + p.diagnosis.icd + '</div></div>' +
        '<span class="badge badge-teal">AI · 82%</span>' +
      '</div>' +
      '<div class="flex items-center gap-8"><div class="conf-bar"><div class="conf-fill" style="width:82%"></div></div><span class="text-xs" style="color:var(--muted)">82%</span></div>' +
    '</div>' +
    (p.checkins.length > 0 ? '<div class="mb-4"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Severity history</div><div class="flex gap-6" style="flex-wrap:wrap">' + sevChips + '</div></div>' : '') +
    '<div class="mb-4"><div class="text-xs" style="color:var(--subtle);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Reported symptoms</div><div class="flex gap-6" style="flex-wrap:wrap">' + chips + '</div></div>' +
    '<div class="alert alert-warning"><span>⚕️</span><p>Your confirmation is recorded in the audit log with your provider ID and timestamp (HIPAA § 164.312(b)).</p></div>';

  document.getElementById('overridePanel').style.display = 'none';
  document.getElementById('confirmModal').classList.add('open');
  _d.Audit.log('consultation_viewed', patientId, { reviewer: _d.Session.id });
}

function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('open'); }

function confirmDiagnosis(action) {
  if (action === 'override') { document.getElementById('overridePanel').style.display = ''; return; }

  // ── Real thread path ──
  if (activeThreadId) {
    if (action === 'confirm') {
      confirmRealThread(activePatientId, activeThreadId);
      _d.Audit.log('real_diagnosis_confirmed', activePatientId, { reviewer: _d.Session.id, threadId: activeThreadId });
      closeConfirmModal();
      renderQueue(); renderRealThreadDetail(activePatientId, activeThreadId); updateCounts();
      showToast('✓ Diagnosis confirmed. Patient can now see their results.');
    }
    if (action === 'defer') {
      _d.Audit.log('real_diagnosis_deferred', activePatientId, { reviewer: _d.Session.id, threadId: activeThreadId });
      closeConfirmModal();
      showToast('⏸ Deferred. Patient will be prompted for more information.');
    }
    return;
  }

  // ── Mock patient path ──
  var p = MOCK_PATIENTS.find(function(x){ return x.id === activePatientId; });
  if (!p) return;
  if (action === 'confirm') {
    p.diagnosis.confirmed = true; p.diagnosis.confirmedBy = _d.Session.id;
    _d.Audit.log('diagnosis_confirmed', activePatientId, { reviewer: _d.Session.id });
    closeConfirmModal(); renderQueue(); renderDetailPanel(activePatientId); updateCounts();
    showToast('✓ Diagnosis confirmed and saved.');
  }
  if (action === 'defer') {
    _d.Audit.log('diagnosis_deferred', activePatientId, { reviewer: _d.Session.id });
    closeConfirmModal(); showToast('⏸ Deferred. Patient will be prompted for more information.');
  }
}

function submitOverride() {
  var dx    = document.getElementById('overrideDx').value.trim();
  var notes = document.getElementById('overrideNotes').value.trim();
  if (!dx) { alert('Please enter your diagnosis.'); return; }

  // ── Real thread path ──
  if (activeThreadId) {
    overrideRealThread(activePatientId, activeThreadId, dx, notes);
    _d.Audit.log('real_diagnosis_overridden', activePatientId, { reviewer: _d.Session.id, threadId: activeThreadId, override: dx });
    closeConfirmModal();
    renderQueue(); renderRealThreadDetail(activePatientId, activeThreadId); updateCounts();
    showToast('✏️ Diagnosis overridden. Patient can now see updated results.');
    return;
  }

  // ── Mock patient path ──
  var p = MOCK_PATIENTS.find(function(x){ return x.id === activePatientId; });
  if (!p) return;
  p.diagnosis.name = dx; p.diagnosis.confirmed = true;
  p.diagnosis.overridden = true; p.diagnosis.confirmedBy = _d.Session.id;
  _d.Audit.log('diagnosis_overridden', activePatientId, { reviewer: _d.Session.id, override: dx });
  closeConfirmModal(); renderQueue(); renderDetailPanel(activePatientId); updateCounts();
  showToast('✏️ Diagnosis overridden and saved.');
}

// ── Outlier modal ─────────────────────────────────────────────
function openOutlierFlag(id) { activePatientId = id; document.getElementById('outlierModal').classList.add('open'); }

function setUrgency(u) {
  selectedUrgency = u;
  var map = { low:'urgLow', medium:'urgMed', high:'urgHigh' };
  ['low','medium','high'].forEach(function(l) {
    var el = document.getElementById(map[l]);
    if (el) { el.classList.remove('btn-outline','btn-primary'); el.classList.add('btn-ghost'); }
  });
  var el = document.getElementById(map[u]);
  if (el) { el.classList.remove('btn-ghost'); el.classList.add('btn-outline'); }
}

function submitOutlierFlag() {
  var reason = document.getElementById('outlierReason').value;
  var notes  = document.getElementById('outlierNotes').value;
  _d.Audit.log('outlier_flagged', activePatientId, { reviewer: _d.Session.id, reason: reason, urgency: selectedUrgency });
  document.getElementById('outlierModal').classList.remove('open');
  showToast('🚨 Flagged. Follow-up scheduled (' + selectedUrgency + ' urgency).');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}
