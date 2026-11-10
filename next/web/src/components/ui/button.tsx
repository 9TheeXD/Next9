"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Tailwind Preflight is disabled in this project (it would restyle the hand-written pages), so a
  // <button> still carries the UA's opaque ButtonFace grey and its border. Every component built
  // here has to neutralise that itself or it renders as a solid grey chip.
  "appearance-none border-0 bg-transparent font-[inherit] inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-primary-foreground hover:bg-destructive/90",
        cool: "bg-linear-to-t border border-b-2 border-zinc-950/40 from-primary to-primary/85 shadow-md shadow-primary/20 ring-1 ring-inset ring-white/25 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 text-primary-foreground",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

const liquidbuttonVariants = cva(
  "appearance-none border-0 bg-transparent font-[inherit] relative inline-flex items-center justify-center cursor-pointer gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[transform,color,box-shadow] duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default: "bg-transparent text-foreground hover:scale-105 active:scale-95",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 text-xs gap-1.5 px-4 has-[>svg]:px-4",
        lg: "h-10 px-6 has-[>svg]:px-4",
        xl: "h-12 px-8 has-[>svg]:px-6",
        xxl: "h-14 px-10 has-[>svg]:px-8",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "xxl" },
  },
);

// The refraction the original component leans on — backdrop-filter: url(#…) — is applied by Firefox
// only; Chrome, Edge and Safari parse it and do nothing, which left the button as bare shadows in
// every browser the site is actually used in. So the pane is built from a real blur and a rim, the
// way the rest of this site's glass is, and the displacement is layered on top where it works.
function LiquidButton({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof liquidbuttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(liquidbuttonVariants({ variant, size, className }))} {...props}>
      {/* The pane: what shows through, plus the edge lighting that gives it thickness. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] backdrop-blur-md backdrop-saturate-150 shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.9),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(255,255,255,0.15)]"
        style={{ backdropFilter: 'blur(12px) saturate(150%) url("#liquid-glass-displace")' }}
      />
      {/* The cut edge: bright where the light lands, fading to nothing on the shaded side. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] p-px [background:linear-gradient(145deg,rgba(255,255,255,0.75),rgba(255,255,255,0.12)_38%,rgba(255,255,255,0.03)_58%,rgba(255,255,255,0.4))] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]"
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </Comp>
  );
}

// Rendered ONCE per page, not once per button: the original put this inside every button, so a page
// with several of them had several elements all answering to id="container-glass".
function GlassFilter() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute size-0">
      <defs>
        <filter id="liquid-glass-displace" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

export { Button, buttonVariants, LiquidButton, liquidbuttonVariants, GlassFilter };
