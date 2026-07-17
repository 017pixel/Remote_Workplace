export interface AsyncCache<T> {
  get(): Promise<T>;
  clear(): void;
}

export function createAsyncCache<T>(ttlMilliseconds: number, loader: () => Promise<T>): AsyncCache<T> {
  let expiresAt = 0;
  let value: T | undefined;
  let pending: Promise<T> | undefined;

  return {
    async get() {
      const now = Date.now();
      if (value !== undefined && now < expiresAt) return value;
      if (pending !== undefined) return pending;

      pending = loader()
        .then((loaded) => {
          value = loaded;
          expiresAt = Date.now() + ttlMilliseconds;
          return loaded;
        })
        .finally(() => {
          pending = undefined;
        });

      return pending;
    },
    clear() {
      value = undefined;
      expiresAt = 0;
    },
  };
}

