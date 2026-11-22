import { useSyncExternalStore } from "react";
import type { TrustPayWalletState } from "@/types/trustpay";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { createDefaultWalletState } from "@/lib/wallet/defaults";
import { sanitizeWalletState, serializeWalletState } from "@/lib/wallet/wallet-schema";
import { finalizeStaleHolds } from "@/lib/wallet/wallet-reducers";

/**
 * Nguồn sự thật DUY NHẤT cho dữ liệu Ví + Ops (số dư, ngân sách, lịch sử, gói
 * định kỳ, Người giám hộ, ticket, Blacklist). Cả Tab Ví và Tab Ops đọc/ghi cùng
 * store này nên luôn đồng bộ 2 chiều; dữ liệu được lưu bền vững vào localStorage
 * và đồng bộ giữa các tab trình duyệt.
 */

export const WALLET_STORAGE_KEY = "trustpay-ai.wallet.v1";

export const STALE_HOLD_NOTE =
  "Phiên kết thúc khi giao dịch đang tạm giữ — hệ thống tự hủy an toàn, tiền chưa bị trừ";

export const walletStore = createPersistentStore<TrustPayWalletState>({
  storageKey: WALLET_STORAGE_KEY,
  createDefault: createDefaultWalletState,
  sanitize: sanitizeWalletState,
  serialize: serializeWalletState,
  onInitialLoad: (state) => finalizeStaleHolds(state, STALE_HOLD_NOTE),
});

export function useWalletState(): TrustPayWalletState {
  return useSyncExternalStore(walletStore.subscribe, walletStore.getSnapshot, walletStore.getServerSnapshot);
}
