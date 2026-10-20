'use strict';
/*
 * Fitness Tracker – persönliche PWA
 * Alle Daten liegen lokal im Browser (localStorage) – kein Server, kein Account.
 * Struktur:
 *   1. Speicher & Datenmodell
 *   2. Hilfsfunktionen (Datum, Zahlen, HTML)
 *   3. Logik (Training, Gewicht, Statistik)
 *   4. Ansichten (Heute, Training, Gewicht, Verlauf, Plan)
 *   5. Ereignisse & Start
 */

/* ========== 1. Speicher & Datenmodell ========== */

const STORE_KEY = 'fitness-tracker:v1';
const APP_VERSION = '1.1.0';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const ex = (name, sets, reps) => ({ id: uid(), name, sets, reps });

// Aktuelle Plan-Vorlage: Oberkörper/Unterkörper, 4× pro Woche, nur Maschine/Kabel/Smith
const TEMPLATE_ID = 'ou4-maschine-v1';
const TEMPLATE_NAME = 'Oberkörper/Unterkörper · 4× pro Woche';
function templatePlans() {
  return [
    {
      id: uid(), name: 'Oberkörper A', exercises: [
        ex('Bankdrücken (Smith-Maschine)', 3, '6-8'),
        ex('Rudern an der Maschine', 3, '8-10'),
        ex('Schulterdrücken an der Maschine', 3, '8-10'),
        ex('Latzug', 3, '8-10'),
        ex('Seitheben am Kabel', 3, '12-15'),
        ex('Trizepsdrücken am Kabel', 2, '10-12'),
      ],
    },
    {
      id: uid(), name: 'Unterkörper A', exercises: [
        ex('Beinpresse', 3, '8-10'),
        ex('Beinbeuger sitzend', 3, '10-12'),
        ex('Hip Thrust (Smith-Maschine)', 3, '8-10'),
        ex('Beinstrecker', 2, '12-15'),
        ex('Wadenheben an der Maschine', 3, '10-15'),
        ex('Cable Crunch', 3, '10-15'),
      ],
    },
    {
      id: uid(), name: 'Oberkörper B', exercises: [
        ex('Schrägbankdrücken (Smith-Maschine)', 3, '8-10'),
        ex('Kabelrudern sitzend', 3, '10-12'),
        ex('Latzug eng / Klimmzug-Maschine', 3, '8-10'),
        ex('Butterfly (Maschine oder Kabel)', 2, '12-15'),
        ex('Face Pulls am Kabel', 3, '12-15'),
        ex('Bizepscurls am Kabel', 2, '10-12'),
      ],
    },
    {
      id: uid(), name: 'Unterkörper B', exercises: [
        ex('Hip Thrust (Smith-Maschine)', 3, '6-8'),
        ex('Beinpresse (Füße hoch & breit)', 3, '10-12'),
        ex('Beinbeuger liegend', 3, '10-12'),
        ex('Rückenstrecker an der Maschine', 3, '10-12'),
        ex('Wadenheben sitzend', 3, '12-15'),
        ex('Hängendes Knieheben', 3, '10-15'),
      ],
    },
  ];
}
const TEMPLATE_HABITS = ['Protein erreicht (~180 g)', 'Kalorien im Ziel (~2.300 kcal)', 'Süßes nur eingeplant', '10.000 Schritte'];
// alte Standard-Texte → neue Texte (eigene Texte bleiben unverändert)
const HABIT_UPDATES = { 'Kalorien im Ziel (~2.500 kcal)': 'Kalorien im Ziel (~2.300 kcal)', '8.000+ Schritte': '10.000 Schritte' };

const BASE_SETTINGS = { goalWeight: null, restSeconds: 120, lastBackup: null, template: null, templateDismissed: null };

function defaultState() {
  return {
    version: 1,
    settings: Object.assign({}, BASE_SETTINGS, { template: TEMPLATE_ID }),
    // Pläne werden der Reihe nach abgewechselt: Oberkörper A → Unterkörper A → Oberkörper B → Unterkörper B …
    plans: templatePlans(),
    habits: TEMPLATE_HABITS.map((label) => ({ id: uid(), label })),
    workouts: [],   // abgeschlossene Trainings
    weights: [],    // { date: 'YYYY-MM-DD', kg }
    days: {},       // { 'YYYY-MM-DD': { habits: { [habitId]: true } } }
    active: null,   // laufendes Training
  };
}

// Vorlage übernehmen: ersetzt die Pläne, Verlauf und Gewicht bleiben erhalten
function applyTemplate() {
  state.plans = templatePlans();
  state.habits.forEach((h) => { if (HABIT_UPDATES[h.label]) h.label = HABIT_UPDATES[h.label]; });
  state.settings.template = TEMPLATE_ID;
  save();
}

function migrate(s) {
  const out = Object.assign(defaultState(), s);
  out.settings = Object.assign({}, BASE_SETTINGS, s.settings || {});
  out.workouts = Array.isArray(out.workouts) ? out.workouts : [];
  out.weights = Array.isArray(out.weights) ? out.weights : [];
  out.days = out.days && typeof out.days === 'object' ? out.days : {};
  if (!Array.isArray(out.plans) || !out.plans.length) out.plans = templatePlans();
  if (!Array.isArray(out.habits)) out.habits = [];
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Laden fehlgeschlagen', e);
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Speichern fehlgeschlagen!');
  }
}

let state = load();
const ui = { tab: 'today', range: 30, calMonth: null, allWeights: false };

/* ========== 2. Hilfsfunktionen ========== */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 864e5);
}
function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
function weekStartKey(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dateKey(x);
}
function fmtDate(k, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseKey(k).toLocaleDateString('de-DE', opts);
}
function relDay(k) {
  const d = daysBetween(k, dateKey());
  if (d <= 0) return 'heute';
  if (d === 1) return 'gestern';
  return `vor ${d} Tagen`;
}

function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function fmtNum(n, digits) {
  if (n == null || !Number.isFinite(n)) return '–';
  const o = digits == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return n.toLocaleString('de-DE', o);
}
const fmtInput = (n) => (n == null ? '' : String(n).replace('.', ','));
function signed(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '–';
  const r = Number(n.toFixed(digits));
  if (r === 0) return '±0';
  return (r > 0 ? '+' : '−') + fmtNum(Math.abs(r), digits);
}
function mmss(sec) {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function elapsed(start) {
  const min = Math.floor((Date.now() - start) / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
function repRange(r) {
  const m = String(r).match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const n = parseInt(r, 10);
  return Number.isFinite(n) ? [n, n] : [null, null];
}

const ICON = {
  today: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  weight: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>',
  history: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  plan: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  up: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};
const TABS = [
  { id: 'today', label: 'Heute' },
  { id: 'weight', label: 'Gewicht' },
  { id: 'history', label: 'Verlauf' },
  { id: 'plan', label: 'Plan' },
];

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ========== 3. Logik ========== */

function sortedWorkouts() {
  return [...state.workouts].sort((a, b) => a.startedAt - b.startedAt);
}
function lastWorkout() {
  const ws = sortedWorkouts();
  return ws[ws.length - 1] || null;
}
function nextPlan() {
  const plans = state.plans;
  if (!plans.length) return null;
  const last = [...sortedWorkouts()].reverse().find((w) => plans.some((p) => p.id === w.planId));
  if (!last) return plans[0];
  const i = plans.findIndex((p) => p.id === last.planId);
  return plans[(i + 1) % plans.length];
}

// Letzte Leistung einer Übung (über ID, notfalls über den Namen)
function lastPerf(exercise) {
  const ws = sortedWorkouts();
  const name = exercise.name.trim().toLowerCase();
  for (let i = ws.length - 1; i >= 0; i--) {
    const w = ws[i];
    const e = w.entries.find((x) => x.exId === exercise.id) || w.entries.find((x) => x.name.trim().toLowerCase() === name);
    if (e && e.sets.length) return { date: w.date, sets: e.sets };
  }
  return null;
}

function perfText(sets) {
  if (!sets.length) return '';
  const sameKg = sets.every((s) => s.kg === sets[0].kg);
  if (sameKg) {
    const kg = sets[0].kg;
    return `${kg ? fmtNum(kg) + ' kg × ' : ''}${sets.map((s) => s.reps).join(', ')}`;
  }
  return sets.map((s) => `${s.kg ? fmtNum(s.kg) : 'KG'}×${s.reps}`).join(' · ');
}

function startWorkout(planId) {
  const p = state.plans.find((x) => x.id === planId);
  if (!p) return;
  const entries = p.exercises.map((e) => {
    const lp = lastPerf(e);
    const [low, high] = repRange(e.reps);
    let suggest = null;
    if (lp && high != null && lp.sets.length >= e.sets && lp.sets.every((s) => (s.reps || 0) >= high)) {
      const maxKg = Math.max(...lp.sets.map((s) => s.kg || 0));
      if (maxKg > 0) suggest = Math.round((maxKg + 2.5) * 100) / 100;
    }
    return {
      exId: e.id,
      name: e.name,
      target: `${e.sets} × ${e.reps}`,
      repLow: low,
      lastTxt: lp ? `${perfText(lp.sets)} (${relDay(lp.date)})` : null,
      suggest,
      sets: Array.from({ length: e.sets }, (_, i) => {
        const prev = lp ? lp.sets[Math.min(i, lp.sets.length - 1)] : null;
        return { kg: prev ? prev.kg : null, reps: null, prevReps: prev ? prev.reps : null, done: false };
      }),
    };
  });
  state.active = { id: uid(), planId: p.id, planName: p.name, date: dateKey(), startedAt: Date.now(), restEnd: null, entries };
  save();
  window.scrollTo(0, 0);
  render();
}

function toggleSet(ei, si) {
  const a = state.active;
  const e = a.entries[ei];
  const s = e.sets[si];
  if (!s.done) {
    if (s.reps == null) s.reps = s.prevReps != null ? s.prevReps : e.repLow;
    if (s.reps == null) {
      toast('Bitte Wiederholungen eintragen');
      return;
    }
    s.done = true;
    if (state.settings.restSeconds > 0) {
      a.restEnd = Date.now() + state.settings.restSeconds * 1000;
      a.restBeeped = false;
      unlockAudio();
    }
  } else {
    s.done = false;
  }
  save();
  render();
}

function finishWorkout() {
  const a = state.active;
  const done = a.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  if (!done) {
    if (confirm('Noch kein Satz abgehakt. Training verwerfen?')) {
      state.active = null;
      save();
      render();
    }
    return;
  }
  if (!confirm('Training beenden und speichern?')) return;
  state.workouts.push({
    id: a.id,
    planId: a.planId,
    planName: a.planName,
    date: a.date,
    startedAt: a.startedAt,
    finishedAt: Date.now(),
    entries: a.entries
      .map((e) => ({ exId: e.exId, name: e.name, target: e.target, sets: e.sets.filter((s) => s.done).map((s) => ({ kg: s.kg, reps: s.reps })) }))
      .filter((e) => e.sets.length),
  });
  state.active = null;
  save();
  window.scrollTo(0, 0);
  render();
  toast('Stark! Training gespeichert 💪');
}

function setWeight(date, kg) {
  state.weights = state.weights.filter((w) => w.date !== date);
  state.weights.push({ date, kg: Math.round(kg * 100) / 100 });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  save();
}

// Gewicht + gleitender 7-Tage-Schnitt
function weightsWithAvg() {
  const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w, i) => {
    const t = parseKey(w.date);
    let sum = 0, n = 0;
    for (let j = i; j >= 0; j--) {
      if ((t - parseKey(sorted[j].date)) / 864e5 > 6.5) break;
      sum += sorted[j].kg;
      n++;
    }
    return { date: w.date, kg: w.kg, avg: sum / n };
  });
}

// Tempo in kg pro Woche (Vergleich des 7-Tage-Schnitts über ~2 Wochen)
function calcPace(all) {
  if (all.length < 3) return null;
  const last = all[all.length - 1];
  let ref = all[0];
  for (let i = all.length - 1; i >= 0; i--) {
    if (daysBetween(all[i].date, last.date) >= 14) { ref = all[i]; break; }
  }
  const days = daysBetween(ref.date, last.date);
  if (days < 7) return null;
  return ((last.avg - ref.avg) / days) * 7;
}

// Kurzer Ton am Ende der Pause (falls das iPhone nicht stumm ist)
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* egal */ }
}
function beep() {
  try {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [0, 0.22].forEach((offset) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.3, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + offset);
      o.stop(t + offset + 0.2);
    });
  } catch (e) { /* egal */ }
}

async function exportData() {
  const json = JSON.stringify(state, null, 2);
  const name = `fitness-backup-${dateKey()}.json`;
  const markDone = () => {
    state.settings.lastBackup = Date.now();
    save();
    render();
    toast('Backup gesichert');
  };
  let file = null;
  try { file = new File([json], name, { type: 'application/json' }); } catch (e) { /* alter Browser */ }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Fitness-Backup' });
      markDone();
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  markDone();
}

function importData(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.weights) || !Array.isArray(data.plans)) throw new Error('Format');
      if (confirm(`Backup laden? Es enthält ${data.workouts.length} Trainings und ${data.weights.length} Gewichtseinträge. Deine aktuellen Daten werden ersetzt.`)) {
        state = migrate(data);
        save();
        render();
        toast('Backup geladen');
      }
    } catch (e) {
      toast('Das ist kein gültiges Backup');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ========== 4. Ansichten ========== */

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const views = { today: viewToday, weight: viewWeight, history: viewHistory, plan: viewPlan };
  $('#main').innerHTML = views[ui.tab]();
  renderRest(true);
}

/* --- Heute --- */
function viewToday() {
  if (state.active) return viewWorkout();
  const today = dateKey();
  const next = nextPlan();
  const last = lastWorkout();
  const doneToday = state.workouts.some((w) => w.date === today);
  const day = state.days[today] || { habits: {} };
  const doneHabits = state.habits.filter((h) => day.habits[h.id]).length;
  const todayWeight = state.weights.find((w) => w.date === today);
  const avgs = weightsWithAvg();
  const latest = avgs[avgs.length - 1];
  const title = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  // Pause empfehlen, wenn gestern UND vorgestern trainiert wurde (Rhythmus 2 an, 1 aus)
  const trainedOn = (k) => state.workouts.some((w) => w.date === k);
  let hint = '';
  if (!doneToday && trainedOn(addDays(today, -1)) && trainedOn(addDays(today, -2))) {
    hint = '<div class="hint">2 Tage in Folge trainiert – heute wäre ein Pausentag (Spaziergang zählt!).</div>';
  } else if (!last) {
    hint = '<div class="hint">Erstes Training nach der Pause: Nimm ca. 60–70 % deiner alten Gewichte. Sehnen brauchen länger als Muskeln.</div>';
  }

  const others = state.plans.filter((p) => next && p.id !== next.id);
  const hero = next ? `
    <section class="card hero">
      <div class="eyebrow">${doneToday ? 'Heute erledigt ✓ · nächstes Mal' : 'Als Nächstes'}</div>
      <div class="hero-name">${esc(next.name)}</div>
      <div class="muted">${next.exercises.length} Übungen · ${last ? `letztes Training ${relDay(last.date)}` : 'noch kein Training'}</div>
      <button class="btn ${doneToday ? 'full' : 'primary'}" data-act="start" data-plan="${next.id}">Training starten</button>
      ${others.length ? `<div class="alt">Lieber: ${others.map((p) => `<button class="chip" data-act="start" data-plan="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      ${hint}
    </section>` : '<section class="card"><p class="muted">Lege unter „Plan“ einen Trainingsplan an.</p></section>';

  const habits = state.habits.length ? `
    <section class="card">
      <div class="card-head"><h2>Tages-Check</h2><span class="muted num">${doneHabits}/${state.habits.length}</span></div>
      <ul class="checks">
        ${state.habits.map((h) => `
          <li><button class="check-row ${day.habits[h.id] ? 'on' : ''}" data-act="habit" data-id="${h.id}">
            <span class="box">${ICON.check}</span><span class="label">${esc(h.label)}</span>
          </button></li>`).join('')}
      </ul>
    </section>` : '';

  const weight = `
    <section class="card">
      <div class="card-head"><h2>Gewicht heute</h2>${todayWeight ? '<span class="muted small">gespeichert ✓</span>' : ''}</div>
      <form class="inline" data-form="weight-today">
        <input name="kg" inputmode="decimal" autocomplete="off" placeholder="${latest ? fmtInput(latest.kg) : 'z. B. 95,0'}" value="${todayWeight ? fmtInput(todayWeight.kg) : ''}" aria-label="Gewicht in kg">
        <span class="unit">kg</span>
        <button class="btn">Speichern</button>
      </form>
      ${latest ? `<div class="sub">7-Tage-Schnitt: <strong class="num">${fmtNum(latest.avg, 1)} kg</strong></div>` : '<div class="sub">Am besten morgens nach dem Aufstehen wiegen.</div>'}
    </section>`;

  const dataCount = state.workouts.length + state.weights.length;
  const lb = state.settings.lastBackup;
  const backupDays = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
  const nudge = dataCount >= 5 && (backupDays == null || backupDays >= 14) ? `
    <section class="card nudge">
      <h2>Zeit für ein Backup</h2>
      <p>${backupDays == null ? 'Du hast noch kein Backup gemacht.' : `Letztes Backup vor ${backupDays} Tagen.`} Deine Daten liegen nur auf diesem iPhone.</p>
      <button class="btn full" data-act="export">Backup sichern</button>
    </section>` : '';

  const offer = state.settings.template !== TEMPLATE_ID && state.settings.templateDismissed !== TEMPLATE_ID ? `
    <section class="card offer">
      <div class="eyebrow">Neuer Plan</div>
      <h2>${esc(TEMPLATE_NAME)}</h2>
      <p>Ohne Kniebeuge und Kreuzheben, nur Maschine, Kabel und Smith-Maschine. Ersetzt deine aktuellen Pläne – Verlauf und Gewicht bleiben.</p>
      <div class="row">
        <button class="btn primary" data-act="tpl-apply">Übernehmen</button>
        <button class="btn" data-act="tpl-dismiss">Nein danke</button>
      </div>
    </section>` : '';

  return `<h1 class="title">${esc(title)}</h1>${offer}${hero}${habits}${weight}${nudge}`;
}

/* --- Laufendes Training --- */
function viewWorkout() {
  const a = state.active;
  const done = a.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = a.entries.reduce((n, e) => n + e.sets.length, 0);
  return `
    <div class="eyebrow">Training läuft · <span id="elapsed">${elapsed(a.startedAt)}</span> · ${done}/${total} Sätze</div>
    <h1 class="title">${esc(a.planName)}</h1>
    <div class="progress"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
    ${a.entries.map(exerciseCard).join('')}
    <button class="btn primary big" data-act="finish">Training beenden</button>
    <button class="btn ghost danger full" data-act="discard">Training verwerfen</button>
    <div class="spacer"></div>`;
}

function exerciseCard(e, ei) {
  const allDone = e.sets.length > 0 && e.sets.every((s) => s.done);
  const anyDone = e.sets.some((s) => s.done);
  return `
    <section class="card ex ${allDone ? 'done' : ''}">
      <div class="card-head"><h2>${esc(e.name)}</h2><span class="muted small">${esc(e.target)}</span></div>
      <div class="last">${e.lastTxt ? `Letztes Mal: ${esc(e.lastTxt)}` : 'Erstes Mal – starte locker.'}</div>
      ${e.suggest && !anyDone ? `<button class="chip accent" data-act="bump" data-ei="${ei}">Ziel erreicht → ${fmtNum(e.suggest)} kg probieren</button>` : ''}
      <div class="set-h"><span>Satz</span><span>kg</span><span>Wdh.</span><span></span></div>
      ${e.sets.map((s, si) => `
        <div class="set ${s.done ? 'on' : ''}">
          <span class="n">${si + 1}</span>
          <input data-f="kg" data-ei="${ei}" data-si="${si}" inputmode="decimal" autocomplete="off" value="${fmtInput(s.kg)}" placeholder="kg" aria-label="Satz ${si + 1} Gewicht">
          <input data-f="reps" data-ei="${ei}" data-si="${si}" inputmode="numeric" autocomplete="off" value="${s.reps == null ? '' : s.reps}" placeholder="${s.prevReps != null ? s.prevReps : (e.repLow != null ? e.repLow : '')}" aria-label="Satz ${si + 1} Wiederholungen">
          <button class="tick" data-act="set" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} abhaken">${ICON.check}</button>
        </div>`).join('')}
      <div class="set-tools">
        <button class="link" data-act="addset" data-ei="${ei}">+ Satz</button>
        ${e.sets.length > 1 ? `<button class="link" data-act="delset" data-ei="${ei}">− Satz</button>` : ''}
      </div>
    </section>`;
}

/* --- Gewicht --- */
function viewWeight() {
  const all = weightsWithAvg();
  const latest = all[all.length - 1];
  const first = all[0];
  const cutoff = ui.range ? addDays(dateKey(), -(ui.range - 1)) : null;
  const shown = cutoff ? all.filter((w) => w.date >= cutoff) : all;
  const pace = calcPace(all);
  const goal = state.settings.goalWeight;
  const list = [...all].reverse();
  const visible = ui.allWeights ? list : list.slice(0, 14);

  return `
    <h1 class="title">Gewicht</h1>
    <section class="card">
      <form class="weight-form" data-form="weight">
        <input type="date" name="date" value="${dateKey()}" max="${dateKey()}" aria-label="Datum">
        <div class="inline">
          <input name="kg" inputmode="decimal" autocomplete="off" placeholder="${latest ? fmtInput(latest.kg) : 'z. B. 95,0'}" aria-label="Gewicht in kg">
          <span class="unit">kg</span>
          <button class="btn primary">Eintragen</button>
        </div>
      </form>
    </section>
    ${latest ? `
      <section class="stats">
        <div class="stat"><span>Ø 7 Tage</span><strong>${fmtNum(latest.avg, 1)}</strong><em>kg</em></div>
        <div class="stat"><span>Seit Start</span><strong>${signed(latest.avg - first.kg)}</strong><em>kg</em></div>
        <div class="stat"><span>Tempo</span><strong>${pace == null ? '–' : signed(pace, 2)}</strong><em>kg/Wo.</em></div>
      </section>
      <p class="tip">Einzelne Tage schwanken um 1–2 kg (Wasser, Salz, Essen). Schau auf den 7-Tage-Schnitt.${goal ? ` Ziel: ${fmtNum(goal, 1)} kg.` : ''}</p>` : ''}
    <section class="card">
      <div class="card-head"><h2>Verlauf</h2>
        <div class="seg">${[30, 90, 0].map((r) => `<button data-act="range" data-r="${r}" class="${ui.range === r ? 'on' : ''}">${r ? r + ' T' : 'Alle'}</button>`).join('')}</div>
      </div>
      ${weightChart(shown, goal)}
      ${shown.length >= 2 ? `<div class="legend"><span class="lg"><i class="lg-dot"></i>Tageswert</span><span class="lg"><i class="lg-line"></i>Ø 7 Tage</span>${goalVisible(shown, goal) ? '<span class="lg"><i class="lg-goal"></i>Ziel</span>' : ''}</div>` : ''}
    </section>
    <section class="card">
      <h2>Einträge</h2>
      ${all.length ? `
        <ul class="list">
          ${visible.map((w) => `
            <li><span class="grow">${fmtDate(w.date)}</span><span class="num">${fmtNum(w.kg, 1)} kg</span>
            <button class="icon-btn" data-act="delweight" data-date="${w.date}" aria-label="Eintrag löschen">${ICON.trash}</button></li>`).join('')}
        </ul>
        ${list.length > 14 && !ui.allWeights ? '<button class="link" data-act="allweights">Alle anzeigen</button>' : ''}` : '<p class="muted">Noch keine Einträge.</p>'}
    </section>`;
}

// Ziellinie nur zeigen, wenn sie in der Nähe der Werte liegt (sonst wird die Kurve platt)
function goalVisible(data, goal) {
  if (goal == null || !data.length) return false;
  const vals = data.flatMap((d) => [d.kg, d.avg]);
  return goal > Math.min(...vals) - 4 && goal < Math.max(...vals) + 4;
}

function weightChart(data, goal) {
  if (data.length < 2) {
    return `<div class="empty">${data.length ? 'Ab dem zweiten Eintrag erscheint hier deine Kurve.' : 'Trag dein erstes Gewicht ein – dann geht’s los.'}</div>`;
  }
  const W = 340, H = 200, L = 36, R = 10, T = 12, B = 26;
  const ts = data.map((d) => parseKey(d.date).getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const span = Math.max(t1 - t0, 864e5);
  const vals = data.flatMap((d) => [d.kg, d.avg]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const showGoal = goalVisible(data, goal);
  if (showGoal) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  const pad = Math.max(0.4, (hi - lo) * 0.15);
  lo -= pad; hi += pad;

  const x = (t) => L + ((t - t0) / span) * (W - L - R);
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const f = (n) => n.toFixed(1);

  const grid = [0.15, 0.5, 0.85].map((k) => {
    const v = lo + (hi - lo) * k;
    return `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}"/><text class="c-label" x="${L - 6}" y="${f(y(v) + 3.5)}" text-anchor="end">${fmtNum(v, 1)}</text>`;
  }).join('');
  const pts = data.map((d, i) => [x(ts[i]), y(d.avg)]);
  const line = 'M' + pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L');
  const area = `${line}L${f(pts[pts.length - 1][0])},${H - B}L${f(pts[0][0])},${H - B}Z`;
  const r = data.length > 60 ? 1.6 : 2.6;
  const dots = data.map((d, i) => `<circle class="c-dot" cx="${f(x(ts[i]))}" cy="${f(y(d.kg))}" r="${r}"/>`).join('');
  const goalLine = showGoal ? `<line class="c-goal" x1="${L}" x2="${W - R}" y1="${f(y(goal))}" y2="${f(y(goal))}"/>` : '';
  const last = pts[pts.length - 1];
  const xLabel = (k, anchor, t) => `<text class="c-label" x="${f(x(t))}" y="${H - 8}" text-anchor="${anchor}">${fmtDate(k, { day: 'numeric', month: 'short' })}</text>`;

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gewichtsverlauf">
    ${grid}${goalLine}<path class="c-area" d="${area}"/>${dots}<path class="c-line" d="${line}"/>
    <circle class="c-last" cx="${f(last[0])}" cy="${f(last[1])}" r="5"/>
    ${xLabel(data[0].date, 'start', t0)}${xLabel(data[data.length - 1].date, 'end', t1)}
  </svg>`;
}

/* --- Verlauf --- */
function viewHistory() {
  const ws = [...state.workouts].sort((a, b) => b.startedAt - a.startedAt);
  const today = dateKey();
  const week = ws.filter((w) => w.date >= weekStartKey()).length;
  const month = ws.filter((w) => w.date.slice(0, 7) === today.slice(0, 7)).length;
  const m = ui.calMonth || today.slice(0, 7);
  return `
    <h1 class="title">Verlauf</h1>
    <section class="stats">
      <div class="stat"><span>Diese Woche</span><strong>${week}</strong><em>×</em></div>
      <div class="stat"><span>Dieser Monat</span><strong>${month}</strong><em>×</em></div>
      <div class="stat"><span>Gesamt</span><strong>${ws.length}</strong><em>×</em></div>
    </section>
    <section class="card">${calendar(m)}</section>
    <section class="card">
      <h2>Trainings</h2>
      ${ws.length ? ws.map(workoutItem).join('') : '<p class="muted">Noch keine Trainings. Dein erstes wartet unter „Heute“.</p>'}
    </section>`;
}

function calendar(m) {
  const [y, mo] = m.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const daysIn = new Date(y, mo, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const wkDays = new Set(state.workouts.filter((w) => w.date.startsWith(m)).map((w) => w.date));
  const wtDays = new Set(state.weights.filter((w) => w.date.startsWith(m)).map((w) => w.date));
  const today = dateKey();
  let cells = '<span></span>'.repeat(offset);
  for (let d = 1; d <= daysIn; d++) {
    const k = `${m}-${String(d).padStart(2, '0')}`;
    cells += `<span class="day ${wkDays.has(k) ? 'wk' : ''} ${k === today ? 'today' : ''}">${d}${wtDays.has(k) ? '<i></i>' : ''}</span>`;
  }
  const title = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return `
    <div class="cal-head">
      <button class="icon-btn" data-act="cal" data-dir="-1" aria-label="Voriger Monat">‹</button>
      <strong>${esc(title)}</strong>
      <button class="icon-btn" data-act="cal" data-dir="1" aria-label="Nächster Monat">›</button>
    </div>
    <div class="cal"><b>Mo</b><b>Di</b><b>Mi</b><b>Do</b><b>Fr</b><b>Sa</b><b>So</b>${cells}</div>
    <div class="legend"><span class="lg"><i class="lg-wk"></i>Training</span><span class="lg"><i class="lg-dot"></i>Gewicht eingetragen</span></div>`;
}

function workoutItem(w) {
  const sets = w.entries.reduce((n, e) => n + e.sets.length, 0);
  const vol = w.entries.reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.kg || 0) * (s.reps || 0), 0), 0);
  const mins = w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null;
  return `
    <details class="wk-item">
      <summary>
        <div><strong>${esc(w.planName)}</strong><span class="muted">${fmtDate(w.date)}${mins ? ` · ${mins} min` : ''} · ${sets} Sätze</span></div>
        <span class="num muted small">${fmtNum(Math.round(vol), 0)} kg</span>
      </summary>
      <div class="wk-body">
        ${w.entries.map((e) => `<div class="wk-ex"><span>${esc(e.name)}</span><span class="muted">${esc(perfText(e.sets))}</span></div>`).join('')}
        <button class="link danger" data-act="delworkout" data-id="${w.id}">Training löschen</button>
      </div>
    </details>`;
}

/* --- Plan & Einstellungen --- */
function viewPlan() {
  const lb = state.settings.lastBackup;
  const lbText = lb ? new Date(lb).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'noch nie';
  return `
    <h1 class="title">Plan</h1>
    <p class="muted intro">Die Pläne wechseln sich der Reihe nach ab (von oben nach unten, dann wieder von vorn). Änderungen werden automatisch gespeichert.</p>
    ${state.plans.map((p, pi) => `
      <section class="card">
        <div class="plan-head">
          <input class="plan-name" data-edit="plan-name" data-pi="${pi}" value="${esc(p.name)}" aria-label="Name des Plans">
          <button class="icon-btn" data-act="delplan" data-pi="${pi}" aria-label="Plan löschen">${ICON.trash}</button>
        </div>
        ${p.exercises.map((e, xi) => `
          <div class="ex-edit">
            <input class="nm" data-edit="ex-name" data-pi="${pi}" data-xi="${xi}" value="${esc(e.name)}" aria-label="Übung">
            <label class="mini s"><span>Sätze</span><input data-edit="ex-sets" data-pi="${pi}" data-xi="${xi}" value="${e.sets}" inputmode="numeric"></label>
            <label class="mini r"><span>Wdh.</span><input data-edit="ex-reps" data-pi="${pi}" data-xi="${xi}" value="${esc(e.reps)}"></label>
            <div class="ex-tools">
              <button class="icon-btn" data-act="exup" data-pi="${pi}" data-xi="${xi}" aria-label="Nach oben" ${xi === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.up}</button>
              <button class="icon-btn" data-act="exdel" data-pi="${pi}" data-xi="${xi}" aria-label="Übung entfernen">${ICON.x}</button>
            </div>
          </div>`).join('')}
        <button class="link" data-act="exadd" data-pi="${pi}">+ Übung hinzufügen</button>
      </section>`).join('')}
    <button class="btn full" data-act="planadd" style="margin-bottom:12px">+ Weiteren Plan hinzufügen</button>

    <section class="card">
      <h2>Vorlage</h2>
      <p class="muted" style="margin-bottom:12px">${esc(TEMPLATE_NAME)} – nur Maschine, Kabel und Smith-Maschine. Setzt die Pläne oben auf die Vorlage zurück.</p>
      <button class="btn full" data-act="tpl-apply" data-confirm="1">Vorlage laden</button>
    </section>

    <section class="card">
      <h2>Tages-Check</h2>
      ${state.habits.map((h, hi) => `
        <div class="habit-edit">
          <input data-edit="habit" data-hi="${hi}" value="${esc(h.label)}" aria-label="Punkt">
          <button class="icon-btn" data-act="habitdel" data-hi="${hi}" aria-label="Punkt entfernen">${ICON.x}</button>
        </div>`).join('')}
      <button class="link" data-act="habitadd">+ Punkt hinzufügen</button>
    </section>

    <section class="card">
      <h2>Einstellungen</h2>
      <label class="field"><span>Zielgewicht in kg (optional, erscheint im Diagramm)</span>
        <input data-edit="goal" inputmode="decimal" autocomplete="off" value="${fmtInput(state.settings.goalWeight)}" placeholder="z. B. 88"></label>
      <label class="field"><span>Pausen-Timer nach jedem Satz (Sekunden, 0 = aus)</span>
        <input data-edit="rest" inputmode="numeric" value="${state.settings.restSeconds}"></label>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p class="muted" style="margin-bottom:6px">Deine Daten liegen nur auf diesem iPhone. Sichere sie ab und zu als Datei, z. B. in iCloud Drive.</p>
      <p class="muted small" style="margin-bottom:12px">Letztes Backup: ${lbText}</p>
      <div class="row">
        <button class="btn primary" data-act="export">Backup sichern</button>
        <label class="btn" for="importFile">Backup laden</label>
      </div>
      <input type="file" id="importFile" class="sr-only" accept="application/json,.json">
    </section>

    <section class="card">
      <h2>Daten</h2>
      <button class="btn ghost danger full" data-act="reset">Alle Daten löschen</button>
    </section>
    <p class="muted small center">Fitness Tracker v${APP_VERSION}</p>`;
}

/* --- Pausen-Timer (schwebende Leiste) --- */
function renderRest(force) {
  const el = $('#rest');
  const a = state.active;
  if (!a || !a.restEnd || ui.tab !== 'today') {
    el.hidden = true;
    el.dataset.mode = '';
    return;
  }
  const left = Math.ceil((a.restEnd - Date.now()) / 1000);
  const mode = left > 0 ? 'run' : 'over';
  el.hidden = false;
  if (force || el.dataset.mode !== mode) {
    el.dataset.mode = mode;
    el.className = mode === 'run' ? 'rest' : 'rest over';
    el.innerHTML = mode === 'run'
      ? '<span class="lbl">Pause</span><strong id="restLeft"></strong><button data-act="rest-plus">+30 s</button><button data-act="rest-stop" aria-label="Timer beenden">✕</button>'
      : '<span class="lbl">Pause vorbei – nächster Satz!</span><button data-act="rest-stop">OK</button>';
  }
  if (mode === 'run') {
    $('#restLeft').textContent = mmss(left);
  } else if (!a.restBeeped) {
    a.restBeeped = true;
    save();
    beep();
  }
}

/* ========== 5. Ereignisse & Start ========== */

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  const a = state.active;
  switch (d.act) {
    case 'tab':
      ui.tab = d.tab;
      window.scrollTo(0, 0);
      render();
      break;
    case 'start':
      startWorkout(d.plan);
      break;
    case 'set':
      toggleSet(Number(d.ei), Number(d.si));
      break;
    case 'bump': {
      const e = a.entries[Number(d.ei)];
      e.sets.forEach((s) => { if (!s.done) s.kg = e.suggest; });
      e.suggest = null;
      save();
      render();
      break;
    }
    case 'addset': {
      const e = a.entries[Number(d.ei)];
      const prev = e.sets[e.sets.length - 1] || {};
      e.sets.push({ kg: prev.kg == null ? null : prev.kg, reps: null, prevReps: prev.prevReps == null ? null : prev.prevReps, done: false });
      save();
      render();
      break;
    }
    case 'delset': {
      const e = a.entries[Number(d.ei)];
      if (e.sets.length > 1) e.sets.pop();
      save();
      render();
      break;
    }
    case 'finish':
      finishWorkout();
      break;
    case 'discard':
      if (confirm('Training verwerfen? Die Sätze von heute gehen verloren.')) {
        state.active = null;
        save();
        render();
      }
      break;
    case 'rest-plus':
      if (a && a.restEnd) { a.restEnd = Math.max(a.restEnd, Date.now()) + 30000; save(); renderRest(true); }
      break;
    case 'rest-stop':
      if (a) { a.restEnd = null; save(); renderRest(true); }
      break;
    case 'habit': {
      const k = dateKey();
      const day = state.days[k] || (state.days[k] = { habits: {} });
      day.habits[d.id] = !day.habits[d.id];
      save();
      render();
      break;
    }
    case 'range':
      ui.range = Number(d.r);
      render();
      break;
    case 'allweights':
      ui.allWeights = true;
      render();
      break;
    case 'delweight':
      if (confirm(`Eintrag vom ${fmtDate(d.date)} löschen?`)) {
        state.weights = state.weights.filter((w) => w.date !== d.date);
        save();
        render();
      }
      break;
    case 'cal': {
      const [y, mo] = (ui.calMonth || dateKey().slice(0, 7)).split('-').map(Number);
      ui.calMonth = dateKey(new Date(y, mo - 1 + Number(d.dir), 1)).slice(0, 7);
      render();
      break;
    }
    case 'delworkout':
      if (confirm('Dieses Training löschen?')) {
        state.workouts = state.workouts.filter((w) => w.id !== d.id);
        save();
        render();
      }
      break;
    case 'delplan': {
      const pi = Number(d.pi);
      if (state.plans.length <= 1) { toast('Mindestens ein Plan wird gebraucht'); break; }
      if (confirm(`Plan „${state.plans[pi].name}“ löschen? Dein Verlauf bleibt erhalten.`)) {
        state.plans.splice(pi, 1);
        save();
        render();
      }
      break;
    }
    case 'exadd': {
      const pi = Number(d.pi);
      state.plans[pi].exercises.push(ex('Neue Übung', 3, '8-10'));
      save();
      render();
      const xi = state.plans[pi].exercises.length - 1;
      const inp = $(`[data-edit="ex-name"][data-pi="${pi}"][data-xi="${xi}"]`);
      if (inp) { inp.focus(); inp.select(); }
      break;
    }
    case 'exup': {
      const list = state.plans[Number(d.pi)].exercises;
      const xi = Number(d.xi);
      if (xi > 0) { [list[xi - 1], list[xi]] = [list[xi], list[xi - 1]]; save(); render(); }
      break;
    }
    case 'exdel': {
      const list = state.plans[Number(d.pi)].exercises;
      const xi = Number(d.xi);
      if (confirm(`„${list[xi].name}“ aus dem Plan entfernen?`)) { list.splice(xi, 1); save(); render(); }
      break;
    }
    case 'planadd': {
      const letter = String.fromCharCode(65 + state.plans.length);
      state.plans.push({ id: uid(), name: `Plan ${letter}`, exercises: [ex('Neue Übung', 3, '8-10')] });
      save();
      render();
      break;
    }
    case 'habitadd': {
      state.habits.push({ id: uid(), label: 'Neuer Punkt' });
      save();
      render();
      const inp = $(`[data-edit="habit"][data-hi="${state.habits.length - 1}"]`);
      if (inp) { inp.focus(); inp.select(); }
      break;
    }
    case 'habitdel':
      state.habits.splice(Number(d.hi), 1);
      save();
      render();
      break;
    case 'tpl-apply':
      if (d.confirm && !confirm(`Vorlage „${TEMPLATE_NAME}“ laden? Deine aktuellen Pläne werden ersetzt, Verlauf und Gewicht bleiben.`)) break;
      applyTemplate();
      window.scrollTo(0, 0);
      render();
      toast('Neuer Plan übernommen 💪');
      break;
    case 'tpl-dismiss':
      state.settings.templateDismissed = TEMPLATE_ID;
      save();
      render();
      break;
    case 'export':
      exportData();
      break;
    case 'reset':
      if (confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.') && confirm('Ganz sicher? Mach vorher besser ein Backup.')) {
        state = defaultState();
        save();
        render();
        toast('Alles zurückgesetzt');
      }
      break;
    default:
      break;
  }
});

const main = $('#main');

// Eingaben im Training sofort speichern (ohne neu zu zeichnen, damit der Fokus bleibt)
main.addEventListener('input', (ev) => {
  const t = ev.target;
  const d = t.dataset;
  if (!d.f || !state.active) return;
  const e = state.active.entries[Number(d.ei)];
  const si = Number(d.si);
  const s = e.sets[si];
  const v = num(t.value);
  if (d.f === 'kg') {
    const old = s.kg;
    s.kg = v;
    // Folgesätze mitziehen, solange sie noch das alte Gewicht haben
    for (let j = si + 1; j < e.sets.length; j++) {
      const n = e.sets[j];
      if (n.done || (n.kg !== old && n.kg != null)) break;
      n.kg = v;
      const inp = main.querySelector(`input[data-f="kg"][data-ei="${d.ei}"][data-si="${j}"]`);
      if (inp) inp.value = fmtInput(v);
    }
  } else {
    s.reps = v == null ? null : Math.round(v);
  }
  save();
});

// Plan & Einstellungen speichern, wenn ein Feld verlassen wird
main.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'importFile') { importData(t); return; }
  const d = t.dataset;
  if (!d.edit) return;
  const v = t.value.trim();
  switch (d.edit) {
    case 'plan-name': state.plans[Number(d.pi)].name = v || 'Plan'; break;
    case 'ex-name': state.plans[Number(d.pi)].exercises[Number(d.xi)].name = v || 'Übung'; break;
    case 'ex-sets': {
      const n = Math.max(1, Math.min(10, parseInt(v, 10) || 3));
      state.plans[Number(d.pi)].exercises[Number(d.xi)].sets = n;
      t.value = n;
      break;
    }
    case 'ex-reps': state.plans[Number(d.pi)].exercises[Number(d.xi)].reps = v || '8-10'; break;
    case 'habit': state.habits[Number(d.hi)].label = v || 'Punkt'; break;
    case 'goal': {
      const n = num(v);
      state.settings.goalWeight = n != null && n > 30 && n < 300 ? n : null;
      t.value = fmtInput(state.settings.goalWeight);
      break;
    }
    case 'rest': {
      const n = Math.max(0, Math.min(600, parseInt(v, 10) || 0));
      state.settings.restSeconds = n;
      t.value = n;
      break;
    }
    default: return;
  }
  save();
  toast('Gespeichert');
});

// Gewicht eintragen
main.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.dataset.form !== 'weight-today' && f.dataset.form !== 'weight') return;
  const kg = num(f.elements.kg.value);
  const date = f.elements.date && f.elements.date.value ? f.elements.date.value : dateKey();
  if (kg == null || kg < 30 || kg > 300) { toast('Bitte ein gültiges Gewicht eingeben'); return; }
  if (date > dateKey()) { toast('Datum liegt in der Zukunft'); return; }
  setWeight(date, kg);
  if (document.activeElement) document.activeElement.blur();
  render();
  toast(`${fmtNum(kg, 1)} kg gespeichert`);
});

// Jede Sekunde: Pausen-Timer und Trainingsdauer aktualisieren
setInterval(() => {
  if (!state.active) return;
  renderRest(false);
  const el = $('#elapsed');
  if (el) el.textContent = elapsed(state.active.startedAt);
}, 1000);

// Beim Zurückkehren in die App neu zeichnen (z. B. neuer Tag)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const focused = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!focused) render();
  }
});

function init() {
  $('#tabs').innerHTML = TABS.map((t) => `<button data-act="tab" data-tab="${t.id}">${ICON[t.id]}<span>${t.label}</span></button>`).join('');
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Neue Version geladen → einmal neu laden, damit sie sofort aktiv ist
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (!typing) location.reload();
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

init();
