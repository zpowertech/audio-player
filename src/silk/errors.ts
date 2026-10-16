/** An input, initialization, container or decoding failure. Native failures retain `cause`. */
export class SilkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SilkError';
  }
}

export function silkError(message: string, cause: unknown): SilkError {
  return cause instanceof SilkError
    ? cause
    : new SilkError(`${message}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
}

export function guard<T>(message: string, operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    throw silkError(message, cause);
  }
}
