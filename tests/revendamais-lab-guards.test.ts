import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lab, validateLabUrl, assertCleanPgEnvironment, validateContainerSnapshot } from './postgres/lab-connection.mjs';
const url = `postgresql://${lab.user}:${lab.password}@127.0.0.1:55432/revendamais_leads_test`;

test('fixed loopback lab URL only; no DNS, remote hosts, query overrides or real credentials', () => {
  assert.deepEqual(validateLabUrl(url), { host: '127.0.0.1', port: 55432, database: 'revendamais_leads_test',
    username: lab.user, password: lab.password, ssl: false, max: 2, connect_timeout: 5 });
  for (const candidate of [undefined, '', url.replace('127.0.0.1','db.example.invalid'),
    url.replace('127.0.0.1','localhost'), url.replace('127.0.0.1','[::1]'),
    url.replace('55432','5432'), url.replace('revendamais_leads_test','postgres'),
    url + '?host=remote.invalid', url + '?sslmode=require', url + '#ignored',
    url.replace('postgresql:', 'https:'), url.replace(lab.password,'production-secret')]) {
    assert.throws(() => validateLabUrl(candidate));
  }
});

test('PG environment overrides are refused without printing their values', () => {
  assert.doesNotThrow(() => assertCleanPgEnvironment({}));
  for (const key of ['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS']) {
    assert.throws(() => assertCleanPgEnvironment({ [key]: 'private-fixture' }), error => !String(error).includes('private-fixture'));
  }
});

const snapshot = () => ({ Name: '/' + lab.container, Config: { Image: lab.image, Labels: { [lab.label]: lab.labelValue } },
  State: { Running: true }, HostConfig: { Privileged: false, Binds: null,
    PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] },
    Tmpfs: { '/var/lib/postgresql/data': 'rw,nosuid' } as Record<string, string> }, Mounts: [{ Type: 'tmpfs' }] });

test('container identity requires owned label, exact image, loopback mapping and tmpfs only', () => {
  assert.doesNotThrow(() => validateContainerSnapshot(snapshot()));
  const bad = [snapshot(),snapshot(),snapshot(),snapshot(),snapshot(),snapshot(),snapshot()];
  bad[0].Config.Labels[lab.label] = 'other';
  bad[1].Config.Image = 'postgres:16';
  bad[2].HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0';
  bad[3].Mounts = [{ Type: 'bind' }];
  bad[4].HostConfig.Tmpfs = {};
  bad[5].Name = '/other-container';
  bad[6].State.Running = false;
  for (const c of bad) assert.throws(() => validateContainerSnapshot(c));
});

test('remote concurrency invocation fails BEFORE Docker, driver import and any SQL', () => {
  const script = fileURLToPath(new URL('./postgres/revendamais-concurrency.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true, env: {
    ...process.env, REVENDAMAIS_TEST_DISPOSABLE: 'YES',
    REVENDAMAIS_TEST_DATABASE_URL: url.replace('127.0.0.1','db.example.invalid'),
  } });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Only the fixed loopback disposable/);
  assert.doesNotMatch(child.stderr, /Cannot find module|ECONNREFUSED|ENOTFOUND/);
});

test('bootstrap and runner are lab-specific, do not use project URLs, and disable implicit image pulls', () => {
  const bootstrap = readFileSync(new URL('./postgres/lab/bootstrap.sql', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('./postgres/lab/Lab.ps1', import.meta.url), 'utf8');
  assert.match(bootstrap, /server_version_num/);
  assert.match(bootstrap, /vehicle_id uuid/);
  assert.match(bootstrap, /CREATE EXTENSION pgcrypto WITH SCHEMA extensions/);
  assert.match(bootstrap, /CREATE ROLE service_role NOLOGIN BYPASSRLS/);
  assert.match(runner, /npipe:\/\/\/\/\.\/pipe\/docker_engine/);
  assert.match(runner, /--pull=never/);
  assert.match(runner, /--single-transaction/);
  assert.doesNotMatch(runner, /LOVABLE_DB_MIGRATION_URL|SUPABASE_URL|Get-Content.*\.env/);
});
