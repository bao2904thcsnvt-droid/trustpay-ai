import { useSyncExternalStore } from "react";
import type { TrustPayWalletState } from "@/types/trustpay";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { createRealWalletState } from "@/lib/wallet/defaults";
import { sanitizeRealWalletState, serializeWalletState } from "@/lib/wallet/wallet-schema";
import { finalizeStaleHolds } from "@/lib/wallet/wallet-reducers";

/**
 * Nguồn sự thật DUY NHẤT cho dữ liệu Ví + Ops (ngân sách, lịch sử giao dịch thật,
 * gói định kỳ, Người giám hộ, ticket, Blacklist). Khởi tạo mặc định ở chế độ
 * Tiền Thật (Non-Custodial, 0đ); chế độ dữ liệu mẫu chỉ kích hoạt khi bật công tắc
 * phụ trong Cài đặt.
 */

export const WALLET_STORAGE_KEY = "trustpay-ai.wallet.v2";

export const STALE_HOLD_NOTE =
  "Phiên kết thúc khi giao dịch đang tạm giữ — hệ thống tự hủy an toàn, tiền chưa bị trừ";

export const walletStore = createPersistentStore<TrustPayWalletState>({
  storageKey: WALLET_STORAGE_KEY,
  createDefault: createRealWalletState,
  sanitize: sanitizeRealWalletState,
  serialize: serializeWalletState,
  onInitialLoad: (state) => finalizeStaleHolds(state, STALE_HOLD_NOTE),
});

export function useWalletState(): TrustPayWalletState {
  return useSyncExternalStore(walletStore.subscribe, walletStore.getSnapshot, walletStore.getServerSnapshot);
}
