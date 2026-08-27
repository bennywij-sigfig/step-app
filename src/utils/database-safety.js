const fs = require('fs');

/**
 * Refuse to replace an existing production database when it is not writable.
 * Recovery must be an explicit operator action so startup can never turn a
 * permissions or mount problem into a fresh, divergent database.
 */
function assertExistingDatabaseWritable(databasePath, fsModule = fs) {
  if (!fsModule.existsSync(databasePath)) return;

  try {
    fsModule.accessSync(databasePath, fsModule.constants.W_OK);
  } catch (cause) {
    const error = new Error(`Existing database is not writable: ${databasePath}`);
    error.code = 'DATABASE_NOT_WRITABLE';
    error.cause = cause;
    throw error;
  }
}

module.exports = { assertExistingDatabaseWritable };
