import type { Metadata } from "next";
import { Button, LiquidButton } from "@/components/ui/button";
import { GlassFilter } from "@/components/ui/liquid-glass";
import { MenuLab } from "./MenuLab";

// A place to look at components from 21st.dev running inside this app, against this site's own
// palette, before any of them are put in front of visitors. Not linked from anywhere and kept out
// of search results.
export const metadata: Metadata = {
  title: "UI lab — NEXT9",
  robots: { index: false, follow: false },
};

const swatch = "rounded-2xl p-8 flex flex-wrap items-center justify-center gap-4";

export default function UiLab() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 font-[inherit]">
      <GlassFilter />
      <h1 className="text-2xl font-semibold text-foreground">UI lab</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        21st.dev components running on this site&apos;s palette. Tailwind is set up without Preflight, so nothing here can reach the pages that already exist.
      </p>

      <MenuLab />

      <h2 className="mt-12 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Liquid glass</h2>
      <p className="mt-1 text-xs text-muted-foreground">Glass needs something behind it — the same button over a photograph and over a flat colour.</p>
      <div
        className={swatch + " mt-4 bg-cover bg-center"}
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&q=70')" }}
      >
        <LiquidButton size="xl" className="text-white">
          Liquid glass
        </LiquidButton>
        <LiquidButton size="lg" className="text-white">
          Smaller
        </LiquidButton>
        <LiquidButton size="icon" className="text-white">
          ★
        </LiquidButton>
      </div>
      <div className={swatch + " mt-4 bg-foreground"}>
        <LiquidButton size="xl" className="text-white">
          On a flat colour
        </LiquidButton>
      </div>

      <h2 className="mt-12 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Buttons</h2>
      <div className={swatch + " mt-4 border border-border bg-card"}>
        <Button>Default</Button>
        <Button variant="cool">Cool</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </div>
      <div className={swatch + " mt-4 border border-border bg-card"}>
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
      </div>
    </main>
  );
}
