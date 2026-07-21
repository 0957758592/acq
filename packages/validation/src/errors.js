export function flattenValidationErrors(errors) {
  if (!errors) return [];
  if (typeof errors === 'string') return [errors];
  if (Array.isArray(errors)) {
    return errors.flatMap((item) => flattenValidationErrors(item));
  }
  if (typeof errors === 'object') {
    return Object.values(errors).flatMap((item) => flattenValidationErrors(item));
  }
  return [];
}


