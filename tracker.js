/* ============================================================
   Cue — Symptom Tracker (embedded in patient.html sec4)
   ============================================================ */

const _t = window.CUE;

let currentPatient = null;
let logRecording   = false;
let checkinStep    = 0;
let checkinAnswers = [];
let checkinQuestions = [];

// Called by patient.js DOMContentLoaded
function initTracker() {
  currentPatient = MOCK_PATIENTS.find(function(p) { return p.id === _t.Session.id; }) || MOCK_PATIENTS[0];
  document.getElementById('logPatientId').textContent = _t.Session.id;
  updateNextCheckin();
  renderTimeline();
  loadCheckinQuestions();
  // Draw chart when section becomes visible
  var pill4 = document.getElementById('pill4');
  if (pill4) {
    var orig = pill4.onclick;
    pill4.onclick = function() { if (typeof orig === 'function') orig(); setTimeout(renderChart, 100); };
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // tracker.js may load before or after patient.js; guard
  if (!window._trackerInitQueued) {
    window._trackerInitQueued = true;
    // patient.js calls initTracker() from its own DOMContentLoaded
    // but if this script loads standalone, init here
    if (typeof _p !== 'undefined' && _p && _p.Session) {
      initTracker();
    }
  }
});

function loadCheckinQuestions() {
  var stored = _t.Store.get(_t.Session.id);
  var condKey = (stored && stored.consultation && stored.consultation.diagnosis &&
    stored.consultation.diagnosis.diagnoses &&
    stored.consultation.diagnosis.diagnoses[0] &&
    stored.consultation.diagnosis.diagnoses[0].conditionKey) || 'default';
  checkinQuestions = (_t.CHECKIN_QUESTIONS[condKey] || _t.CHECKIN_QUESTIONS.default).slice();
}

function updateNextCheckin() {
  if (!currentPatient) return;
  var ms = 1000*60*60*48 - (Date.now() - currentPatient.lastCheckin);
  var el = document.getElementById('trakNext');
  if (!el) return;
  if (ms <= 0) { el.textContent = 'Due now'; return; }
  var h = Math.floor(ms / 3600000);
  el.textContent = h + 'h';
}

// ── Timeline ─────────────────────────────────────────────────
function renderTimeline(filter) {
  filter = filter || 'all';
  if (!currentPatient) return;
  var p = currentPatient;
  var list = filter === 'outlier'   ? p.checkins.filter(function(c){return c.outlier;})
           : filter === 'improving' ? p.checkins.filter(function(c){return c.severity < (p.baseline||7);})
           : p.checkins;

  var el = document.getElementById('timelineList');
  if (!el) return;
  if (list.length === 0) { el.innerHTML = '<p class="text-sm text-muted">No entries match this filter.</p>'; return; }

  el.innerHTML = list.slice().reverse().map(function(c) {
    return '<div class="tl-item ' + (c.outlier ? 'outlier' : '') + '">' +
      '<div class="tl-dot"></div>' +
      '<div class="tl-date">' + formatDate(c.date) + '</div>' +
      '<div class="tl-card">' +
        '<div class="flex items-center justify-between mb-6" style="flex-wrap:wrap;gap:6px">' +
          '<div class="flex gap-6" style="flex-wrap:wrap">' +
            c.symptoms.map(function(s) { return '<span class="badge badge-gray">' + s + '</span>'; }).join('') +
          '</div>' +
          '<div class="flex gap-6">' +
            (c.outlier ? '<span class="badge badge-red">🚨 Outlier</span>' : '') +
            '<span class="badge ' + (c.severity<=3?'badge-green':c.severity<=6?'badge-amber':'badge-red') + '">' + severityLabel(c.severity) + ' ' + c.severity + '/10</span>' +
          '</div>' +
        '</div>' +
        '<p class="text-sm">' + c.notes + '</p>' +
        (c.outlier ? '<div class="alert alert-danger mt-8" style="font-size:.78rem"><span>🩺</span><p>Doctor has been notified. Follow-up scheduled.</p></div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function filterTimeline(val) { renderTimeline(val); }

// ── Chart ─────────────────────────────────────────────────────
function renderChart() {
  if (!currentPatient) return;
  var canvas = document.getElementById('severityChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 580;
  canvas.height = 160;
  var W = canvas.width, H = canvas.height;
  var pad = { top:16, right:16, bottom:36, left:36 };
  var data = currentPatient.checkins.map(function(c){return c.severity;});
  var threshold = 6;

  ctx.clearRect(0,0,W,H);

  var xStep  = (W - pad.left - pad.right) / Math.max(data.length - 1, 1);
  var yScale = function(v) { return pad.top + (10 - v) / 10 * (H - pad.top - pad.bottom); };

  // Grid
  ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1;
  for (var v = 0; v <= 10; v += 2) {
    var y = yScale(v);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#9CA3AF'; ctx.font = '10px Inter'; ctx.textAlign = 'right';
    ctx.fillText(v, pad.left - 5, y + 3);
  }

  // Threshold
  ctx.setLineDash([5,4]); ctx.strokeStyle = '#DC2626'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, yScale(threshold)); ctx.lineTo(W - pad.right, yScale(threshold)); ctx.stroke();
  ctx.setLineDash([]);

  // Area
  ctx.beginPath();
  ctx.moveTo(pad.left, yScale(data[0]));
  data.forEach(function(val, i) { ctx.lineTo(pad.left + i * xStep, yScale(val)); });
  ctx.lineTo(pad.left + (data.length-1)*xStep, H - pad.bottom);
  ctx.lineTo(pad.left, H - pad.bottom); ctx.closePath();
  ctx.fillStyle = 'rgba(13,148,136,.07)'; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = '#0D9488'; ctx.lineWidth = 2;
  data.forEach(function(val, i) {
    var x = pad.left + i * xStep, y2 = yScale(val);
    i === 0 ? ctx.moveTo(x,y2) : ctx.lineTo(x,y2);
  });
  ctx.stroke();

  // Points
  data.forEach(function(val, i) {
    var x = pad.left + i * xStep, y2 = yScale(val);
    ctx.beginPath(); ctx.arc(x, y2, val>=8?6:4, 0, Math.PI*2);
    ctx.fillStyle = val>=8 ? '#DC2626' : '#0D9488'; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
  });

  // X labels
  ctx.fillStyle = '#9CA3AF'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  data.forEach(function(_, i) { ctx.fillText('D'+(i+1), pad.left + i*xStep, H-8); });
}

// ── Log modal ─────────────────────────────────────────────────
function openLogModal() {
  loadCheckinQuestions();
  document.getElementById('logModal').classList.add('open');
  buildCheckinChat();
}
function closeLogModal() { document.getElementById('logModal').classList.remove('open'); }

function buildCheckinChat() {
  checkinStep = 0; checkinAnswers = [];
  var box = document.getElementById('checkinChat');
  box.innerHTML = '';
  document.getElementById('checkinInput').value = '';
  document.getElementById('checkinProgress').style.width = '0%';
  document.getElementById('checkinProgressLabel').textContent = '0 / ' + checkinQuestions.length;
  document.getElementById('checkinSubmitRow').style.display = 'none';
  document.getElementById('checkinCancelRow').style.display = '';
  addCheckinBubble(checkinQuestions[0] || 'How are you feeling today?');
}

function addCheckinBubble(text) {
  var box = document.getElementById('checkinChat');
  var typing = document.createElement('div');
  typing.className = 'chat-row';
  typing.innerHTML = '<div class="avatar ai">🤖</div><div class="bubble ai typing"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  box.appendChild(typing);
  box.scrollTop = box.scrollHeight;
  setTimeout(function() {
    box.removeChild(typing);
    var wrap = document.createElement('div');
    wrap.className = 'chat-row';
    wrap.innerHTML = '<div class="avatar ai">🤖</div><div class="bubble ai">' + text + '</div>';
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }, 450);
}

function addCheckinUserBubble(text) {
  var box = document.getElementById('checkinChat');
  var wrap = document.createElement('div');
  wrap.className = 'chat-row user';
  wrap.innerHTML = '<div class="bubble user">' + text + '</div><div class="avatar user">👤</div>';
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

function sendCheckinTyped() {
  var input = document.getElementById('checkinInput');
  var val = input.value.trim();
  if (!val) return;
  input.value = '';
  sendCheckinAnswer(val);
}

function sendCheckinAnswer(text) {
  addCheckinUserBubble(text);
  checkinAnswers.push({ question: checkinQuestions[checkinStep], answer: text });
  checkinStep++;
  var pct = (checkinStep / checkinQuestions.length * 100).toFixed(0);
  document.getElementById('checkinProgress').style.width = pct + '%';
  document.getElementById('checkinProgressLabel').textContent = checkinStep + ' / ' + checkinQuestions.length;
  if (checkinStep < checkinQuestions.length) {
    setTimeout(function() { addCheckinBubble(checkinQuestions[checkinStep]); }, 400);
  } else {
    setTimeout(function() {
      addCheckinBubble('Thank you — that\'s all I need. Please rate your overall discomfort below and save your entry.');
      document.getElementById('checkinSubmitRow').style.display = '';
      document.getElementById('checkinCancelRow').style.display = 'none';
    }, 400);
  }
}

async function toggleLogRecording() {
  if (logRecording) {
    logRecording = false;
    document.getElementById('logRecordBtn').classList.remove('recording');
    document.getElementById('logRecordBtn').textContent = '🎙️';
    document.getElementById('logWaveform').classList.add('idle');
    var text = await _t.transcribeAudio('en', checkinStep);
    document.getElementById('checkinInput').value = text;
    sendCheckinTyped();
  } else {
    logRecording = true;
    document.getElementById('logRecordBtn').classList.add('recording');
    document.getElementById('logRecordBtn').textContent = '⏹';
    document.getElementById('logWaveform').classList.remove('idle');
    setTimeout(function() { if (logRecording) toggleLogRecording(); }, 5000);
  }
}

function submitLog() {
  var severity = +document.getElementById('overallSeverity').value;
  var notes    = document.getElementById('logNotes').value.trim();
  var answersText = checkinAnswers.map(function(a) { return a.question + '\n→ ' + a.answer; }).join('\n\n');

  var sympSet = new Set();
  checkinAnswers.forEach(function(a) {
    var t = a.answer.toLowerCase();
    if (t.includes('head') || t.includes('migrain')) sympSet.add('Headache');
    if (t.includes('naus') || t.includes('sick'))    sympSet.add('Nausea');
    if (t.includes('fever') || t.includes('temp'))   sympSet.add('Fever');
    if (t.includes('tired') || t.includes('fatigue'))sympSet.add('Fatigue');
    if (t.includes('pain') || t.includes('ache'))    sympSet.add('Pain');
  });
  var symptoms = sympSet.size > 0 ? Array.from(sympSet) : ['General check-in'];

  var entry = {
    id: 'CI-' + Date.now(), date: Date.now(), severity: severity,
    symptoms: symptoms,
    notes: answersText || notes || 'Patient self-log.',
    lang: 'en', outlier: severity >= 8,
  };

  if (currentPatient) currentPatient.checkins.push(entry);
  _t.Audit.log('checkin_logged', _t.Session.id, { severity: severity, outlier: entry.outlier });

  closeLogModal();
  renderTimeline();
  setTimeout(renderChart, 100);
  if (entry.outlier) alert('⚠️ High severity detected. Your doctor has been notified and will review shortly.');
}
