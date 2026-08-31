const fs = require('fs');
const path = require('path');
const vm = require('vm');

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name)
  };
}

function loadUX({ date = '2026-08-31', steps = '9999', dateValid = true } = {}) {
  const form = { _values: { date, steps }, addEventListener: jest.fn() };
  const button = { classList: classList(), textContent: 'Save Steps', disabled: false };
  const dateInput = { validity: { valid: dateValid } };
  const stepsInput = { addEventListener: jest.fn() };
  const elements = { stepsForm: form, submitStepsBtn: button, date: dateInput, steps: stepsInput };
  const window = { addEventListener: jest.fn() };
  const document = {
    readyState: 'loading',
    addEventListener: jest.fn(),
    getElementById: id => elements[id] || null
  };
  class FakeFormData {
    constructor(source) { this.values = source._values; }
    get(name) { return this.values[name] ?? null; }
  }
  const context = {
    window,
    document,
    navigator: { userAgent: 'test' },
    localStorage: { getItem: jest.fn(() => null) },
    FormData: FakeFormData,
    console,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../../src/public/step-entry-ux.js'), 'utf8'),
    context
  );
  const ux = new window.StepEntryUX();
  ux.isEnabled = true;
  return { ux, form, button, dateInput };
}

describe('Save Steps button states', () => {
  test('an API or network error always exits the saving state', () => {
    const { ux, button } = loadUX();

    ux.updateButtonState();
    expect(button.classList.contains('ready-to-save')).toBe(true);

    ux.handleSubmitStart();
    expect(button).toMatchObject({ textContent: 'Saving...', disabled: true });
    expect(button.classList.contains('saving')).toBe(true);

    ux.handleSubmitError();
    expect(button).toMatchObject({ textContent: 'Save Steps', disabled: false });
    expect(button.classList.contains('saving')).toBe(false);
    expect(button.classList.contains('ready-to-save')).toBe(true);
  });

  test('invalid form data is not presented as ready to save', () => {
    const { ux, button } = loadUX({ dateValid: false });
    ux.updateButtonState();
    expect(button.classList.contains('ready-to-save')).toBe(false);
  });

  test('success feedback returns to the canonical button state', () => {
    jest.useFakeTimers();
    try {
      const { ux, form, button } = loadUX();
      ux.handleSubmitStart();
      ux.handleSubmitSuccess(9999, { innerHTML: '' });
      expect(button).toMatchObject({ textContent: '✓ Saved!', disabled: true });
      expect(button.classList.contains('saved')).toBe(true);

      form._values.steps = '';
      jest.advanceTimersByTime(2000);
      expect(button).toMatchObject({ textContent: 'Save Steps', disabled: false });
      expect(button.classList.contains('saving')).toBe(false);
      expect(button.classList.contains('saved')).toBe(false);
      expect(button.classList.contains('ready-to-save')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
