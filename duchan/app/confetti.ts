/**
 * קונפטי קטן — משותף לדשבורד ולדוכן ("קונפטי לקונים" מחנות הקופה).
 * משתמש במחלקה .confetti מ-globals.css. אין כאן שום ספרייה.
 */
export function confettiBurst(x: number, y: number, count = 14) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#B89AC8", "#E3C26F", "#A8A46D", "#F2D9DC", "#9B6D3E"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "confetti";
    s.setAttribute("aria-hidden", "true");
    s.style.background = cols[i % cols.length];
    s.style.left = `${x + (Math.random() * 120 - 60)}px`;
    s.style.top = `${y}px`;
    s.style.animationDelay = `${Math.random() * 0.25}s`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}
