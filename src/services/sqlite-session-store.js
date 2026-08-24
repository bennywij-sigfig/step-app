const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

/**
 * Minimal SQLite-backed express-session store.
 *
 * This keeps the same `sessions(sid, expired, sess)` schema used by
 * connect-sqlite3, while avoiding its stale bundled sqlite3 dependency.
 */
class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();

    const directory = options.dir || '.';
    const filename = options.db || 'sessions.db';
    const table = options.table || 'sessions';

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      throw new Error('Invalid SQLite session table name');
    }

    fs.mkdirSync(directory, { recursive: true });
    this.table = table;
    this.ttl = options.ttl || 24 * 60 * 60 * 1000;
    this.db = new sqlite3.Database(path.join(directory, filename));
    this.db.configure('busyTimeout', options.busyTimeout || 30000);
    this.ready = new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run(`CREATE TABLE IF NOT EXISTS ${this.table} (sid TEXT PRIMARY KEY, expired INTEGER NOT NULL, sess TEXT NOT NULL)`);
        this.db.run(
          `CREATE INDEX IF NOT EXISTS idx_${this.table}_expired ON ${this.table}(expired)`,
          error => error ? reject(error) : resolve()
        );
      });
    });

    const cleanupInterval = options.cleanupInterval || 15 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.clearExpired(() => {}), cleanupInterval);
    this.cleanupTimer.unref?.();
  }

  get(sid, callback) {
    this.ready.then(() => {
      this.db.get(
        `SELECT sess, expired FROM ${this.table} WHERE sid = ?`,
        [sid],
        (error, row) => {
          if (error) return callback(error);
          if (!row) return callback(null, null);

          if (Number(row.expired) <= Date.now()) {
            return this.destroy(sid, destroyError => callback(destroyError, null));
          }

          try {
            callback(null, JSON.parse(row.sess));
          } catch (parseError) {
            callback(parseError);
          }
        }
      );
    }).catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData?.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + this.ttl;
    const expired = Number.isFinite(cookieExpiry) ? cookieExpiry : Date.now() + this.ttl;

    let serialized;
    try {
      serialized = JSON.stringify(sessionData);
    } catch (error) {
      return callback(error);
    }

    this.ready.then(() => {
      this.db.run(
        `INSERT INTO ${this.table} (sid, expired, sess) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET expired = excluded.expired, sess = excluded.sess`,
        [sid, expired, serialized],
        callback
      );
    }).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.ready
      .then(() => this.db.run(`DELETE FROM ${this.table} WHERE sid = ?`, [sid], callback))
      .catch(callback);
  }

  touch(sid, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData?.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + this.ttl;
    const expired = Number.isFinite(cookieExpiry) ? cookieExpiry : Date.now() + this.ttl;
    this.ready
      .then(() => this.db.run(`UPDATE ${this.table} SET expired = ? WHERE sid = ?`, [expired, sid], callback))
      .catch(callback);
  }

  clearExpired(callback = () => {}) {
    this.ready
      .then(() => this.db.run(`DELETE FROM ${this.table} WHERE expired <= ?`, [Date.now()], callback))
      .catch(callback);
  }

  close(callback = () => {}) {
    clearInterval(this.cleanupTimer);
    this.ready
      .then(() => this.db?.open ? this.db.close(callback) : callback())
      .catch(callback);
  }
}

module.exports = SQLiteSessionStore;
