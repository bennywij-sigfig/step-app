const sqlite3 = require('sqlite3').verbose();

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

describe('single active challenge database invariant', () => {
  let db;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await run(db, `CREATE TABLE challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 0
    )`);
    await run(db, `CREATE UNIQUE INDEX idx_single_active_challenge
      ON challenges(is_active) WHERE is_active = 1`);
  });

  afterEach(() => new Promise(resolve => db.close(resolve)));

  test('allows many inactive challenges but only one active challenge', async () => {
    await run(db, `INSERT INTO challenges(name, is_active) VALUES ('Inactive A', 0), ('Inactive B', 0)`);
    await run(db, `INSERT INTO challenges(name, is_active) VALUES ('Active A', 1)`);
    await expect(run(db, `INSERT INTO challenges(name, is_active) VALUES ('Active B', 1)`))
      .rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' });

    expect(await all(db, `SELECT name FROM challenges WHERE is_active = 1`))
      .toEqual([{ name: 'Active A' }]);
  });

  test('supports switching active challenges by deactivating first', async () => {
    await run(db, `INSERT INTO challenges(name, is_active) VALUES ('A', 1), ('B', 0)`);
    await run(db, `UPDATE challenges SET is_active = 0`);
    await run(db, `UPDATE challenges SET is_active = 1 WHERE name = 'B'`);

    expect(await all(db, `SELECT name FROM challenges WHERE is_active = 1`))
      .toEqual([{ name: 'B' }]);
  });
});
