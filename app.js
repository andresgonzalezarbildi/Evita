'use strict';

const INDEX_URL = './data/index.json';
const STORAGE_KEY = 'study_platform_v1';
const PLAN_SELECTION = '__plan__';
const CHECKLIST_STATES = ['no_iniciado', 'visto', 'practicado', 'dominado'];
const CHECKLIST_LABELS = {
  no_iniciado: 'No iniciado',
  visto: 'Visto',
  practicado: 'Practicado',
  dominado: 'Dominado'
};
const MASTERY_STATES = ['nunca_visto', 'entiendo', 'con_ayuda', 'sale_solo'];
const MASTERY_LABELS = {
  nunca_visto: 'Nunca visto',
  entiendo: 'Entiendo',
  con_ayuda: 'Resuelvo con ayuda',
  sale_solo: 'Sale solo'
};
const BANK_STATUS_LABELS = {
  pending: 'Pendiente',
  done: 'Resuelto',
  review: 'Repasar'
};
const NAV_SUBJECT = [
  ['dashboard', '⌂', 'Inicio'],
  ['bank', '☷', 'Banco de ejercicios'],
  ['materials', '↗', 'Materiales'],
  ['checklist', '✓', 'Checklist'],
  ['cards', '▣', 'Tarjetas'],
  ['errors', '!', 'Errores']
];
const NAV_PLAN = [
  ['plan', '◫', 'Configurar plan'],
  ['calendar', '▦', 'Calendario'],
  ['errors', '!', 'Errores combinados']
];
const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const elements = {
  selector: document.querySelector('#subjectSelector'),
  nav: document.querySelector('#mainNav'),
  content: document.querySelector('#content'),
  sidebar: document.querySelector('#sidebar'),
  mobileTitle: document.querySelector('#mobileTitle'),
  menuToggle: document.querySelector('#menuToggle'),
  toast: document.querySelector('#toast'),
  exportProgress: document.querySelector('#exportProgress'),
  importProgress: document.querySelector('#importProgress'),
  resetProgress: document.querySelector('#resetProgress'),
  checklistDialog: document.querySelector('#checklistDialog'),
  checklistForm: document.querySelector('#checklistForm'),
  errorDialog: document.querySelector('#errorDialog'),
  errorForm: document.querySelector('#errorForm'),
  planTaskDialog: document.querySelector('#planTaskDialog'),
  planTaskForm: document.querySelector('#planTaskForm')
};

let registry = null;
let state = null;
let activeSubject = null;
let bankSelectedId = null;
let materialSelectedId = null;
let bankSolutionVisible = false;
let currentFlashcardId = null;
let flashcardAnswerVisible = false;
let bankFilters = {};
let materialFilters = {};
let checklistFilters = {};
let toastTimer = null;
const subjectCache = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysISO(value, days) {
  const date = parseISODate(value) || new Date();
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function daysBetween(from, to) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  if (!a || !b) return null;
  return Math.ceil((b - a) / 86400000);
}

function formatDate(value, options = {}) {
  const date = parseISODate(value);
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-UY', {
    weekday: options.weekday ? 'long' : undefined,
    day: '2-digit',
    month: options.long ? 'long' : '2-digit',
    year: options.year === false ? undefined : 'numeric'
  }).format(date);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmt(value) {
  return esc(value || '').replaceAll('\n', '<br>');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function uniq(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ''))];
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function toast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function showLoading() {
  elements.content.innerHTML = '<div class="loading">Cargando datos…</div>';
}

function defaultState() {
  return {
    version: 1,
    activeSelection: null,
    currentView: null,
    subjects: {},
    errors: [],
    plan: {
      selectedSubjects: [],
      startDate: todayISO(),
      dailyMinutes: 120,
      studyDays: [1, 2, 3, 4, 5, 6],
      examDates: {},
      days: [],
      updatedAt: null,
      suppressedTaskIds: []
    }
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaultState();
    const fresh = defaultState();
    return {
      ...fresh,
      ...saved,
      subjects: saved.subjects || {},
      errors: Array.isArray(saved.errors) ? saved.errors : [],
      plan: {
        ...fresh.plan,
        ...(saved.plan || {}),
        selectedSubjects: Array.isArray(saved.plan?.selectedSubjects) ? saved.plan.selectedSubjects : [],
        studyDays: Array.isArray(saved.plan?.studyDays) ? saved.plan.studyDays : fresh.plan.studyDays,
        examDates: saved.plan?.examDates || {},
        days: Array.isArray(saved.plan?.days) ? saved.plan.days : [],
        suppressedTaskIds: Array.isArray(saved.plan?.suppressedTaskIds) ? saved.plan.suppressedTaskIds : []
      }
    };
  } catch (error) {
    console.warn('No se pudo leer el progreso guardado.', error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureSubjectState(subjectId) {
  state.subjects[subjectId] ||= {
    bankStatus: {},
    checklistStatus: {},
    checklistOverrides: {},
    customChecklist: [],
    topicMastery: {},
    flashcards: {}
  };
  const subjectState = state.subjects[subjectId];
  subjectState.bankStatus ||= {};
  subjectState.checklistStatus ||= {};
  subjectState.checklistOverrides ||= {};
  subjectState.customChecklist ||= [];
  subjectState.topicMastery ||= {};
  subjectState.flashcards ||= {};
  return subjectState;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo cargar ${url}: ${response.status}`);
  return response.json();
}

async function loadSubject(subjectId) {
  if (subjectCache.has(subjectId)) return subjectCache.get(subjectId);
  const item = registry.subjects.find(subject => subject.id === subjectId);
  if (!item) throw new Error(`Materia desconocida: ${subjectId}`);
  const subject = await fetchJson(item.file);
  validateSubjectBasics(subject, subjectId);
  subjectCache.set(subjectId, subject);
  ensureSubjectState(subjectId);
  return subject;
}

function validateSubjectBasics(subject, expectedId) {
  if (!subject || subject.schemaVersion !== 1 || !subject.subject || !Array.isArray(subject.topics)) {
    throw new Error(`El JSON de ${expectedId} no cumple la estructura básica.`);
  }
  if (subject.subject.id !== expectedId) {
    throw new Error(`El id interno ${subject.subject.id} no coincide con ${expectedId}.`);
  }
  subject.materials ||= [];
  subject.bank ||= [];
  subject.checklist ||= [];
  subject.flashcards ||= [];
  subject.commonErrors ||= [];
  subject.skills ||= [];
  subject.plan ||= { tasks: [] };
  subject.plan.tasks ||= [];
}

function registryItem(subjectId) {
  return registry.subjects.find(subject => subject.id === subjectId);
}

function isPlanMode() {
  return state.activeSelection === PLAN_SELECTION;
}

function activeSubjectId() {
  return isPlanMode() ? null : state.activeSelection;
}

function currentSubjectState() {
  const id = activeSubjectId();
  return id ? ensureSubjectState(id) : null;
}

function effectiveExamDate(subjectId, subject = subjectCache.get(subjectId)) {
  return state.plan.examDates[subjectId]
    || subject?.subject?.examDate
    || subject?.plan?.examDate
    || null;
}

function topicMap(subject) {
  return Object.fromEntries(subject.topics.map(topic => [topic.id, topic]));
}

function topicName(subject, topicId) {
  return subject.topics.find(topic => topic.id === topicId)?.name || 'Sin tema';
}

function topicColor(subject, topicId) {
  return subject.topics.find(topic => topic.id === topicId)?.color || subject.subject.color || '#657180';
}

function chip(text, className = '') {
  if (!text) return '';
  return `<span class="chip ${className}">${esc(text)}</span>`;
}

function sectionHeader(eyebrow, title, description, actions = '') {
  return `<header class="section-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions}</header>`;
}

function statusOptions(values, labels, selected) {
  return values.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(labels[value] || value)}</option>`).join('');
}

async function init() {
  showLoading();
  registry = await fetchJson(INDEX_URL);
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.subjects)) {
    throw new Error('data/index.json no tiene una estructura válida.');
  }
  state = loadState();
  const validIds = new Set(registry.subjects.map(subject => subject.id));
  state.plan.selectedSubjects = state.plan.selectedSubjects.filter(id => validIds.has(id));
  if (!state.plan.selectedSubjects.length) {
    state.plan.selectedSubjects = registry.subjects.filter(subject => subject.includeInPlan).map(subject => subject.id);
  }
  const initial = state.activeSelection;
  state.activeSelection = validIds.has(initial)
    ? initial
    : (registry.defaultSubject || registry.subjects[0]?.id);
  populateSelector();
  bindGlobalEvents();
  await switchSelection(state.activeSelection, false);
}

function populateSelector() {
  const subjectOptions = registry.subjects.map(subject => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join('');
  elements.selector.innerHTML = `<optgroup label="Materias">${subjectOptions}</optgroup>`;
  elements.selector.value = state.activeSelection;
}

function bindGlobalEvents() {
  elements.selector.addEventListener('change', event => switchSelection(event.target.value));
  elements.menuToggle.addEventListener('click', () => elements.sidebar.classList.toggle('open'));
  elements.exportProgress.addEventListener('click', exportProgress);
  elements.importProgress.addEventListener('change', importProgress);
  elements.resetProgress.addEventListener('click', resetProgress);
  elements.checklistForm.addEventListener('submit', saveChecklistDialog);
  elements.errorForm.addEventListener('submit', saveErrorDialog);
  elements.planTaskForm?.addEventListener('submit', savePlanTaskDialog);
}

async function switchSelection(value, persist = true) {
  state.activeSelection = value;
  state.currentView = value === PLAN_SELECTION ? 'plan' : 'dashboard';
  bankSelectedId = null;
  materialSelectedId = null;
  currentFlashcardId = null;
  bankSolutionVisible = false;
  flashcardAnswerVisible = false;
  if (persist) saveState();
  elements.selector.value = value;
  showLoading();
  if (value !== PLAN_SELECTION) activeSubject = await loadSubject(value);
  else activeSubject = null;
  renderNav();
  updateMobileTitle();
  await renderCurrentView();
}

function renderNav() {
  const items = isPlanMode() ? NAV_PLAN : NAV_SUBJECT;
  const label = isPlanMode() ? 'Plan general' : 'Materia';
  elements.nav.innerHTML = `<div class="nav-group-label">${label}</div>${items.map(([id, icon, title]) => `<button class="nav-item ${state.currentView === id ? 'active' : ''}" data-view="${id}"><span class="nav-icon">${icon}</span>${esc(title)}</button>`).join('')}`;
  elements.nav.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', async () => {
      state.currentView = button.dataset.view;
      saveState();
      elements.sidebar.classList.remove('open');
      renderNav();
      await renderCurrentView();
    });
  });
}

function updateMobileTitle() {
  elements.mobileTitle.textContent = isPlanMode()
    ? 'Plan combinado'
    : (registryItem(activeSubjectId())?.shortName || registryItem(activeSubjectId())?.name || 'Materia');
}

async function renderCurrentView() {
  showLoading();
  if (isPlanMode()) {
    if (state.currentView === 'calendar') return renderCalendar();
    if (state.currentView === 'errors') return renderErrors(true);
    return renderPlan();
  }
  if (!activeSubject) activeSubject = await loadSubject(activeSubjectId());
  const renderers = {
    dashboard: renderDashboard,
    bank: renderBank,
    materials: renderMaterials,
    checklist: renderChecklist,
    cards: renderCards,
    errors: () => renderErrors(false)
  };
  return (renderers[state.currentView] || renderDashboard)();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `progreso-estudio-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function importProgress(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || imported.version !== 1 || !imported.plan || !imported.subjects) {
      throw new Error('El archivo no es una exportación válida de esta plataforma.');
    }
    state = imported;
    saveState();
    populateSelector();
    await switchSelection(state.activeSelection || registry.defaultSubject, false);
    toast('Progreso importado');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo importar el progreso');
  }
}

async function resetProgress() {
  if (!confirm('Se borrará todo el progreso local, el calendario y el banco de errores.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  state.activeSelection = registry.defaultSubject || registry.subjects[0]?.id || PLAN_SELECTION;
  state.plan.selectedSubjects = registry.subjects.filter(subject => subject.includeInPlan).map(subject => subject.id);
  await switchSelection(state.activeSelection, false);
  saveState();
  toast('Progreso reiniciado');
}

init().catch(error => {
  console.error(error);
  elements.content.innerHTML = `<section class="panel"><h1>No se pudo iniciar la plataforma</h1><p>${esc(error.message)}</p><p class="muted">Abrila mediante un servidor local o desde Netlify; los archivos JSON no se pueden cargar correctamente con doble clic.</p></section>`;
});

function subjectProgress(subject) {
  const subjectState = ensureSubjectState(subject.subject.id);
  const checklist = getChecklistItems(subject);
  const checklistWeights = { no_iniciado: 0, visto: .33, practicado: .67, dominado: 1 };
  const checklistScore = checklist.length
    ? checklist.reduce((sum, item) => sum + (checklistWeights[subjectState.checklistStatus[item.id] || 'no_iniciado'] || 0), 0) / checklist.length
    : 0;
  const relevantBank = subject.bank.filter(item => item.kind === 'exercise' || item.kind === 'theory');
  const bankDone = relevantBank.filter(item => subjectState.bankStatus[item.id]?.status === 'done').length;
  const bankScore = relevantBank.length ? bankDone / relevantBank.length : 0;
  const topicWeights = { nunca_visto: 0, entiendo: .35, con_ayuda: .7, sale_solo: 1 };
  const topicScore = subject.topics.length
    ? subject.topics.reduce((sum, topic) => sum + (topicWeights[subjectState.topicMastery[topic.id] || 'nunca_visto'] || 0), 0) / subject.topics.length
    : 0;
  const pct = Math.round(100 * (.45 * checklistScore + .35 * bankScore + .2 * topicScore));
  return { pct, bankDone, bankTotal: relevantBank.length, checklistScore, topicScore };
}

function dueFlashcards(subject) {
  const cardState = ensureSubjectState(subject.subject.id).flashcards;
  const today = todayISO();
  return subject.flashcards.filter(card => !cardState[card.id]?.due || cardState[card.id].due <= today);
}

function renderDashboard() {
  const subject = activeSubject;
  const subjectState = currentSubjectState();
  const progress = subjectProgress(subject);
  const examDate = effectiveExamDate(subject.subject.id, subject);
  const remainingDays = examDate ? daysBetween(todayISO(), examDate) : null;
  const remainingMinutes = subject.topics
    .filter(topic => (subjectState.topicMastery[topic.id] || 'nunca_visto') !== 'sale_solo')
    .reduce((sum, topic) => sum + (topic.estimatedMinutes || 60), 0);
  const todayTasks = [];
  const topTopics = [...subject.topics].sort((a, b) => (b.frequency || 0) - (a.frequency || 0)).slice(0, 6);
  const cardsDue = dueFlashcards(subject).length;

  elements.content.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">${subject.subject.archived ? 'Materia de referencia' : 'Materia activa'}</div>
        <h1 class="page-title">${esc(subject.subject.name)}</h1>
        <p class="lead">${esc(subject.subject.description || 'Banco de ejercicios, materiales, checklist y seguimiento en una sola vista.')}</p>
        <div class="metric-grid">
          <div class="metric"><b>${progress.pct}%</b><span>progreso estimado</span></div>
          <div class="metric"><b>${progress.bankDone}/${progress.bankTotal}</b><span>ítems resueltos</span></div>
          <div class="metric"><b>${Math.round(remainingMinutes / 60)} h</b><span>tiempo temático pendiente</span></div>
          <div class="metric"><b>${cardsDue}</b><span>tarjetas para repasar</span></div>
        </div>
        <div class="quick-actions">
          <button class="btn accent" data-jump-view="bank">Abrir banco</button>
          <button class="btn" data-jump-view="checklist">Actualizar checklist</button>
        </div>
      </div>
      <aside class="hero-note">
        <h2>Seguimiento simple</h2>
        <p>Por ahora la organización se concentra en los checklists de clases y temas. El calendario queda fuera de la navegación.</p>
        <h3>Próximo paso</h3>
        ${todayTasks.length
          ? todayTasks.map(task => `<div class="mini-row"><b>${esc(task.title)}</b><div class="muted">${task.minutes} min</div></div>`).join('')
          : '<p class="muted">No hay bloques asignados para hoy.</p>'}
      </aside>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-title-row"><div><div class="eyebrow">Prioridad</div><h2>Lo que aparece más</h2></div><button class="btn small" data-jump-view="bank">Practicar</button></div>
        ${topTopics.map((topic, index) => `
          <div class="priority-row">
            <span class="topic-dot" style="--topic:${topic.color}"></span>
            <div><b>${esc(topic.name)}</b><small class="muted">Frecuencia histórica: ${topic.frequency || 0}</small></div>
            <button class="btn small" data-bank-topic="${esc(topic.id)}">Buscar</button>
          </div>`).join('')}
      </section>

      <section class="panel">
        <div class="eyebrow">Dominio real</div>
        <h2>No alcanza con “completado”</h2>
        <p class="muted">El estado se guarda por tema y se usa para priorizar el plan.</p>
        ${subject.topics.map(topic => {
          const mastery = subjectState.topicMastery[topic.id] || 'nunca_visto';
          return `<div class="stat-line"><span>${esc(topic.name)}</span><div class="bar"><span style="width:${masteryPercent(mastery)}%;background:${topic.color}"></span></div><select class="status-select" data-topic-mastery="${esc(topic.id)}">${statusOptions(MASTERY_STATES, MASTERY_LABELS, mastery)}</select></div>`;
        }).join('')}
      </section>
    </div>
  `;

  bindViewJumps();
  elements.content.querySelectorAll('[data-topic-mastery]').forEach(select => {
    select.addEventListener('change', () => {
      subjectState.topicMastery[select.dataset.topicMastery] = select.value;
      saveState();
      renderDashboard();
    });
  });
  elements.content.querySelectorAll('[data-bank-topic]').forEach(button => {
    button.addEventListener('click', async () => {
      bankFilters[subject.subject.id] = { ...(bankFilters[subject.subject.id] || {}), topic: button.dataset.bankTopic };
      state.currentView = 'bank';
      saveState();
      renderNav();
      await renderBank();
    });
  });
}

function masteryPercent(value) {
  return { nunca_visto: 0, entiendo: 35, con_ayuda: 70, sale_solo: 100 }[value] || 0;
}

function bindViewJumps() {
  elements.content.querySelectorAll('[data-jump-view]').forEach(button => {
    button.addEventListener('click', async () => {
      state.currentView = button.dataset.jumpView;
      saveState();
      renderNav();
      await renderCurrentView();
    });
  });
  elements.content.querySelectorAll('[data-jump-selection]').forEach(button => {
    button.addEventListener('click', () => switchSelection(button.dataset.jumpSelection));
  });
}

function getBankStatus(subjectId, itemId) {
  return ensureSubjectState(subjectId).bankStatus[itemId] || { status: 'pending', favorite: false };
}

function setBankStatus(subjectId, itemId, patch) {
  const subjectState = ensureSubjectState(subjectId);
  subjectState.bankStatus[itemId] = { ...getBankStatus(subjectId, itemId), ...patch };
  saveState();
}

function bankSearchText(item, subject) {
  const topics = (item.topicIds || []).map(id => topicName(subject, id)).join(' ');
  return normalizeText([
    item.title,
    item.statement,
    item.solution,
    item.subtopic,
    item.sourceType,
    item.year,
    item.instance,
    topics,
    ...(item.tags || [])
  ].join(' '));
}

function renderBank() {
  const subject = activeSubject;
  const subjectId = subject.subject.id;
  const filters = bankFilters[subjectId] ||= { search: '', topic: 'all', kind: 'all', year: 'all', sourceType: 'all', official: 'all', status: 'all', sort: 'frequency' };
  const years = uniq(subject.bank.map(item => item.year)).sort((a, b) => Number(b) - Number(a));
  const sourceTypes = uniq(subject.bank.map(item => item.sourceType)).sort();
  const query = normalizeText(filters.search);

  let list = subject.bank.filter(item => {
    const status = getBankStatus(subjectId, item.id);
    if (query && !bankSearchText(item, subject).includes(query)) return false;
    if (filters.topic !== 'all' && !(item.topicIds || []).includes(filters.topic)) return false;
    if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
    if (filters.year !== 'all' && String(item.year) !== filters.year) return false;
    if (filters.sourceType !== 'all' && item.sourceType !== filters.sourceType) return false;
    if (filters.official === 'yes' && !item.officialSolution) return false;
    if (filters.official === 'with_solution' && !item.hasSolution) return false;
    if (filters.status !== 'all' && status.status !== filters.status) return false;
    return true;
  });

  const sorters = {
    frequency: (a, b) => (b.frequency || 0) - (a.frequency || 0) || Number(b.year || 0) - Number(a.year || 0),
    newest: (a, b) => Number(b.year || 0) - Number(a.year || 0),
    oldest: (a, b) => Number(a.year || 9999) - Number(b.year || 9999),
    title: (a, b) => String(a.title).localeCompare(String(b.title), 'es')
  };
  list.sort(sorters[filters.sort] || sorters.frequency);

  if (!bankSelectedId || !list.some(item => item.id === bankSelectedId)) {
    bankSelectedId = list[0]?.id || null;
    bankSolutionVisible = false;
  }
  const selected = subject.bank.find(item => item.id === bankSelectedId) || null;

  elements.content.innerHTML = `
    ${sectionHeader('Consulta principal', 'Banco de ejercicios y preguntas', 'El buscador revisa enunciados, soluciones, temas, años, instancias y etiquetas.')}
    <section class="filters bank-filters">
      <label class="field field-wide">Buscar
        <input id="bankSearch" value="${esc(filters.search)}" placeholder="Texto del enunciado, tema, año o solución">
      </label>
      <label class="field">Tema
        <select id="bankTopic"><option value="all">Todos</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${filters.topic === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}</select>
      </label>
      <label class="field">Tipo
        <select id="bankKind"><option value="all">Todos</option><option value="exercise" ${filters.kind === 'exercise' ? 'selected' : ''}>Ejercicio</option><option value="theory" ${filters.kind === 'theory' ? 'selected' : ''}>Teoría</option></select>
      </label>
      <label class="field">Origen
        <select id="bankSourceType"><option value="all">Todos</option>${sourceTypes.map(type => `<option value="${esc(type)}" ${filters.sourceType === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select>
      </label>
      <label class="field">Año
        <select id="bankYear"><option value="all">Todos</option>${years.map(year => `<option value="${esc(year)}" ${filters.year === String(year) ? 'selected' : ''}>${esc(year)}</option>`).join('')}</select>
      </label>
      <label class="field">Solución
        <select id="bankOfficial"><option value="all" ${filters.official === 'all' ? 'selected' : ''}>Cualquiera</option><option value="with_solution" ${filters.official === 'with_solution' ? 'selected' : ''}>Con solución</option><option value="yes" ${filters.official === 'yes' ? 'selected' : ''}>Solución oficial</option></select>
      </label>
      <label class="field">Estado
        <select id="bankStatus"><option value="all">Todos</option>${Object.entries(BANK_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </label>
      <label class="field">Orden
        <select id="bankSort"><option value="frequency" ${filters.sort === 'frequency' ? 'selected' : ''}>Más frecuentes</option><option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Más nuevos</option><option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>Más antiguos</option><option value="title" ${filters.sort === 'title' ? 'selected' : ''}>Título</option></select>
      </label>
    </section>
    <div class="search-summary"><span>${list.length} resultados de ${subject.bank.length}</span><span>La solución se muestra solo al pedirla.</span></div>
    <div class="split">
      <div class="list-panel">
        ${list.length ? list.map(item => renderBankListItem(item, subject, item.id === bankSelectedId)).join('') : '<div class="empty">No hay resultados para estos filtros.</div>'}
      </div>
      <article class="detail" id="bankDetail">${renderBankDetail(selected, subject)}</article>
    </div>
  `;

  bindBankEvents(subject, filters);
}

function renderBankListItem(item, subject, active) {
  const status = getBankStatus(subject.subject.id, item.id);
  const topicId = item.topicIds?.[0];
  const preview = String(item.statement || '').replace(/\s+/g, ' ').slice(0, 150);
  return `<button class="list-item ${active ? 'active' : ''}" data-bank-id="${esc(item.id)}">
    <strong>${status.favorite ? '★ ' : ''}${esc(item.title || (item.kind === 'theory' ? 'Pregunta teórica' : 'Ejercicio'))}</strong>
    <small>${esc(topicName(subject, topicId))} · ${esc(item.year || 's/a')} · ${esc(item.instance || item.sourceType || '')} · ${esc(BANK_STATUS_LABELS[status.status])}</small>
    <span class="list-preview">${esc(preview)}</span>
  </button>`;
}

function renderBankDetail(item, subject) {
  if (!item) return '<div class="empty">Seleccioná un resultado.</div>';
  const status = getBankStatus(subject.subject.id, item.id);
  const topicId = item.topicIds?.[0];
  const source = subject.materials.find(material => material.id === item.sourceMaterialId);
  return `
    <div class="chips">
      ${chip(item.kind === 'theory' ? 'Teoría' : 'Ejercicio', 'dark')}
      ${chip(topicName(subject, topicId))}
      ${chip(item.subtopic)}
      ${chip(String(item.year || 'sin año'))}
      ${chip(item.instance || item.sourceType)}
      ${chip(`Frecuencia ${item.frequency || 1}`, (item.frequency || 1) > 2 ? 'warning' : '')}
      ${item.officialSolution ? chip('Solución oficial', 'official') : item.hasSolution ? chip('Con solución') : ''}
      ${chip(BANK_STATUS_LABELS[status.status], status.status === 'done' ? 'done' : status.status === 'review' ? 'review' : '')}
    </div>
    <h2>${esc(item.title || 'Ítem del banco')}</h2>
    <div class="${item.kind === 'theory' ? 'question-text' : 'exercise-text'}" style="--topic:${topicColor(subject, topicId)}">${fmt(item.statement)}</div>
    <div class="quick-actions">
      <button class="btn good" data-bank-action="done">${status.status === 'done' ? 'Marcar pendiente' : 'Lo resolví'}</button>
      <button class="btn bad" data-bank-action="review">${status.status === 'review' ? 'Quitar de repaso' : 'Necesito repasar'}</button>
      <button class="btn" data-bank-action="favorite">${status.favorite ? 'Quitar favorito' : 'Marcar favorito'}</button>
      <button class="btn primary" data-bank-action="solution" ${item.hasSolution ? '' : 'disabled'}>${bankSolutionVisible ? 'Ocultar solución' : 'Ver solución'}</button>
      <button class="btn" data-bank-action="error">Registrar error</button>
    </div>
    ${bankSolutionVisible && item.hasSolution ? `<div class="solution-box"><b>${item.officialSolution ? 'Solución oficial' : 'Solución disponible'}</b><br><br>${fmt(item.solution || 'La solución debe consultarse en el enlace original.')}</div>` : ''}
    <p class="counter">Fuente: ${source ? esc(source.title) : 'sin material asociado'}${item.url ? ` · <a href="${esc(item.url)}" target="_blank" rel="noopener">abrir enunciado</a>` : ''}${item.solutionUrl ? ` · <a href="${esc(item.solutionUrl)}" target="_blank" rel="noopener">abrir solución</a>` : ''}</p>
  `;
}

function bindBankEvents(subject, filters) {
  const rerenderFromInput = debounce(value => {
    filters.search = value;
    renderBank();
    const input = document.querySelector('#bankSearch');
    input?.focus();
    input?.setSelectionRange(value.length, value.length);
  });
  document.querySelector('#bankSearch')?.addEventListener('input', event => rerenderFromInput(event.target.value));
  const controls = {
    bankTopic: 'topic',
    bankKind: 'kind',
    bankSourceType: 'sourceType',
    bankYear: 'year',
    bankOfficial: 'official',
    bankStatus: 'status',
    bankSort: 'sort'
  };
  Object.entries(controls).forEach(([id, key]) => {
    document.querySelector(`#${id}`)?.addEventListener('change', event => {
      filters[key] = event.target.value;
      bankSelectedId = null;
      renderBank();
    });
  });
  document.querySelectorAll('[data-bank-id]').forEach(button => {
    button.addEventListener('click', () => {
      bankSelectedId = button.dataset.bankId;
      bankSolutionVisible = false;
      renderBank();
    });
  });
  document.querySelectorAll('[data-bank-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const item = subject.bank.find(entry => entry.id === bankSelectedId);
      if (!item) return;
      const current = getBankStatus(subject.subject.id, item.id);
      const action = button.dataset.bankAction;
      if (action === 'done') setBankStatus(subject.subject.id, item.id, { status: current.status === 'done' ? 'pending' : 'done' });
      if (action === 'review') setBankStatus(subject.subject.id, item.id, { status: current.status === 'review' ? 'pending' : 'review' });
      if (action === 'favorite') setBankStatus(subject.subject.id, item.id, { favorite: !current.favorite });
      if (action === 'solution') bankSolutionVisible = !bankSolutionVisible;
      if (action === 'error') return openErrorDialog({ subjectId: subject.subject.id, bankItemId: item.id, topicId: item.topicIds?.[0] });
      renderBank();
    });
  });
}

function materialSearchText(material, subject) {
  const topics = (material.topicIds || []).map(id => topicName(subject, id)).join(' ');
  return normalizeText([
    material.title,
    material.type,
    material.year,
    material.instance,
    material.description,
    material.content,
    topics,
    ...(material.subtopics || []),
    ...(material.tags || [])
  ].join(' '));
}

function renderMaterials() {
  const subject = activeSubject;
  const subjectId = subject.subject.id;
  const filters = materialFilters[subjectId] ||= { search: '', topic: 'all', type: 'all', year: 'all', official: 'all' };
  const query = normalizeText(filters.search);
  const types = uniq(subject.materials.map(material => material.type)).sort();
  const years = uniq(subject.materials.map(material => material.year)).sort((a, b) => Number(b) - Number(a));

  const list = subject.materials.filter(material => {
    if (query && !materialSearchText(material, subject).includes(query)) return false;
    if (filters.topic !== 'all' && !(material.topicIds || []).includes(filters.topic)) return false;
    if (filters.type !== 'all' && material.type !== filters.type) return false;
    if (filters.year !== 'all' && String(material.year) !== filters.year) return false;
    if (filters.official === 'yes' && !material.official) return false;
    if (filters.official === 'solution' && !material.hasOfficialSolution) return false;
    return true;
  }).sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || String(a.title).localeCompare(String(b.title), 'es'));

  if (!materialSelectedId || !list.some(material => material.id === materialSelectedId)) {
    materialSelectedId = list[0]?.id || null;
  }
  const selected = subject.materials.find(material => material.id === materialSelectedId) || null;

  elements.content.innerHTML = `
    ${sectionHeader('Biblioteca', 'Materiales y fuentes', 'Busca dentro del título, los metadatos y el texto extraído de cada documento.')}
    <section class="filters">
      <label class="field field-wide">Buscar
        <input id="materialSearch" value="${esc(filters.search)}" placeholder="Nombre, tema o contenido del documento">
      </label>
      <label class="field">Tema
        <select id="materialTopic"><option value="all">Todos</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${filters.topic === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}</select>
      </label>
      <label class="field">Tipo
        <select id="materialType"><option value="all">Todos</option>${types.map(type => `<option value="${esc(type)}" ${filters.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select>
      </label>
      <label class="field">Año
        <select id="materialYear"><option value="all">Todos</option>${years.map(year => `<option value="${esc(year)}" ${filters.year === String(year) ? 'selected' : ''}>${esc(year)}</option>`).join('')}</select>
      </label>
      <label class="field">Fuente
        <select id="materialOfficial"><option value="all" ${filters.official === 'all' ? 'selected' : ''}>Cualquiera</option><option value="yes" ${filters.official === 'yes' ? 'selected' : ''}>Oficial</option><option value="solution" ${filters.official === 'solution' ? 'selected' : ''}>Con solución oficial</option></select>
      </label>
    </section>
    <div class="search-summary"><span>${list.length} materiales de ${subject.materials.length}</span><span>Los enlaces se abren en la fuente original.</span></div>
    <div class="split">
      <div class="list-panel">
        ${list.length ? list.map(material => `
          <button class="list-item ${material.id === materialSelectedId ? 'active' : ''}" data-material-id="${esc(material.id)}">
            <strong>${esc(material.title)}</strong>
            <small>${esc(material.type)} · ${esc(material.year || 's/a')} · ${esc(material.instance || '')}</small>
            <span class="list-preview">${esc(String(material.content || material.description || '').replace(/\s+/g, ' ').slice(0, 150))}</span>
          </button>`).join('') : '<div class="empty">No hay materiales para estos filtros.</div>'}
      </div>
      <article class="detail">${renderMaterialDetail(selected, subject)}</article>
    </div>
  `;

  const rerenderFromInput = debounce(value => {
    filters.search = value;
    renderMaterials();
    const input = document.querySelector('#materialSearch');
    input?.focus();
    input?.setSelectionRange(value.length, value.length);
  });
  document.querySelector('#materialSearch')?.addEventListener('input', event => rerenderFromInput(event.target.value));
  [['materialTopic', 'topic'], ['materialType', 'type'], ['materialYear', 'year'], ['materialOfficial', 'official']].forEach(([id, key]) => {
    document.querySelector(`#${id}`)?.addEventListener('change', event => {
      filters[key] = event.target.value;
      materialSelectedId = null;
      renderMaterials();
    });
  });
  document.querySelectorAll('[data-material-id]').forEach(button => {
    button.addEventListener('click', () => {
      materialSelectedId = button.dataset.materialId;
      renderMaterials();
    });
  });
  document.querySelector('[data-open-solution-material]')?.addEventListener('click', event => {
    const targetId = event.currentTarget.dataset.openSolutionMaterial;
    if (!subject.materials.some(material => material.id === targetId)) {
      toast('El material de solución no está disponible');
      return;
    }
    materialSelectedId = targetId;
    renderMaterials();
  });
}

function renderMaterialDetail(material, subject) {
  if (!material) return '<div class="empty">Seleccioná un material.</div>';
  return `
    <div class="chips">
      ${chip(material.type, 'dark')}
      ${chip(String(material.year || 'sin año'))}
      ${chip(material.instance)}
      ${material.official ? chip('Fuente oficial', 'official') : ''}
      ${material.hasOfficialSolution ? chip('Tiene solución oficial', 'official') : ''}
      ${(material.topicIds || []).map(id => chip(topicName(subject, id))).join('')}
    </div>
    <h2>${esc(material.title)}</h2>
    ${material.description ? `<p>${esc(material.description)}</p>` : ''}
    <div class="quick-actions">
      ${material.url ? `<a class="btn primary" href="${esc(material.url)}" target="_blank" rel="noopener">Abrir documento</a>` : ''}
      ${material.solutionMaterialId ? `<button class="btn" data-open-solution-material="${esc(material.solutionMaterialId)}">Ver material de solución</button>` : ''}
    </div>
    <h3>Contenido extraído</h3>
    <div class="source-content">${fmt(material.content || 'No hay texto extraído en el JSON.')}</div>
  `;
}

function getChecklistItems(subject) {
  const subjectState = ensureSubjectState(subject.subject.id);
  const base = subject.checklist.map(item => ({
    ...item,
    ...(subjectState.checklistOverrides[item.id] || {}),
    custom: false
  }));
  const custom = subjectState.customChecklist.map(item => ({ ...item, custom: true }));
  return [...base, ...custom].sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999) || String(a.title).localeCompare(String(b.title), 'es'));
}

function renderChecklist() {
  const subject = activeSubject;
  const subjectState = currentSubjectState();
  const filters = checklistFilters[subject.subject.id] ||= { search: '', topic: 'all', status: 'all' };
  const query = normalizeText(filters.search);
  const allItems = getChecklistItems(subject);
  const items = allItems.filter(item => {
    const status = subjectState.checklistStatus[item.id] || 'no_iniciado';
    if (query && !normalizeText([item.title, item.description, item.group, topicName(subject, item.topicId)].join(' ')).includes(query)) return false;
    if (filters.topic !== 'all' && item.topicId !== filters.topic) return false;
    if (filters.status !== 'all' && status !== filters.status) return false;
    return true;
  });
  const groups = groupBy(items, item => item.group || topicName(subject, item.topicId) || 'General');
  const mastered = allItems.filter(item => (subjectState.checklistStatus[item.id] || 'no_iniciado') === 'dominado').length;

  elements.content.innerHTML = `
    ${sectionHeader('Seguimiento editable', 'Checklist de la materia', 'Cada ítem puede modificarse. También podés agregar controles propios sin tocar el JSON.', '<button class="btn accent" id="addChecklistItem">Agregar ítem</button>')}
    <section class="metric-grid">
      <div class="metric"><b>${mastered}/${allItems.length}</b><span>dominados</span></div>
      <div class="metric"><b>${allItems.filter(item => (subjectState.checklistStatus[item.id] || 'no_iniciado') === 'practicado').length}</b><span>practicados</span></div>
      <div class="metric"><b>${allItems.filter(item => item.custom).length}</b><span>ítems personales</span></div>
      <div class="metric"><b>${allItems.length ? Math.round(mastered * 100 / allItems.length) : 0}%</b><span>completado fuerte</span></div>
    </section>
    <section class="filters">
      <label class="field field-wide">Buscar
        <input id="checklistSearch" value="${esc(filters.search)}" placeholder="Título, descripción o grupo">
      </label>
      <label class="field">Tema
        <select id="checklistTopicFilter"><option value="all">Todos</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${filters.topic === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}</select>
      </label>
      <label class="field">Estado
        <select id="checklistStatusFilter"><option value="all">Todos</option>${CHECKLIST_STATES.map(value => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${CHECKLIST_LABELS[value]}</option>`).join('')}</select>
      </label>
    </section>
    <div class="search-summary"><span>${items.length} ítems visibles</span><span>El progreso se guarda automáticamente.</span></div>
    ${Object.keys(groups).length ? Object.entries(groups).map(([group, groupItems]) => `
      <section class="panel checklist-group">
        <h2>${esc(group)}</h2>
        ${groupItems.map(item => renderChecklistItem(item, subject, subjectState)).join('')}
      </section>`).join('') : '<section class="panel empty">No hay ítems para estos filtros.</section>'}
  `;

  document.querySelector('#addChecklistItem')?.addEventListener('click', () => openChecklistDialog());
  const rerenderFromInput = debounce(value => {
    filters.search = value;
    renderChecklist();
    const input = document.querySelector('#checklistSearch');
    input?.focus();
    input?.setSelectionRange(value.length, value.length);
  });
  document.querySelector('#checklistSearch')?.addEventListener('input', event => rerenderFromInput(event.target.value));
  document.querySelector('#checklistTopicFilter')?.addEventListener('change', event => {
    filters.topic = event.target.value;
    renderChecklist();
  });
  document.querySelector('#checklistStatusFilter')?.addEventListener('change', event => {
    filters.status = event.target.value;
    renderChecklist();
  });
  document.querySelectorAll('[data-checklist-status]').forEach(select => {
    select.addEventListener('change', () => {
      subjectState.checklistStatus[select.dataset.checklistStatus] = select.value;
      saveState();
      renderChecklist();
    });
  });
  document.querySelectorAll('[data-edit-checklist]').forEach(button => {
    button.addEventListener('click', () => openChecklistDialog(button.dataset.editChecklist));
  });
  document.querySelectorAll('[data-delete-checklist]').forEach(button => {
    button.addEventListener('click', () => deleteChecklistItem(button.dataset.deleteChecklist));
  });
}

function renderChecklistItem(item, subject, subjectState) {
  const status = subjectState.checklistStatus[item.id] || 'no_iniciado';
  return `<div class="check-item ${status === 'dominado' ? 'done' : ''}">
    <div>
      <div class="check-item-title">${esc(item.title)}</div>
      <div class="muted">${esc(item.description || '')}${item.topicId ? ` · ${esc(topicName(subject, item.topicId))}` : ''}</div>
    </div>
    <select class="status-select" data-checklist-status="${esc(item.id)}">${statusOptions(CHECKLIST_STATES, CHECKLIST_LABELS, status)}</select>
    <div class="check-item-actions">
      <button class="btn small" data-edit-checklist="${esc(item.id)}">Editar</button>
      ${item.custom ? `<button class="btn small bad" data-delete-checklist="${esc(item.id)}">Borrar</button>` : ''}
    </div>
  </div>`;
}

function openChecklistDialog(itemId = null) {
  const subject = activeSubject;
  const item = itemId ? getChecklistItems(subject).find(entry => entry.id === itemId) : null;
  document.querySelector('#checklistDialogTitle').textContent = item ? 'Editar ítem' : 'Agregar ítem';
  document.querySelector('#checklistItemId').value = item?.id || '';
  document.querySelector('#checklistTitle').value = item?.title || '';
  document.querySelector('#checklistDescription').value = item?.description || '';
  document.querySelector('#checklistGroup').value = item?.group || '';
  document.querySelector('#checklistTopic').innerHTML = `<option value="">Sin tema</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${item?.topicId === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}`;
  elements.checklistDialog.showModal();
  setTimeout(() => document.querySelector('#checklistTitle')?.focus(), 0);
}

function saveChecklistDialog(event) {
  event.preventDefault();
  if (!activeSubject) return;
  const subjectState = currentSubjectState();
  const id = document.querySelector('#checklistItemId').value;
  const payload = {
    title: document.querySelector('#checklistTitle').value.trim(),
    description: document.querySelector('#checklistDescription').value.trim(),
    group: document.querySelector('#checklistGroup').value.trim() || 'Personal',
    topicId: document.querySelector('#checklistTopic').value || null
  };
  if (!payload.title) return;
  const existingCustom = subjectState.customChecklist.find(item => item.id === id);
  if (existingCustom) Object.assign(existingCustom, payload);
  else if (id) subjectState.checklistOverrides[id] = { ...(subjectState.checklistOverrides[id] || {}), ...payload };
  else subjectState.customChecklist.push({ id: `custom_check_${Date.now()}`, order: 10000 + subjectState.customChecklist.length, ...payload });
  saveState();
  elements.checklistDialog.close();
  renderChecklist();
  toast('Checklist actualizado');
}

function deleteChecklistItem(itemId) {
  const subjectState = currentSubjectState();
  const item = subjectState.customChecklist.find(entry => entry.id === itemId);
  if (!item || !confirm(`Borrar “${item.title}”?`)) return;
  subjectState.customChecklist = subjectState.customChecklist.filter(entry => entry.id !== itemId);
  delete subjectState.checklistStatus[itemId];
  saveState();
  renderChecklist();
}

function renderCards() {
  const subject = activeSubject;
  const subjectState = currentSubjectState();
  const topicFilter = subjectState.cardTopicFilter || 'all';
  const cards = subject.flashcards.filter(card => topicFilter === 'all' || card.topicId === topicFilter);
  const today = todayISO();
  const due = cards.filter(card => !subjectState.flashcards[card.id]?.due || subjectState.flashcards[card.id].due <= today);
  if (!currentFlashcardId || !cards.some(card => card.id === currentFlashcardId)) {
    currentFlashcardId = (due[0] || cards[0])?.id || null;
    flashcardAnswerVisible = false;
  }
  const card = cards.find(entry => entry.id === currentFlashcardId) || null;
  const cardProgress = card ? subjectState.flashcards[card.id] || {} : {};
  const mastered = cards.filter(entry => (subjectState.flashcards[entry.id]?.interval || 0) >= 14).length;

  elements.content.innerHTML = `
    ${sectionHeader('Repaso espaciado', 'Tarjetas', 'Las fechas de repaso se guardan localmente. El JSON aporta las tarjetas iniciales.')}
    <section class="filters">
      <label class="field">Tema
        <select id="cardTopicFilter"><option value="all">Todos</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${topicFilter === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}</select>
      </label>
    </section>
    <div class="metric-grid">
      <div class="metric"><b>${due.length}</b><span>para hoy</span></div>
      <div class="metric"><b>${cards.length}</b><span>tarjetas visibles</span></div>
      <div class="metric"><b>${mastered}</b><span>con intervalo largo</span></div>
      <div class="metric"><b>${cardProgress.due ? esc(formatDate(cardProgress.due)) : 'Hoy'}</b><span>próximo repaso</span></div>
    </div>
    <section class="flashcard-shell">
      ${card ? `
        <article class="flashcard" style="--topic:${topicColor(subject, card.topicId)}">
          <div>
            <small>${esc(topicName(subject, card.topicId))}</small>
            <h2>${esc(card.front)}</h2>
            ${flashcardAnswerVisible ? `<div class="flashcard-answer">${fmt(card.back)}</div>` : '<p class="muted">Intentá responder antes de mostrar la solución.</p>'}
          </div>
        </article>
        <div class="flashcard-actions">
          <button class="btn primary" id="toggleCardAnswer">${flashcardAnswerVisible ? 'Ocultar respuesta' : 'Mostrar respuesta'}</button>
          ${flashcardAnswerVisible ? '<button class="btn bad" data-card-grade="again">Otra vez</button><button class="btn" data-card-grade="soon">En unos días</button><button class="btn good" data-card-grade="mastered">Dominada</button>' : ''}
          <button class="btn" id="nextCard">Siguiente</button>
        </div>`
        : '<section class="panel empty">Esta materia no tiene tarjetas en el JSON.</section>'}
    </section>
  `;

  document.querySelector('#cardTopicFilter')?.addEventListener('change', event => {
    subjectState.cardTopicFilter = event.target.value;
    currentFlashcardId = null;
    flashcardAnswerVisible = false;
    saveState();
    renderCards();
  });
  document.querySelector('#toggleCardAnswer')?.addEventListener('click', () => {
    flashcardAnswerVisible = !flashcardAnswerVisible;
    renderCards();
  });
  document.querySelector('#nextCard')?.addEventListener('click', () => {
    chooseNextCard(cards);
    renderCards();
  });
  document.querySelectorAll('[data-card-grade]').forEach(button => {
    button.addEventListener('click', () => {
      reviewFlashcard(subject.subject.id, card.id, button.dataset.cardGrade);
      chooseNextCard(cards);
      renderCards();
    });
  });
}

function chooseNextCard(cards) {
  if (!cards.length) return;
  const index = cards.findIndex(card => card.id === currentFlashcardId);
  currentFlashcardId = cards[(index + 1) % cards.length].id;
  flashcardAnswerVisible = false;
}

function reviewFlashcard(subjectId, cardId, grade) {
  const subjectState = ensureSubjectState(subjectId);
  const current = subjectState.flashcards[cardId] || { interval: 0 };
  let interval = 0;
  if (grade === 'again') interval = 0;
  if (grade === 'soon') interval = Math.max(3, Math.round((current.interval || 1) * 1.8));
  if (grade === 'mastered') interval = Math.max(14, Math.round((current.interval || 7) * 2));
  subjectState.flashcards[cardId] = {
    interval,
    due: addDaysISO(todayISO(), interval),
    reviewedAt: new Date().toISOString()
  };
  saveState();
}

async function renderErrors(combined) {
  const subjectIds = combined ? state.plan.selectedSubjects : [activeSubjectId()];
  const subjects = (await Promise.all(subjectIds.filter(Boolean).map(loadSubject))).filter(Boolean);
  const allowed = new Set(subjects.map(subject => subject.subject.id));
  const errors = state.errors
    .filter(error => allowed.has(error.subjectId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const subjectById = Object.fromEntries(subjects.map(subject => [subject.subject.id, subject]));
  const commonErrors = subjects.flatMap(subject => (subject.commonErrors || []).map(error => ({ ...error, subjectId: subject.subject.id })));

  elements.content.innerHTML = `
    ${sectionHeader('Corrección activa', combined ? 'Errores de las materias elegidas' : 'Banco personal de errores', 'Registrar por qué falló un ejercicio permite detectar patrones que el progreso general oculta.', '<button class="btn accent" id="addError">Registrar error</button>')}
    <div class="metric-grid">
      <div class="metric"><b>${errors.length}</b><span>errores registrados</span></div>
      <div class="metric"><b>${uniq(errors.map(error => error.topicId)).length}</b><span>temas afectados</span></div>
      <div class="metric"><b>${errors.filter(error => error.date >= addDaysISO(todayISO(), -7)).length}</b><span>últimos 7 días</span></div>
      <div class="metric"><b>${commonErrors.length}</b><span>errores frecuentes del JSON</span></div>
    </div>
    <div class="grid-2">
      <section>
        ${errors.length ? errors.map(error => renderUserError(error, subjectById[error.subjectId])).join('') : '<section class="panel empty">Todavía no registraste errores.</section>'}
      </section>
      <section class="panel">
        <div class="eyebrow">Referencia</div>
        <h2>Errores frecuentes detectados</h2>
        <p class="muted">Estos vienen del JSON de cada materia y no se mezclan con tus registros personales.</p>
        ${commonErrors.length ? commonErrors.slice(0, 30).map(error => `
          <div class="mini-row" style="--topic:${topicColor(subjectById[error.subjectId], error.topicId)}">
            <b>${esc(error.title)}</b>
            <div class="muted">${esc(subjectById[error.subjectId]?.subject.shortName || error.subjectId)} · ${esc(error.why || '')}</div>
            ${error.correct ? `<div>${esc(error.correct)}</div>` : ''}
          </div>`).join('') : '<p class="muted">No hay errores frecuentes definidos.</p>'}
      </section>
    </div>
  `;

  document.querySelector('#addError')?.addEventListener('click', () => openErrorDialog({ subjectId: combined ? state.plan.selectedSubjects[0] : activeSubjectId() }));
  document.querySelectorAll('[data-edit-error]').forEach(button => {
    button.addEventListener('click', () => openErrorDialog({ errorId: button.dataset.editError }));
  });
  document.querySelectorAll('[data-delete-error]').forEach(button => {
    button.addEventListener('click', () => deleteError(button.dataset.deleteError));
  });
}

function renderUserError(error, subject) {
  const bankItem = subject?.bank.find(item => item.id === error.bankItemId);
  return `<article class="error-card">
    <div class="chips">
      ${chip(subject?.subject.shortName || error.subjectId, 'dark')}
      ${chip(topicName(subject || { topics: [] }, error.topicId))}
      ${chip(formatDate(error.date))}
    </div>
    <h3>${esc(bankItem?.title || 'Error de estudio')}</h3>
    <p>${fmt(error.what)}</p>
    <div class="error-correct"><b>Idea correcta</b><br>${fmt(error.correct)}</div>
    <div class="quick-actions">
      <button class="btn small" data-edit-error="${esc(error.id)}">Editar</button>
      <button class="btn small bad" data-delete-error="${esc(error.id)}">Borrar</button>
    </div>
  </article>`;
}

async function openErrorDialog({ errorId = null, subjectId = null, bankItemId = null, topicId = null } = {}) {
  const existing = errorId ? state.errors.find(error => error.id === errorId) : null;
  const chosenSubjectId = existing?.subjectId || subjectId || activeSubjectId() || state.plan.selectedSubjects[0] || registry.subjects[0]?.id;
  document.querySelector('#errorDialogTitle').textContent = existing ? 'Editar error' : 'Registrar error';
  document.querySelector('#errorId').value = existing?.id || '';
  document.querySelector('#errorWhat').value = existing?.what || '';
  document.querySelector('#errorCorrect').value = existing?.correct || '';
  document.querySelector('#errorDate').value = existing?.date || todayISO();
  document.querySelector('#errorSubject').innerHTML = registry.subjects.map(subject => `<option value="${esc(subject.id)}" ${chosenSubjectId === subject.id ? 'selected' : ''}>${esc(subject.name)}</option>`).join('');

  async function populateRelated(selectedSubjectId, selectedTopicId = null, selectedBankItemId = null) {
    const subject = await loadSubject(selectedSubjectId);
    document.querySelector('#errorTopic').innerHTML = `<option value="">Sin tema</option>${subject.topics.map(topic => `<option value="${esc(topic.id)}" ${selectedTopicId === topic.id ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}`;
    const options = subject.bank.map(item => `<option value="${esc(item.id)}" ${selectedBankItemId === item.id ? 'selected' : ''}>${esc(`${item.year || 's/a'} · ${item.title} · ${String(item.statement || '').replace(/\s+/g, ' ').slice(0, 85)}`)}</option>`).join('');
    document.querySelector('#errorBankItem').innerHTML = `<option value="">Sin ejercicio relacionado</option>${options}`;
  }

  await populateRelated(chosenSubjectId, existing?.topicId || topicId, existing?.bankItemId || bankItemId);
  document.querySelector('#errorSubject').onchange = event => populateRelated(event.target.value);
  elements.errorDialog.showModal();
  setTimeout(() => document.querySelector('#errorWhat')?.focus(), 0);
}

function saveErrorDialog(event) {
  event.preventDefault();
  const id = document.querySelector('#errorId').value;
  const payload = {
    subjectId: document.querySelector('#errorSubject').value,
    topicId: document.querySelector('#errorTopic').value || null,
    bankItemId: document.querySelector('#errorBankItem').value || null,
    what: document.querySelector('#errorWhat').value.trim(),
    correct: document.querySelector('#errorCorrect').value.trim(),
    date: document.querySelector('#errorDate').value,
    updatedAt: new Date().toISOString()
  };
  if (!payload.subjectId || !payload.what || !payload.correct || !payload.date) return;
  const existing = state.errors.find(error => error.id === id);
  if (existing) Object.assign(existing, payload);
  else state.errors.push({ id: `error_${Date.now()}`, createdAt: new Date().toISOString(), ...payload });
  saveState();
  elements.errorDialog.close();
  renderErrors(isPlanMode());
  toast('Error guardado');
}

function deleteError(errorId) {
  const error = state.errors.find(entry => entry.id === errorId);
  if (!error || !confirm('Borrar este error del registro personal?')) return;
  state.errors = state.errors.filter(entry => entry.id !== errorId);
  saveState();
  renderErrors(isPlanMode());
}

async function renderPlan() {
  const selectedIds = state.plan.selectedSubjects;
  const selectedSubjects = (await Promise.all(selectedIds.map(loadSubject))).filter(Boolean);
  const tasks = state.plan.days.flatMap(day => day.tasks.map(task => ({ ...task, date: day.date })));
  const pending = tasks.filter(task => !task.done);
  const totalMinutes = pending.reduce((sum, task) => sum + Number(task.minutes || 0), 0);
  const overloadedDays = state.plan.days.filter(day => day.tasks.reduce((sum, task) => sum + Number(task.minutes || 0), 0) > state.plan.dailyMinutes).length;
  const nextTasks = pending.filter(task => task.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  elements.content.innerHTML = `
    ${sectionHeader('Organización multi-materia', 'Plan combinado', 'Elegí las materias y actualizá manualmente. Marcar tareas o checklist no redistribuye el calendario.')}
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">Configuración</div>
        <h1 class="page-title">Un plan, varias materias</h1>
        <p class="lead">Cada JSON aporta bloques estimados, prioridad y frecuencia. La plataforma los intercala respetando la fecha de examen de cada materia.</p>
        <div class="metric-grid">
          <div class="metric"><b>${selectedIds.length}</b><span>materias elegidas</span></div>
          <div class="metric"><b>${pending.length}</b><span>tareas pendientes</span></div>
          <div class="metric"><b>${Math.round(totalMinutes / 60)} h</b><span>carga pendiente</span></div>
          <div class="metric"><b>${overloadedDays}</b><span>días sobrecargados</span></div>
        </div>
        <div class="quick-actions">
          <button class="btn accent" id="updatePlan">Actualizar plan</button>
          <button class="btn" data-plan-jump="calendar">Abrir calendario</button>
          <button class="btn bad" id="clearPlan">Vaciar calendario</button>
        </div>
      </div>
      <aside class="hero-note">
        <h2>Próximos bloques</h2>
        ${nextTasks.length ? nextTasks.map(task => `<div class="mini-row"><b>${esc(task.title)}</b><div class="muted">${esc(registryItem(task.subjectId)?.shortName || task.subjectId)} · ${esc(formatDate(task.date))} · ${task.minutes} min</div></div>`).join('') : '<p class="muted">Todavía no hay un plan generado.</p>'}
      </aside>
    </section>

    <section class="panel">
      <div class="panel-title-row"><div><div class="eyebrow">Materias</div><h2>Qué entra en el plan</h2></div><span class="counter">La selección se guarda, pero el calendario cambia solo con “Actualizar plan”.</span></div>
      <div class="subject-choice-grid">
        ${registry.subjects.map(item => {
          const checked = selectedIds.includes(item.id);
          const cached = subjectCache.get(item.id);
          const examDate = state.plan.examDates[item.id] || cached?.subject.examDate || cached?.plan.examDate || item.examDate || '';
          return `<div class="subject-choice">
            <input type="checkbox" data-plan-subject="${esc(item.id)}" ${checked ? 'checked' : ''} aria-label="Incluir ${esc(item.name)}">
            <div class="subject-choice-body">
              <div><b>${esc(item.name)}</b>${item.archived ? ' ' + chip('Archivada') : ''}<div class="muted">${esc(item.description || '')}</div></div>
              <label>Fecha de examen<input type="date" data-exam-date="${esc(item.id)}" value="${esc(examDate)}"></label>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>

    <div style="height:18px"></div>
    <section class="panel">
      <div class="eyebrow">Distribución</div>
      <h2>Capacidad del calendario</h2>
      <div class="form-grid">
        <label class="field">Repartir desde
          <input id="planStartDate" type="date" value="${esc(state.plan.startDate || todayISO())}">
        </label>
        <label class="field">Minutos por día
          <input id="planDailyMinutes" type="number" min="15" max="720" step="15" value="${Number(state.plan.dailyMinutes || 120)}">
        </label>
        <div class="field field-wide">Días de estudio
          <div class="weekday-row">${WEEKDAYS.map(day => `<label class="weekday-pill"><input type="checkbox" data-study-day="${day.value}" ${state.plan.studyDays.includes(day.value) ? 'checked' : ''}>${day.label}</label>`).join('')}</div>
        </div>
      </div>
      ${state.plan.updatedAt ? `<p class="counter">Última actualización: ${new Date(state.plan.updatedAt).toLocaleString('es-UY')}.</p>` : '<p class="counter">El calendario todavía no fue generado.</p>'}
      ${overloadedDays ? `<div class="warning-note">Hay ${overloadedDays} días que superan la capacidad elegida. Esto sucede cuando no queda espacio antes de una fecha de examen o cuando una tarea fue movida manualmente.</div>` : ''}
    </section>

    <div style="height:18px"></div>
    <section class="panel">
      <div class="eyebrow">Carga detectada</div>
      <h2>Bloques disponibles por materia</h2>
      ${selectedSubjects.length ? selectedSubjects.map(subject => {
        const subjectTasks = subject.plan.tasks?.length || subject.topics.length;
        const scheduled = tasks.filter(task => task.subjectId === subject.subject.id).length;
        const examDate = effectiveExamDate(subject.subject.id, subject);
        return `<div class="priority-row"><span class="topic-dot" style="--topic:${subject.subject.color}"></span><div><b>${esc(subject.subject.name)}</b><small class="muted">${subjectTasks} bloques base · ${scheduled} en calendario · examen ${examDate ? formatDate(examDate) : 'sin fecha'}</small></div><button class="btn small" data-open-subject="${esc(subject.subject.id)}">Abrir</button></div>`;
      }).join('') : '<p class="muted">Elegí al menos una materia.</p>'}
    </section>
  `;

  document.querySelectorAll('[data-plan-subject]').forEach(input => {
    input.addEventListener('change', () => {
      const set = new Set(state.plan.selectedSubjects);
      if (input.checked) set.add(input.dataset.planSubject);
      else set.delete(input.dataset.planSubject);
      state.plan.selectedSubjects = [...set];
      saveState();
    });
  });
  document.querySelectorAll('[data-exam-date]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.value) state.plan.examDates[input.dataset.examDate] = input.value;
      else delete state.plan.examDates[input.dataset.examDate];
      saveState();
    });
  });
  document.querySelector('#planStartDate')?.addEventListener('change', event => {
    state.plan.startDate = event.target.value || todayISO();
    saveState();
  });
  document.querySelector('#planDailyMinutes')?.addEventListener('change', event => {
    state.plan.dailyMinutes = clamp(Number(event.target.value) || 120, 15, 720);
    saveState();
  });
  document.querySelectorAll('[data-study-day]').forEach(input => {
    input.addEventListener('change', () => {
      state.plan.studyDays = [...document.querySelectorAll('[data-study-day]:checked')].map(item => Number(item.dataset.studyDay));
      saveState();
    });
  });
  document.querySelector('#updatePlan')?.addEventListener('click', generatePlan);
  document.querySelector('#clearPlan')?.addEventListener('click', clearPlan);
  document.querySelectorAll('[data-plan-jump]').forEach(button => {
    button.addEventListener('click', async () => {
      state.currentView = button.dataset.planJump;
      saveState();
      renderNav();
      await renderCurrentView();
    });
  });
  document.querySelectorAll('[data-open-subject]').forEach(button => {
    button.addEventListener('click', () => switchSelection(button.dataset.openSubject));
  });
}

function readPlanSettingsFromDom() {
  const selected = [...document.querySelectorAll('[data-plan-subject]:checked')].map(input => input.dataset.planSubject);
  if (selected.length || document.querySelectorAll('[data-plan-subject]').length) state.plan.selectedSubjects = selected;
  const start = document.querySelector('#planStartDate')?.value;
  if (start) state.plan.startDate = start;
  const daily = Number(document.querySelector('#planDailyMinutes')?.value);
  if (daily) state.plan.dailyMinutes = clamp(daily, 15, 720);
  const studyDays = [...document.querySelectorAll('[data-study-day]:checked')].map(input => Number(input.dataset.studyDay));
  if (document.querySelectorAll('[data-study-day]').length) state.plan.studyDays = studyDays;
  document.querySelectorAll('[data-exam-date]').forEach(input => {
    if (input.value) state.plan.examDates[input.dataset.examDate] = input.value;
    else delete state.plan.examDates[input.dataset.examDate];
  });
}

function planSourceTasks(subject) {
  if (subject.plan.tasks?.length) return subject.plan.tasks;
  return subject.topics.map((topic, index) => ({
    id: `topic_${topic.id}`,
    title: `Estudiar ${topic.name}`,
    topicId: topic.id,
    kind: 'tema',
    estimatedMinutes: topic.estimatedMinutes || 60,
    priority: 2,
    frequency: topic.frequency || 0,
    phase: index + 1
  }));
}

function planTaskScore(subjectId, task) {
  const mastery = ensureSubjectState(subjectId).topicMastery[task.topicId] || 'nunca_visto';
  const weaknessBonus = { nunca_visto: 18, entiendo: 10, con_ayuda: 4, sale_solo: -12 }[mastery] || 0;
  return Number(task.priority || 1) * 10 + Math.min(25, Number(task.frequency || 0)) + weaknessBonus;
}

function dateRange(from, to, allowedDays) {
  const start = parseISODate(from);
  const end = parseISODate(to);
  if (!start || !end || end < start) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (allowedDays.includes(cursor.getDay())) dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function generatePlan() {
  readPlanSettingsFromDom();
  const selectedIds = state.plan.selectedSubjects;
  if (!selectedIds.length) {
    toast('Elegí al menos una materia');
    return;
  }
  if (!state.plan.studyDays.length) {
    toast('Elegí al menos un día de estudio');
    return;
  }
  const subjects = await Promise.all(selectedIds.map(loadSubject));
  const startDate = state.plan.startDate || todayISO();
  const dailyMinutes = Number(state.plan.dailyMinutes || 120);
  const oldTasks = state.plan.days.flatMap(day => day.tasks.map(task => ({ ...task, date: day.date })));
  const preserved = oldTasks.filter(task => task.done || task.date < startDate || task.source === 'custom' || task.edited);
  const reservedOrigins = new Set(preserved.map(task => task.originKey).filter(Boolean));
  const suppressed = new Set(state.plan.suppressedTaskIds || []);

  const subjectInfo = {};
  const candidatesBySubject = {};
  for (const subject of subjects) {
    const subjectId = subject.subject.id;
    const requestedDeadline = effectiveExamDate(subjectId, subject) || addDaysISO(startDate, 60);
    const deadline = requestedDeadline < startDate ? startDate : requestedDeadline;
    const sourceTasks = planSourceTasks(subject);
    const candidates = sourceTasks
      .map(task => ({
        originKey: `${subjectId}:${task.id}`,
        subjectId,
        title: task.title,
        topicId: task.topicId || null,
        kind: task.kind || 'tema',
        minutes: clamp(Number(task.estimatedMinutes || 60), 5, 600),
        phase: Number(task.phase || 1),
        score: planTaskScore(subjectId, task),
        deadline
      }))
      .filter(task => !reservedOrigins.has(task.originKey) && !suppressed.has(task.originKey))
      .sort((a, b) => a.phase - b.phase || b.score - a.score || a.title.localeCompare(b.title, 'es'));
    candidatesBySubject[subjectId] = candidates;
    subjectInfo[subjectId] = {
      deadline,
      totalMinutes: candidates.reduce((sum, task) => sum + task.minutes, 0),
      scheduledMinutes: 0
    };
  }

  const orderedCandidates = [];
  while (Object.values(candidatesBySubject).some(queue => queue.length)) {
    const available = selectedIds.filter(id => candidatesBySubject[id]?.length);
    available.sort((a, b) => {
      const aInfo = subjectInfo[a];
      const bInfo = subjectInfo[b];
      const aRatio = aInfo.totalMinutes ? aInfo.scheduledMinutes / aInfo.totalMinutes : 1;
      const bRatio = bInfo.totalMinutes ? bInfo.scheduledMinutes / bInfo.totalMinutes : 1;
      return aInfo.deadline.localeCompare(bInfo.deadline) || aRatio - bRatio;
    });
    const chosenId = available[0];
    const task = candidatesBySubject[chosenId].shift();
    subjectInfo[chosenId].scheduledMinutes += task.minutes;
    orderedCandidates.push(task);
  }

  const latestDeadline = subjects
    .map(subject => {
      const requested = effectiveExamDate(subject.subject.id, subject) || addDaysISO(startDate, 60);
      return requested < startDate ? startDate : requested;
    })
    .sort()
    .at(-1);
  const validDates = dateRange(startDate, latestDeadline, state.plan.studyDays);
  const taskMap = groupBy(preserved, task => task.date);
  const usedMinutes = Object.fromEntries(Object.entries(taskMap).map(([date, tasks]) => [date, tasks.reduce((sum, task) => sum + Number(task.minutes || 0), 0)]));

  for (const candidate of orderedCandidates) {
    const possible = validDates.filter(date => date <= candidate.deadline);
    let chosenDate = possible.find(date => (usedMinutes[date] || 0) + candidate.minutes <= dailyMinutes);
    if (!chosenDate) chosenDate = possible.at(-1) || candidate.deadline;
    usedMinutes[chosenDate] = (usedMinutes[chosenDate] || 0) + candidate.minutes;
    (taskMap[chosenDate] ||= []).push({
      id: `plan_${candidate.originKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      originKey: candidate.originKey,
      subjectId: candidate.subjectId,
      title: candidate.title,
      topicId: candidate.topicId,
      kind: candidate.kind,
      minutes: candidate.minutes,
      done: false,
      source: 'generated',
      createdAt: new Date().toISOString()
    });
  }

  state.plan.days = Object.entries(taskMap)
    .map(([date, tasks]) => ({ date, tasks: tasks.sort((a, b) => Number(a.done) - Number(b.done) || String(a.subjectId).localeCompare(String(b.subjectId))) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  state.plan.updatedAt = new Date().toISOString();
  saveState();
  await renderPlan();
  toast('Plan actualizado');
}

function clearPlan() {
  if (!confirm('Vaciar todo el calendario, incluidas las tareas agregadas manualmente?')) return;
  state.plan.days = [];
  state.plan.updatedAt = null;
  state.plan.suppressedTaskIds = [];
  saveState();
  renderPlan();
}

async function renderCalendar() {
  const selectedIds = state.plan.selectedSubjects;
  const filter = state.plan.calendarSubjectFilter || 'all';
  const days = state.plan.days
    .map(day => ({ ...day, tasks: day.tasks.filter(task => filter === 'all' || task.subjectId === filter) }))
    .filter(day => day.tasks.length);
  const visibleTasks = days.flatMap(day => day.tasks.map(task => ({ ...task, date: day.date })));
  const done = visibleTasks.filter(task => task.done).length;
  const pendingMinutes = visibleTasks.filter(task => !task.done).reduce((sum, task) => sum + Number(task.minutes || 0), 0);

  elements.content.innerHTML = `
    ${sectionHeader('Plan editable', 'Calendario', 'Podés mover, editar, agregar o borrar tareas. Marcar una tarea no redistribuye las demás.', '<button class="btn accent" id="addPlanTask">Agregar tarea</button>')}
    <section class="filters">
      <label class="field">Materia
        <select id="calendarSubjectFilter"><option value="all">Todas</option>${selectedIds.map(id => `<option value="${esc(id)}" ${filter === id ? 'selected' : ''}>${esc(registryItem(id)?.name || id)}</option>`).join('')}</select>
      </label>
    </section>
    <div class="metric-grid">
      <div class="metric"><b>${visibleTasks.length}</b><span>tareas visibles</span></div>
      <div class="metric"><b>${done}</b><span>completadas</span></div>
      <div class="metric"><b>${Math.round(pendingMinutes / 60)} h</b><span>pendientes</span></div>
      <div class="metric"><b>${state.plan.days.length}</b><span>días con tareas</span></div>
    </div>
    ${days.length ? days.map(day => renderPlanDay(day)).join('') : '<section class="panel empty">No hay tareas visibles. Generá el plan o agregá una tarea manual.</section>'}
  `;

  document.querySelector('#calendarSubjectFilter')?.addEventListener('change', event => {
    state.plan.calendarSubjectFilter = event.target.value;
    saveState();
    renderCalendar();
  });
  document.querySelector('#addPlanTask')?.addEventListener('click', () => openPlanTaskDialog());
  document.querySelectorAll('[data-plan-task-done]').forEach(input => {
    input.addEventListener('change', () => togglePlanTask(input.dataset.planTaskDone, input.checked));
  });
  document.querySelectorAll('[data-edit-plan-task]').forEach(button => {
    button.addEventListener('click', () => openPlanTaskDialog(button.dataset.editPlanTask));
  });
  document.querySelectorAll('[data-delete-plan-task]').forEach(button => {
    button.addEventListener('click', () => deletePlanTask(button.dataset.deletePlanTask));
  });
}

function renderPlanDay(day) {
  const totalMinutes = day.tasks.reduce((sum, task) => sum + Number(task.minutes || 0), 0);
  const classes = [day.date === todayISO() ? 'today' : '', totalMinutes > state.plan.dailyMinutes ? 'overloaded' : ''].filter(Boolean).join(' ');
  return `<section class="plan-day ${classes}">
    <div class="plan-day-head"><h2>${esc(formatDate(day.date, { weekday: true, long: true }))}</h2><span class="summary-pill">${totalMinutes} min</span></div>
    ${day.tasks.map(task => `
      <div class="plan-task ${task.done ? 'done' : ''}">
        <input type="checkbox" data-plan-task-done="${esc(task.id)}" ${task.done ? 'checked' : ''} aria-label="Completar tarea">
        <div>
          <div class="plan-task-title"><b>${esc(task.title)}</b></div>
          <div class="plan-task-meta"><span>${esc(registryItem(task.subjectId)?.shortName || task.subjectId)}</span><span>${task.minutes} min</span><span>${esc(task.kind || 'tarea')}</span>${task.edited ? '<span>editada</span>' : ''}</div>
        </div>
        <div class="plan-task-actions"><button class="btn small" data-edit-plan-task="${esc(task.id)}">Editar</button><button class="btn small bad" data-delete-plan-task="${esc(task.id)}">Borrar</button></div>
      </div>`).join('')}
  </section>`;
}

function findPlanTask(taskId) {
  for (const day of state.plan.days) {
    const task = day.tasks.find(entry => entry.id === taskId);
    if (task) return { day, task };
  }
  return null;
}

function togglePlanTask(taskId, done) {
  const found = findPlanTask(taskId);
  if (!found) return;
  found.task.done = done;
  found.task.completedAt = done ? new Date().toISOString() : null;
  saveState();
  renderCalendar();
}

function openPlanTaskDialog(taskId = null) {
  const found = taskId ? findPlanTask(taskId) : null;
  const task = found?.task || null;
  document.querySelector('#planTaskDialogTitle').textContent = task ? 'Editar tarea' : 'Agregar tarea';
  document.querySelector('#planTaskId').value = task?.id || '';
  document.querySelector('#planTaskTitle').value = task?.title || '';
  document.querySelector('#planTaskDate').value = found?.day.date || todayISO();
  document.querySelector('#planTaskMinutes').value = task?.minutes || 60;
  document.querySelector('#planTaskKind').value = task?.kind || 'tema';
  const availableIds = uniq([...state.plan.selectedSubjects, task?.subjectId, registry.defaultSubject]);
  document.querySelector('#planTaskSubject').innerHTML = availableIds.filter(Boolean).map(id => `<option value="${esc(id)}" ${task?.subjectId === id ? 'selected' : ''}>${esc(registryItem(id)?.name || id)}</option>`).join('');
  elements.planTaskDialog.showModal();
  setTimeout(() => document.querySelector('#planTaskTitle')?.focus(), 0);
}

function savePlanTaskDialog(event) {
  event.preventDefault();
  const id = document.querySelector('#planTaskId').value;
  const date = document.querySelector('#planTaskDate').value;
  const payload = {
    title: document.querySelector('#planTaskTitle').value.trim(),
    subjectId: document.querySelector('#planTaskSubject').value,
    minutes: clamp(Number(document.querySelector('#planTaskMinutes').value) || 60, 5, 600),
    kind: document.querySelector('#planTaskKind').value || 'otro'
  };
  if (!date || !payload.title || !payload.subjectId) return;
  const found = id ? findPlanTask(id) : null;
  if (found) {
    found.day.tasks = found.day.tasks.filter(task => task.id !== id);
    Object.assign(found.task, payload, { edited: true });
    addTaskToDate(date, found.task);
  } else {
    addTaskToDate(date, {
      id: `custom_plan_${Date.now()}`,
      ...payload,
      done: false,
      source: 'custom',
      edited: true,
      createdAt: new Date().toISOString()
    });
  }
  cleanupPlanDays();
  saveState();
  elements.planTaskDialog.close();
  renderCalendar();
  toast('Calendario actualizado');
}

function addTaskToDate(date, task) {
  let day = state.plan.days.find(entry => entry.date === date);
  if (!day) {
    day = { date, tasks: [] };
    state.plan.days.push(day);
  }
  day.tasks.push(task);
}

function cleanupPlanDays() {
  state.plan.days = state.plan.days.filter(day => day.tasks.length).sort((a, b) => a.date.localeCompare(b.date));
}

function deletePlanTask(taskId) {
  const found = findPlanTask(taskId);
  if (!found || !confirm(`Borrar “${found.task.title}”?`)) return;
  if (found.task.originKey) {
    const suppressed = new Set(state.plan.suppressedTaskIds || []);
    suppressed.add(found.task.originKey);
    state.plan.suppressedTaskIds = [...suppressed];
  }
  found.day.tasks = found.day.tasks.filter(task => task.id !== taskId);
  cleanupPlanDays();
  saveState();
  renderCalendar();
}
