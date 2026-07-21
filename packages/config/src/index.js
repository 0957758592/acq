const REQUIRED_STRING = 'required_string';
const INVALID_NUMBER = 'invalid_number';

export function parseEnv(env, schema) {
  const output = {};
  const errors = [];
  const source = env || {};

  Object.entries(schema).forEach(([key, rules]) => {
    const value = source[key];
    const isRequired = rules?.required === true;
    const fallback = rules?.default;
    const finalValue = value ?? fallback;

    if (isRequired && (finalValue === undefined || finalValue === '')) {
      errors.push({ key, reason: REQUIRED_STRING });
      return;
    }

    if (rules?.parse) {
      const parsed = rules.parse(finalValue);
      if (!parsed.ok) {
        errors.push({ key, reason: parsed.reason || INVALID_NUMBER });
        return;
      }
      output[key] = parsed.value;
      return;
    }

    output[key] = finalValue;
  });

  return { output, errors };
}

export function loadConfig(env, schema) {
  const { output, errors } = parseEnv(env, schema);
  if (errors.length > 0) {
    const message = errors.map((err) => `${err.key}:${err.reason}`).join(', ');
    throw new Error(`Invalid config: ${message}`);
  }
  return output;
}

export function defineSchema(entries) {
  return entries;
}

export const rules = {
  requiredString() {
    return { required: true };
  },
  optionalString(defaultValue = undefined) {
    return { required: false, default: defaultValue };
  },
  requiredNumber() {
    return {
      required: true,
      parse(value) {
        if (value === undefined || value === '') return { ok: false, reason: REQUIRED_STRING };
        const num = Number(value);
        if (Number.isNaN(num)) return { ok: false, reason: INVALID_NUMBER };
        return { ok: true, value: num };
      }
    };
  },
  optionalNumber(defaultValue = undefined) {
    return {
      required: false,
      default: defaultValue,
      parse(value) {
        if (value === undefined || value === '') {
          return { ok: true, value: value ?? defaultValue };
        }
        const num = Number(value);
        if (Number.isNaN(num)) return { ok: false, reason: INVALID_NUMBER };
        return { ok: true, value: num };
      }
    };
  }
};

