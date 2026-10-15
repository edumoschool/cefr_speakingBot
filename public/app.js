'use strict';

const tg = window.Telegram && window.Telegram.WebApp;
const initData = (tg && tg.initData) || new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || '';
if (tg) {
  document.documentElement.setAttribute('data-tg', '1');
  tg.ready();
  tg.expand();
  if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
}

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const haptic = (type) => { try { tg && tg.HapticFeedback.notificationOccurred(type); } catch {} };

const state = { me: null, session: null, test: null, stepIndex: 0, stream: null, uploads: [], uploading: Promise.resolve(), tts: true };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'x-telegram-init-data': initData, ...(opts.json ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) },
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  window.scrollTo(0, 0);
  if (tg && tg.BackButton) {
    if (['result', 'vocab', 'ready'].includes(name)) tg.BackButton.show();
    else tg.BackButton.hide();
  }
}

function fail(message) {
  $('#error-text').textContent = message;
  show('error');
}

function alertMsg(text) {
  if (tg && tg.showAlert) tg.showAlert(text);
  else alert(text);
}

// ---------------------------------------------------------------- home
async function loadHome() {
  if (!initData) return fail('Please open this app from the Telegram bot.');
  show('loading');
  try {
    state.me = await api('/api/me', { method: 'POST' });
  } catch (e) {
    return fail(e.message);
  }
  const me = state.me;
  if (!me.isMember) return show('gate');
  renderHome();
  const m = /result=([0-9a-f-]{36})/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname);
    return openResult(m[1]);
  }
  show('home');
}

function renderHome() {
  const me = state.me;
  $('#hello').textContent = `Hi, ${me.user.firstName || 'there'}! Practise with real exam questions and get an instant score.`;
  $('#attempts').textContent = me.user.attempts;
  const btn = $('#start-btn');
  if (me.active) {
    btn.textContent = me.active.status === 'grading' ? 'See result' : 'Continue mock';
    btn.disabled = false;
    $('#start-hint').textContent = `Unfinished: ${me.active.testTitle} (${me.active.answered.length} answers recorded)`;
  } else {
    btn.textContent = 'Start mock';
    btn.disabled = me.user.attempts < 1;
    $('#start-hint').textContent = me.user.attempts < 1 ? 'No attempts left — invite friends below to earn more.' : '';
  }
  const r = me.referral;
  $('#ref-rule').textContent = `Every ${r.per} friends who join the channel through your link give you +1 mock.`;
  $('#ref-dots').innerHTML = Array.from({ length: r.per }, (_, i) => `<div class="dot ${i < r.progress ? 'on' : ''}"></div>`).join('');
  $('#ref-count').textContent = `${r.progress}/${r.per} towards your next mock · ${r.qualified} friend(s) joined in total`;
  $('#ref-link').textContent = r.link;
  $('#history-card').hidden = !me.history.length;
  $('#history').innerHTML = me.history
    .map(
      (h) => `<div class="hist" data-result="${h.id}">
        <div><div>${esc(h.title)}</div><div class="muted small">${new Date(h.date).toLocaleDateString()}</div></div>
        <div><b>${h.score}</b>/75 <span class="badge ${esc(h.level.split(' ')[0])}">${esc(h.level)}</span></div></div>`,
    )
    .join('');
}

function share() {
  const r = state.me.referral;
  const text = '🎤 Practise the Multilevel speaking exam with instant AI scoring — your first mock is free!';
  const url = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(state.me.referral.link);
    haptic('success');
    alertMsg('Link copied!');
  } catch {
    alertMsg(state.me.referral.link);
  }
}

// ---------------------------------------------------------------- exam
async function startOrResume() {
  if (state.me.active && state.me.active.status === 'grading') return finishExam(state.me.active.id);
  $('#ready-title').textContent = state.me.active ? 'Continue your mock' : 'Ready to start?';
  show('ready');
}

async function begin() {
  state.tts = $('#tts-toggle').checked;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return alertMsg('Microphone access is needed for the speaking test. Please allow it and try again.');
  }
  show('loading');
  let data;
  try {
    data = await api('/api/mock/start', { method: 'POST' });
  } catch (e) {
    stopStream();
    if (e.code === 'not_member') return show('gate');
    alertMsg(e.message);
    return loadHome();
  }
  state.session = data.session;
  state.test = data.test;
  const answered = new Set(data.answered);
  state.stepIndex = state.test.steps.findIndex((s) => !answered.has(s.key));
  if (state.stepIndex === -1) return finishExam(state.session.id);
  if (tg && tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  show('exam');
  runStep();
}

function stopStream() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function renderStep(step) {
  const steps = state.test.steps;
  $('#part-label').textContent = `Part ${step.part}`;
  $('#step-counter').textContent = `${state.stepIndex + 1} / ${steps.length}`;
  $('#progress-bar').style.width = `${(state.stepIndex / steps.length) * 100}%`;
  let html = '';
  if (step.part === '2') {
    html += picsHtml(step.images);
    html += `<ul class="bullets">${step.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  } else if (step.part === '3') {
    const t = step.table;
    html += `<div class="debate"><h3>${esc(t.statement)}</h3><div class="cols">
      <div class="col for"><b>FOR</b><ul>${t.for.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="col against"><b>AGAINST</b><ul>${t.against.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div>`;
  } else {
    html += `<div class="question">${esc(step.question)}</div>`;
    html += picsHtml(step.images);
  }
  $('#exam-body').innerHTML = html;
}

function picsHtml(images) {
  if (!images || !images.length) return '';
  return `<div class="pics ${images.length === 1 ? 'one' : ''}">${images.map((src) => `<img src="${esc(src)}" alt="" />`).join('')}</div>`;
}

let timer = null;
let phaseDone = null;

function countdown(seconds, onTick) {
  clearInterval(timer);
  const end = performance.now() + seconds * 1000;
  return new Promise((resolve) => {
    phaseDone = () => { clearInterval(timer); phaseDone = null; resolve(); };
    const tick = () => {
      const left = Math.max(0, (end - performance.now()) / 1000);
      onTick(left, seconds);
      if (left <= 0) phaseDone && phaseDone();
    };
    tick();
    timer = setInterval(tick, 200);
  });
}

function paintTimer(left, total) {
  const s = Math.ceil(left);
  $('#time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#ring').style.strokeDashoffset = String(326.7 * (1 - left / total));
}

function speak(text) {
  if (!state.tts || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch {}
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    o.onended = () => ctx.close();
  } catch {}
}

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

async function runStep() {
  const step = state.test.steps[state.stepIndex];
  renderStep(step);
  const wrap = $('.timer-wrap');
  const btn = $('#exam-btn');

  // Preparation
  wrap.classList.remove('recording');
  $('#phase').textContent = 'Preparation';
  btn.textContent = 'Start speaking now';
  speak(step.part === '2' ? step.bullets.join('. ') : step.part === '3' ? step.table.statement : step.question);
  await countdown(step.prepSec, paintTimer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();

  // Recording
  beep();
  haptic('warning');
  wrap.classList.add('recording');
  $('#phase').textContent = 'Speak now';
  btn.textContent = 'Finish answer';
  const mimeType = pickMime();
  const rec = new MediaRecorder(state.stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(1000);
  await countdown(step.speakSec, paintTimer);
  rec.stop();
  await stopped;
  const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
  queueUpload(step.key, blob);

  state.stepIndex++;
  if (state.stepIndex < state.test.steps.length) runStep();
  else finishExam(state.session.id);
}

function queueUpload(key, blob) {
  const sessionId = state.session.id;
  state.uploading = state.uploading.then(async () => {
    $('#upload-status').textContent = 'Saving your answer…';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await api(`/api/mock/answer?session=${sessionId}&key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'content-type': blob.type },
          body: blob,
        });
        $('#upload-status').textContent = '';
        return;
      } catch (e) {
        if (e.status && e.status < 500) break; // not retryable
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    $('#upload-status').textContent = 'One answer could not be saved — it will be skipped.';
  });
}

async function finishExam(sessionId) {
  clearInterval(timer);
  stopStream();
  if (tg && tg.disableClosingConfirmation) tg.disableClosingConfirmation();
  show('grading');
  $('#grading-text').textContent = 'Saving your last answers…';
  await state.uploading;
  $('#grading-text').textContent = 'Our AI examiner is checking fluency, vocabulary, grammar, pronunciation and task response. This takes up to a minute.';
  try {
    const data = await api('/api/mock/finish', { method: 'POST', json: { session: sessionId } });
    haptic('success');
    renderResult(data.result);
    show('result');
    refreshMeSilently();
  } catch (e) {
    alertMsg(e.message);
    loadHome();
  }
}

async function refreshMeSilently() {
  try {
    state.me = await api('/api/me', { method: 'POST' });
    renderHome();
  } catch {}
}

// ---------------------------------------------------------------- results
async function openResult(id) {
  show('loading');
  try {
    const data = await api(`/api/mock/result?id=${id}`);
    renderResult(data.result);
    show('result');
  } catch (e) {
    alertMsg(e.message);
    show('home');
  }
}

const CRIT = {
  fluency_coherence: 'Fluency & coherence',
  lexical_resource: 'Vocabulary',
  grammar: 'Grammar',
  pronunciation: 'Pronunciation',
  task_response: 'Task response',
};

function renderResult(r) {
  const list = (items) => (items && items.length ? `<ul class="plain">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  let html = `<div class="card score-card">
    <div class="muted small">${esc(r.testTitle)}</div>
    <div class="score-ring">${r.score}<small>/75</small></div>
    <div class="level">Level: <span class="badge ${esc(r.level.split(' ')[0])}">${esc(r.level)}</span></div>
    <p class="muted small">B1 38–50 · B2 51–64 · C1 65–75</p>
  </div>`;

  html += `<div class="card"><div class="card-title">Criteria</div>${Object.entries(r.criteria)
    .map(([k, v]) => `<div class="bar"><div class="bar-top"><span>${CRIT[k] || k}</span><b>${v}/75</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v / 75) * 100}%"></div></div></div>`)
    .join('')}</div>`;

  html += `<div class="card"><div class="card-title">Examiner feedback</div><p>${esc(r.overall)}</p>
    ${r.strengths && r.strengths.length ? `<b>✅ Strengths</b>${list(r.strengths)}` : ''}
    ${r.priorities && r.priorities.length ? `<b>🎯 Focus next</b>${list(r.priorities)}` : ''}</div>`;

  html += `<div class="card"><div class="card-title">By part</div>${r.parts
    .map((p) => `<details><summary><span class="part-row"><span>Part ${p.part}</span><b>${Math.round(p.points)}/75</b></span></summary>
      <div class="chips">${Object.entries(p.criteria).map(([k, v]) => `<span class="chip">${CRIT[k] || k}: ${esc(v)}</span>`).join('')}</div>
      <p class="small">${esc(p.feedback)}</p></details>`)
    .join('')}</div>`;

  if (r.corrections && r.corrections.length) {
    html += `<div class="card"><div class="card-title">✍️ Grammar fixes</div>${r.corrections
      .map((c) => `<div class="fix"><div class="orig">${esc(c.original)}</div><div class="corr">${esc(c.corrected)}</div><div class="muted small">${esc(c.explanation)}</div></div>`)
      .join('')}</div>`;
  }
  if (r.vocabulary && r.vocabulary.length) {
    html += `<div class="card"><div class="card-title">📈 Vocabulary upgrades</div>${r.vocabulary
      .map((v) => `<div class="vocab-row"><span class="muted">${esc(v.basic)} →</span><b>${esc(v.better)}</b><span class="muted small" style="grid-column:1/-1">${esc(v.example)}</span></div>`)
      .join('')}</div>`;
  }
  if (r.pronunciation && r.pronunciation.length) {
    html += `<div class="card"><div class="card-title">🗣 Pronunciation</div>${list(r.pronunciation)}</div>`;
  }

  html += `<div class="card"><div class="card-title">Your answers</div>${r.answers
    .map((a) => {
      const m = a.metrics;
      return `<details><summary>Part ${a.part} · ${esc(a.question)}</summary>
        ${a.transcript === null ? '<p class="muted small">Not recorded.</p>' : `<div class="transcript">${esc(a.transcript || '(no speech detected)')}</div>`}
        ${m ? `<div class="chips"><span class="chip">${m.wordCount} words</span><span class="chip">${m.wpm} wpm</span><span class="chip">${m.pauses} pauses</span><span class="chip">${m.fillers} fillers</span></div>` : ''}
        ${a.comment ? `<p class="small">${esc(a.comment)}</p>` : ''}
        ${a.modelAnswer ? `<div class="muted small">Model answer</div><div class="transcript model">${esc(a.modelAnswer)}</div>` : ''}
      </details>`;
    })
    .join('')}</div>`;
  html += `<p class="hint">Scores are an AI estimate for practice, not an official result.</p>`;
  $('#result').innerHTML = html;
}

// ---------------------------------------------------------------- vocabulary
async function openVocab() {
  show('vocab');
  if ($('#vocab').dataset.loaded) return;
  try {
    const parts = await (await fetch('/data/vocabulary.json')).json();
    $('#vocab').innerHTML = parts
      .map((p) => `<details class="card"><summary>${esc(p.title)} · ${p.words.length} words</summary>
        <table class="vocab-table">${p.words.map((w) => `<tr><td>${esc(w.en)}</td><td>${esc(w.uz)}</td><td>${esc(w.ru)}</td></tr>`).join('')}</table></details>`)
      .join('');
    $('#vocab').dataset.loaded = '1';
  } catch {
    $('#vocab').textContent = 'Could not load vocabulary.';
  }
}

// ---------------------------------------------------------------- wiring
document.addEventListener('click', (e) => {
  const hist = e.target.closest('[data-result]');
  if (hist) return openResult(hist.dataset.result);
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const actions = {
    reload: loadHome,
    home: () => { renderHome(); show('home'); },
    'open-channel': () => (tg && tg.openTelegramLink && /^https:\/\/t\.me\//.test(state.me.channelUrl) ? tg.openTelegramLink(state.me.channelUrl) : window.open(state.me.channelUrl, '_blank')),
    start: startOrResume,
    begin,
    share,
    copy: copyLink,
    vocab: openVocab,
    'exam-next': () => phaseDone && phaseDone(),
  };
  if (actions[action]) actions[action]();
});

if (tg && tg.BackButton) tg.BackButton.onClick(() => { if (state.me) { renderHome(); show('home'); } });

loadHome();
