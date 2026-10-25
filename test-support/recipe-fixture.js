function recipeDraft(patch={}) {
  return {title:' Œufs aux tomates ',minutes:20,servings:2,diet:'vegetarian',tags:[' Japon ','japon','Été'],sourceUrl:'https://example.org/recette?x=1',
    ingredients:[{name:' ŒUF ',amount:2.375,unit:' pièce ',preparation:'raw'},{name:'tomate',amount:120.125,unit:'g',preparation:'cooked'}],
    steps:[{kind:'cook',instruction:' Cuire les tomates. ',minutes:15},{kind:'serve',instruction:'Servir.',minutes:null}],...patch};
}
module.exports={recipeDraft};
