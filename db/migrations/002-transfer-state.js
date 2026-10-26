const sql=`
ALTER TABLE manger_meta.schema_migrations ADD COLUMN structure_checksum text COLLATE "C";
CREATE TABLE manger_meta.data_import (
  id integer PRIMARY KEY CHECK(id=1), nonce text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK(status IN ('pending','ready')),
  source_hash text COLLATE "C" NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
REVOKE ALL ON manger_meta.data_import FROM PUBLIC;
CREATE FUNCTION household.storage_status() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT json_build_object('version',(SELECT max(version) FROM manger_meta.schema_migrations),
    'structureChecksum',(SELECT structure_checksum FROM manger_meta.schema_migrations ORDER BY version DESC LIMIT 1),
    'ready',NOT EXISTS(SELECT 1 FROM manger_meta.data_import WHERE status<>'ready'));
$function$;
REVOKE ALL ON FUNCTION household.storage_status() FROM PUBLIC;
`;
module.exports=Object.freeze({version:2,name:'002-transfer-state',sql});
