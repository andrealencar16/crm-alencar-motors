import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
export const lab = Object.freeze(JSON.parse(readFileSync(new URL('./lab/settings.json', import.meta.url), 'utf8')));

export function validateLabUrl(value) {
  const fail = () => { throw new Error('Only the fixed loopback disposable PostgreSQL laboratory is permitted'); };
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
    url.port !== '55432' || url.pathname !== '/revendamais_leads_test' || url.search || url.hash ||
    decodeURIComponent(url.username) !== lab.user || decodeURIComponent(url.password) !== lab.password ||
    lab.host !== '127.0.0.1' || lab.port !== 55432 || lab.database !== 'revendamais_leads_test') fail();
  // Explicit values: no driver URL query or PG* environment can override host/database.
  return { host: '127.0.0.1', port: 55432, database: 'revendamais_leads_test',
    username: lab.user, password: lab.password, ssl: false, max: 2, connect_timeout: 5 };
}

export function assertCleanPgEnvironment(env) {
  for (const key of ['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS']) {
    if (env[key]) throw new Error('Use a clean laboratory shell without PG* connection settings');
  }
}

export function validateContainerSnapshot(c) {
  const ports = c?.HostConfig?.PortBindings?.['5432/tcp'];
  if (c?.Name !== '/' + lab.container || c?.Config?.Image !== 'postgres:17-bookworm' ||
    c?.Config?.Labels?.[lab.label] !== lab.labelValue || !c?.State?.Running ||
    !Array.isArray(ports) || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '55432' ||
    c?.HostConfig?.Privileged !== false || c?.HostConfig?.Binds?.length ||
    !c?.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] || !Array.isArray(c?.Mounts) || c.Mounts.some(m => m.Type !== 'tmpfs')) {
    throw new Error('Not the owned ephemeral loopback laboratory container');
  }
}

export function assertLocalLabContainer(env = process.env) {
  for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) {
    if (env[key]) throw new Error('Remote Docker/context overrides are not permitted');
  }
  const result = spawnSync('docker', ['--host','npipe:////./pipe/docker_engine','inspect',lab.container], {
    encoding: 'utf8', windowsHide: true, env,
  });
  if (result.error || result.status !== 0) throw new Error('Local laboratory container unavailable');
  let value;
  try { value = JSON.parse(result.stdout); } catch { throw new Error('Invalid local container inspection'); }
  if (!Array.isArray(value) || value.length !== 1) throw new Error('Unexpected local container inventory');
  validateContainerSnapshot(value[0]);
}
