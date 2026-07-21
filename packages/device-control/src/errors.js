export class DeviceControlError extends Error {
  constructor(message, { code = 'DEVICE_CONTROL_ERROR', cause = null, details = null } = {}) {
    super(message);
    this.name = 'DeviceControlError';
    this.code = code;
    this.cause = cause;
    this.details = details;
  }
}

export function toDeviceControlError(error, fallbackMessage = 'Device control operation failed') {
  if (error instanceof DeviceControlError) return error;
  return new DeviceControlError(error?.message || fallbackMessage, {
    cause: error,
    details: error
  });
}
