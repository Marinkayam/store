"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * ארבעה אזורים, לא שישה. "שלי" מרכז את הגלריה, החברות, הקבוצות,
 * הקישורים וההגדרות — כך שהילדה מגיעה לכל אחד מהם בשתי לחיצות בלי
 * שורת ניווט עמוסה.
 *
 * הניווט לא מוצג במסכי הפתיחה ובגלריה של חברה: שם היא עוד לא בפנים,
 * ושורת טאבים של אפליקציה שהיא לא חלק ממנה רק מבלבלת.
 */
const TABS = [
  { href: "/squish/collection", label: "האוסף", icon: ShelfIcon },
  { href: "/squish/discover", label: "לגלות", icon: SparkIcon },
  { href: "/squish/trades", label: "טריידים", icon: SwapIcon },
  { href: "/squish/me", label: "שלי", icon: MeIcon },
];

const HIDE_ON = ["/squish", "/squish/new", "/squish/c", "/squish/join"];

export default function SquishNav() {
  const path = usePathname();
  const router = useRouter();

  const hidden =
    path === "/squish" ||
    HIDE_ON.some((p) => p !== "/squish" && (path === p || path.startsWith(`${p}/`)));
  if (hidden) return null;

  return (
    <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-[var(--line)] flex pt-1.5 pb-3 z-40">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            aria-current={on ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1 text-[11px] ${
              on ? "text-[var(--ink)] font-medium" : "text-[var(--muted)]"
            }`}
          >
            <Icon on={on} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

const stroke = (on: boolean) => (on ? "var(--ink)" : "var(--muted)");
const fill = (on: boolean) => (on ? "var(--lavender)" : "transparent");

function ShelfIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="14.5" width="18" height="3" fill={fill(on)} />
      <path d="M5.5 17.5 v3 M18.5 17.5 v3" />
      <path d="M8 14.5 v-4 a4 4 0 0 1 8 0 v4" fill={fill(on)} />
    </svg>
  );
}

function SparkIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill={fill(on)} stroke={stroke(on)} strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 l2.2 5.3 5.8 .5 -4.4 3.8 1.3 5.7 -4.9 -3 -4.9 3 1.3 -5.7 -4.4 -3.8 5.8 -.5 z" />
    </svg>
  );
}

function SwapIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={stroke(on)} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9 h13 l-3.5 -3.5" />
      <path d="M20 15 h-13 l3.5 3.5" />
    </svg>
  );
}

function MeIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" fill={fill(on)} />
      <path d="M4.5 20 c0 -4 3.4 -6.5 7.5 -6.5 s7.5 2.5 7.5 6.5" />
    </svg>
  );
}
