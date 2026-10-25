const {downloadRecipePage,extractRecipeDraft}=require('./recipe-import');
const {validateRecipe,inputError}=require('./recipe');

function createRecipePreview({download=downloadRecipePage}={}) {
  let importingUrl=false;
  return async input=>{
    if (!input || !['url', 'file'].includes(input.kind)) throw inputError('Import invalide');
    let result;
    if (input.kind === 'url') {
      if (importingUrl) throw inputError('Un import internet est déjà en cours, réessaie dans un instant');
      importingUrl = true;
      try { const page = await download(input.url); result = extractRecipeDraft(page.html, page.sourceUrl); }
      finally { importingUrl = false; }
    } else {
      if (!input.data || input.data.format !== 'manger-recipes' || input.data.version !== 1 || !Array.isArray(input.data.recipes) || input.data.recipes.length < 1 || input.data.recipes.length > 200) throw inputError('Fichier Manger! version 1 attendu (1 à 200 recettes)');
      result = { recipes: input.data.recipes, warnings: ['Sélectionne une recette puis vérifie-la. L’import crée une nouvelle recette, sans remplacer les recettes existantes.'] };
    }
    const validated = result.recipes.map(recipe => {
      const missingSteps = input.kind === 'file' && Array.isArray(recipe?.steps) && recipe.steps.length === 0;
      const safeRecipe = { ...recipe, photo: undefined, photoCopyId: undefined };
      const draft = validateRecipe(missingSteps ? { ...safeRecipe, steps: [{ kind: 'prep', instruction: 'À compléter', minutes: null }] } : safeRecipe);
      if (missingSteps) { draft.steps = []; result.warnings.push(`« ${draft.title} » n’a pas encore d’étapes : complète-les dans le brouillon avant d’enregistrer.`); }
      return draft;
    });
    if (validated.some(recipe => recipe.ingredients.some(item => item.preparation === 'unknown'))) result.warnings.push('Cru/cuit non précisé pour certains ingrédients : complète « Servi » dans leurs détails si nécessaire pour les goûts du foyer. Aucune cuisson n’est déduite automatiquement.');
    return {recipes:validated,warnings:result.warnings};
  };
}
module.exports={createRecipePreview};
