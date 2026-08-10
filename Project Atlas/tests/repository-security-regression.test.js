const assert = require('assert');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const repositoryRoot = path.join(__dirname, '..', '..');
const tracked = childProcess.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repositoryRoot, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const binaryExtensions = /\.(png|jpg|jpeg|gif|pdf|docx|xlsx|pptx)$/i;
const patterns = [
  new RegExp('BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY'),
  new RegExp('s' + 'k-[A-Za-z0-9_-]{24,}'),
  new RegExp('AI' + 'za[0-9A-Za-z_-]{30,}')
];

tracked.forEach((relative) => {
  if (binaryExtensions.test(relative) || /repository-security-regression\.test\.js$/.test(relative)) return;
  const content = fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');
  patterns.forEach((pattern) => assert.doesNotMatch(content, pattern, 'High-confidence secret pattern in tracked file: ' + relative));
});

const ignoredArtifacts = ['Project Atlas/.env', 'Project Atlas/.env.local', 'Project Atlas/.clasp.json', 'Project Atlas/client_secret.json', 'Project Atlas/token.json'];
ignoredArtifacts.forEach((relative) => {
  const result = childProcess.spawnSync('git', ['check-ignore', '-q', relative], { cwd: repositoryRoot });
  assert.equal(result.status, 0, 'Local credential artifact must remain ignored: ' + relative);
});

console.log('Atlas repository security hygiene regression tests passed');
