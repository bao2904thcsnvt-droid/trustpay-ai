import { I18nProvider } from "@/components/i18n/I18nProvider";
import TrustPayApp from "@/components/app/TrustPayApp";

/**
 * TrustPay AI — Ví Người Dùng & Lá Chắn AI + Fintech Future Workspace (Ops).
 * Toàn bộ trạng thái nghiệp vụ nằm trong store bền vững (localStorage) dùng
 * chung giữa 2 phân hệ; xem `components/app/TrustPayApp.tsx`.
 */
export default function Home() {
  return (
    <I18nProvider>
      <TrustPayApp />
    </I18nProvider>
  );
}
