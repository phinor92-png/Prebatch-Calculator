const PAGE_PASSWORD = 'BritanniaBar2026';
const AUTH_OK_KEY = 'pb_calc_auth_ok';
function showToast(message, type='ok', durationMs=2600){
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'warn' ? 'warn' : 'ok'}`;
  toast.textContent = String(message || '');
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 220);
  }, Math.max(900, durationMs|0));
}
window.alert = (message) => showToast(message, 'ok');
function unlockApp(){
  const gate = document.getElementById('authGate');
  const app = document.getElementById('appRoot');
  if (gate) gate.style.display = 'none';
  if (app) app.style.display = 'block';
}
function initAuthGate(){
  const unlockBtn = document.getElementById('authUnlock');
  const passwordInput = document.getElementById('authPassword');
  const errorEl = document.getElementById('authError');
  if (sessionStorage.getItem(AUTH_OK_KEY) === '1') {
    unlockApp();
    return;
  }
  const tryUnlock = () => {
    const entered = String(passwordInput?.value || '');
    if (entered === PAGE_PASSWORD) {
      sessionStorage.setItem(AUTH_OK_KEY, '1');
      unlockApp();
      return;
    }
    if (errorEl) errorEl.textContent = 'Wrong password. Please try again.';
  };
  if (unlockBtn) unlockBtn.addEventListener('click', tryUnlock);
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryUnlock();
      }
    });
  }
}
initAuthGate();

const DATA_URL = 'prebatch_data.json';
const DATA = { source: DATA_URL, unit: 'cl', defaultBottleSizeCl: 70, prebatches: [] };
let DATA_LOAD_MESSAGE = `Loading recipes from ${DATA_URL}...`;

function replaceData(raw){
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.prebatches)) {
    throw new Error('Invalid recipe data: expected a prebatches array.');
  }

  Object.keys(DATA).forEach(k => delete DATA[k]);
  Object.assign(DATA, {
    source: raw.source || DATA_URL,
    unit: raw.unit || 'cl',
    defaultBottleSizeCl: Number(raw.defaultBottleSizeCl) || 70,
    prebatches: raw.prebatches
  });
  ensureIds();
}

async function loadDataFromJson({cacheBust=false}={}){
  const url = cacheBust ? `${DATA_URL}?ts=${Date.now()}` : DATA_URL;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${DATA_URL} (${response.status})`);
  const parsed = await response.json();
  replaceData(parsed);
  DATA_LOAD_MESSAGE = `Loaded recipes from ${DATA_URL} (${DATA.prebatches.length} recipes).`;
  return parsed;
}

async function reloadDataFromJsonAtRuntime(){
  try {
    await loadDataFromJson({ cacheBust: true });
    pruneResolvedOverrides();
    loadCustomPrebatches();
    loadProductionSession();
    updateDepartmentOptions();
    updateRecipeCount();
    updateDataSourceInfo();
    renderPrebatches();
    renderIngredients();
    alert(`Data reloaded from ${DATA_URL}`);
  } catch (e) {
    console.error(e);
    alert(`Could not reload ${DATA_URL}.`);
  }
}

const INGREDIENT_KEY_ALIASES = {
  'campari bitter': 'campari',
  'cocchi torino vermouth': 'cocchi torino',
  'dolin rouge vermouth': 'dolin rouge',
  'cold water': 'water',
  'lemon juice': 'lemon',
  'lime juice': 'lime'
};

const INGREDIENT_DISPLAY_ALIASES = {
  'campari': 'Campari',
  'cocchi torino': 'Cocchi Torino',
  'dolin rouge': 'Dolin Rouge',
  'water': 'Water',
  'lemon': 'Lemon',
  'lime': 'Lime'
};

function normalizeIngName(name){
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g,' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g,' ')
    .trim();
  return INGREDIENT_KEY_ALIASES[base] || base;
}

function getPreferredIngredientDisplayName(key, fallbackName){
  return INGREDIENT_DISPLAY_ALIASES[key] || fallbackName;
}

function makeId(){ return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function ensureIds(){
  (DATA.prebatches||[]).forEach(pb => {
    if (!pb._id) pb._id = pb.sheet + '::' + pb.name;
    (pb.ingredients||[]).forEach(ing => { if (ing.bottleSizeCl === undefined) ing.bottleSizeCl = null; });
  });
}

// Custom prebatches
const CUSTOM_KEY = 'customPrebatches';
function isCustomPrebatch(pb){
  return !!pb?.isCustom;
}
function loadCustomPrebatches(){
  const stored = localStorage.getItem(CUSTOM_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      parsed.forEach(p => {
        if (!p._id) p._id = makeId();
        if (!p.sheet) p.sheet = 'Custom';
        p.isCustom = true;
        (p.ingredients||[]).forEach(ing => { if (ing.bottleSizeCl === undefined) ing.bottleSizeCl = null; });
      });
      DATA.prebatches.push(...parsed);
    }
  } catch(e) {}
}
function saveCustomPrebatches(){
  const custom = (DATA.prebatches||[]).filter(isCustomPrebatch);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
}

// Prebatch overrides for imported
const PB_OVERRIDE_KEY = 'prebatchOverrides';
let prebatchOverrides = {};
function loadPrebatchOverrides(){
  const raw = localStorage.getItem(PB_OVERRIDE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') prebatchOverrides = parsed;
  } catch(e) {}
}
function savePrebatchOverrides(){
  localStorage.setItem(PB_OVERRIDE_KEY, JSON.stringify(prebatchOverrides));
}
loadPrebatchOverrides();

const PREBATCH_NOTE_KEY = 'prebatchNotes';
let prebatchNotes = {};
function loadPrebatchNotes(){
  const raw = localStorage.getItem(PREBATCH_NOTE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') prebatchNotes = parsed;
  } catch(e) {}
}
function savePrebatchNotes({skipSessionSave=false}={}){
  localStorage.setItem(PREBATCH_NOTE_KEY, JSON.stringify(prebatchNotes));
  if (!skipSessionSave && typeof saveProductionSession === 'function') saveProductionSession();
}
loadPrebatchNotes();

function getEffectivePrebatch(pb){
  if (!pb || isCustomPrebatch(pb)) return pb;
  const ov = prebatchOverrides[pb._id];
  if (!ov) return pb;
  return {
    ...pb,
    name: ov.name ?? pb.name,
    sheet: ov.sheet ?? pb.sheet,
    ingredients: (ov.ingredients ?? pb.ingredients).map(i => ({
      name: i.name,
      clPerBatch: Number(i.clPerBatch)||0,
      bottleSizeCl: (i.bottleSizeCl && Number(i.bottleSizeCl)>0) ? Number(i.bottleSizeCl) : null,
      hideInFinalList: !!i.hideInFinalList
    })),
    _override: true
  };
}

function normalizeOverrideIngredient(i){
  return {
    name: String(i?.name || '').trim(),
    clPerBatch: Number(i?.clPerBatch) || 0,
    bottleSizeCl: (Number(i?.bottleSizeCl) > 0) ? Number(i?.bottleSizeCl) : null,
    hideInFinalList: !!i?.hideInFinalList
  };
}

function doesOverrideMatchBase(pbRaw, ov){
  if (!pbRaw || !ov) return false;
  const baseName = String(pbRaw.name || '').trim();
  const ovName = String(ov.name ?? baseName).trim();
  if (baseName !== ovName) return false;
  const baseSheet = String(pbRaw.sheet || 'Custom').trim();
  const ovSheet = String(ov.sheet ?? baseSheet).trim();
  if (baseSheet !== ovSheet) return false;

  const baseIngredients = (pbRaw.ingredients || []).map(normalizeOverrideIngredient);
  const ovIngredients = (ov.ingredients ?? pbRaw.ingredients ?? []).map(normalizeOverrideIngredient);
  if (baseIngredients.length !== ovIngredients.length) return false;

  for (let i = 0; i < baseIngredients.length; i++) {
    const a = baseIngredients[i];
    const b = ovIngredients[i];
    if (a.name !== b.name) return false;
    if (a.clPerBatch !== b.clPerBatch) return false;
    if (a.bottleSizeCl !== b.bottleSizeCl) return false;
    if (a.hideInFinalList !== b.hideInFinalList) return false;
  }
  return true;
}

function pruneResolvedOverrides(){
  let changed = false;
  (DATA.prebatches || []).forEach(pbRaw => {
    if (!pbRaw || isCustomPrebatch(pbRaw)) return;
    const ov = prebatchOverrides[pbRaw._id];
    if (!ov) return;
    if (doesOverrideMatchBase(pbRaw, ov)) {
      delete prebatchOverrides[pbRaw._id];
      changed = true;
    }
  });
  if (changed) savePrebatchOverrides();
}

// Ingredient bottle size overrides (global) - keyed by normalised ingredient name
const ING_SIZE_KEY = 'ingredientBottleSizes';
let ingredientBottleOverrides = {};
function loadIngredientBottleOverrides(){
  const raw = localStorage.getItem(ING_SIZE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // normalise keys
      const out = {};
      Object.entries(parsed).forEach(([k,v]) => {
        const nk = normalizeIngName(k);
        if (!nk) return;
        const num = Number(v);
        if (Number.isFinite(num) && num>0) out[nk] = num;
      });
      ingredientBottleOverrides = out;
    }
  } catch(e) {}
}
function saveIngredientBottleOverrides(){
  localStorage.setItem(ING_SIZE_KEY, JSON.stringify(ingredientBottleOverrides));
}
loadIngredientBottleOverrides();

// Hidden ingredients - keyed by normalised ingredient name
const ING_HIDDEN_KEY = 'hiddenIngredients';
let hiddenIngredients = {};
function loadHiddenIngredients(){
  const raw = localStorage.getItem(ING_HIDDEN_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const out = {};
      Object.keys(parsed).forEach(k => {
        const nk = normalizeIngName(k);
        if (nk) out[nk] = true;
      });
      hiddenIngredients = out;
    }
  } catch(e) {}
}
function saveHiddenIngredients(){
  localStorage.setItem(ING_HIDDEN_KEY, JSON.stringify(hiddenIngredients));
}
loadHiddenIngredients();
const SETTINGS_SCHEMA_VERSION = 1;

let showHidden = false;
const DEPARTMENT_FILTER_KEY = 'departmentFilter';
const ACTIVE_ONLY_KEY = 'activeOnlyEnabled';
let selectedDepartment = localStorage.getItem(DEPARTMENT_FILTER_KEY) || '';
let activeOnlyEnabled = localStorage.getItem(ACTIVE_ONLY_KEY) === '1';

const dataSourceInfoEl = document.getElementById('dataSourceInfo');

// State per prebatch id
const state = new Map();
const PRODUCTION_SESSION_KEY = 'productionSessionV1';
let productionSessionUpdatedAt = null;
const searchEl = document.getElementById('search');
const departmentFilterEl = document.getElementById('departmentFilter');
const departmentOptionsEl = document.getElementById('departmentOptions');
const activeOnlyEl = document.getElementById('activeOnly');
const ingBottleSizeEl = document.getElementById('ingredientBottleSize');
const finBottleSizeEl = document.getElementById('finishedBottleSize');
const pbTbody = document.querySelector('#pbTable tbody');
const ingTbody = document.querySelector('#ingTable tbody');
const hiddenInfo = document.getElementById('hiddenInfo');
const prebatchesMadeInfo = document.getElementById('prebatchesMadeInfo');
const countActiveEl = document.getElementById('countActive');
const filterSummaryEl = document.getElementById('filterSummary');
const productionSessionInfoEl = document.getElementById('productionSessionInfo');
const productionSummaryEl = document.getElementById('productionSummary');
const sheetPreviewModal = document.getElementById('sheetPreviewModal');
const sheetPreviewText = document.getElementById('sheetPreviewText');
const sheetPreviewHint = document.getElementById('sheetPreviewHint');
const sheetPreviewStats = document.getElementById('sheetPreviewStats');
const recipeManagerModal = document.getElementById('recipeManagerModal');
const recipeManagerStats = document.getElementById('recipeManagerStats');
const recipeManagerSearch = document.getElementById('recipeManagerSearch');
const recipeManagerDepartment = document.getElementById('recipeManagerDepartment');
const recipeManagerTbody = document.querySelector('#recipeManagerTable tbody');

function updateRecipeCount(){
  document.getElementById('countTotal').textContent = String(DATA.prebatches.length);
  if (countActiveEl) countActiveEl.textContent = String(getActivePrebatchCount());
}

function updateDataSourceInfo(){
  if (dataSourceInfoEl) dataSourceInfoEl.textContent = DATA_LOAD_MESSAGE;
}

function clampNum(x){
  if (x === '' || x === null || x === undefined) return 0;
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value){
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function bottlesPerBatch(pb, finishedBottleSize){
  const total = (pb.ingredients||[]).reduce((s,i)=>s + (Number(i.clPerBatch)||0), 0);
  return finishedBottleSize > 0 ? (total / finishedBottleSize) : 0;
}

function getProductionSessionCounts(){
  const validIds = new Set((DATA.prebatches || []).map(pb => pb._id));
  let batches = 0;
  let activeRecipes = 0;
  state.forEach((st, id) => {
    if (!validIds.has(id)) return;
    const value = Math.max(0, clampNum(st?.batches));
    if (value > 0) {
      activeRecipes += 1;
      batches += value;
    }
  });
  const notes = Object.keys(prebatchNotes || {}).filter(id => validIds.has(id) && String(prebatchNotes[id] || '').trim()).length;
  return { batches, activeRecipes, notes };
}

function formatSessionTime(value){
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function updateProductionSessionInfo(){
  if (!productionSessionInfoEl) return;
  const counts = getProductionSessionCounts();
  const hasSession = counts.activeRecipes > 0 || counts.notes > 0;
  if (!hasSession) {
    productionSessionInfoEl.textContent = "Ready for today's production.";
    productionSessionInfoEl.classList.remove('hasSession');
    return;
  }
  const parts = [];
  if (counts.activeRecipes > 0) parts.push(`${counts.activeRecipes} active`, `${counts.batches.toFixed(2)} batches`);
  if (counts.notes > 0) parts.push(`${counts.notes} prep note${counts.notes === 1 ? '' : 's'}`);
  const saved = formatSessionTime(productionSessionUpdatedAt);
  productionSessionInfoEl.textContent = `Production restored: ${parts.join(' · ')}${saved ? ` · Last saved ${saved}` : ''}`;
  productionSessionInfoEl.classList.add('hasSession');
}

function saveProductionSession(){
  const validIds = new Set((DATA.prebatches || []).map(pb => pb._id));
  const batches = {};
  state.forEach((st, id) => {
    if (!validIds.has(id)) return;
    const value = Math.max(0, clampNum(st?.batches));
    if (value > 0) batches[id] = value;
  });
  const notes = {};
  Object.entries(prebatchNotes || {}).forEach(([id, note]) => {
    if (!validIds.has(id)) return;
    const cleaned = String(note || '').trim();
    if (cleaned) notes[id] = cleaned;
  });

  if (!Object.keys(batches).length && !Object.keys(notes).length) {
    localStorage.removeItem(PRODUCTION_SESSION_KEY);
    productionSessionUpdatedAt = null;
    updateProductionSessionInfo();
    return;
  }

  productionSessionUpdatedAt = new Date().toISOString();
  localStorage.setItem(PRODUCTION_SESSION_KEY, JSON.stringify({
    version: 1,
    updatedAt: productionSessionUpdatedAt,
    batches,
    notes
  }));
  updateProductionSessionInfo();
}

function loadProductionSession(){
  const raw = localStorage.getItem(PRODUCTION_SESSION_KEY);
  if (!raw) {
    updateProductionSessionInfo();
    return { activeRecipes: 0, notes: 0 };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid session');
    productionSessionUpdatedAt = parsed.updatedAt || null;
    Object.entries(parsed.batches || {}).forEach(([id, value]) => {
      const batches = Math.max(0, clampNum(value));
      if (batches > 0 && DATA.prebatches.some(pb => pb._id === id)) state.set(id, { batches });
    });
    if (parsed.notes && typeof parsed.notes === 'object') {
      prebatchNotes = {};
      Object.entries(parsed.notes).forEach(([id, note]) => {
        const cleaned = String(note || '').trim();
        if (cleaned && DATA.prebatches.some(pb => pb._id === id)) prebatchNotes[id] = cleaned.slice(0, 140);
      });
      savePrebatchNotes({skipSessionSave:true});
    }
  } catch(e) {
    localStorage.removeItem(PRODUCTION_SESSION_KEY);
    productionSessionUpdatedAt = null;
  }
  updateProductionSessionInfo();
  return getProductionSessionCounts();
}

function clearProductionSession(){
  state.clear();
  prebatchNotes = {};
  savePrebatchNotes({skipSessionSave:true});
  localStorage.removeItem(PRODUCTION_SESSION_KEY);
  productionSessionUpdatedAt = null;
  updateProductionSessionInfo();
}

function getActiveProductionItems(){
  const finBottleSize = clampNum(finBottleSizeEl.value) || 70;
  return (DATA.prebatches || [])
    .map(pbRaw => {
      const batches = getBatchesForPrebatch(pbRaw._id);
      if (batches <= 0) return null;
      const pb = getEffectivePrebatch(pbRaw);
      const totalClPerBatch = (pb.ingredients || []).reduce((s,i)=>s+(Number(i.clPerBatch)||0),0);
      return {
        id: pbRaw._id,
        pbRaw,
        pb,
        department: getPrebatchDepartment(pbRaw),
        batches,
        totalClPerBatch,
        bottles: bottlesPerBatch(pb, finBottleSize) * batches,
        note: String(prebatchNotes[pbRaw._id] || '').trim()
      };
    })
    .filter(Boolean)
    .sort((a,b) => (a.department + a.pb.name).localeCompare(b.department + b.pb.name));
}

function collectProductionMetrics({defaultIngBottleSize=null}={}){
  const ingredientBottleSize = defaultIngBottleSize || clampNum(ingBottleSizeEl.value) || 70;
  const activeItems = getActiveProductionItems();
  const departmentTotals = new Map();
  const ingredientTotals = new Map();
  let totalBatches = 0;
  let totalFinishedBottles = 0;

  activeItems.forEach(item => {
    const {pb, batches, department, bottles} = item;
    totalBatches += batches;
    totalFinishedBottles += bottles;

    const departmentTotal = departmentTotals.get(department) || {recipes:0, batches:0, bottles:0};
    departmentTotal.recipes += 1;
    departmentTotal.batches += batches;
    departmentTotal.bottles += bottles;
    departmentTotals.set(department, departmentTotal);

    (pb.ingredients || []).forEach(ing => {
      const rawName = String(ing.name || '').replace(/\u00A0/g,' ').trim();
      if (!rawName) return;
      const key = normalizeIngName(rawName);
      if (isIngredientHiddenInFinishedList(ing, key)) return;
      const cl = (Number(ing.clPerBatch) || 0) * batches;
      const bsz = (ing.bottleSizeCl && Number(ing.bottleSizeCl)>0) ? Number(ing.bottleSizeCl) : null;

      if (!ingredientTotals.has(key)) {
        ingredientTotals.set(key, {displayName: getPreferredIngredientDisplayName(key, rawName), cl:0, bottleSizeCl: bsz, conflict:false});
      }
      const obj = ingredientTotals.get(key);
      obj.cl += cl;
      if (obj.displayName === obj.displayName.toLowerCase() && rawName !== rawName.toLowerCase()) {
        obj.displayName = getPreferredIngredientDisplayName(key, rawName);
      }
      if (bsz) {
        if (obj.bottleSizeCl === null) obj.bottleSizeCl = bsz;
        else if (obj.bottleSizeCl !== bsz) obj.conflict = true;
      }
    });
  });

  const ingredientEntries = Array.from(ingredientTotals.entries())
    .sort((a,b)=> (a[1].displayName||a[0]).localeCompare(b[1].displayName||b[0]))
    .map(([key, obj]) => {
      const override = Number(ingredientBottleOverrides[key]);
      const recipeSize = (!obj.conflict && obj.bottleSizeCl) ? obj.bottleSizeCl : null;
      const usedSize = (override>0) ? override : (recipeSize || ingredientBottleSize);
      const bottles = usedSize>0 ? (obj.cl / usedSize) : 0;
      return {key, ...obj, override, recipeSize, usedSize, bottles, hasOverride: override > 0};
    });

  return {
    activeItems,
    departmentTotals,
    ingredientEntries,
    totalBatches,
    totalFinishedBottles,
    totalIngredientCl: ingredientEntries.reduce((sum, obj) => sum + obj.cl, 0),
    totalIngredientBottles: ingredientEntries.reduce((sum, obj) => sum + obj.bottles, 0)
  };
}

function getBatchesForPrebatch(id){
  return clampNum(state.get(id)?.batches);
}

function isActivePrebatch(pbRaw){
  return getBatchesForPrebatch(pbRaw?._id) > 0;
}

function getActivePrebatchCount(){
  return (DATA.prebatches || []).filter(isActivePrebatch).length;
}

function normalizeDepartmentName(value){
  const department = String(value || '').replace(/\s+/g, ' ').trim() || 'Custom';
  const key = department.toLowerCase().replace(/[-_]+/g, ' ');
  const legacyAliases = {
    'prebatch calculator mal': 'Britannia Bar Menu',
    'pre batch calculator mal': 'Britannia Bar Menu',
    'prebatch calculator model': 'Britannia Bar Menu',
    'pre batch calculator model': 'Britannia Bar Menu'
  };
  return legacyAliases[key] || department;
}

function getPrebatchDepartment(pbRaw){
  const pb = getEffectivePrebatch(pbRaw);
  return normalizeDepartmentName(pb?.sheet || pbRaw?.sheet || 'Custom');
}

function getDepartments(){
  return Array.from(new Set((DATA.prebatches || []).map(getPrebatchDepartment).filter(Boolean)))
    .sort((a,b) => a.localeCompare(b));
}

function updateDepartmentOptions(){
  const departments = getDepartments();
  if (departmentFilterEl) {
    departmentFilterEl.innerHTML = '';
    departmentFilterEl.appendChild(new Option('All departments', ''));
    departments.forEach(department => departmentFilterEl.appendChild(new Option(department, department)));
    if (selectedDepartment && !departments.includes(selectedDepartment)) {
      selectedDepartment = '';
      localStorage.setItem(DEPARTMENT_FILTER_KEY, selectedDepartment);
    }
    departmentFilterEl.value = selectedDepartment;
  }
  if (departmentOptionsEl) {
    departmentOptionsEl.innerHTML = '';
    departments.forEach(department => {
      const option = document.createElement('option');
      option.value = department;
      departmentOptionsEl.appendChild(option);
    });
  }
}

function getFilteredPrebatches(){
  const q = (searchEl.value || '').trim().toLowerCase();
  return DATA.prebatches
    .slice()
    .sort((a,b)=> (getPrebatchDepartment(a)+' '+getEffectivePrebatch(a).name).localeCompare(getPrebatchDepartment(b)+' '+getEffectivePrebatch(b).name))
    .filter(pbRaw => !selectedDepartment || getPrebatchDepartment(pbRaw) === selectedDepartment)
    .filter(pbRaw => !activeOnlyEnabled || isActivePrebatch(pbRaw))
    .filter(pbRaw => {
      if (!q) return true;
      const overrideName = (prebatchOverrides[pbRaw._id]?.name || '').toLowerCase();
      const department = getPrebatchDepartment(pbRaw).toLowerCase();
      const ingredients = (getEffectivePrebatch(pbRaw)?.ingredients || []).map(i => String(i.name || '').toLowerCase()).join(' ');
      return String(pbRaw.name || '').toLowerCase().includes(q) || overrideName.includes(q) || department.includes(q) || ingredients.includes(q);
    });
}

function updateFilterSummary(visibleCount){
  if (!filterSummaryEl) return;
  const parts = [`${visibleCount} shown`];
  if (selectedDepartment) parts.push(selectedDepartment);
  if (activeOnlyEnabled) parts.push('active only');
  filterSummaryEl.textContent = parts.join(' · ');
}

function isIngredientHiddenInFinishedList(ing, key){
  return !!hiddenIngredients[key] || !!ing?.hideInFinalList;
}

function renderPrebatches(){
  pbTbody.innerHTML = '';
  const finBottleSize = clampNum(finBottleSizeEl.value) || 70;
  const filteredPrebatches = getFilteredPrebatches();
  updateRecipeCount();
  updateFilterSummary(filteredPrebatches.length);
  updateProductionSessionInfo();

  if (!filteredPrebatches.length) {
    const tr = document.createElement('tr');
    const emptyMessage = activeOnlyEnabled
      ? 'No active recipes yet. Turn off Active only to choose recipes.'
      : 'No recipes match the current filters.';
    tr.innerHTML = `<td colspan="4" class="small">${escapeHtml(emptyMessage)}</td>`;
    pbTbody.appendChild(tr);
  }

  filteredPrebatches.forEach(pbRaw => {
      const pb = getEffectivePrebatch(pbRaw);
      const id = pbRaw._id;
      if (!state.has(id)) state.set(id, {batches:0});
      const st = state.get(id);

      const bpb = bottlesPerBatch(pb, finBottleSize);
      const batchTotal = (pb.ingredients||[]).reduce((s,i)=>s+(Number(i.clPerBatch)||0),0);
      const department = getPrebatchDepartment(pbRaw);

      const isCustom = isCustomPrebatch(pbRaw);

      const badge = (pb._override) ? '<span class="badge">override</span>' : '';

      const note = String(prebatchNotes[id] || '');
      const tr = document.createElement('tr');
      if ((Number(st.batches) || 0) > 0) tr.classList.add('printInclude', 'activeRow');
      tr.innerHTML = `
        <td>
          <button class="nameBtn" data-edit-mode="${isCustom ? 'edit-custom' : 'edit-override'}" data-edit-id="${escapeAttr(id)}" title="Edit prebatch">
            <span class="name nameTxt">${escapeHtml(pb.name)}${badge}</span>
          </button>
          <div class="sub">${escapeHtml(department)} · Batch total: <span class="mono">${batchTotal.toFixed(0)} cl</span></div>
        </td>
        <td class="advancedCol">
          <input class="tool noteInp" type="text" maxlength="140" placeholder="Prep note..." value="${escapeAttr(note)}" data-note-id="${escapeAttr(id)}" />
        </td>
        <td class="right mono advancedCol">${bpb.toFixed(2)}</td>
        <td class="right">
          <input class="tool inp mono" type="text" inputmode="decimal" value="${Number(st.batches).toFixed(2)}" data-id="${escapeAttr(id)}" data-mode="batches" />
          <div class="quickBtns">
            <button class="quickBtn" data-inc-id="${escapeAttr(id)}" data-inc="0.5" title="Add 0.5 batch">+0.5</button>
            <button class="quickBtn" data-inc-id="${escapeAttr(id)}" data-inc="1" title="Add 1 batch">+1</button>
            <button class="quickBtn" data-inc-id="${escapeAttr(id)}" data-inc="2" title="Add 2 batches">+2</button>
          </div>
        </td>      `;
      pbTbody.appendChild(tr);
    });

  const commitProductionInput = (inputEl, {rerenderPrebatches=false}={}) => {
    const id = inputEl.dataset.id;
    const mode = inputEl.dataset.mode;
    const pbRaw = DATA.prebatches.find(x => x._id === id);
    if (!pbRaw) return;
    const val = Math.max(0, clampNum(inputEl.value));

    const st = state.get(id) || {batches:0};
    if (mode === 'batches') {
      st.batches = val;
    }
    state.set(id, st);
    const row = inputEl.closest('tr');
    if (row) {
      row.classList.toggle('printInclude', st.batches > 0);
      row.classList.toggle('activeRow', st.batches > 0);
    }
    updateRecipeCount();
    saveProductionSession();
    renderIngredients();
    if (rerenderPrebatches || activeOnlyEnabled) renderPrebatches();
  };

  pbTbody.querySelectorAll('input[data-id]').forEach(inp => {
    inp.addEventListener('input', () => commitProductionInput(inp));
    inp.addEventListener('change', () => commitProductionInput(inp, {rerenderPrebatches: true}));
    inp.addEventListener('blur', () => commitProductionInput(inp, {rerenderPrebatches: true}));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inp.blur();
      }
    });
  });

  pbTbody.querySelectorAll('button[data-inc-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.incId;
      const inc = clampNum(btn.dataset.inc);
      const pbRaw = DATA.prebatches.find(x => x._id === id);
      if (!pbRaw) return;
      const pb = getEffectivePrebatch(pbRaw);
      const finBottleSize = clampNum(finBottleSizeEl.value) || 70;
      const bpb = bottlesPerBatch(pb, finBottleSize);
      const st = state.get(id) || {batches:0};
      st.batches = clampNum(st.batches) + inc;
      state.set(id, st);
      saveProductionSession();
      renderPrebatches();
      renderIngredients();
    });
  });

  pbTbody.querySelectorAll('input[data-note-id]').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = e.target.dataset.noteId;
      prebatchNotes[id] = String(e.target.value || '').trim();
      if (!prebatchNotes[id]) delete prebatchNotes[id];
      savePrebatchNotes();
      renderPrebatches();
    });
  });

  pbTbody.querySelectorAll('button[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.editMode;
      const id = btn.dataset.editId;
      if (!mode || !id) return;
      openModal(mode, id);
    });
  });

}

function renderIngredients(){
  const defaultIngBottleSize = clampNum(ingBottleSizeEl.value) || 70;
  const metrics = collectProductionMetrics({defaultIngBottleSize});
  const madeLines = metrics.activeItems.map(item => `${item.department} / ${item.pb.name}:   ${item.bottles.toFixed(2)} bottles`);

  if (productionSummaryEl) {
    if (metrics.departmentTotals.size > 0) {
      const rows = Array.from(metrics.departmentTotals.entries()).map(([department, total]) => `
        <div class="summaryItem">
          <span>${escapeHtml(department)}</span>
          <strong>${total.recipes} active · ${total.batches.toFixed(2)} batches · ${total.bottles.toFixed(2)} bottles</strong>
        </div>
      `).join('');
      productionSummaryEl.innerHTML = `<b>Production summary</b>${rows}`;
    } else {
      productionSummaryEl.innerHTML = '<b>Production summary</b><div class="summaryItem mutedSummary">No active prebatches yet.</div>';
    }
  }

  document.getElementById('kpiBatches').textContent = metrics.totalBatches.toFixed(2);
  document.getElementById('kpiBottles').textContent = metrics.totalFinishedBottles.toFixed(2);
  if (madeLines.length > 0) {
    prebatchesMadeInfo.innerHTML = `<b>Prebatches made</b><br>${madeLines.map(escapeHtml).join('<br>')}`;
  } else {
    prebatchesMadeInfo.innerHTML = '';
  }

  const hiddenCount = Object.keys(hiddenIngredients).filter(k => hiddenIngredients[k]).length;
  if (hiddenCount > 0) {
    hiddenInfo.innerHTML = `${hiddenCount} ingredient(s) hidden · <a href="#" id="toggleHidden" style="color:#cfe0ff">${showHidden ? 'Hide hidden' : 'Show hidden'}</a> · <a href="#" id="clearHidden" style="color:#cfe0ff">Unhide all</a>`;
  } else {
    hiddenInfo.innerHTML = '';
  }

  ingTbody.innerHTML='';

  let ingTotalCl=0;
  let ingTotalBottles=0;

  metrics.ingredientEntries.forEach(obj => {
    const key = obj.key;
    const name = obj.displayName;
    const isHidden = !!hiddenIngredients[key];
    if (isHidden && !showHidden) return;

    const cl = obj.cl;
    const bottles = obj.bottles; // rounding OFF

    const warn = obj.conflict ? '<span class="warn">mixed recipe sizes</span>' : '';

    const hideBtn = isHidden
      ? `<button class="iconBtn" data-unhide="${escapeAttr(key)}" title="Unhide">Unhide</button>`
      : `<button class="iconBtn" data-hide="${escapeAttr(key)}" title="Hide">Hide</button>`;

    const tr=document.createElement('tr');
    if (isHidden) tr.classList.add('hiddenRow');
    tr.innerHTML=`
      <td>${escapeHtml(name)}${warn}${isHidden ? '<span class="warn">hidden</span>' : ''}</td>
      <td class="right mono">${cl.toFixed(1)}</td>
      <td class="right">
        <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
          <input class="tool inp mono" type="number" min="0" step="1" data-ing="${escapeAttr(key)}" value="${obj.hasOverride ? escapeAttr(obj.override) : ''}" placeholder="${obj.usedSize.toFixed(0)}" />
          ${obj.hasOverride ? `<button class="iconBtn" data-clear="${escapeAttr(key)}" title="Clear bottle override">Reset</button>` : ''}
          ${hideBtn}
        </div>
      </td>
      <td class="right mono">${bottles.toFixed(2)}</td>
    `;
    ingTbody.appendChild(tr);

    ingTotalCl += cl;
    ingTotalBottles += bottles;
  });

  ingTbody.querySelectorAll('input[data-ing]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.ing;
      const v = clampNum(inp.value);
      if (v > 0) ingredientBottleOverrides[key] = v;
      else delete ingredientBottleOverrides[key];
      saveIngredientBottleOverrides();
      renderIngredients();
    });
  });
  ingTbody.querySelectorAll('button[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.clear;
      delete ingredientBottleOverrides[key];
      saveIngredientBottleOverrides();
      renderIngredients();
    });
  });
  ingTbody.querySelectorAll('button[data-hide]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.hide;
      hiddenIngredients[key] = true;
      saveHiddenIngredients();
      renderIngredients();
    });
  });
  ingTbody.querySelectorAll('button[data-unhide]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.unhide;
      delete hiddenIngredients[key];
      saveHiddenIngredients();
      renderIngredients();
    });
  });

  const tog = document.getElementById('toggleHidden');
  if (tog) {
    tog.addEventListener('click', (e) => {
      e.preventDefault();
      showHidden = !showHidden;
      renderIngredients();
    });
  }
  const clr = document.getElementById('clearHidden');
  if (clr) {
    clr.addEventListener('click', (e) => {
      e.preventDefault();
      hiddenIngredients = {};
      saveHiddenIngredients();
      showHidden = false;
      renderIngredients();
    });
  }

  document.getElementById('kpiIngCl').textContent = ingTotalCl.toFixed(1);
  document.getElementById('kpiIngBottles').textContent = ingTotalBottles.toFixed(2);
}

function getShoppingListText(){
  const defaultIngBottleSize = clampNum(ingBottleSizeEl.value) || 70;
  const metrics = collectProductionMetrics({defaultIngBottleSize});
  const groupedPrebatches = new Map();

  metrics.activeItems.forEach(item => {
    const {pb, batches, department, bottles, note} = item;
    if (!groupedPrebatches.has(department)) groupedPrebatches.set(department, []);
    groupedPrebatches.get(department).push(`${pb.name}: ${batches.toFixed(2)} batches = ${bottles.toFixed(2)} bottles${note ? ` [Note: ${note}]` : ''}`);
  });

  const pbLines = [];
  groupedPrebatches.forEach((lines, department) => {
    pbLines.push(department.toUpperCase());
    lines.forEach(line => pbLines.push(`- ${line}`));
  });
  if (!pbLines.length) pbLines.push('(No active prebatches)');

  const ingLines = metrics.ingredientEntries.map(obj => `${obj.displayName}: ${obj.cl.toFixed(1)} cl = ${obj.bottles.toFixed(2)} bottles`);
  if (!ingLines.length) ingLines.push('(No ingredients required)');

  const generated = new Date().toLocaleString();
  return [
    'PREBATCH PRODUCTION SHEET',
    `Generated: ${generated}`,
    '',
    'PREBATCHES TO MAKE',
    'Department / prebatch: batches = finished bottles',
    ...pbLines,
    '',
    'INGREDIENTS REQUIRED',
    'Ingredient: total cl = bottles',
    ...ingLines
  ].join('\n');
}

async function copyTextToClipboard(txt){
  try {
    await navigator.clipboard.writeText(txt);
    alert('Copied!');
  } catch(e) {
    const ta=document.createElement('textarea');
    ta.value=txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Copied!');
  }
}

function updatePrintMeta(){
  const ts = new Date();
  const printMeta = document.getElementById('printMeta');
  printMeta.textContent = `Prebatch Production Sheet - Generated ${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`;
}

function openSheetPreview(){
  if (!sheetPreviewModal || !sheetPreviewText) return;
  const metrics = collectProductionMetrics();
  const activeItems = metrics.activeItems;
  sheetPreviewText.textContent = getShoppingListText();
  if (sheetPreviewHint) {
    sheetPreviewHint.textContent = activeItems.length
      ? `Review ${activeItems.length} active prebatch${activeItems.length === 1 ? '' : 'es'} before copying or printing.`
      : 'No active prebatches yet. The sheet will be empty until you enter batches.';
  }
  if (sheetPreviewStats) {
    sheetPreviewStats.innerHTML = `
      <div><span>${activeItems.length}</span><small>Prebatches</small></div>
      <div><span>${metrics.departmentTotals.size}</span><small>Departments</small></div>
      <div><span>${metrics.totalBatches.toFixed(2)}</span><small>Batches</small></div>
      <div><span>${metrics.totalFinishedBottles.toFixed(2)}</span><small>Finished bottles</small></div>
      <div><span>${metrics.totalIngredientBottles.toFixed(2)}</span><small>Ingredient bottles</small></div>
    `;
  }
  sheetPreviewModal.style.display = 'block';
}

function closeSheetPreview(){
  if (sheetPreviewModal) sheetPreviewModal.style.display = 'none';
}

function printProductionSheet(){
  updatePrintMeta();
  closeSheetPreview();
  window.print();
}

// Modal (unchanged)
const modalBack = document.getElementById('addPrebatchModal');
const ingredientRows = document.getElementById('ingredientRows');
const modalTitle = document.getElementById('modalTitle');
const modalHint = document.getElementById('modalHint');
const deleteInModal = document.getElementById('deleteInModal');
const pbDepartmentInput = document.getElementById('pbDepartment');

let modalMode = 'add';
let editingId = null;

function clearIngredientRows(){ ingredientRows.innerHTML=''; }

function addIngredientRow(name='', cl='', bottleSize='', hideInFinalList=false){
  const esc = (s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="tool" placeholder="Ingredient" style="width:100%" value="${esc(name)}"></td>
    <td class="right"><input type="number" class="tool mono inp" step="0.1" min="0" placeholder="cl" value="${esc(cl)}"></td>
    <td class="right"><input type="number" class="tool mono inp" step="1" min="0" placeholder="default" value="${esc(bottleSize)}"></td>
    <td class="right"><input type="checkbox" data-hide-final ${hideInFinalList ? 'checked' : ''} /></td>
    <td class="right"><button class="iconBtn danger" title="Remove">x</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => tr.remove());
  ingredientRows.appendChild(tr);
}

function openModal(mode, id=null){
  modalMode = mode;
  editingId = id;
  modalBack.style.display='block';

  if (mode === 'add'){
    modalTitle.textContent = '+ Add new prebatch';
    modalHint.textContent = 'Creates a Custom prebatch saved on this device.';
    deleteInModal.style.display='none';
    deleteInModal.textContent='Delete';
    document.getElementById('pbName').value='';
    pbDepartmentInput.value = selectedDepartment || 'Custom';
    clearIngredientRows();
    addIngredientRow();
    return;
  }

  const pbRaw = DATA.prebatches.find(x => x._id === id);
  if (!pbRaw){ closeModal(); return; }

  if (mode === 'edit-custom'){
    if (!isCustomPrebatch(pbRaw)){ alert('Only Custom prebatches can be edited here.'); closeModal(); return; }
    modalTitle.textContent = 'Edit custom prebatch';
    modalHint.textContent = 'Edits the Custom prebatch saved on this device.';
    deleteInModal.style.display='inline-block';
    deleteInModal.textContent='Delete';
    document.getElementById('pbName').value = pbRaw.name;
    pbDepartmentInput.value = getPrebatchDepartment(pbRaw);
    clearIngredientRows();
    (pbRaw.ingredients||[]).forEach(i => addIngredientRow(i.name, i.clPerBatch, i.bottleSizeCl||'', !!i.hideInFinalList));
    return;
  }

  if (mode === 'edit-override'){
    if (isCustomPrebatch(pbRaw)){ alert('Custom prebatches are edited as Custom.'); closeModal(); return; }
    const pb = getEffectivePrebatch(pbRaw);
    modalTitle.textContent = 'Edit JSON recipe (local override)';
    modalHint.textContent = 'This creates/updates a local override. The JSON source file is not changed.';
    deleteInModal.style.display = prebatchOverrides[pbRaw._id] ? 'inline-block' : 'none';
    deleteInModal.textContent='Reset override';
    document.getElementById('pbName').value = pb.name;
    pbDepartmentInput.value = getPrebatchDepartment(pbRaw);
    clearIngredientRows();
    (pb.ingredients||[]).forEach(i => addIngredientRow(i.name, i.clPerBatch, i.bottleSizeCl||'', !!i.hideInFinalList));
    return;
  }
}

function closeModal(){ modalBack.style.display='none'; }

function deleteCustomPrebatch(id){
  const pb = DATA.prebatches.find(x => x._id === id);
  if (!pb || !isCustomPrebatch(pb)) return;
  if (!confirm(`Delete custom prebatch "${pb.name}"?`)) return;
  DATA.prebatches = DATA.prebatches.filter(x => x._id !== id);
  state.delete(id);
  delete prebatchNotes[id];
  saveCustomPrebatches();
  saveProductionSession();
  updateDepartmentOptions();
  updateRecipeCount();
  renderPrebatches();
  renderIngredients();
}

function resetOverride(id){
  const pb = DATA.prebatches.find(x => x._id === id);
  if (!pb || isCustomPrebatch(pb)) return;
  if (!prebatchOverrides[pb._id]) return;
  if (!confirm(`Reset override for "${pb.name}"?`)) return;
  delete prebatchOverrides[pb._id];
  savePrebatchOverrides();
  updateDepartmentOptions();
  renderPrebatches();
  renderIngredients();
}

function getRecipeStatus(pbRaw){
  if (isCustomPrebatch(pbRaw)) return { label: 'Custom', className: 'custom' };
  if (prebatchOverrides[pbRaw._id]) return { label: 'Local override', className: 'override' };
  return { label: 'JSON source', className: 'source' };
}

function updateRecipeManagerDepartments(){
  if (!recipeManagerDepartment) return;
  const current = recipeManagerDepartment.value || '';
  const departments = getDepartments();
  recipeManagerDepartment.innerHTML = '';
  recipeManagerDepartment.appendChild(new Option('All departments', ''));
  departments.forEach(department => recipeManagerDepartment.appendChild(new Option(department, department)));
  recipeManagerDepartment.value = departments.includes(current) ? current : '';
}

function getRecipeManagerRows(){
  const q = (recipeManagerSearch?.value || '').trim().toLowerCase();
  const departmentFilter = recipeManagerDepartment?.value || '';
  return (DATA.prebatches || [])
    .slice()
    .sort((a,b)=> (getPrebatchDepartment(a)+' '+getEffectivePrebatch(a).name).localeCompare(getPrebatchDepartment(b)+' '+getEffectivePrebatch(b).name))
    .filter(pbRaw => !departmentFilter || getPrebatchDepartment(pbRaw) === departmentFilter)
    .filter(pbRaw => {
      if (!q) return true;
      const pb = getEffectivePrebatch(pbRaw);
      const ingredients = (pb?.ingredients || []).map(i => String(i.name || '').toLowerCase()).join(' ');
      return String(pb?.name || '').toLowerCase().includes(q)
        || getPrebatchDepartment(pbRaw).toLowerCase().includes(q)
        || ingredients.includes(q);
    });
}

function renderRecipeManager(){
  if (!recipeManagerTbody) return;
  updateRecipeManagerDepartments();
  const rows = getRecipeManagerRows();
  const total = DATA.prebatches.length;
  const overrides = Object.keys(prebatchOverrides || {}).length;
  const custom = (DATA.prebatches || []).filter(isCustomPrebatch).length;
  if (recipeManagerStats) {
    recipeManagerStats.textContent = `${rows.length} shown · ${total} total · ${overrides} local override${overrides === 1 ? '' : 's'} · ${custom} custom`;
  }

  recipeManagerTbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="small">No recipes match the current search or department.</td>';
    recipeManagerTbody.appendChild(tr);
    return;
  }

  rows.forEach(pbRaw => {
    const pb = getEffectivePrebatch(pbRaw);
    const id = pbRaw._id;
    const status = getRecipeStatus(pbRaw);
    const ingredientCount = (pb?.ingredients || []).length;
    const batchTotal = (pb?.ingredients || []).reduce((sum, ing) => sum + (Number(ing.clPerBatch) || 0), 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <button class="nameBtn" data-manager-edit-id="${escapeAttr(id)}" title="Edit recipe">
          <span class="name nameTxt">${escapeHtml(pb?.name || 'Untitled recipe')}</span>
        </button>
        <div class="sub">Batch total: <span class="mono">${batchTotal.toFixed(0)} cl</span></div>
      </td>
      <td>${escapeHtml(getPrebatchDepartment(pbRaw))}</td>
      <td class="right mono">${ingredientCount}</td>
      <td><span class="statusPill ${escapeAttr(status.className)}">${escapeHtml(status.label)}</span></td>
      <td class="right">
        <div class="managerActions">
          <button class="iconBtn" data-manager-edit-id="${escapeAttr(id)}">Edit</button>
          ${prebatchOverrides[id] ? `<button class="iconBtn danger" data-manager-reset-id="${escapeAttr(id)}">Reset</button>` : ''}
        </div>
      </td>
    `;
    recipeManagerTbody.appendChild(tr);
  });

  recipeManagerTbody.querySelectorAll('[data-manager-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.managerEditId;
      const pbRaw = DATA.prebatches.find(x => x._id === id);
      if (!pbRaw) return;
      closeRecipeManager();
      openModal(isCustomPrebatch(pbRaw) ? 'edit-custom' : 'edit-override', id);
    });
  });

  recipeManagerTbody.querySelectorAll('[data-manager-reset-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      resetOverride(btn.dataset.managerResetId);
      renderRecipeManager();
    });
  });
}

function openRecipeManager(){
  if (!recipeManagerModal) return;
  renderRecipeManager();
  recipeManagerModal.style.display = 'block';
  recipeManagerSearch?.focus();
}

function closeRecipeManager(){
  if (recipeManagerModal) recipeManagerModal.style.display = 'none';
}

// Buttons

document.getElementById('addPrebatchBtn').addEventListener('click', () => openModal('add'));
document.getElementById('recipeManagerBtn')?.addEventListener('click', openRecipeManager);
document.getElementById('cancelAddPrebatch').addEventListener('click', closeModal);
modalBack.addEventListener('click', (e)=>{ if (e.target === modalBack) closeModal(); });
document.getElementById('addIngredientRow').addEventListener('click', () => addIngredientRow());
document.getElementById('closeRecipeManager')?.addEventListener('click', closeRecipeManager);
recipeManagerModal?.addEventListener('click', (e)=>{ if (e.target === recipeManagerModal) closeRecipeManager(); });
recipeManagerSearch?.addEventListener('input', renderRecipeManager);
recipeManagerDepartment?.addEventListener('change', renderRecipeManager);
document.getElementById('managerAddPrebatch')?.addEventListener('click', () => {
  closeRecipeManager();
  openModal('add');
});
document.getElementById('managerImportJson')?.addEventListener('click', () => {
  const inp = document.getElementById('importSettingsFile');
  inp.value = '';
  inp.click();
});
document.getElementById('managerExportJson')?.addEventListener('click', downloadSettingsFile);

deleteInModal.addEventListener('click', () => {
  if (!editingId) return;
  if (modalMode === 'edit-custom'){
    deleteCustomPrebatch(editingId);
    closeModal();
  } else if (modalMode === 'edit-override'){
    delete prebatchOverrides[editingId];
    savePrebatchOverrides();
    updateDepartmentOptions();
    closeModal();
    renderPrebatches();
    renderIngredients();
  }
});

document.getElementById('savePrebatch').addEventListener('click', ()=>{
  const name = (document.getElementById('pbName').value || '').trim();
  const departmentRaw = String(pbDepartmentInput.value || '').trim();
  const department = normalizeDepartmentName(departmentRaw);
  if (!name){ alert('Prebatch name is required'); return; }
  if (!departmentRaw){ alert('Department is required'); return; }

  const ingredients=[];
  const ingredientKeys = new Set();
  const duplicateIngredients = new Set();
  ingredientRows.querySelectorAll('tr').forEach(tr=>{
    const ingName = (tr.querySelector('td:nth-child(1) input').value || '').trim();
    const cl = clampNum(tr.querySelector('td:nth-child(2) input').value);
    const bottleSize = clampNum(tr.querySelector('td:nth-child(3) input').value);
    const hideInFinalList = !!tr.querySelector('input[data-hide-final]')?.checked;
    if (ingName && cl>0){
      const ingredientKey = normalizeIngName(ingName);
      if (ingredientKeys.has(ingredientKey)) duplicateIngredients.add(ingName);
      ingredientKeys.add(ingredientKey);
      ingredients.push({name: ingName, clPerBatch: cl, bottleSizeCl: (bottleSize>0? bottleSize : null), hideInFinalList});
    }
  });
  if (!ingredients.length){ alert('Add at least one ingredient'); return; }
  if (duplicateIngredients.size > 0){ alert(`Duplicate ingredient in this prebatch: ${Array.from(duplicateIngredients).join(', ')}`); return; }

  if (modalMode === 'add'){
    const lower = name.toLowerCase();
    const dup = DATA.prebatches.some(p => (p.name||'').toLowerCase()===lower);
    if (dup){ alert('A prebatch with this name already exists. Use a different name.'); return; }
    const newPB = { _id: makeId(), name, sheet: department, isCustom: true, ingredients };
    DATA.prebatches.push(newPB);
    saveCustomPrebatches();
    updateDepartmentOptions();
    updateRecipeCount();
    closeModal();
    renderPrebatches();
    renderIngredients();
    return;
  }

  if (modalMode === 'edit-custom'){
    const pb = DATA.prebatches.find(x => x._id === editingId);
    if (!pb || !isCustomPrebatch(pb)){ alert('Only Custom prebatches can be edited.'); return; }
    const lower = name.toLowerCase();
    const dup = DATA.prebatches.some(p => p._id !== pb._id && (p.name||'').toLowerCase()===lower);
    if (dup){ alert('A prebatch with this name already exists. Use a different name.'); return; }
    pb.name = name;
    pb.sheet = department;
    pb.isCustom = true;
    pb.ingredients = ingredients;
    saveCustomPrebatches();
    updateDepartmentOptions();
    closeModal();
    renderPrebatches();
    renderIngredients();
    return;
  }

  if (modalMode === 'edit-override'){
    const pb = DATA.prebatches.find(x => x._id === editingId);
    if (!pb || isCustomPrebatch(pb)){ alert('Only JSON source recipes use overrides.'); return; }
    prebatchOverrides[pb._id] = { name, sheet: department, ingredients };
    savePrebatchOverrides();
    updateDepartmentOptions();
    closeModal();
    renderPrebatches();
    renderIngredients();
    return;
  }
});

searchEl.addEventListener('input', () => { renderPrebatches(); });
if (departmentFilterEl) {
  departmentFilterEl.addEventListener('change', () => {
    selectedDepartment = departmentFilterEl.value;
    localStorage.setItem(DEPARTMENT_FILTER_KEY, selectedDepartment);
    renderPrebatches();
  });
}
if (activeOnlyEl) {
  activeOnlyEl.checked = activeOnlyEnabled;
  activeOnlyEl.addEventListener('change', () => {
    activeOnlyEnabled = activeOnlyEl.checked;
    localStorage.setItem(ACTIVE_ONLY_KEY, activeOnlyEnabled ? '1' : '0');
    renderPrebatches();
  });
}
[ingBottleSizeEl, finBottleSizeEl].forEach(el => el.addEventListener('input', () => { renderPrebatches(); renderIngredients(); }));


document.getElementById('importSettingsFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleSettingsImportFile(file);
  } catch(err) {
    alert(err?.message || 'Import failed.');
  }
});

const printSheetBtn = document.getElementById('printSheet');
if (printSheetBtn) printSheetBtn.addEventListener('click', openSheetPreview);
document.getElementById('reloadData').addEventListener('click', () => {
  reloadDataFromJsonAtRuntime();
});
document.getElementById('reset').addEventListener('click', () => {
  const counts = getProductionSessionCounts();
  if ((counts.activeRecipes > 0 || counts.notes > 0) && !confirm('Clear all entered batches and prep notes for this production session?')) return;
  clearProductionSession();
  renderPrebatches();
  renderIngredients();
});
const mCopy = document.getElementById('mCopy');
if (mCopy) mCopy.addEventListener('click', () => document.getElementById('copy').click());
const mPrint = document.getElementById('mPrint');
if (mPrint) mPrint.addEventListener('click', () => document.getElementById('printSheet').click());
const mReset = document.getElementById('mReset');
if (mReset) mReset.addEventListener('click', () => document.getElementById('reset').click());
if (sheetPreviewModal) {
  sheetPreviewModal.addEventListener('click', (e)=>{ if (e.target === sheetPreviewModal) closeSheetPreview(); });
}
document.getElementById('closeSheetPreview').addEventListener('click', closeSheetPreview);
document.getElementById('copyPreviewSheet').addEventListener('click', () => copyTextToClipboard(getShoppingListText()));
document.getElementById('printPreviewSheet').addEventListener('click', printProductionSheet);


function getCustomPrebatchesForExport(){
  return (DATA.prebatches || []).filter(isCustomPrebatch);
}

function sanitizeImportedOverrides(input){
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.entries(input).forEach(([id, ov]) => {
    if (!id || !ov || typeof ov !== 'object') return;
    const name = String(ov.name || '').trim();
    const sheet = ov.sheet === undefined ? null : normalizeDepartmentName(ov.sheet);
    const ingredientsRaw = Array.isArray(ov.ingredients) ? ov.ingredients : [];
    const ingredients = ingredientsRaw
      .map(i => ({
        name: String(i?.name || '').trim(),
        clPerBatch: clampNum(i?.clPerBatch),
        bottleSizeCl: clampNum(i?.bottleSizeCl) > 0 ? clampNum(i?.bottleSizeCl) : null,
        hideInFinalList: !!i?.hideInFinalList
      }))
      .filter(i => i.name && i.clPerBatch > 0);
    if (!name || !ingredients.length) return;
    out[id] = sheet ? { name, sheet, ingredients } : { name, ingredients };
  });
  return out;
}

function sanitizeImportedHidden(input){
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.keys(input).forEach(k => {
    const nk = normalizeIngName(k);
    if (nk) out[nk] = true;
  });
  return out;
}

function sanitizeImportedIngredientSizes(input){
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.entries(input).forEach(([k,v]) => {
    const nk = normalizeIngName(k);
    const num = clampNum(v);
    if (nk && num > 0) out[nk] = num;
  });
  return out;
}

function sanitizeImportedCustomPrebatches(input){
  if (!Array.isArray(input)) return [];
  return input.map(p => {
    const name = String(p?.name || '').trim();
    const ingredientsRaw = Array.isArray(p?.ingredients) ? p.ingredients : [];
    const ingredients = ingredientsRaw
      .map(i => ({
        name: String(i?.name || '').trim(),
        clPerBatch: clampNum(i?.clPerBatch),
        bottleSizeCl: clampNum(i?.bottleSizeCl) > 0 ? clampNum(i?.bottleSizeCl) : null,
        hideInFinalList: !!i?.hideInFinalList
      }))
      .filter(i => i.name && i.clPerBatch > 0);
    if (!name || !ingredients.length) return null;
    return {
      _id: p?._id ? String(p._id) : makeId(),
      name,
      sheet: normalizeDepartmentName(p?.sheet),
      isCustom: true,
      ingredients
    };
  }).filter(Boolean);
}

function buildCompleteDataExportPayload(){
  const prebatches = (DATA.prebatches || []).map(pbRaw => {
    const pb = getEffectivePrebatch(pbRaw);
    const ingredients = (pb.ingredients || []).map(i => ({
      name: String(i.name || '').trim(),
      clPerBatch: Number(i.clPerBatch) || 0,
      bottleSizeCl: (Number(i.bottleSizeCl) > 0) ? Number(i.bottleSizeCl) : null,
      hideInFinalList: !!i.hideInFinalList
    })).filter(i => i.name && i.clPerBatch > 0);
    const totalClPerBatch = ingredients.reduce((s, i) => s + i.clPerBatch, 0);
    return {
      name: pb.name,
      sheet: getPrebatchDepartment(pbRaw),
      cocktailsPerBatch: (pb.cocktailsPerBatch ?? null),
      ingredients,
      totalClPerBatch,
      bottlesPerBatchAt70cl: totalClPerBatch / 70
    };
  });

  return {
    source: DATA.source || 'prebatch_data.json',
    unit: DATA.unit || 'cl',
    defaultBottleSizeCl: Number(DATA.defaultBottleSizeCl) || 70,
    prebatches,
    appSettings: {
      hiddenIngredients: hiddenIngredients || {},
      ingredientBottleOverrides: ingredientBottleOverrides || {}
    }
  };
}

function downloadSettingsFile(){
  const payload = buildCompleteDataExportPayload();
  const txt = JSON.stringify(payload, null, 2);
  const blob = new Blob([txt], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `prebatch_data-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function mergeCustomPrebatches(imported){
  const existing = DATA.prebatches.filter(isCustomPrebatch);
  const byName = new Map(existing.map(p => [String(p.name || '').toLowerCase(), p]));
  imported.forEach(p => {
    const key = p.name.toLowerCase();
    if (byName.has(key)) {
      const target = byName.get(key);
      target.sheet = normalizeDepartmentName(p.sheet);
      target.isCustom = true;
      target.ingredients = p.ingredients;
    } else {
      DATA.prebatches.push({ ...p, _id: p._id || makeId(), sheet: normalizeDepartmentName(p.sheet), isCustom: true });
    }
  });
}

function replaceCustomPrebatches(imported){
  DATA.prebatches = DATA.prebatches.filter(p => !isCustomPrebatch(p));
  imported.forEach(p => DATA.prebatches.push({ ...p, _id: p._id || makeId(), sheet: normalizeDepartmentName(p.sheet), isCustom: true }));
}

function applyImportedSettings(raw){
  const payload = raw?.payload || raw;
  if (!payload || typeof payload !== 'object') throw new Error('Invalid settings JSON format.');

  const importedOverrides = sanitizeImportedOverrides(payload.prebatchOverrides);
  const importedHidden = sanitizeImportedHidden(payload.hiddenIngredients);
  const importedIngSizes = sanitizeImportedIngredientSizes(payload.ingredientBottleOverrides);
  const importedCustom = sanitizeImportedCustomPrebatches(payload.customPrebatches);

  const hasAny = Object.keys(importedOverrides).length || Object.keys(importedHidden).length || Object.keys(importedIngSizes).length || importedCustom.length;
  if (!hasAny) throw new Error('No usable settings found in file.');

  const replaceMode = confirm('Import mode: OK = Replace existing local settings. Cancel = Merge with existing settings.');

  if (replaceMode) {
    prebatchOverrides = importedOverrides;
    hiddenIngredients = importedHidden;
    ingredientBottleOverrides = importedIngSizes;
    replaceCustomPrebatches(importedCustom);
  } else {
    prebatchOverrides = { ...prebatchOverrides, ...importedOverrides };
    hiddenIngredients = { ...hiddenIngredients, ...importedHidden };
    ingredientBottleOverrides = { ...ingredientBottleOverrides, ...importedIngSizes };
    mergeCustomPrebatches(importedCustom);
  }

  savePrebatchOverrides();
  saveHiddenIngredients();
  saveIngredientBottleOverrides();
  saveCustomPrebatches();

  updateDepartmentOptions();
  updateRecipeCount();
  renderPrebatches();
  renderIngredients();

  alert(
    'Settings imported successfully.\n' +
    `Overrides: ${Object.keys(importedOverrides).length}\n` +
    `Hidden ingredients: ${Object.keys(importedHidden).length}\n` +
    `Bottle size overrides: ${Object.keys(importedIngSizes).length}\n` +
    `Custom prebatches: ${importedCustom.length}`
  );
}

function applyImportedFullData(raw){
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.prebatches)) {
    throw new Error('Invalid full data JSON format.');
  }

  const ok = confirm('This will replace the complete recipe dataset in the app. Continue?');
  if (!ok) return;

  const cleaned = {
    source: raw.source || 'prebatch_data.json',
    unit: raw.unit || 'cl',
    defaultBottleSizeCl: Number(raw.defaultBottleSizeCl) || 70,
    prebatches: raw.prebatches
      .map(pb => {
        const name = String(pb?.name || '').trim();
        const sheet = String(pb?.sheet || 'Custom').trim() || 'Custom';
        const ingredients = (Array.isArray(pb?.ingredients) ? pb.ingredients : [])
          .map(i => ({
            name: String(i?.name || '').trim(),
            clPerBatch: clampNum(i?.clPerBatch),
            bottleSizeCl: clampNum(i?.bottleSizeCl) > 0 ? clampNum(i?.bottleSizeCl) : null,
            hideInFinalList: !!i?.hideInFinalList
          }))
          .filter(i => i.name && i.clPerBatch > 0);
        if (!name || !ingredients.length) return null;
        const totalClPerBatch = ingredients.reduce((s, i) => s + i.clPerBatch, 0);
        return {
          name,
          sheet,
          cocktailsPerBatch: (pb?.cocktailsPerBatch ?? null),
          ingredients,
          totalClPerBatch,
          bottlesPerBatchAt70cl: totalClPerBatch / 70
        };
      })
      .filter(Boolean)
  };

  Object.keys(DATA).forEach(k => delete DATA[k]);
  Object.assign(DATA, cleaned);
  ensureIds();

  // Imported full data already contains effective recipes; clear override/custom local layers.
  prebatchOverrides = {};
  localStorage.removeItem(PB_OVERRIDE_KEY);
  localStorage.removeItem(CUSTOM_KEY);
  state.clear();
  prebatchNotes = {};
  localStorage.removeItem(PREBATCH_NOTE_KEY);
  localStorage.removeItem(PRODUCTION_SESSION_KEY);
  productionSessionUpdatedAt = null;

  // Restore optional app-level settings when present in full-data export.
  hiddenIngredients = sanitizeImportedHidden(raw?.appSettings?.hiddenIngredients || {});
  ingredientBottleOverrides = sanitizeImportedIngredientSizes(raw?.appSettings?.ingredientBottleOverrides || {});
  saveHiddenIngredients();
  saveIngredientBottleOverrides();

  updateDepartmentOptions();
  updateRecipeCount();
  renderPrebatches();
  renderIngredients();
  alert(`Full data imported successfully (${DATA.prebatches.length} recipes).`);
}

async function handleSettingsImportFile(file){
  if (!file) return;
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch(e) {
    throw new Error('File is not valid JSON.');
  }
  const looksLikeFullData = Array.isArray(parsed?.prebatches);
  if (looksLikeFullData) {
    applyImportedFullData(parsed);
  } else {
    applyImportedSettings(parsed);
  }
}

document.getElementById('copy').addEventListener('click', openSheetPreview);

async function initializeApp(){
  updateRecipeCount();
  updateDataSourceInfo();

  try {
    await loadDataFromJson();
  } catch (e) {
    console.error(e);
    DATA_LOAD_MESSAGE = `Could not load ${DATA_URL}. Check that the file exists next to index.html.`;
    updateDataSourceInfo();
    renderPrebatches();
    renderIngredients();
    alert(DATA_LOAD_MESSAGE);
    return;
  }

  pruneResolvedOverrides();
  loadCustomPrebatches();
  loadProductionSession();
  updateDepartmentOptions();
  updateRecipeCount();
  updateDataSourceInfo();
  renderPrebatches();
  renderIngredients();
}

initializeApp();
