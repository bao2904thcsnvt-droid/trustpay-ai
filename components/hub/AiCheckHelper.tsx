"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2, ShieldCheck, X } from "lucide-react";
import type { BudgetCategory, RiskLevel } from "@/types/trustpay";
import { analyzeShopTarget } from "@/lib/agents/safe-shopping";
import { requestTransactionAnalysis } from "@/lib/aws/pipeline-trace";
import { extractUrls, inspectVietQr } from "@/lib/qr/vietqr-inspector";
import { reasonCodesFrom, type SdkReasonCode } from "@/lib/sdk/decision-token";
import { expandBlacklistForText } from "@/lib/wallet/blacklist-patterns";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface AiCheckHelperProps {
  budgets: BudgetCategory[];
  blacklist: string[];
}

interface CheckResult {
  level: RiskLevel;
  reasons: SdkReasonCode[];
  link: { host: string; level: RiskLevel } | null;
  qrFound: boolean;
  aiFailed: boolean;
}

interface DetectedBarcodeLike {
  rawValue: string;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): { detect(source: ImageBitmapSource): Promise<DetectedBarcodeLike[]> };
}

const LEVEL_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function maxLevel(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((best, level) => (LEVEL_RANK[level] > LEVEL_RANK[best] ? level : best), "LOW");
}

const VERDICT_STYLE: Record<RiskLevel, string> = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-950",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-950",
  HIGH: "border-rose-300 bg-rose-50 text-rose-950",
};

async function readQrFromImage(file: File): Promise<string | null> {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof ctor !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const codes = await new ctor({ formats: ["qr_code"] }).detect(bitmap);
    bitmap.close();
    return codes.find((code) => code.rawValue)?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** "🛡️ Nhờ AI kiểm tra giúp": dán tin nhắn / link / ảnh → An toàn hay Lừa đảo, nói bằng lời đời thường. */
export default function AiCheckHelper({ budgets, blacklist }: AiCheckHelperProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; file: File } | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "empty">("idle");
  const [result, setResult] = useState<CheckResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImage({ base64: reader.result, file });
    };
    reader.readAsDataURL(file);
  };

  const runCheck = async () => {
    const content = text.trim().slice(0, 2000);
    if (!content && !image) {
      setStatus("empty");
      return;
    }
    setStatus("checking");
    setResult(null);

    const levels: RiskLevel[] = [];
    const reasons: SdkReasonCode[] = [];
    let qrFound = false;

    // 1) Đường link trong tin nhắn → bộ phân tích Safe Shopping (chạy trên máy).
    const url = extractUrls(content)[0] ?? null;
    let link: CheckResult["link"] = null;
    if (url) {
      const report = analyzeShopTarget({ target: url, price: 0, blacklist });
      link = { host: report.normalizedTarget || url, level: report.riskLevel };
      levels.push(report.riskLevel);
    }

    // 2) Mã VietQR (chuỗi dán vào hoặc trong ảnh) → VietQR Inspector.
    const qrRaw = content.startsWith("000201") ? content : image ? await readQrFromImage(image.file) : null;
    if (qrRaw) {
      const qr = inspectVietQr(qrRaw, { blacklist });
      qrFound = true;
      levels.push(qr.riskLevel);
      reasons.push(qr.verdict === "DANGER" ? "QR_DANGER" : qr.verdict === "WARNING" ? "QR_WARNING" : "QR_VERIFIED");
      if (qr.blacklistMatches.length > 0) reasons.push("BLACKLIST_MATCH");
    }

    // 3) Lá chắn AI (Bedrock + bộ luật; tự chạy Offline Heuristic khi không có AWS).
    let aiFailed = false;
    try {
      const commandText = content || "Kiểm tra nội dung ảnh chụp màn hình";
      const { result: analysis } = await requestTransactionAnalysis(
        {
          commandText,
          ...(image ? { imageBase64: image.base64 } : {}),
          currentBudgets: budgets,
          blacklist: expandBlacklistForText(blacklist, commandText),
        },
        image ? "IMAGE_EVIDENCE" : "CONTEXT_CHECK",
      );
      levels.push(analysis.scamReport.riskLevel);
      reasons.push(
        ...reasonCodesFrom({
          redFlags: analysis.scamReport.redFlags,
          policyReasons: [],
          riskLevel: analysis.scamReport.riskLevel,
        }),
      );
    } catch {
      aiFailed = true;
    }

    const level = maxLevel(levels);
    const unique = Array.from(new Set(reasons)).filter((code) => !(level !== "LOW" && code === "NO_SCAM_SIGNALS"));
    setResult({ level, reasons: unique, link, qrFound, aiFailed });
    setStatus("done");
  };

  const reset = () => {
    setText("");
    setImage(null);
    setResult(null);
    setStatus("idle");
  };

  return (
    <section id="tp-ai-check" aria-labelledby="tp-ai-check-title" className="rounded-3xl border border-sky-200 bg-white p-4 shadow-xs sm:p-5">
      <h2 id="tp-ai-check-title" className="text-base font-bold text-slate-900">
        {t.aiCheck.title}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">{t.aiCheck.subtitle}</p>

      {!result ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={4}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder={t.aiCheck.placeholder}
            aria-label={t.aiCheck.title}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ImagePlus className="h-4 w-4" />
              {t.aiCheck.attach}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            {image && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800">
                {image.file.name}
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label={t.aiCheck.removeImage}
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full hover:bg-sky-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
          {status === "empty" && <p className="text-xs font-semibold text-amber-700">{t.aiCheck.empty}</p>}
          <button
            type="button"
            disabled={status === "checking"}
            onClick={() => void runCheck()}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-wait disabled:opacity-70"
          >
            {status === "checking" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            {status === "checking" ? t.aiCheck.checking : t.aiCheck.check}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div role="status" className={`rounded-2xl border-2 p-4 ${VERDICT_STYLE[result.level]}`}>
            <p className="text-xl font-extrabold">{t.aiCheck.verdict(result.level)}</p>
            <p className="mt-1 text-sm">{t.aiCheck.verdictDesc(result.level)}</p>
          </div>

          {(result.reasons.length > 0 || result.link || result.qrFound) && (
            <div>
              <p className="text-sm font-bold text-slate-900">{t.aiCheck.reasonsTitle}</p>
              <ul className="mt-1.5 space-y-1.5">
                {result.link && (
                  <li className="flex gap-2 text-sm text-slate-700">
                    <span aria-hidden="true">🔗</span>
                    <span className="min-w-0 break-words">{t.aiCheck.link(result.link.host, t.aiCheck.verdict(result.link.level))}</span>
                  </li>
                )}
                {result.reasons.map((code) => (
                  <li key={code} className="flex gap-2 text-sm text-slate-700">
                    <span aria-hidden="true">•</span>
                    <span className="min-w-0">{t.aiCheck.reasons[code] ?? t.aiCheck.otherReason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-sm font-bold text-slate-900">{t.aiCheck.tipsTitle}</p>
            <ul className="mt-1.5 space-y-1.5">
              {t.aiCheck.tips(result.level).map((tip) => (
                <li key={tip} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden="true">✔️</span>
                  <span className="min-w-0">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {result.aiFailed && <p className="text-xs font-semibold text-amber-700">{t.aiCheck.failed}</p>}

          <button
            type="button"
            onClick={reset}
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            {t.aiCheck.again}
          </button>
        </div>
      )}
    </section>
  );
}
