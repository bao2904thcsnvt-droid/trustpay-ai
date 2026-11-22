/**
 * External store tối giản lưu bền vững vào `localStorage`, dùng với
 * `useSyncExternalStore` của React:
 *  - SSR/prerender dùng snapshot mặc định (không đụng `window`), React tự render
 *    lại bằng dữ liệu thật sau khi hydrate → không lỗi lệch hydrate.
 *  - Đồng bộ giữa nhiều tab trình duyệt qua sự kiện `storage`.
 *  - Dữ liệu đọc từ localStorage được coi là KHÔNG tin cậy và luôn đi qua
 *    hàm `sanitize` trước khi dùng.
 */

export interface PersistentStore<T> {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  setState: (updater: (prev: T) => T) => void;
  reset: () => void;
}

export interface PersistentStoreOptions<T> {
  storageKey: string;
  createDefault: () => T;
  sanitize: (raw: unknown) => T;
  /** Biến đổi trước khi ghi (vd loại ảnh base64 khỏi dữ liệu bền vững). */
  serialize?: (state: T) => unknown;
  /** Chạy một lần khi nạp dữ liệu lần đầu trong phiên (vd hủy giao dịch treo). */
  onInitialLoad?: (state: T) => T;
}

export function createPersistentStore<T>(options: PersistentStoreOptions<T>): PersistentStore<T> {
  const serverSnapshot = options.createDefault();
  const listeners = new Set<() => void>();
  let state: T | null = null;
  let storageListenerAttached = false;

  const hasWindow = (): boolean => typeof window !== "undefined";

  const read = (): T => {
    if (!hasWindow()) {
      return serverSnapshot;
    }
    try {
      const raw = window.localStorage.getItem(options.storageKey);
      if (raw === null) {
        return options.createDefault();
      }
      return options.sanitize(JSON.parse(raw) as unknown);
    } catch {
      return options.createDefault();
    }
  };

  const write = (next: T): void => {
    if (!hasWindow()) {
      return;
    }
    try {
      const payload = options.serialize ? options.serialize(next) : next;
      window.localStorage.setItem(options.storageKey, JSON.stringify(payload));
    } catch {
      // Hết quota hoặc chế độ riêng tư: vẫn giữ trạng thái trong bộ nhớ phiên.
    }
  };

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== options.storageKey) {
      return;
    }
    state = read();
    emit();
  };

  const getSnapshot = (): T => {
    if (state === null) {
      if (!hasWindow()) {
        return serverSnapshot;
      }
      const loaded = read();
      state = options.onInitialLoad ? options.onInitialLoad(loaded) : loaded;
    }
    return state;
  };

  const setState = (updater: (prev: T) => T): void => {
    const prev = getSnapshot();
    const next = updater(prev);
    if (Object.is(next, prev)) {
      return;
    }
    state = next;
    write(next);
    emit();
  };

  const reset = (): void => {
    state = options.createDefault();
    write(state);
    emit();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    if (!storageListenerAttached && hasWindow()) {
      window.addEventListener("storage", onStorage);
      storageListenerAttached = true;
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && storageListenerAttached && hasWindow()) {
        window.removeEventListener("storage", onStorage);
        storageListenerAttached = false;
      }
    };
  };

  return {
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe,
    setState,
    reset,
  };
}
