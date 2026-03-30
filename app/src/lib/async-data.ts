export class AsyncData<T, E = string> {
  static readonly Empty: unique symbol = Symbol('empty');

  public data: T | typeof AsyncData.Empty = AsyncData.Empty;
  public isLoading: boolean = true;
  public error: E | null = null;
  public abortController: AbortController | null = null;

  constructor(opts: {
    data?: T | typeof AsyncData.Empty,
    isLoading?: boolean,
    error?: E | null,
    abortController?: AbortController | null,
  } = {}) {
    const {
      data = AsyncData.Empty,
      error = null,
      isLoading = false,
      abortController = null,
    } = opts;

    this.data = data;
    this.isLoading = isLoading;
    this.error = error;
    this.abortController = abortController;
  }

  public get(): T | undefined {
    return this.data === AsyncData.Empty ? undefined : this.data;
  }

  public unwrap(): T {
    if (this.data === AsyncData.Empty) {
      throw new Error('Attempted to unwrap empty AsyncData');
    }
    return this.data;
  }

  public setLoading(abortController?: AbortController): AsyncData<T, E> {
    return new AsyncData<T, E>({ isLoading: true, abortController });
  }

  public setError(error: E): AsyncData<T, E> {
    return new AsyncData<T, E>({ error, abortController: null });
  }

  public setData(data: T): AsyncData<T, E> {
    return new AsyncData<T, E>({ data, abortController: null });
  }

  public map<D>(mapper: (input: T) => D): AsyncData<D, E> {
    if (this.data !== AsyncData.Empty) {
      return new AsyncData<D, E>().setData(mapper(this.data));
    }

    return new AsyncData<D, E>({
      abortController: this.abortController,
      data: AsyncData.Empty,
      error: this.error,
      isLoading: this.isLoading,
    });
  }
}
