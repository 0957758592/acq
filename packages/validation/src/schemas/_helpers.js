import * as Yup from 'yup';

export function isValidJsonString(value) {
  if (value == null || value === '') return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function jsonStringSchema(messageKey) {
  return Yup.string().test('json', messageKey, (value) => isValidJsonString(value));
}


