"use client";

import { useEffect, useState } from "react";

// נופל פעם אחת בכל לשונית (אחרי הטעינה, בדפדפן); אחרי "לרענן" כבר לא.
export default function Boom() {
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    if (!sessionStorage.getItem("duchan-test-boom")) {
      sessionStorage.setItem("duchan-test-boom", "1");
      setBoom(true);
    }
  }, []);
  if (boom) throw new Error("test-error: boom");
  return <p data-testid="recovered" className="p-8 text-center">חזר לעבוד</p>;
}
