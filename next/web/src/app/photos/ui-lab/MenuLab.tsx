"use client";

import { useState } from "react";
import { MorphMenu, MorphMenuItem, MorphMenuSeparator } from "@/components/photos/ui/MorphMenu";

// The real MorphMenu, on a public page, so the animation can be driven and recorded instead of
// reasoned about. Two backdrops because the glass has to work over both: a photograph and the
// album pages' flat light grey.
export function MenuLab() {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Morph menu</h2>
      <div className="mt-4 flex gap-6">
        <div
          data-lab="photo"
          className="flex h-64 flex-1 items-start justify-end rounded-2xl bg-cover bg-center p-6"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&q=70')" }}
        >
          <MorphMenu open={a} onOpenChange={setA} side="bottom" align="end" label="Actions" triggerClassName="h-11 w-11 text-lg" trigger={<span>⋯</span>}>
            <MorphMenuItem icon={<span>✓</span>} onSelect={() => setA(false)}>เลือกรูป</MorphMenuItem>
            <MorphMenuItem icon={<span>↓</span>} onSelect={() => setA(false)}>ดาวน์โหลด</MorphMenuItem>
            <MorphMenuItem icon={<span>▶</span>} onSelect={() => setA(false)}>เริ่มสไลด์โชว์</MorphMenuItem>
            <MorphMenuSeparator />
            <MorphMenuItem danger icon={<span>🗑</span>} onSelect={() => setA(false)}>ลบรูปนี้</MorphMenuItem>
          </MorphMenu>
        </div>
        <div data-lab="flat" className="flex h-64 flex-1 items-start justify-end rounded-2xl bg-muted p-6">
          <MorphMenu open={b} onOpenChange={setB} side="bottom" align="end" label="Actions" triggerClassName="h-11 px-4 text-sm" trigger={<span>กำลังแสดง SD+</span>}>
            <MorphMenuItem onSelect={() => setB(false)}>เร็วสุด (SD)</MorphMenuItem>
            <MorphMenuItem active icon={<span>✓</span>} onSelect={() => setB(false)}>เร็ว (SD+)</MorphMenuItem>
            <MorphMenuItem onSelect={() => setB(false)}>มาตรฐาน (HD)</MorphMenuItem>
          </MorphMenu>
        </div>
      </div>
    </section>
  );
}
