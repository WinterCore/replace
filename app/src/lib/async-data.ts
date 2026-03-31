import { html, type TemplateResult, nothing } from 'lit';

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
    return new AsyncData<T, E>({
      data: this.data,
      isLoading: true,
      abortController,
    });
  }

  public setError(error: E): AsyncData<T, E> {
    return new AsyncData<T, E>({ error, abortController: null });
  }

  public setData(data: T): AsyncData<T, E> {
    return new AsyncData<T, E>({ data, abortController: null });
  }

  public render(opts: {
    renderLoading?: 'always' | 'no-data',
    loading?: () => TemplateResult,
    error?: (error: E) => TemplateResult,
    data?: (data: T, isLoading: boolean) => TemplateResult,
  } = {}): TemplateResult | symbol {
    const renderLoadingMode = opts.renderLoading ?? 'always';

    if (this.error !== null) {
      const renderError = opts.error ?? ((e: E) => html`
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: sans-serif;
          color: #e0e0e0;
          text-align: center;
        ">
          <div style="
            margin-bottom: 12px;
            opacity: 0.4;
          "><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>
          <div style="
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 6px;
          ">Something went wrong</div>
          <div style="
            font-size: 14px;
            opacity: 0.6;
          ">${e}</div>
        </div>
      `);
      return renderError(this.error);
    }

    const renderLoadingFn = opts.loading ?? (() => html`<div class="async-loading">Loading...</div>`);

    if (renderLoadingMode === 'always' && this.isLoading) {
      return renderLoadingFn();
    }

    if (this.data === AsyncData.Empty) {
      return renderLoadingFn();
    }

    const renderData = opts.data ?? (() => nothing);

    return renderData(this.data, this.isLoading);
  }

  static combine<A, B, E = string>(a: AsyncData<A, E>, b: AsyncData<B, E>): AsyncData<[A, B], E> {
    const error = a.error ?? b.error;
    if (error !== null) {
      return new AsyncData<[A, B], E>({ error });
    }

    const isLoading = a.isLoading || b.isLoading;

    if (a.data === AsyncData.Empty || b.data === AsyncData.Empty) {
      return new AsyncData<[A, B], E>({ isLoading });
    }

    return new AsyncData<[A, B], E>({ data: [a.data, b.data], isLoading });
  }

  static combine3<A, B, C, E = string>(a: AsyncData<A, E>, b: AsyncData<B, E>, c: AsyncData<C, E>): AsyncData<[A, B, C], E> {
    const error = a.error ?? b.error ?? c.error;
    if (error !== null) {
      return new AsyncData<[A, B, C], E>({ error });
    }

    const isLoading = a.isLoading || b.isLoading || c.isLoading;

    if (a.data === AsyncData.Empty || b.data === AsyncData.Empty || c.data === AsyncData.Empty) {
      return new AsyncData<[A, B, C], E>({ isLoading });
    }

    return new AsyncData<[A, B, C], E>({ data: [a.data, b.data, c.data], isLoading });
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
