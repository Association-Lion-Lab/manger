function inputError(message) {
  return Object.assign(new Error(message), {code:'MANGER_RECIPE_INPUT'});
}

function checkedRecipe(result) {
  const errors={'unknown-recipe':'Recette inconnue','used-recipe':'Cette recette est utilisée dans le planning'};
  if(typeof result==='string'&&Object.hasOwn(errors,result))throw inputError(errors[result]);
  return result;
}

function validateRecipe(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.includes('\0') || input.title.length > 120) throw inputError('Titre invalide');
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1_440) throw inputError('Durée invalide');
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 100) throw inputError('Nombre de portions invalide');
  if (!['vegan', 'vegetarian', 'pescetarian', 'omnivore'].includes(input.diet)) throw inputError('Régime de recette invalide');
  if (!Array.isArray(input.tags) || input.tags.length > 20 || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40 || tag.includes('\0'))) throw inputError('Étiquettes invalides');
  if (!Array.isArray(input.ingredients) || input.ingredients.length < 1 || input.ingredients.length > 100) throw inputError('Ingrédients invalides');

  const ingredients = input.ingredients.map(ingredient => {
    if (!ingredient || typeof ingredient.name !== 'string' || !ingredient.name.trim() || ingredient.name.includes('\0') || ingredient.name.length > 80) throw inputError('Nom d’ingrédient invalide');
    if (typeof ingredient.unit !== 'string' || !ingredient.unit.trim() || ingredient.unit.includes('\0') || ingredient.unit.length > 24) throw inputError('Unité invalide');
    if (typeof ingredient.amount !== 'number' || !Number.isFinite(ingredient.amount) || ingredient.amount <= 0 || ingredient.amount > 1_000_000) throw inputError('Quantité invalide');
    if (ingredient.preparation !== undefined && !['raw', 'cooked', 'unknown'].includes(ingredient.preparation)) throw inputError('État d’ingrédient invalide');
    return { name: ingredient.name.trim().toLocaleLowerCase('fr'), unit: ingredient.unit.trim(), amount: ingredient.amount, preparation: ingredient.preparation ?? 'unknown' };
  });
  const duplicate = new Set(ingredients.map(ingredient => `${ingredient.name}\0${ingredient.unit}`));
  if (duplicate.size !== ingredients.length) throw inputError('Un ingrédient est présent plusieurs fois');

  const stepKinds = new Set(['prep', 'cook', 'rest', 'serve']);
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 50) throw inputError('Étapes invalides');
  const steps = input.steps.map((step, index) => {
    if (!step || !stepKinds.has(step.kind)) throw inputError(`Type invalide à l’étape ${index + 1}`);
    if (typeof step.instruction !== 'string' || !step.instruction.trim() || step.instruction.includes('\0') || step.instruction.length > 2_000) throw inputError(`Instruction invalide à l’étape ${index + 1}`);
    if (step.minutes != null && (!Number.isInteger(step.minutes) || step.minutes < 0 || step.minutes > 1_440)) throw inputError(`Durée invalide à l’étape ${index + 1}`);
    return { position: index + 1, kind: step.kind, instruction: step.instruction.trim(), minutes: step.minutes ?? null };
  });

  let sourceUrl = null;
  if (input.sourceUrl != null && input.sourceUrl !== '') {
    if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 2000) throw inputError('Lien source invalide');
    let url; try { url = new URL(input.sourceUrl); } catch { throw inputError('Lien source invalide'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw inputError('Lien source invalide');
    sourceUrl = url.href;
  }
  let photo;
  if (input.photo !== undefined && input.photo !== null) {
    if (typeof input.photo !== 'string' || input.photo.length > 400000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo)) throw inputError('Photo JPEG invalide ou trop volumineuse');
    photo = Buffer.from(input.photo.slice(23), 'base64');
    if (photo.length < 4 || photo.readUInt16BE(0) !== 0xffd8 || photo.readUInt16BE(photo.length - 2) !== 0xffd9) throw inputError('Photo JPEG invalide');
  } else photo = input.photo;
  if (input.photoCopyId !== undefined && (!Number.isSafeInteger(input.photoCopyId) || input.photoCopyId < 1)) throw inputError('Photo source invalide');
  return {
    title: input.title.trim(),
    minutes: input.minutes,
    servings: input.servings,
    tags: [...new Set(input.tags.map(tag => tag.trim().toLocaleLowerCase('fr')))],
    diet: input.diet,
    sourceUrl,
    ...(photo !== undefined ? { photo } : {}),
    ...(input.photoCopyId !== undefined ? { photoCopyId: input.photoCopyId } : {}),
    ingredients,
    steps
  };
}

function validateNote(input) {
  if(!input||!Number.isInteger(input.rating)||input.rating<0||input.rating>5||typeof input.note!=='string'||input.note.length>2000||input.note.includes('\0'))throw inputError('Choisis une note de 0 à 5 et un commentaire de 2 000 caractères maximum.');
  return {rating:input.rating,note:input.note.trim()};
}
module.exports={validateRecipe,validateNote,checkedRecipe,inputError};
