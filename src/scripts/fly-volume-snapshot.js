const { execFileSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 3000;

function selectAttachedVolume(volumes) {
  if (!Array.isArray(volumes)) {
    throw new Error('Fly volume list returned an invalid response');
  }

  const attached = volumes.filter(volume => volume?.attached_machine_id);
  if (attached.length !== 1) {
    throw new Error(`Expected exactly one attached Fly volume, found ${attached.length}`);
  }
  return attached[0];
}

function runJson(args, exec = execFileSync) {
  const output = exec('fly', args, { encoding: 'utf8' });
  return JSON.parse(output);
}

async function createAttachedVolumeSnapshot({
  exec = execFileSync,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  const volume = selectAttachedVolume(runJson(['volumes', 'list', '--json'], exec));
  const before = runJson(['volumes', 'snapshots', 'list', volume.id, '--json'], exec);
  const existingIds = new Set(before.map(snapshot => snapshot.id));

  exec('fly', ['volumes', 'snapshots', 'create', volume.id], { stdio: 'inherit' });

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const snapshots = runJson(['volumes', 'snapshots', 'list', volume.id, '--json'], exec);
    const snapshot = snapshots.find(candidate => !existingIds.has(candidate.id));
    if (snapshot?.status === 'created') return { volume, snapshot };
    if (snapshot && !['waiting', 'running', 'pending'].includes(snapshot.status)) {
      throw new Error(`Fly volume snapshot ${snapshot.id} entered unexpected status: ${snapshot.status}`);
    }
    await wait(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for a snapshot of Fly volume ${volume.id}`);
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createAttachedVolumeSnapshot,
  selectAttachedVolume
};
