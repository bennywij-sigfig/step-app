const fs = require('fs');
const os = require('os');
const path = require('path');
const SQLiteSessionStore = require('../../../src/services/sqlite-session-store');

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => error ? reject(error) : resolve(value));
  });
}
describe('SQLiteSessionStore', () => {
  let directory;
  let store;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'step-sessions-'));
    store = new SQLiteSessionStore({ dir: directory, cleanupInterval: 60000 });
  });

  afterEach(async () => {
    await callStore(store, 'close');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('persists, reads, touches, and destroys sessions', async () => {
    const session = {
      userId: 42,
      cookie: { expires: new Date(Date.now() + 60000).toISOString() }
    };

    await callStore(store, 'set', 'session-id', session);
    await expect(callStore(store, 'get', 'session-id')).resolves.toMatchObject({ userId: 42 });
    await callStore(store, 'touch', 'session-id', session);
    await callStore(store, 'destroy', 'session-id');
    await expect(callStore(store, 'get', 'session-id')).resolves.toBeNull();
  });

  test('deletes expired sessions when read', async () => {
    await callStore(store, 'set', 'expired', {
      cookie: { expires: new Date(Date.now() - 1000).toISOString() }
    });
    await expect(callStore(store, 'get', 'expired')).resolves.toBeNull();
  });
});
