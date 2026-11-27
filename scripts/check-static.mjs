// Minimal offline checks; not a substitute for npm build, SQL execution and E2E.
import fs from 'node:fs';import assert from 'node:assert/strict';
const get=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const core=get('supabase/migrations/202611270001_core.sql');const hard=get('supabase/migrations/202611270005_production_controls.sql');
for(const table of ['organizations','profiles','memberships','affaires','zones','missions','pricing_rules','estimates','activity_logs'])assert.match(core,new RegExp('create table public\\.'+table+'\\b'))
assert.match(core,/enable row level security/);assert.match(hard,/revoke update on public.affaires/)
assert.match(get('src/lib/prefecture.ts'),/zones\.map/)
assert.match(get('src/App.tsx'),/admin_publish_pricing/)
assert.match(get('src/App.tsx'),/printPrefecture/)
console.log('OK: static contracts; schema files and UI integrations detected.');
