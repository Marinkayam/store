"use client";

/**
 * שגיאה ב-layout עצמו — הרשת האחרונה.
 *
 * ברמה הזו Next מחליף את כל המסמך, ולכן הקובץ הזה חייב להחזיר html ו-body
 * משלו, ואי אפשר להישען על ה-CSS של האפליקציה: אם ה-layout הוא זה שנפל,
 * ייתכן שגם גיליון הסגנון לא נטען. לכן הסגנון כאן inline ומינימלי.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#fbf8f3",
          color: "#262626",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 32,
        }}
      >
        <div style={{ fontSize: 44 }}>🌧️</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>משהו השתבש אצלנו</h1>
        <p style={{ fontSize: 14, color: "#857e73", maxWidth: 300, lineHeight: 1.6 }}>
          זו לא את — זו תקלה שלנו. אפשר לנסות שוב.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#262626",
            color: "#fff",
            border: 0,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          לנסות שוב
        </button>
      </body>
    </html>
  );
}
