/* AstroAura "Find My Perfect Match" quiz — branching + live Vedic remedies API */
(function () {
  'use strict';
  try { window.AA_QUIZ_VERSION = 'quiz-v5-api'; } catch (e) {}

  var API_URL = 'https://ieakxiipnpwvyvpsjnkl.supabase.co/functions/v1/public-remedies-api';
  var API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllYWt4aWlwbnB3dnl2cHNqbmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxOTA4NzcsImV4cCI6MjA3MDc2Njg3N30.R_seea1Eefbitn2ZI-ye0oASLsoazA7lynGTk7B1pH4';

  var GOAL_TITLE = {
    wealth: 'Wealth & Success', love: 'Love & Harmony', health: 'Health & Healing',
    protection: 'Protection & Calm', spiritual: 'Spiritual Growth', confidence: 'Confidence & Drive'
  };
  var GOALS = [
    { v: 'wealth', t: 'Wealth & Success', d: 'Money, career and growth' },
    { v: 'love', t: 'Love & Harmony', d: 'Connection and relationships' },
    { v: 'health', t: 'Health & Healing', d: 'Energy, vitality and recovery' },
    { v: 'protection', t: 'Protection & Calm', d: 'A shield from negativity and stress' },
    { v: 'spiritual', t: 'Spiritual Growth', d: 'Clarity, meditation and awakening' },
    { v: 'confidence', t: 'Confidence & Drive', d: 'Self-worth and willpower' }
  ];
  /* goal -> two follow-up questions that refine the remedy (steps 2 & 3) */
  var GOAL_FOLLOWUPS = {
    wealth: [
      { kicker: 'STEP 2 · YOUR MONEY FOCUS', q: 'What is your money focus?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'business', t: 'Business growth' }, { v: 'career', t: 'Career & job' },
        { v: 'debt', t: 'Clearing debts & blockages' }, { v: 'savings', t: 'Savings & stability' },
        { v: 'opportunity', t: 'New opportunities' } ] },
      { kicker: 'STEP 3 · THE OBSTACLE', q: 'What is slowing it down?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'leaks', t: 'Money flows out fast' }, { v: 'stuck', t: 'Stuck, no growth' },
        { v: 'disputes', t: 'Legal or financial disputes' }, { v: 'noluck', t: 'Lack of opportunities' },
        { v: 'fear', t: 'Fear of investing' } ] }
    ],
    love: [
      { kicker: 'STEP 2 · YOUR HEART', q: 'What does your heart want?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'find', t: 'Find a partner' }, { v: 'deepen', t: 'Deepen my bond' },
        { v: 'marriage', t: 'Marriage & commitment' }, { v: 'heal', t: 'Heal after heartbreak' },
        { v: 'family', t: 'Family harmony' } ] },
      { kicker: 'STEP 3 · THE OBSTACLE', q: 'What is in the way?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'distance', t: 'Distance & misunderstanding' }, { v: 'noprospect', t: 'No prospects' },
        { v: 'resistance', t: 'Family resistance' }, { v: 'trust', t: 'Trust issues' },
        { v: 'lonely', t: 'Loneliness' } ] }
    ],
    health: [
      { kicker: 'STEP 2 · YOUR HEALTH', q: 'Which area of health?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'energy', t: 'Energy & vitality' }, { v: 'chronic', t: 'A chronic issue' },
        { v: 'mental', t: 'Mental peace' }, { v: 'recovery', t: 'Recovery & immunity' },
        { v: 'sleep', t: 'Sleep & stress' } ] },
      { kicker: 'STEP 3 · HOW IT SHOWS', q: 'How does it show up?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'fatigue', t: 'Constant fatigue' }, { v: 'illness', t: 'Recurring illness' },
        { v: 'anxiety', t: 'Anxiety & overthinking' }, { v: 'slow', t: 'Slow recovery' },
        { v: 'poorsleep', t: 'Poor sleep' } ] }
    ],
    protection: [
      { kicker: 'STEP 2 · YOUR SHIELD', q: 'Protection from what?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'evileye', t: 'Evil eye & negativity' }, { v: 'fear', t: 'Anxiety & fear' },
        { v: 'badluck', t: 'A bad-luck streak' }, { v: 'toxic', t: 'Toxic people' },
        { v: 'overthink', t: 'Overthinking' } ] },
      { kicker: 'STEP 3 · WHERE', q: 'Where do you feel it most?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'home', t: 'At home' }, { v: 'work', t: 'At work' },
        { v: 'relations', t: 'In relationships' }, { v: 'body', t: 'In my health' },
        { v: 'everywhere', t: 'Everywhere' } ] }
    ],
    spiritual: [
      { kicker: 'STEP 2 · YOUR PATH', q: 'What is your spiritual goal?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'meditation', t: 'Deeper meditation' }, { v: 'clarity', t: 'Clarity & focus' },
        { v: 'karmic', t: 'Karmic healing' }, { v: 'divine', t: 'Divine connection' },
        { v: 'peace', t: 'Inner peace' } ] },
      { kicker: 'STEP 3 · YOUR PRACTICE', q: 'Your current practice?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'starting', t: 'Just starting out' }, { v: 'sometimes', t: 'Meditate sometimes' },
        { v: 'daily', t: 'Daily sadhana' }, { v: 'blocked', t: 'Feeling blocked' },
        { v: 'guidance', t: 'Seeking guidance' } ] }
    ],
    confidence: [
      { kicker: 'STEP 2 · YOUR DRIVE', q: 'Where do you need confidence?', sub: 'So we tune the remedy to the right area.', opts: [
        { v: 'leadership', t: 'Career & leadership' }, { v: 'speaking', t: 'Public speaking' },
        { v: 'selfworth', t: 'Self-worth' }, { v: 'decisions', t: 'Decision-making' },
        { v: 'newstart', t: 'Starting something new' } ] },
      { kicker: 'STEP 3 · WHAT HOLDS YOU', q: 'What holds you back?', sub: 'This single answer shapes your remedy the most.', opts: [
        { v: 'doubt', t: 'Self-doubt' }, { v: 'failure', t: 'Fear of failure' },
        { v: 'lowenergy', t: 'Low energy' }, { v: 'opinions', t: "Others' opinions" },
        { v: 'setbacks', t: 'Past setbacks' } ] }
    ]
  };
  var STEP_COUNT = 5;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function priceTag(n) { var x = Math.round(Number(n) || 0); return 'Rs. ' + x.toLocaleString('en-IN'); }
  function imgU(u) { u = u || ''; if (!u) return ''; if (u.indexOf('//') === 0) u = 'https:' + u; return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'width=500'; }
  function handleOf(url) { if (!url) return ''; var m = ('' + url).split('/products/')[1]; return m ? m.split('?')[0].split('#')[0] : ''; }
  function cap(s) { s = '' + (s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function mdInline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
  function mdToHtml(md) {
    var lines = ('' + (md || '')).split('\n'); var out = ''; var inList = false;
    lines.forEach(function (ln) {
      ln = ln.trim();
      if (!ln) { if (inList) { out += '</ul>'; inList = false; } return; }
      if (ln.indexOf('- ') === 0) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + mdInline(ln.slice(2)) + '</li>'; }
      else { if (inList) { out += '</ul>'; inList = false; } out += '<p>' + mdInline(ln) + '</p>'; }
    });
    if (inList) out += '</ul>';
    return out;
  }
  function normPhone(p) {
    p = ('' + (p || '')).trim().replace(/[\s\-()]/g, '');
    if (/^\+\d{8,15}$/.test(p)) return p;
    if (/^\d{10}$/.test(p)) return '+91' + p;
    if (/^0\d{10}$/.test(p)) return '+91' + p.slice(1);
    if (/^91\d{10}$/.test(p)) return '+' + p;
    return null;
  }

  /* ---------- daily usage limit (disabled while finalising; flip to true to re-enable) ---------- */
  var QUIZ_LIMIT = 1, QUIZ_LIMIT_ENABLED = false;
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function usage() { try { var u = JSON.parse(localStorage.getItem('aa_quiz_usage') || '{}'); if (!u || u.date !== todayKey()) return { date: todayKey(), n: 0 }; return u; } catch (e) { return { date: todayKey(), n: 0 }; } }
  function bumpUsage() { try { var u = usage(); localStorage.setItem('aa_quiz_usage', JSON.stringify({ date: todayKey(), n: (u.n || 0) + 1 })); } catch (e) {} }
  function limitReached() { return QUIZ_LIMIT_ENABLED && (usage().n || 0) >= QUIZ_LIMIT; }

  /* ---- API rate-limit cooldown: remember a 429 so taps show the half-sheet message,
         and the full quiz only opens when it will actually work ---- */
  function cooldownUntil() { try { return parseInt(localStorage.getItem('aa_quiz_cd') || '0', 10) || 0; } catch (e) { return 0; } }
  function setCooldown(sec) { try { localStorage.setItem('aa_quiz_cd', String(Date.now() + ((sec || 3600) * 1000))); } catch (e) {} }
  function clearCooldown() { try { localStorage.removeItem('aa_quiz_cd'); } catch (e) {} }
  function inCooldown() { return cooldownUntil() > Date.now(); }
  function cooldownMins() { var ms = cooldownUntil() - Date.now(); return ms > 0 ? Math.max(1, Math.ceil(ms / 60000)) : 60; }

  function continueInApp() {
    try { if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'close', reason: 'quiz_limit', upsell: 'aura_chat' })); } catch (e) {}
    try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.aura) window.webkit.messageHandlers.aura.postMessage({ type: 'close', reason: 'quiz_limit' }); } catch (e) {}
    closeQuiz();
    setTimeout(function () { try { window.location.href = 'aura://close'; } catch (e) {} }, 80);
  }

  var root, body, progress, stepCount, nextBtn, backBtn, resultsBox;
  var state = { i: 0, ans: {} };
  function refs() {
    root = document.getElementById('aa-quiz'); if (!root) return false;
    body = root.querySelector('[data-quiz-body]');
    progress = root.querySelector('[data-quiz-progress]');
    stepCount = root.querySelector('[data-quiz-stepcount]');
    nextBtn = root.querySelector('[data-quiz-next]');
    backBtn = root.querySelector('[data-quiz-back]');
    resultsBox = root.querySelector('[data-quiz-results]');
    return true;
  }
  function showScreen(name) {
    root.querySelectorAll('[data-quiz-screen]').forEach(function (s) { s.hidden = s.getAttribute('data-quiz-screen') !== name; });
    root.classList.toggle('is-full', name === 'flow' || name === 'results');
  }
  function showLimit(mins) {
    mins = mins || cooldownMins();
    var boxEl = root.querySelector('[data-quiz-screen="limit"] .aa-quiz__intro-in');
    if (boxEl) {
      boxEl.innerHTML =
        '<span class="aa-quiz__kicker">You’re out of readings</span>' +
        '<h2 class="aa-quiz__h">Come back in a <em>little while</em></h2>' +
        '<p class="aa-quiz__lede">You’ve used your free readings for now. Try again in about ' + mins + ' minute' + (mins > 1 ? 's' : '') + ', or continue your journey inside the Aura AI app.</p>' +
        '<button type="button" class="aa-quiz__cta" data-quiz-continue-app>Continue in Aura AI app <span aria-hidden="true">→</span></button>' +
        '<p class="aa-quiz__fine">Unlimited guidance inside the Aura AI app</p>';
    }
    showScreen('limit');
  }
  function openQuiz() {
    if (!refs()) return;
    root.hidden = false; root.setAttribute('aria-hidden', 'false');
    if (inCooldown()) showLimit(cooldownMins());
    else showScreen('intro');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { root.classList.add('is-open'); });
  }
  function closeQuiz() {
    if (!root) return;
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { root.hidden = true; root.setAttribute('aria-hidden', 'true'); root.classList.remove('is-full'); }, 480);
  }
  function startFlow() { state.i = 0; state.ans = {}; showScreen('flow'); renderStep(); }

  function stepDef(i) {
    if (i === 0) return { type: 'list', key: 'goal', kicker: 'STEP 1 · YOUR INTENT', q: 'What do you want to invite in?', sub: 'There are no wrong answers. Choose what your heart leans toward today.', opts: GOALS };
    if (i === 1 || i === 2) {
      var fu = (GOAL_FOLLOWUPS[state.ans.goal] || [])[i - 1] || { q: 'Tell us more', sub: '', opts: [] };
      return { type: 'list', key: 'f' + i, kicker: fu.kicker, q: fu.q, sub: fu.sub, opts: fu.opts };
    }
    if (i === 3) return { type: 'birth', kicker: 'STEP 4 · YOUR KUNDALI', q: 'Your birth details', sub: 'Your Lagna, Rashi and Nakshatra make the remedy precise.' };
    return { type: 'phone', kicker: 'STEP 5 · ALMOST THERE', q: 'Where do we send your reading?', sub: 'We save your reading to your number so you can return to it anytime.' };
  }

  function optHTML(o, sel) {
    return '<button type="button" class="aa-quiz__opt' + (sel ? ' is-sel' : '') + '" data-opt="' + o.v + '">' +
      '<span class="aa-quiz__opt-tx"><span class="aa-quiz__opt-t">' + esc(o.t) + '</span>' +
      (o.d ? '<span class="aa-quiz__opt-d">' + esc(o.d) + '</span>' : '') + '</span>' +
      '<span class="aa-quiz__radio" aria-hidden="true"></span></button>';
  }
  function renderStep() {
    var s = stepDef(state.i);
    progress.style.width = ((state.i + 1) / STEP_COUNT * 100) + '%';
    stepCount.textContent = 'STEP ' + (state.i + 1) + ' OF ' + STEP_COUNT;
    backBtn.hidden = state.i === 0;
    var h = '<div class="aa-quiz__kick">' + esc(s.kicker) + '</div><h2 class="aa-quiz__q">' + esc(s.q) + '</h2><p class="aa-quiz__sub">' + esc(s.sub) + '</p>';
    if (s.type === 'list') {
      h += '<div class="aa-quiz__opts">';
      s.opts.forEach(function (o) { h += optHTML(o, state.ans[s.key] === o.v); });
      h += '</div>';
    } else if (s.type === 'birth') {
      h += '<div class="aa-quiz__field"><label>Date of birth</label><input type="date" data-k="dob" value="' + esc(state.ans.dob || '') + '"></div>' +
        '<div class="aa-quiz__field"><label>Time of birth</label>' +
          '<input type="time" lang="en-US" data-k="tob" value="' + esc(state.ans.tob || '') + '"' + (state.ans.tob_unknown ? ' disabled' : '') + '>' +
          '<button type="button" class="aa-quiz__tnk' + (state.ans.tob_unknown ? ' is-on' : '') + '" data-quiz-tnk>' + (state.ans.tob_unknown ? '✓ I don’t know my exact time' : 'I don’t know my birth time') + '</button>' +
        '</div>' +
        '<div class="aa-quiz__field"><label>Place of birth</label><input type="text" data-k="pob" placeholder="e.g. Mumbai, India" value="' + esc(state.ans.pob || '') + '"></div>' +
        '<div class="aa-quiz__why">Your exact birth details let us read your Kundali for a precise, personal remedy. No exact time? We’ll still read your chart.</div>';
    } else if (s.type === 'phone') {
      h += '<div class="aa-quiz__field"><label>Mobile number</label><input type="tel" inputmode="numeric" autocomplete="tel" data-k="phone" placeholder="+91 98765 43210" value="' + esc(state.ans.phone || '') + '"></div>' +
        '<div class="aa-quiz__field"><label>I am <span class="aa-quiz__opt-d" style="text-transform:none;letter-spacing:0">(optional)</span></label><div class="aa-quiz__chips">' +
          ['male:Male', 'female:Female', 'Any:Prefer not to say'].map(function (g) {
            var parts = g.split(':'); return '<button type="button" class="aa-quiz__chip' + (state.ans.gender === parts[0] ? ' is-sel' : '') + '" data-gender="' + parts[0] + '">' + parts[1] + '</button>';
          }).join('') + '</div></div>' +
        '<div class="aa-quiz__why">We use your number only to save your reading. No spam, ever.</div>';
    }
    body.innerHTML = h;
    body.scrollTop = 0;
    nextBtn.innerHTML = (state.i === STEP_COUNT - 1 ? 'Reveal My Remedy' : 'Continue') + ' <span aria-hidden="true">→</span>';
    updateNext();
  }
  function stepValid() {
    var s = stepDef(state.i);
    if (s.type === 'list') return !!state.ans[s.key];
    if (s.type === 'birth') return !!(state.ans.dob && state.ans.pob && (state.ans.tob || state.ans.tob_unknown));
    if (s.type === 'phone') return !!normPhone(state.ans.phone);
    return true;
  }
  function updateNext() { nextBtn.disabled = !stepValid(); }
  function advance() { if (state.i < STEP_COUNT - 1) { state.i++; renderStep(); } else { finish(); } }

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-quiz-close]')) { e.preventDefault(); closeQuiz(); return; }
    if (e.target.closest && e.target.closest('[data-quiz-start]')) { e.preventDefault(); startFlow(); return; }
    if (e.target.closest && e.target.closest('[data-quiz-continue-app]')) { e.preventDefault(); continueInApp(); return; }
    if (e.target.closest && e.target.closest('[data-quiz-retry]')) { e.preventDefault(); finish(); return; }
    if (e.target.closest && e.target.closest('[data-quiz-tnk]')) { e.preventDefault(); state.ans.tob_unknown = !state.ans.tob_unknown; if (state.ans.tob_unknown) state.ans.tob = ''; renderStep(); return; }
    var chip = e.target.closest && e.target.closest('[data-gender]');
    if (chip && root && !root.hidden) {
      e.preventDefault();
      state.ans.gender = chip.getAttribute('data-gender');
      chip.parentElement.querySelectorAll('.aa-quiz__chip').forEach(function (c) { c.classList.remove('is-sel'); });
      chip.classList.add('is-sel');
      return;
    }
    var opt = e.target.closest && e.target.closest('.aa-quiz__opt');
    if (opt && root && !root.hidden) {
      e.preventDefault();
      var s = stepDef(state.i);
      var prev = state.ans[s.key];
      state.ans[s.key] = opt.getAttribute('data-opt');
      var lbl = opt.querySelector('.aa-quiz__opt-t'); state.ans[s.key + '_t'] = lbl ? lbl.textContent : '';
      if (s.key === 'goal' && prev !== state.ans.goal) { state.ans.f1 = null; state.ans.f1_t = ''; state.ans.f2 = null; state.ans.f2_t = ''; }
      opt.parentElement.querySelectorAll('.aa-quiz__opt').forEach(function (o) { o.classList.remove('is-sel'); });
      opt.classList.add('is-sel');
      try { if (navigator.vibrate) navigator.vibrate(6); } catch (er) {}
      updateNext();
      return;
    }
    if (e.target.closest && e.target.closest('[data-quiz-back]')) { e.preventDefault(); if (state.i > 0) { state.i--; renderStep(); } return; }
    if (e.target.closest && e.target.closest('[data-quiz-next]')) { e.preventDefault(); if (stepValid()) advance(); return; }
    var padd = e.target.closest && e.target.closest('[data-quiz-padd]');
    if (padd) { e.preventDefault(); apiAdd(padd.getAttribute('data-quiz-padd'), padd); return; }
    if (root && !root.hidden && e.target.closest && e.target.closest('.aa-qc a, .aa-quiz__hero-media')) { closeQuiz(); return; }
  }, true);
  document.addEventListener('change', function (e) {
    if (!root || root.hidden) return;
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (k) { state.ans[k] = e.target.value; updateNext(); }
  });
  document.addEventListener('input', function (e) {
    if (!root || root.hidden) return;
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (k) { state.ans[k] = e.target.value; updateNext(); }
  });

  /* ---------- reveal: call the remedies API ---------- */
  var LOAD_MSGS = [
    'Casting your birth chart…',
    'Reading your Lagna, Rashi & Nakshatra…',
    'Mapping your planets to the right remedies…',
    'Consulting the Vedic catalogue…',
    'Hand-picking your gemstones & rudraksha…',
    'Writing your personal reading…',
    'Almost ready…'
  ];
  function loaderHTML() {
    return '<div class="aa-quiz__load">' +
      '<div class="aa-quiz__load-orb"><span></span><span></span><span></span></div>' +
      '<div class="aa-quiz__load-t">Reading your chart</div>' +
      '<div class="aa-quiz__load-s" data-quiz-loadmsg>' + LOAD_MSGS[0] + '</div>' +
      '<div class="aa-quiz__load-fine">This can take up to a minute — it is worth the wait.</div></div>';
  }
  function buildQuestion() {
    var g = (GOAL_TITLE[state.ans.goal] || 'overall wellbeing').toLowerCase();
    var a1 = (state.ans.f1_t || '').toLowerCase();
    var a2 = (state.ans.f2_t || '').toLowerCase();
    var q = 'I am seeking ' + g + '.';
    if (a1) q += ' My focus is ' + a1 + '.';
    if (a2) q += ' My biggest challenge is ' + a2 + '.';
    q += ' Which spiritual remedy will help me most?';
    return q;
  }
  function buildPayload() {
    return {
      phone: normPhone(state.ans.phone),
      dob: state.ans.dob || '', tob: state.ans.tob_unknown ? '12:00' : (state.ans.tob || ''), pob: state.ans.pob || '',
      name: state.ans.name || 'Web user',
      gender: state.ans.gender || 'Any',
      question: buildQuestion(),
      language: 'en'
    };
  }
  function resultKey(p) { return 'aaq_r:' + [p.phone, p.dob, p.tob, p.pob, p.gender, p.question].join('|'); }
  function resultGet(k) { try { var o = JSON.parse(localStorage.getItem(k) || 'null'); if (o && o.data && (Date.now() - o.ts) < 7 * 86400000) return o.data; } catch (e) {} return null; }
  function resultSet(k, d) { try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data: d })); } catch (e) {} }

  var apiBusy = false;
  function finish() {
    if (apiBusy) return;            /* never fire two readings at once (no wasted API calls) */
    var payload = buildPayload();
    var key = resultKey(payload);
    showScreen('results');
    var cached = resultGet(key);
    if (cached) { renderApiResults(cached); return; }   /* instant for repeat inputs; saves an API call */
    apiBusy = true;
    bumpUsage();
    resultsBox.innerHTML = loaderHTML();
    var msgEl = resultsBox.querySelector('[data-quiz-loadmsg]'); var mi = 0;
    var timer = setInterval(function () { mi = (mi + 1) % LOAD_MSGS.length; if (msgEl) msgEl.textContent = LOAD_MSGS[mi]; }, 2200);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var killer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 150000);  /* don't abort valid slow charts */
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, data: j }; }, function () { return { status: r.status, data: null }; });
    })
      .then(function (res) {
        clearInterval(timer); clearTimeout(killer); apiBusy = false;
        if (res.status === 429 || (res.data && res.data.error === 'rate_limited')) { setCooldown(res.data && res.data.retry_after_seconds); showLimit(cooldownMins()); return; }
        if (!res.data || res.data.shown === false || (!res.data.hero && !(res.data.more && res.data.more.length))) { renderError(); return; }
        clearCooldown();            /* a success means we are not capped */
        resultSet(key, res.data);   /* cache so repeat reveals are instant */
        renderApiResults(res.data);
      })
      .catch(function () { clearInterval(timer); clearTimeout(killer); apiBusy = false; renderError(); });
  }
  function renderError(kind, retry) {
    if (kind === 'rate') {
      var mins = retry ? Math.max(1, Math.ceil(retry / 60)) : 60;
      resultsBox.innerHTML = '<div class="aa-quiz__err">' +
        '<div class="aa-quiz__err-ico" aria-hidden="true">✦</div>' +
        '<h3 class="aa-quiz__err-title">You’re out of readings</h3>' +
        '<p class="aa-quiz__err-p">You’ve used your free readings for now. Come back in about ' + mins + ' minute' + (mins > 1 ? 's' : '') + ' for your next personalised reading.</p>' +
        '<a class="aa-quiz__err-link" href="/collections/all">Browse the shop</a></div>';
      resultsBox.scrollTop = 0;
      return;
    }
    resultsBox.innerHTML = '<div class="aa-quiz__err">' +
      '<div class="aa-quiz__err-ico" aria-hidden="true">✦</div>' +
      '<h3 class="aa-quiz__err-title">The stars are busy</h3>' +
      '<p class="aa-quiz__err-p">We couldn’t complete your reading just now. Please try again in a moment.</p>' +
      '<button type="button" class="aa-quiz__combo-btn" data-quiz-retry>Try again</button>' +
      '<a class="aa-quiz__err-link" href="/collections/all">Browse the shop</a></div>';
    resultsBox.scrollTop = 0;
  }

  function heroCard(hero) {
    if (!hero) return '';
    var handle = handleOf(hero.shop_url);
    var url = hero.shop_url || (handle ? '/products/' + handle : '#');
    var benefits = (hero.benefits || []).slice(0, 3).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('');
    return '<div class="aa-quiz__combo aa-quiz__hero">' +
      '<div class="aa-quiz__combo-head"><span class="aa-quiz__combo-kick">Your main remedy</span></div>' +
      '<a class="aa-quiz__hero-media" href="' + esc(url) + '"><img src="' + esc(imgU(hero.image_url)) + '" alt="" loading="lazy"></a>' +
      '<div class="aa-quiz__hero-body">' +
      (hero.category ? '<span class="aa-qc__cat">' + esc(hero.category) + '</span>' : '') +
      '<h3 class="aa-quiz__hero-nm">' + esc(hero.name) + '</h3>' +
      '<div class="aa-quiz__combo-price">' + priceTag(hero.price_inr) + '</div>' +
      (hero.reason ? '<p class="aa-quiz__hero-reason">' + esc(hero.reason) + '</p>' : '') +
      (benefits ? '<ul class="aa-quiz__benefits">' + benefits + '</ul>' : '') +
      '<button type="button" class="aa-quiz__combo-btn"' + (handle ? ' data-quiz-padd="' + esc(handle) + '"' : ' onclick="window.location.href=\'' + esc(url) + '\'"') + '>Add to cart</button>' +
      '<div class="aa-quiz__combo-note">Pay online and save 25% at checkout</div>' +
      '</div></div>';
  }
  function moreCard(p) {
    var handle = handleOf(p.shop_url);
    var url = p.shop_url || (handle ? '/products/' + handle : '#');
    return '<article class="aa-qc">' +
      '<a class="aa-qc__media" href="' + esc(url) + '">' + (p.tag ? '<span class="aa-qc__badge">' + esc(p.tag) + '</span>' : '') +
      '<img class="aa-qc__img" src="' + esc(imgU(p.image_url)) + '" alt="" loading="lazy"></a>' +
      '<div class="aa-qc__body">' + (p.category ? '<span class="aa-qc__cat">' + esc(p.category) + '</span>' : '') +
      '<div class="aa-qc__nm"><a href="' + esc(url) + '">' + esc(p.name) + '</a></div>' +
      '<div class="aa-qc__pr"><span class="aa-qc__price">' + priceTag(p.price_inr) + '</span>' +
      '<button type="button" class="aa-qc__add"' + (handle ? ' data-quiz-padd="' + esc(handle) + '"' : ' onclick="window.location.href=\'' + esc(url) + '\'"') + '>Add</button></div></div></article>';
  }
  function renderApiResults(data) {
    if (!data || data.shown === false || (!data.hero && !(data.more && data.more.length))) { renderError(); return; }
    var cs = data.chart_summary || {};
    var sub = cs.ascendant_sign ? (esc(cs.ascendant_sign) + ' Lagna' + (cs.yogakaraka ? ' · ' + esc(cs.yogakaraka) + ' yogakaraka' : '')) : 'Personalised for you';
    var title = 'Your ' + (GOAL_TITLE[state.ans.goal] || cap(data.topic) || 'Personalised') + ' Remedy';
    var h = '<div class="aa-quiz__banner">' +
      '<div class="aa-quiz__banner-kick">Your Vedic remedy</div>' +
      '<h2 class="aa-quiz__banner-title">' + esc(title) + '</h2>' +
      '<div class="aa-quiz__banner-sub">' + sub + '</div></div>';

    if (data.hero) h += heroCard(data.hero);

    if (data.more && data.more.length) {
      h += '<div class="aa-quiz__rec-head">More remedies for you</div><div class="aa-qc-grid">';
      data.more.forEach(function (p) { h += moreCard(p); });
      h += '</div>';
    }

    if (data.action_items && data.action_items.length) {
      h += '<div class="aa-quiz__rec-head">Daily practices</div><ul class="aa-quiz__acts">' +
        data.action_items.map(function (a) { return '<li>' + mdInline(a) + '</li>'; }).join('') + '</ul>';
    }

    h += '<div class="aa-quiz__btm"></div>';
    resultsBox.innerHTML = h;
    resultsBox.scrollTop = 0;
  }

  /* add an API product to cart by resolving its first variant from the handle */
  function apiAdd(handle, btn) {
    if (!handle) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    fetch('/products/' + handle + '.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (pj) {
        var vid = pj && pj.variants && pj.variants[0] && pj.variants[0].id;
        if (vid && typeof window.AA_addToCart === 'function') { window.AA_addToCart(vid, 1); closeQuiz(); }
        else window.location.href = '/products/' + handle;
      })
      .catch(function () { window.location.href = '/products/' + handle; });
  }

  window.AA_openQuiz = openQuiz;
})();
