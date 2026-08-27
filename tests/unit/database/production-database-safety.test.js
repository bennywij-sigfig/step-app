const { assertExistingDatabaseWritable } = require('../../../src/utils/database-safety');

describe('production database startup safety', () => {
  test('allows first-time initialization when the database does not exist', () => {
    const fsModule = {
      constants: { W_OK: 2 },
      existsSync: jest.fn(() => false),
      accessSync: jest.fn()
    };

    expect(() => assertExistingDatabaseWritable('/data/steps.db', fsModule)).not.toThrow();
    expect(fsModule.accessSync).not.toHaveBeenCalled();
  });

  test('allows startup when the existing database is writable', () => {
    const fsModule = {
      constants: { W_OK: 2 },
      existsSync: jest.fn(() => true),
      accessSync: jest.fn()
    };

    expect(() => assertExistingDatabaseWritable('/data/steps.db', fsModule)).not.toThrow();
    expect(fsModule.accessSync).toHaveBeenCalledWith('/data/steps.db', 2);
  });

  test('fails closed without copying or deleting a read-only database', () => {
    const cause = new Error('permission denied');
    const fsModule = {
      constants: { W_OK: 2 },
      existsSync: jest.fn(() => true),
      accessSync: jest.fn(() => { throw cause; }),
      copyFileSync: jest.fn(),
      unlinkSync: jest.fn()
    };

    expect(() => assertExistingDatabaseWritable('/data/steps.db', fsModule)).toThrow(
      expect.objectContaining({
        code: 'DATABASE_NOT_WRITABLE',
        message: 'Existing database is not writable: /data/steps.db',
        cause
      })
    );
    expect(fsModule.copyFileSync).not.toHaveBeenCalled();
    expect(fsModule.unlinkSync).not.toHaveBeenCalled();
  });
});
