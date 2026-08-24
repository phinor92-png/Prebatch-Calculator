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
function savePrebatchNotes(){
  localStorage.setItem(PREBATCH_NOTE_KEY, JSON.stringify(prebatchNotes));
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
const ADVANCED_VIEW_KEY = 'advancedViewEnabled';
let advancedViewEnabled = localStorage.getItem(ADVANCED_VIEW_KEY) === '1';
const DEPARTMENT_FILTER_KEY = 'departmentFilter';
const ACTIVE_ONLY_KEY = 'activeOnlyEnabled';
let selectedDepartment = localStorage.getItem(DEPARTMENT_FILTER_KEY) || '';
let activeOnlyEnabled = localStorage.getItem(ACTIVE_ONLY_KEY) === '1';
if (advancedViewEnabled) document.body.classList.add('showAdvanced');
function updateAdvancedButtonLabel(){
  const btn = document.getElementById('toggleAdvanced');
  if (btn) btn.textContent = `Advanced: ${advancedViewEnabled ? 'On' : 'Off'}`;
  const mb = document.getElementById('mobileAdvancedToggle');
  if (mb) mb.textContent = `Advanced: ${advancedViewEnabled ? 'On' : 'Off'}`;
}

const dataSourceInfoEl = document.getElementById('dataSourceInfo');

// State per prebatch id
const state = new Map();
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
  return String(value || '').replace(/\s+/g, ' ').trim() || 'Custom';
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
  const finBottleSize = clampNum(finBottleSizeEl.value) || 70;

  // totals keyed by normalised ingredient name
  const totals = new Map();
  let totalBatches=0;
  let totalFinishedBottles=0;
  const madeLines = [];

  DATA.prebatches.forEach(pbRaw => {
    const id = pbRaw._id;
    const st = state.get(id);
    if (!st) return;
    const batches = clampNum(st.batches);
    if (batches <= 0) return;

    const pb = getEffectivePrebatch(pbRaw);

    totalBatches += batches;
    const madeBottles = batches * bottlesPerBatch(pb, finBottleSize);
    totalFinishedBottles += madeBottles;
    madeLines.push(`${getPrebatchDepartment(pbRaw)} / ${pb.name}:   ${madeBottles.toFixed(2)} bottles`);

    (pb.ingredients||[]).forEach(ing => {
      const rawName = String(ing.name||'').replace(/\u00A0/g,' ').trim();
      if (!rawName) return;
      const key = normalizeIngName(rawName);
      const cl = (Number(ing.clPerBatch)||0) * batches;
      const bsz = (ing.bottleSizeCl && Number(ing.bottleSizeCl)>0) ? Number(ing.bottleSizeCl) : null;
      if (isIngredientHiddenInFinishedList(ing, key)) return;

      if (!totals.has(key)) {
        totals.set(key, {displayName: getPreferredIngredientDisplayName(key, rawName), cl:0, bottleSizeCl: bsz, conflict:false});
      }
      const obj = totals.get(key);
      obj.cl += cl;
      // choose a nicer display name if current one is all lower-case and this isn't
      if (obj.displayName === obj.displayName.toLowerCase() && rawName !== rawName.toLowerCase()) {
        obj.displayName = getPreferredIngredientDisplayName(key, rawName);
      }
      if (bsz) {
        if (obj.bottleSizeCl === null) obj.bottleSizeCl = bsz;
        else if (obj.bottleSizeCl !== bsz) obj.conflict = true;
      }
    });
  });

  document.getElementById('kpiBatches').textContent = totalBatches.toFixed(2);
  document.getElementById('kpiBottles').textContent = totalFinishedBottles.toFixed(2);
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
  const entries = Array.from(totals.entries()).sort((a,b)=> (a[1].displayName||a[0]).localeCompare(b[1].displayName||b[0]));

  let ingTotalCl=0;
  let ingTotalBottles=0;

  entries.forEach(([key, obj]) => {
    const name = obj.displayName;
    const isHidden = !!hiddenIngredients[key];
    if (isHidden && !showHidden) return;

    const cl = obj.cl;
    const override = Number(ingredientBottleOverrides[key]);
    const recipeSize = (!obj.conflict && obj.bottleSizeCl) ? obj.bottleSizeCl : null;
    const usedSize = (override>0) ? override : (recipeSize || defaultIngBottleSize);

    const exact = usedSize>0 ? (cl / usedSize) : 0;
    const bottles = exact; // rounding OFF

    const warn = obj.conflict ? '<span class="warn">mixed recipe sizes</span>' : '';
    const hasOverride = override>0;

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
          <input class="tool inp mono" type="number" min="0" step="1" data-ing="${escapeAttr(key)}" value="${hasOverride ? escapeAttr(override) : ''}" placeholder="${usedSize.toFixed(0)}" />
          ${hasOverride ? `<button class="iconBtn" data-clear="${escapeAttr(key)}" title="Clear bottle override">Reset</button>` : ''}
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
  const finBottleSize = clampNum(finBottleSizeEl.value) || 70;

  const totals = new Map();
  const pbLines=[];

  DATA.prebatches.forEach(pbRaw => {
    const id = pbRaw._id;
    const st = state.get(id);
    if (!st) return;
    const batches = clampNum(st.batches);
    if (batches <= 0) return;

    const pb = getEffectivePrebatch(pbRaw);

    const totalClPerBatch = (pb.ingredients||[]).reduce((s,i)=>s+(Number(i.clPerBatch)||0),0);
    const bottlesMade = (totalClPerBatch/finBottleSize) * batches;
    const note = prebatchNotes[id] ? ` [Note: ${prebatchNotes[id]}]` : '';
    pbLines.push(`${getPrebatchDepartment(pbRaw)} / ${pb.name}: ${batches.toFixed(2)} batches = ${bottlesMade.toFixed(2)} bottles${note}`);

    (pb.ingredients||[]).forEach(ing => {
      const rawName = String(ing.name||'').replace(/\u00A0/g,' ').trim();
      if (!rawName) return;
      const key = normalizeIngName(rawName);
      if (isIngredientHiddenInFinishedList(ing, key)) return;
      const cl = (Number(ing.clPerBatch)||0) * batches;
      const bsz = (ing.bottleSizeCl && Number(ing.bottleSizeCl)>0) ? Number(ing.bottleSizeCl) : null;

      if (!totals.has(key)) totals.set(key, {displayName: getPreferredIngredientDisplayName(key, rawName), cl:0, bottleSizeCl:bsz, conflict:false});
      const obj = totals.get(key);
      obj.cl += cl;
      if (obj.displayName === obj.displayName.toLowerCase() && rawName !== rawName.toLowerCase()) obj.displayName = getPreferredIngredientDisplayName(key, rawName);
      if (bsz){
        if (obj.bottleSizeCl === null) obj.bottleSizeCl = bsz;
        else if (obj.bottleSizeCl !== bsz) obj.conflict = true;
      }
    });
  });

  const ingLines = Array.from(totals.entries())
    .sort((a,b)=> (a[1].displayName||a[0]).localeCompare(b[1].displayName||b[0]))
    .map(([key, obj]) => {
      const override = Number(ingredientBottleOverrides[key]);
      const recipeSize = (!obj.conflict && obj.bottleSizeCl) ? obj.bottleSizeCl : null;
      const usedSize = (override>0) ? override : (recipeSize || defaultIngBottleSize);
      const exact = usedSize>0 ? (obj.cl/usedSize) : 0;
      const bottles = exact;
      return `${obj.displayName}: ${obj.cl.toFixed(1)} cl = ${bottles.toFixed(2)} bottles`;
    });

  const generated = new Date().toLocaleString();
  return [
    'PREBATCH PRODUCTION SHEET',
    `Generated: ${generated}`,
    '',
    'PREBATCHES TO MAKE',
    'Prebatch: batches = finished bottles',
    ...pbLines,
    '',
    'INGREDIENTS REQUIRED',
    'Ingredient: total cl = bottles',
    ...ingLines
  ].join('\n');
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
    modalTitle.textContent = 'Edit Excel prebatch (local override)';
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
  saveCustomPrebatches();
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

// Buttons

document.getElementById('addPrebatchBtn').addEventListener('click', () => openModal('add'));
document.getElementById('cancelAddPrebatch').addEventListener('click', closeModal);
modalBack.addEventListener('click', (e)=>{ if (e.target === modalBack) closeModal(); });
document.getElementById('addIngredientRow').addEventListener('click', () => addIngredientRow());

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
  const department = normalizeDepartmentName(pbDepartmentInput.value);
  if (!name){ alert('Prebatch name is required'); return; }

  const ingredients=[];
  ingredientRows.querySelectorAll('tr').forEach(tr=>{
    const ingName = (tr.querySelector('td:nth-child(1) input').value || '').trim();
    const cl = clampNum(tr.querySelector('td:nth-child(2) input').value);
    const bottleSize = clampNum(tr.querySelector('td:nth-child(3) input').value);
    const hideInFinalList = !!tr.querySelector('input[data-hide-final]')?.checked;
    if (ingName && cl>0){
      ingredients.push({name: ingName, clPerBatch: cl, bottleSizeCl: (bottleSize>0? bottleSize : null), hideInFinalList});
    }
  });
  if (!ingredients.length){ alert('Add at least one ingredient'); return; }

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
    if (!pb || isCustomPrebatch(pb)){ alert('Only Excel prebatches use overrides.'); return; }
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


document.getElementById('exportSettings').addEventListener('click', () => {
  downloadSettingsFile();
});

document.getElementById('importSettings').addEventListener('click', () => {
  const inp = document.getElementById('importSettingsFile');
  inp.value = '';
  inp.click();
});

document.getElementById('importSettingsFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleSettingsImportFile(file);
  } catch(err) {
    alert(err?.message || 'Import failed.');
  }
});

document.getElementById('printSheet').addEventListener('click', () => {
  const ts = new Date();
  const printMeta = document.getElementById('printMeta');
  printMeta.textContent = `Prebatch Production Sheet - Generated ${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`;
  window.print();
});
document.getElementById('reloadData').addEventListener('click', () => {
  reloadDataFromJsonAtRuntime();
});
document.getElementById('toggleAdvanced').addEventListener('click', () => {
  advancedViewEnabled = !advancedViewEnabled;
  document.body.classList.toggle('showAdvanced', advancedViewEnabled);
  localStorage.setItem(ADVANCED_VIEW_KEY, advancedViewEnabled ? '1' : '0');
  updateAdvancedButtonLabel();
  renderPrebatches();
});
const mobileAdvancedToggle = document.getElementById('mobileAdvancedToggle');
if (mobileAdvancedToggle) {
  mobileAdvancedToggle.addEventListener('click', () => {
    document.getElementById('toggleAdvanced').click();
  });
}
document.getElementById('reset').addEventListener('click', () => {
  state.clear();
  renderPrebatches();
  renderIngredients();
});
const mCopy = document.getElementById('mCopy');
if (mCopy) mCopy.addEventListener('click', () => document.getElementById('copy').click());
const mPrint = document.getElementById('mPrint');
if (mPrint) mPrint.addEventListener('click', () => document.getElementById('printSheet').click());
const mReset = document.getElementById('mReset');
if (mReset) mReset.addEventListener('click', () => document.getElementById('reset').click());


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

document.getElementById('copy').addEventListener('click', async () => {
  const txt = getShoppingListText();
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
});

async function initializeApp(){
  updateAdvancedButtonLabel();
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
  updateDepartmentOptions();
  updateRecipeCount();
  updateDataSourceInfo();
  renderPrebatches();
  renderIngredients();
}

initializeApp();
