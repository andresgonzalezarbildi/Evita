import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const dataDir = path.join(rootDir, 'data');
const idPattern = /^[a-z0-9][a-z0-9_-]*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const errors = [];
const warnings = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(rootDir, filePath)}: JSON inválido (${error.message})`);
    return null;
  }
}

function fail(file, location, message) {
  errors.push(`${file}${location ? ` · ${location}` : ''}: ${message}`);
}

function warn(file, location, message) {
  warnings.push(`${file}${location ? ` · ${location}` : ''}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(file, value, location) {
  if (!isObject(value)) {
    fail(file, location, 'debe ser un objeto');
    return false;
  }
  return true;
}

function requireArray(file, value, location) {
  if (!Array.isArray(value)) {
    fail(file, location, 'debe ser un arreglo');
    return false;
  }
  return true;
}

function requireString(file, value, location, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    fail(file, location, allowEmpty ? 'debe ser texto' : 'debe ser texto no vacío');
    return false;
  }
  return true;
}

function requireBoolean(file, value, location) {
  if (typeof value !== 'boolean') {
    fail(file, location, 'debe ser booleano');
    return false;
  }
  return true;
}

function requireNumber(file, value, location, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(file, location, `debe ser un número entre ${min} y ${max}`);
    return false;
  }
  return true;
}

function requireInteger(file, value, location, min = -Infinity, max = Infinity) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(file, location, `debe ser un entero entre ${min} y ${max}`);
    return false;
  }
  return true;
}

function requireId(file, value, location, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  if (!requireString(file, value, location)) return false;
  if (!idPattern.test(value)) {
    fail(file, location, 'debe cumplir ^[a-z0-9][a-z0-9_-]*$');
    return false;
  }
  return true;
}

function requireDate(file, value, location) {
  if (value === null) return true;
  if (typeof value !== 'string' || !datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00`))) {
    fail(file, location, 'debe ser null o una fecha YYYY-MM-DD válida');
    return false;
  }
  return true;
}

function requireUrl(file, value, location) {
  if (value === null) return true;
  if (typeof value !== 'string') {
    fail(file, location, 'debe ser null o una URL');
    return false;
  }
  try {
    const url = new URL(value, 'https://local.invalid');
    if (!['http:', 'https:', 'file:'].includes(url.protocol) && !value.startsWith('/')) {
      fail(file, location, 'usa un protocolo no admitido');
      return false;
    }
  } catch {
    fail(file, location, 'no es una URL válida');
    return false;
  }
  return true;
}

function checkAllowedKeys(file, object, location, allowed) {
  if (!isObject(object)) return;
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(file, `${location}.${key}`, 'propiedad no admitida por schemaVersion 1');
  }
  for (const key of allowed) {
    if (!(key in object)) fail(file, `${location}.${key}`, 'propiedad obligatoria ausente');
  }
}

function checkStringArray(file, value, location, { ids = false } = {}) {
  if (!requireArray(file, value, location)) return;
  value.forEach((entry, index) => {
    if (ids) requireId(file, entry, `${location}[${index}]`);
    else requireString(file, entry, `${location}[${index}]`, { allowEmpty: false });
  });
}

function collectIds(file, collection, name) {
  const ids = new Set();
  if (!requireArray(file, collection, name)) return ids;
  collection.forEach((item, index) => {
    const location = `${name}[${index}].id`;
    if (!isObject(item)) {
      fail(file, `${name}[${index}]`, 'debe ser un objeto');
      return;
    }
    if (!requireId(file, item.id, location)) return;
    if (ids.has(item.id)) fail(file, location, `identificador duplicado: ${item.id}`);
    ids.add(item.id);
  });
  return ids;
}

function checkReference(file, value, validIds, location, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!requireId(file, value, location)) return;
  if (!validIds.has(value)) fail(file, location, `referencia inexistente: ${value}`);
}

function checkReferenceArray(file, value, validIds, location) {
  if (!requireArray(file, value, location)) return;
  const seen = new Set();
  value.forEach((id, index) => {
    if (!requireId(file, id, `${location}[${index}]`)) return;
    if (!validIds.has(id)) fail(file, `${location}[${index}]`, `referencia inexistente: ${id}`);
    if (seen.has(id)) warn(file, location, `referencia repetida: ${id}`);
    seen.add(id);
  });
}

function validateSubject(data, file, expectedId = null, { template = false } = {}) {
  if (!requireObject(file, data, 'raíz')) return null;
  const rootRequired = ['schemaVersion', 'subject', 'topics', 'skills', 'materials', 'bank', 'checklist', 'flashcards', 'commonErrors', 'plan'];
  const rootAllowed = [...rootRequired, 'metadata'];
  for (const key of Object.keys(data)) if (!rootAllowed.includes(key)) fail(file, key, 'propiedad raíz no admitida');
  rootRequired.forEach(key => { if (!(key in data)) fail(file, key, 'propiedad obligatoria ausente'); });
  if (data.schemaVersion !== 1) fail(file, 'schemaVersion', 'debe valer 1');

  if (!requireObject(file, data.subject, 'subject')) return null;
  checkAllowedKeys(file, data.subject, 'subject', ['id', 'name', 'shortName', 'description', 'color', 'examDate', 'sourceUrl', 'archived']);
  requireId(file, data.subject.id, 'subject.id');
  requireString(file, data.subject.name, 'subject.name');
  requireString(file, data.subject.shortName, 'subject.shortName');
  requireString(file, data.subject.description, 'subject.description', { allowEmpty: true });
  if (typeof data.subject.color !== 'string' || !colorPattern.test(data.subject.color)) fail(file, 'subject.color', 'debe ser un color hexadecimal #RRGGBB');
  requireDate(file, data.subject.examDate, 'subject.examDate');
  requireUrl(file, data.subject.sourceUrl, 'subject.sourceUrl');
  requireBoolean(file, data.subject.archived, 'subject.archived');
  if (expectedId && data.subject.id !== expectedId) fail(file, 'subject.id', `debe coincidir con el registro (${expectedId})`);

  const topicIds = collectIds(file, data.topics, 'topics');
  const skillIds = collectIds(file, data.skills, 'skills');
  const materialIds = collectIds(file, data.materials, 'materials');
  const bankIds = collectIds(file, data.bank, 'bank');
  collectIds(file, data.checklist, 'checklist');
  collectIds(file, data.flashcards, 'flashcards');
  collectIds(file, data.commonErrors, 'commonErrors');
  const taskIds = collectIds(file, data.plan?.tasks, 'plan.tasks');

  data.topics?.forEach((item, index) => {
    const p = `topics[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'name', 'description', 'color', 'order', 'frequency', 'estimatedMinutes']);
    requireString(file, item.name, `${p}.name`);
    requireString(file, item.description, `${p}.description`, { allowEmpty: true });
    if (typeof item.color !== 'string' || !colorPattern.test(item.color)) fail(file, `${p}.color`, 'debe ser #RRGGBB');
    requireInteger(file, item.order, `${p}.order`, 1, 100000);
    requireNumber(file, item.frequency, `${p}.frequency`, 0, Infinity);
    requireInteger(file, item.estimatedMinutes, `${p}.estimatedMinutes`, 0, 10000);
  });

  data.skills?.forEach((item, index) => {
    const p = `skills[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'name', 'topicId', 'subtopic', 'frequency']);
    requireString(file, item.name, `${p}.name`);
    checkReference(file, item.topicId, topicIds, `${p}.topicId`, { nullable: true });
    requireString(file, item.subtopic, `${p}.subtopic`, { allowEmpty: true });
    requireNumber(file, item.frequency, `${p}.frequency`, 0, Infinity);
  });

  data.materials?.forEach((item, index) => {
    const p = `materials[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'title', 'type', 'year', 'instance', 'topicIds', 'subtopics', 'description', 'url', 'official', 'hasOfficialSolution', 'solutionMaterialId', 'content', 'tags']);
    requireString(file, item.title, `${p}.title`);
    requireString(file, item.type, `${p}.type`);
    if (!(item.year === null || typeof item.year === 'string' || Number.isInteger(item.year))) fail(file, `${p}.year`, 'debe ser entero, texto o null');
    if (!(item.instance === null || typeof item.instance === 'string')) fail(file, `${p}.instance`, 'debe ser texto o null');
    checkReferenceArray(file, item.topicIds, topicIds, `${p}.topicIds`);
    checkStringArray(file, item.subtopics, `${p}.subtopics`);
    requireString(file, item.description, `${p}.description`, { allowEmpty: true });
    requireUrl(file, item.url, `${p}.url`);
    requireBoolean(file, item.official, `${p}.official`);
    requireBoolean(file, item.hasOfficialSolution, `${p}.hasOfficialSolution`);
    checkReference(file, item.solutionMaterialId, materialIds, `${p}.solutionMaterialId`, { nullable: true });
    requireString(file, item.content, `${p}.content`, { allowEmpty: true });
    checkStringArray(file, item.tags, `${p}.tags`);
  });

  data.bank?.forEach((item, index) => {
    const p = `bank[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'kind', 'sourceType', 'title', 'statement', 'solution', 'hints', 'topicIds', 'subtopic', 'skillIds', 'year', 'instance', 'sourceMaterialId', 'url', 'solutionUrl', 'hasSolution', 'officialSolution', 'frequency', 'difficulty', 'estimatedMinutes', 'tags']);
    if (!['exercise', 'theory'].includes(item.kind)) fail(file, `${p}.kind`, 'solo admite exercise o theory');
    requireString(file, item.sourceType, `${p}.sourceType`);
    requireString(file, item.title, `${p}.title`);
    requireString(file, item.statement, `${p}.statement`);
    requireString(file, item.solution, `${p}.solution`, { allowEmpty: true });
    checkStringArray(file, item.hints, `${p}.hints`);
    checkReferenceArray(file, item.topicIds, topicIds, `${p}.topicIds`);
    requireString(file, item.subtopic, `${p}.subtopic`, { allowEmpty: true });
    checkReferenceArray(file, item.skillIds, skillIds, `${p}.skillIds`);
    if (!(item.year === null || typeof item.year === 'string' || Number.isInteger(item.year))) fail(file, `${p}.year`, 'debe ser entero, texto o null');
    if (!(item.instance === null || typeof item.instance === 'string')) fail(file, `${p}.instance`, 'debe ser texto o null');
    checkReference(file, item.sourceMaterialId, materialIds, `${p}.sourceMaterialId`, { nullable: true });
    requireUrl(file, item.url, `${p}.url`);
    requireUrl(file, item.solutionUrl, `${p}.solutionUrl`);
    requireBoolean(file, item.hasSolution, `${p}.hasSolution`);
    requireBoolean(file, item.officialSolution, `${p}.officialSolution`);
    requireNumber(file, item.frequency, `${p}.frequency`, 0, Infinity);
    if (!(item.difficulty === null || typeof item.difficulty === 'string' || Number.isInteger(item.difficulty))) fail(file, `${p}.difficulty`, 'debe ser entero, texto o null');
    requireInteger(file, item.estimatedMinutes, `${p}.estimatedMinutes`, 1, 600);
    checkStringArray(file, item.tags, `${p}.tags`);
    if (item.officialSolution && !item.hasSolution) fail(file, p, 'officialSolution no puede ser true si hasSolution es false');
    if (item.hasSolution && !String(item.solution || '').trim() && !item.solutionUrl) warn(file, p, 'hasSolution es true pero no hay texto ni enlace de solución');
    if (!item.hasSolution && String(item.solution || '').trim()) warn(file, p, 'hay texto de solución pero hasSolution es false');
  });

  data.checklist?.forEach((item, index) => {
    const p = `checklist[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'group', 'title', 'description', 'topicId', 'order']);
    requireString(file, item.group, `${p}.group`);
    requireString(file, item.title, `${p}.title`);
    requireString(file, item.description, `${p}.description`, { allowEmpty: true });
    checkReference(file, item.topicId, topicIds, `${p}.topicId`, { nullable: true });
    requireInteger(file, item.order, `${p}.order`, 0, 100000);
  });

  data.flashcards?.forEach((item, index) => {
    const p = `flashcards[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'front', 'back', 'topicId', 'tags']);
    requireString(file, item.front, `${p}.front`);
    requireString(file, item.back, `${p}.back`);
    checkReference(file, item.topicId, topicIds, `${p}.topicId`, { nullable: true });
    checkStringArray(file, item.tags, `${p}.tags`);
  });

  data.commonErrors?.forEach((item, index) => {
    const p = `commonErrors[${index}]`;
    checkAllowedKeys(file, item, p, ['id', 'title', 'why', 'correct', 'topicId', 'tags']);
    requireString(file, item.title, `${p}.title`);
    requireString(file, item.why, `${p}.why`, { allowEmpty: true });
    requireString(file, item.correct, `${p}.correct`, { allowEmpty: true });
    checkReference(file, item.topicId, topicIds, `${p}.topicId`, { nullable: true });
    checkStringArray(file, item.tags, `${p}.tags`);
  });

  if (requireObject(file, data.plan, 'plan')) {
    checkAllowedKeys(file, data.plan, 'plan', ['defaultStartDate', 'examDate', 'suggestedDailyMinutes', 'tasks']);
    requireDate(file, data.plan.defaultStartDate, 'plan.defaultStartDate');
    requireDate(file, data.plan.examDate, 'plan.examDate');
    requireInteger(file, data.plan.suggestedDailyMinutes, 'plan.suggestedDailyMinutes', 15, 720);
    data.plan.tasks?.forEach((item, index) => {
      const p = `plan.tasks[${index}]`;
      checkAllowedKeys(file, item, p, ['id', 'title', 'topicId', 'kind', 'estimatedMinutes', 'priority', 'frequency', 'phase', 'dependsOn', 'materialIds', 'bankItemIds']);
      requireString(file, item.title, `${p}.title`);
      checkReference(file, item.topicId, topicIds, `${p}.topicId`, { nullable: true });
      requireString(file, item.kind, `${p}.kind`);
      requireInteger(file, item.estimatedMinutes, `${p}.estimatedMinutes`, 5, 600);
      requireNumber(file, item.priority, `${p}.priority`, 1, 5);
      requireNumber(file, item.frequency, `${p}.frequency`, 0, Infinity);
      requireInteger(file, item.phase, `${p}.phase`, 1, 100000);
      checkReferenceArray(file, item.dependsOn, taskIds, `${p}.dependsOn`);
      checkReferenceArray(file, item.materialIds, materialIds, `${p}.materialIds`);
      checkReferenceArray(file, item.bankItemIds, bankIds, `${p}.bankItemIds`);
      if (item.dependsOn?.includes(item.id)) fail(file, `${p}.dependsOn`, 'una tarea no puede depender de sí misma');
    });
  }

  if (!template && data.bank?.length === 0 && data.materials?.length === 0) warn(file, 'contenido', 'la materia no tiene banco ni materiales');
  return {
    id: data.subject.id,
    topics: data.topics?.length || 0,
    materials: data.materials?.length || 0,
    bank: data.bank?.length || 0,
    checklist: data.checklist?.length || 0,
    flashcards: data.flashcards?.length || 0,
    tasks: data.plan?.tasks?.length || 0
  };
}

const indexPath = path.join(dataDir, 'index.json');
const registry = readJson(indexPath);
const summaries = [];

if (registry) {
  if (!isObject(registry)) fail('data/index.json', 'raíz', 'debe ser un objeto');
  if (registry.schemaVersion !== 1) fail('data/index.json', 'schemaVersion', 'debe valer 1');
  if (!Array.isArray(registry.subjects)) fail('data/index.json', 'subjects', 'debe ser un arreglo');
  const registryIds = new Set();
  for (const [index, entry] of (registry.subjects || []).entries()) {
    const p = `subjects[${index}]`;
    if (!isObject(entry)) {
      fail('data/index.json', p, 'debe ser un objeto');
      continue;
    }
    for (const key of ['id', 'name', 'shortName', 'description', 'color', 'file', 'includeInPlan', 'archived', 'examDate']) {
      if (!(key in entry)) fail('data/index.json', `${p}.${key}`, 'propiedad obligatoria ausente');
    }
    requireId('data/index.json', entry.id, `${p}.id`);
    if (registryIds.has(entry.id)) fail('data/index.json', `${p}.id`, `identificador duplicado: ${entry.id}`);
    registryIds.add(entry.id);
    requireString('data/index.json', entry.name, `${p}.name`);
    requireString('data/index.json', entry.shortName, `${p}.shortName`);
    requireString('data/index.json', entry.description, `${p}.description`, { allowEmpty: true });
    if (typeof entry.color !== 'string' || !colorPattern.test(entry.color)) fail('data/index.json', `${p}.color`, 'debe ser #RRGGBB');
    requireString('data/index.json', entry.file, `${p}.file`);
    requireBoolean('data/index.json', entry.includeInPlan, `${p}.includeInPlan`);
    requireBoolean('data/index.json', entry.archived, `${p}.archived`);
    requireDate('data/index.json', entry.examDate, `${p}.examDate`);

    const relativeFile = entry.file.replace(/^\.\//, '');
    const subjectPath = path.resolve(rootDir, relativeFile);
    if (!subjectPath.startsWith(dataDir + path.sep)) {
      fail('data/index.json', `${p}.file`, 'debe apuntar a un archivo dentro de data/');
      continue;
    }
    if (!fs.existsSync(subjectPath)) {
      fail('data/index.json', `${p}.file`, `archivo inexistente: ${relativeFile}`);
      continue;
    }
    const subjectData = readJson(subjectPath);
    if (subjectData) {
      const summary = validateSubject(subjectData, relativeFile, entry.id);
      if (summary) summaries.push(summary);
      if (subjectData.subject?.name !== entry.name) warn('data/index.json', `${p}.name`, 'difiere del nombre dentro del JSON de la materia');
      if (subjectData.subject?.shortName !== entry.shortName) warn('data/index.json', `${p}.shortName`, 'difiere del nombre corto dentro del JSON de la materia');
    }
  }
  if (registry.defaultSubject && !registryIds.has(registry.defaultSubject)) fail('data/index.json', 'defaultSubject', 'no existe en subjects');
}

const templatePath = path.join(dataDir, 'materia-plantilla.json');
if (fs.existsSync(templatePath)) {
  const template = readJson(templatePath);
  if (template) validateSubject(template, 'data/materia-plantilla.json', null, { template: true });
}

for (const summary of summaries) {
  console.log(`✓ ${summary.id}: ${summary.topics} temas · ${summary.materials} materiales · ${summary.bank} ítems de banco · ${summary.checklist} checklist · ${summary.flashcards} flashcards · ${summary.tasks} tareas`);
}

if (warnings.length) {
  console.log(`\nAdvertencias (${warnings.length}):`);
  warnings.forEach(message => console.log(`- ${message}`));
}

if (errors.length) {
  console.error(`\nErrores (${errors.length}):`);
  errors.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log('\nDatos válidos.');
}
