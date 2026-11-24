import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` khi prerender / lúc hydrate, `true` sau khi đã gắn vào trình duyệt.
 * Dùng cho phần giao diện phụ thuộc API chỉ có trên trình duyệt (camera,
 * WebAuthn, nhận giọng nói, cài PWA…) để HTML máy chủ và lần render hydrate
 * đầu tiên luôn giống nhau — không lỗi lệch hydrate, không cần `useEffect` + setState.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
