/**
 * קונפטי קטן שעולה מתוך באנר המבצע. קישוט בלבד: aria-hidden, לא לוכד
 * לחיצות, ונעלם לגמרי אצל מי שביקשה פחות תנועה (globals.css).
 * המיקומים קבועים ולא אקראיים — כך השרת והדפדפן מציירים אותו דבר.
 */
const BITS = [
  { left: "8%", bottom: "10%", bg: "#f2d9dc", delay: "0s" },
  { left: "22%", bottom: "4%", bg: "#e3c26f", delay: ".9s" },
  { left: "38%", bottom: "12%", bg: "#b89ac8", delay: "1.7s" },
  { left: "61%", bottom: "6%", bg: "#ffffff", delay: ".4s" },
  { left: "76%", bottom: "14%", bg: "#8ca78c", delay: "1.3s" },
  { left: "90%", bottom: "8%", bg: "#f2d9dc", delay: "2.1s" },
];

export default function PromoBurst() {
  return (
    <span aria-hidden>
      {BITS.map((b, i) => (
        <i key={i} className="fx-confetti" style={{ left: b.left, bottom: b.bottom, background: b.bg, animationDelay: b.delay }} />
      ))}
    </span>
  );
}
