import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const project = `atlas-pgtest-${randomBytes(8).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const user = 'atlas_test_bootstrap';
const env = {
  ...process.env,
  ATLAS_POSTGRES_DB: 'postgres',
  ATLAS_POSTGRES_USER: user,
  ATLAS_POSTGRES_PASSWORD: password,
  ATLAS_POSTGRES_PORT: '0'
};
const compose = ['compose', '-f', 'compose.yml', '-f', 'compose.postgres-test.yml', '-p', project];

function run(command, args, { capture = false, environment = env, timeout = 180_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    timeout
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} exited with ${result.status ?? result.signal}`);
  return result.stdout?.trim();
}

try {
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  try {
    run('docker', [...compose, 'up', '--wait', '--wait-timeout', '75']);
    const address = run('docker', [...compose, 'port', 'atlas-postgres', '5432'], { capture: true });
    const endpoint = /^127\.0\.0\.1:(\d+)$/.exec(address);
    if (!endpoint) throw new Error('The disposable PostgreSQL port was not published to loopback.');
    run(process.execPath, ['--test', 'test/real-postgres-mos133g.test.js'], {
      environment: {
        ...process.env,
        ATLAS_MOS133G_REAL_POSTGRES: '1',
        PGHOST: '127.0.0.1',
        PGPORT: endpoint[1],
        PGDATABASE: 'postgres',
        PGUSER: user,
        PGPASSWORD: password
      }
    });
  } finally {
    try {
      run('docker', [...compose, 'down'], { timeout: 60_000 });
    } catch (error) {
      console.error(`Cleanup failed for ${project}. Remove that project's test container and network.`);
      console.error(error.message);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
