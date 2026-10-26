const sql=`
CREATE FUNCTION household.restart_sequences() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE item record; maximum bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(1296125511,4);
  LOCK TABLE household.recipes,household.ingredients,household.recipe_ingredients,household.recipe_steps,
    household.members,household.proteins,household.meals,household.meal_assignments,household.meal_dishes,
    household.shopping_checks,household.shopping_manual,household.shopping_aisles,household.recipe_favorites,
    household.avoided_ingredients,household.recipe_photos,household.pantry,household.recipe_notes,household.week_templates
    IN ACCESS EXCLUSIVE MODE;
  FOR item IN SELECT * FROM (VALUES ('recipes','id'),('ingredients','id'),('recipe_steps','id'),
    ('members','id'),('proteins','id'),('meals','id'),('shopping_manual','id'),
    ('shopping_aisles','sort_order'),('pantry','id'),('week_templates','id')) AS fixed(name,col)
  LOOP
    EXECUTE format('SELECT greatest(0,coalesce(max(%I),0)) FROM household.%I',item.col,item.name) INTO maximum;
    IF maximum>=9007199254740991 THEN RAISE EXCEPTION 'Household sequence exhausted' USING ERRCODE='22003'; END IF;
    EXECUTE format('ALTER SEQUENCE household.%I RESTART WITH %s',item.name||'_'||item.col||'_seq',maximum+1);
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION household.restart_sequences() FROM PUBLIC;
`;
module.exports=Object.freeze({version:3,name:'003-household-restore',sql});
