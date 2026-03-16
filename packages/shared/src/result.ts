export type Ok<T> = {
  ok: true;
  value: T;
};

export type Err<E = unknown> = {
  ok: false;
  error: E;
};

export type Result<T, E = unknown> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;
