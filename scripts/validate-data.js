const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'prebatch_data.json');
const errors = [];
const warnings = [];

function isPositiveNumber(value){
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function nearlyEqual(a, b, tolerance = 0.01){
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function addError(location, message){
  errors.push(`${location}: ${message}`);
}

function addWarning(location, message){
  warnings.push(`${location}: ${message}`);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
} catch (error) {
  console.error(`Could not read ${DATA_PATH}: ${error.message}`);
  process.exit(1);
}

if (!data || typeof data !== 'object') {
  addError('root', 'Expected a JSON object.');
}

if (!Array.isArray(data.prebatches) || data.prebatches.length === 0) {
  addError('root.prebatches', 'Expected a non-empty recipe array.');
}

if (data.defaultBottleSizeCl !== undefined && !isPositiveNumber(data.defaultBottleSizeCl)) {
  addError('root.defaultBottleSizeCl', 'Expected a positive number.');
}

const recipeKeys = new Set();

(data.prebatches || []).forEach((recipe, recipeIndex) => {
  const location = `prebatches[${recipeIndex}]`;
  const name = String(recipe?.name || '').trim();
  const sheet = String(recipe?.sheet || '').trim();

  if (!name) addError(location, 'Recipe name is required.');
  if (!sheet) addError(location, 'Sheet/department is required.');

  const recipeKey = `${sheet}::${name}`.toLowerCase();
  if (recipeKeys.has(recipeKey)) {
    addError(location, `Duplicate recipe key "${sheet}::${name}".`);
  }
  recipeKeys.add(recipeKey);

  if (recipe.cocktailsPerBatch !== null && recipe.cocktailsPerBatch !== undefined && !isPositiveNumber(recipe.cocktailsPerBatch)) {
    addError(`${location}.cocktailsPerBatch`, 'Expected null or a positive number.');
  }

  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    addError(`${location}.ingredients`, 'Expected at least one ingredient.');
    return;
  }

  let totalCl = 0;
  recipe.ingredients.forEach((ingredient, ingredientIndex) => {
    const ingredientLocation = `${location}.ingredients[${ingredientIndex}]`;
    const ingredientName = String(ingredient?.name || '').trim();
    const clPerBatch = Number(ingredient?.clPerBatch);
    const bottleSizeCl = ingredient?.bottleSizeCl;

    if (!ingredientName) addError(ingredientLocation, 'Ingredient name is required.');
    if (!isPositiveNumber(clPerBatch)) addError(`${ingredientLocation}.clPerBatch`, 'Expected a positive number.');
    if (bottleSizeCl !== null && bottleSizeCl !== undefined && !isPositiveNumber(bottleSizeCl)) {
      addError(`${ingredientLocation}.bottleSizeCl`, 'Expected null or a positive number.');
    }
    if (ingredient?.hideInFinalList !== undefined && typeof ingredient.hideInFinalList !== 'boolean') {
      addError(`${ingredientLocation}.hideInFinalList`, 'Expected a boolean when present.');
    }

    if (Number.isFinite(clPerBatch)) totalCl += clPerBatch;
  });

  if (recipe.totalClPerBatch !== undefined && !nearlyEqual(recipe.totalClPerBatch, totalCl)) {
    addWarning(`${location}.totalClPerBatch`, `Stored total ${recipe.totalClPerBatch} differs from ingredients total ${totalCl.toFixed(2)}.`);
  }

  if (recipe.bottlesPerBatchAt70cl !== undefined && !nearlyEqual(recipe.bottlesPerBatchAt70cl, totalCl / 70)) {
    addWarning(`${location}.bottlesPerBatchAt70cl`, 'Stored bottle count differs from ingredients total / 70.');
  }
});

warnings.forEach(warning => console.warn(`Warning: ${warning}`));

if (errors.length > 0) {
  errors.forEach(error => console.error(`Error: ${error}`));
  process.exit(1);
}

console.log(`Recipe data valid: ${(data.prebatches || []).length} recipes checked.`);
