const {createHash}=require('node:crypto');
const namespaces="n.nspname IN ('household','auth','manger_meta')";
// Object definitions only: no row contents, sequence counters, OIDs or planner statistics.
const queries=[
  `SELECT n.nspname,n.nspowner::regrole::text,n.nspacl::text FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1`,
  `SELECT n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.relpersistence,c.reloptions
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${namespaces} ORDER BY 1,2`,
  `SELECT n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attisdropped,a.attacl::text,
    cn.nspname AS collation_schema,co.collname,pg_get_expr(d.adbin,d.adrelid) AS default_expression
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
   LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
   WHERE ${namespaces} AND a.attnum>0 ORDER BY 1,2,3`,
  `SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,true) AS definition,k.convalidated
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${namespaces} ORDER BY 1,2,3`,
  `SELECT n.nspname,c.relname,pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid,i.indisready
   FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${namespaces} ORDER BY 1,2`,
  `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,p.proowner::regrole::text,p.proacl::text
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${namespaces} ORDER BY 1,2,3`,
  `SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${namespaces} AND NOT t.tgisinternal ORDER BY 1,2,3`,
  `SELECT n.nspname,c.relname,r.rulename,pg_get_ruledef(r.oid,true) AS definition
   FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${namespaces} ORDER BY 1,2,3`,
  `SELECT schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('household','auth','manger_meta') ORDER BY 1,2,3`,
  `SELECT n.nspname,c.relname,s.seqtypid::regtype::text,s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle,
    rn.nspname AS owner_schema,r.relname AS owner_table,a.attname AS owner_column,d.deptype
   FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')
   LEFT JOIN pg_class r ON r.oid=d.refobjid LEFT JOIN pg_namespace rn ON rn.oid=r.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=d.refobjsubid
   WHERE ${namespaces} ORDER BY 1,2`,
  `SELECT n.nspname,d.classid::regclass::text AS class,pg_identify_object(d.classid,d.objid,d.objsubid)::text AS identity,d.deptype
   FROM pg_depend d JOIN pg_namespace n ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
   WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2,3,4`
];
async function structureFingerprint(client){
  const parts=[];for(const sql of queries)parts.push((await client.query(sql)).rows);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
async function verifyStructure(client){
  const row=(await client.query('SELECT structure_checksum FROM manger_meta.schema_migrations ORDER BY version DESC LIMIT 1')).rows[0];
  if(!row?.structure_checksum||row.structure_checksum!==await structureFingerprint(client))throw Object.assign(new Error('Structure PostgreSQL modifiée ou inconnue.'),{code:'MANGER_STRUCTURE_INVALID'});
}
module.exports={structureFingerprint,verifyStructure};
