"use client";

// "המסע שלי" — כרטיס בדשבורד של הילדה.
// מציג את אבן הדרך הבאה בגדול, ואת כל המסע בלחיצה.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { milestones, nextMilestone, reachedCount, type StoreStats } from "@/lib/milestones";
import type { Store } from "@/lib/types";

export default function Journey({ store }: { store: Store }) {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supa = supabaseBrowser();
    Promise.all([
      supa.from("products").select("id").eq("store_id", store.id).is("deleted_at", null),
      supa.from("orders").select("status, total").eq("store_id", store.id),
      fetch(`/api/views?slug=${store.slug}`).then((r) => (r.ok ? r.json() : { views: 0 })).catch(() => ({ views: 0 })),
    ]).then(([p, o, v]) => {
      const orders = o.data ?? [];
      const sold = orders.filter((x) => x.status === "paid" || x.status === "delivered");
      setStats({
        products: p.data?.length ?? 0,
        orders: orders.length,
        paidOrders: sold.length,
        revenue: sold.reduce((sum, x) => sum + x.total, 0),
        views: v.views ?? 0,
      });
    });
  }, [store.id, store.slug]);

  if (!stats) return null;

  const list = milestones(stats);
  const next = nextMilestone(list);
  const done = reachedCount(list);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-3 mt-3 bg-white border border-[#E6E7EC] rounded-xl p-3 flex items-center gap-3 text-right w-[calc(100%-1.5rem)]"
      >
        {next ? (
          <>
            <span className="text-2xl grayscale opacity-40">{next.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">הבא במסע: {next.title}</div>
              <div className="text-[11px] text-[#7A7D8A]">{next.hint}</div>
              <div className="h-1.5 bg-[#EDEEF1] rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#15161B] rounded-full transition-all"
                  style={{ width: `${Math.round(next.progress * 100)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="text-2xl">🏆</span>
            <div className="flex-1">
              <div className="text-[13px] font-bold">סיימת את כל המסע!</div>
              <div className="text-[11px] text-[#7A7D8A]">כל אבני הדרך הושגו</div>
            </div>
          </>
        )}
        <span className="text-[11px] text-[#7A7D8A] whitespace-nowrap">{done}/{list.length}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white rounded-t-3xl px-4 pt-3 pb-8 max-h-[85%] overflow-y-auto">
            <div className="w-9 h-1 rounded bg-black/15 mx-auto mb-3.5" />
            <h2 className="text-base font-bold">המסע שלי</h2>
            <p className="text-[11px] text-[#7A7D8A] mb-3">
              {done} מתוך {list.length} — כל אבן דרך היא משהו אמיתי שהצלחת
            </p>

            <div className="flex flex-col gap-2">
              {list.map((ms) => (
                <div
                  key={ms.key}
                  className={`border rounded-xl p-3 ${ms.reached ? "border-[#CBE8D4] bg-[#F6FBF7]" : "border-[#E6E7EC]"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`text-xl ${ms.reached ? "" : "grayscale opacity-35"}`}>{ms.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold">{ms.title}</span>
                        {ms.reached && <span className="text-[10px] text-[#1F7A42]">✓ הושג</span>}
                      </div>
                      {ms.reached ? (
                        <p className="text-[11px] text-[#3A3C46] mt-0.5 leading-relaxed">💡 {ms.lesson}</p>
                      ) : (
                        <>
                          <p className="text-[11px] text-[#7A7D8A] mt-0.5">{ms.hint}</p>
                          <div className="h-1 bg-[#EDEEF1] rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full bg-[#7A7D8A] rounded-full"
                              style={{ width: `${Math.round(ms.progress * 100)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
