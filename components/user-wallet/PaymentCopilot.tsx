"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles, Trash2, User } from "lucide-react";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

// Web Speech API (chưa có trong lib DOM của TypeScript) — khai báo tối thiểu.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
import type { BudgetCategory, CategoryName, RecurringSubscription } from "@/types/trustpay";
import {
  answerBudget,
  answerSubscriptions,
  COPILOT_CHIPS,
  parseCopilotIntent,
} from "@/lib/copilot/payment-copilot";
import { isSubscriptionFlagged } from "@/lib/agents/subscription-guard";
import { createClientId } from "@/lib/wallet/ledger";
import {
  appendCopilotEntries,
  clearCopilotLog,
  useFeatureState,
  type CopilotLogEntry,
} from "@/lib/features/feature-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface PaymentCopilotProps {
  budgets: BudgetCategory[];
  subscriptions: RecurringSubscription[];
  onPrefillTransfer: (commandText: string) => void;
  onOpenSubscriptions: () => void;
  onOpenQr: () => void;
  onOpenCallShield: () => void;
  highlighted?: boolean;
}

interface Extraction {
  amount: number;
  recipient: string;
  category: CategoryName;
}

/**
 * AI Payment Copilot: ô lệnh ngôn ngữ tự nhiên + 3 gợi ý nhanh. Điền sẵn lệnh
 * chuyển tiền, trả lời hạn mức từ dữ liệu Ví thật (localStorage) và mở đúng trợ lý.
 */
export default function PaymentCopilot({
  budgets,
  subscriptions,
  onPrefillTransfer,
  onOpenSubscriptions,
  onOpenQr,
  onOpenCallShield,
  highlighted = false,
}: PaymentCopilotProps) {
  const { t, lang, money, category } = useI18n();
  const { copilotLog } = useFeatureState();
  const [input, setInput] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  // Vòng 4: Voice Copilot — "🎙️ Nói lệnh" (Web Speech API, vi-VN / en-US).
  const mounted = useHasMounted();
  const voiceSupported = mounted && getSpeechRecognition() !== null;
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const submitRef = useRef<(raw: string) => void>(() => {});

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [copilotLog.length]);

  const respond = (text: string): string => {
    const intent = parseCopilotIntent(text);
    switch (intent.kind) {
      case "transfer": {
        if (intent.amount === null) return t.copilot.transferNeedAmount;
        if (intent.recipient === null || intent.commandText === null) return t.copilot.transferNeedRecipient;
        setExtraction({ amount: intent.amount, recipient: intent.recipient, category: intent.category });
        onPrefillTransfer(intent.commandText);
        return t.copilot.transferReady(money(intent.amount), intent.recipient, category(intent.category));
      }
      case "budget": {
        const answers = answerBudget(budgets, intent.category);
        if (intent.category && answers.length === 0) return t.copilot.budgetMissing(category(intent.category));
        if (answers.length === 1) {
          const [only] = answers;
          return only.remaining >= 0
            ? t.copilot.budgetOne(category(only.category), money(only.remaining), money(only.spent), money(only.limit))
            : t.copilot.budgetOver(category(only.category), money(-only.remaining));
        }
        return t.copilot.budgetAll(
          answers.map((answer) => `${category(answer.category)} ${money(answer.remaining)}`).join("; "),
        );
      }
      case "subscriptions": {
        const summary = answerSubscriptions(subscriptions, isSubscriptionFlagged);
        onOpenSubscriptions();
        return summary.flaggedCount > 0
          ? t.copilot.subsFlagged(summary.flaggedCount, money(summary.flaggedMonthly), money(summary.monthlyTotal))
          : t.copilot.subsClean(summary.activeCount, money(summary.monthlyTotal));
      }
      case "qr":
        onOpenQr();
        return t.copilot.qrOpened;
      case "call-shield":
        onOpenCallShield();
        return t.copilot.callOpened;
      default:
        return t.copilot.unknown;
    }
  };

  const submit = (raw: string) => {
    const text = raw.trim().slice(0, 300);
    if (!text) return;
    const reply = respond(text);
    const at = new Date().toISOString();
    const entries: CopilotLogEntry[] = [
      { id: createClientId("CPU"), role: "user", text, at },
      { id: createClientId("CPB"), role: "copilot", text: reply, at },
    ];
    appendCopilotEntries(entries);
    setInput("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setVoiceError(true);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang === "en" ? "en-US" : "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0]?.transcript ?? "";
        if (result.isFinal) isFinal = true;
      }
      const text = transcript.trim().slice(0, 300);
      setInput(text);
      if (isFinal && text) {
        submitRef.current(text);
      }
    };
    recognition.onerror = () => {
      setVoiceError(true);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setVoiceError(false);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setVoiceError(true);
    }
  };

  return (
    <section
      id="tp-copilot"
      aria-labelledby="tp-copilot-title"
      className={`rounded-3xl border border-pink-200/80 bg-gradient-to-br from-pink-50 to-white p-4 shadow-xs sm:p-5 ${
        highlighted ? "tp-highlight" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="tp-copilot-title" className="text-sm font-bold text-slate-900">
              {t.copilot.title}
            </h2>
            <p className="text-[11px] leading-relaxed text-slate-500">{t.copilot.subtitle}</p>
          </div>
        </div>
        {copilotLog.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearCopilotLog();
              setExtraction(null);
            }}
            title={t.copilot.clear}
            aria-label={t.copilot.clear}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {copilotLog.length > 0 && (
        <ol ref={listRef} className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
          {copilotLog.map((entry) => (
            <li key={entry.id} className={`flex gap-2 ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
              {entry.role === "copilot" && (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[#a50064]">
                  <Bot className="h-3.5 w-3.5" />
                </span>
              )}
              <p
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  entry.role === "user"
                    ? "rounded-br-md bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white"
                    : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <span className="sr-only">{entry.role === "user" ? t.copilot.you : t.copilot.bot}: </span>
                {entry.text}
              </p>
              {entry.role === "user" && (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <User className="h-3.5 w-3.5" />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {extraction && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            { label: t.copilot.extracted.amount, value: money(extraction.amount) },
            { label: t.copilot.extracted.recipient, value: extraction.recipient },
            { label: t.copilot.extracted.category, value: category(extraction.category) },
          ].map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"
            >
              <span className="font-semibold text-[#a50064]">{item.label}:</span>
              <span className="font-mono">{item.value}</span>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="tp-copilot-input" className="sr-only">
          {t.copilot.title}
        </label>
        <input
          id="tp-copilot-input"
          value={input}
          maxLength={300}
          autoComplete="off"
          onChange={(event) => setInput(event.target.value)}
          placeholder={t.copilot.placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d82d8b] focus:ring-4 focus:ring-pink-100 focus:outline-none"
        />
        <button
          type="button"
          onClick={toggleVoice}
          disabled={mounted && !voiceSupported}
          aria-pressed={listening}
          title={voiceSupported ? (listening ? t.voice.stop : t.voice.start) : t.voice.unsupported}
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-bold whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            listening
              ? "tp-call-pulse bg-rose-600 text-white"
              : "border border-pink-200 bg-white text-[#a50064] hover:bg-pink-50"
          }`}
        >
          {listening ? t.voice.stop : t.voice.start}
        </button>
        <button
          type="submit"
          disabled={!input.trim()}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-[#a50064]/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">{t.copilot.send}</span>
        </button>
      </form>
      {(listening || voiceError || (mounted && !voiceSupported)) && (
        <p
          role="status"
          className={`mt-1.5 text-[11px] font-semibold ${listening ? "text-rose-700" : "text-amber-700"}`}
        >
          {listening ? t.voice.listening : voiceError ? t.voice.error : t.voice.unsupported}
        </p>
      )}
      {voiceSupported && <p className="mt-1 text-[10px] text-slate-400">{t.voice.privacy}</p>}

      <div className="mt-3">
        <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">{t.copilot.chipsLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {COPILOT_CHIPS[lang].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => submit(chip)}
              className="cursor-pointer rounded-full border border-pink-200 bg-white px-3 py-1.5 text-left text-[11px] font-semibold text-[#a50064] transition-colors hover:bg-pink-50"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{t.copilot.engineNote}</p>
    </section>
  );
}
