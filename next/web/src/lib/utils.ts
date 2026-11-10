import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The class joiner every shadcn/ui and 21st.dev component expects. clsx flattens conditionals;
// tailwind-merge then drops utilities an later one overrides, so `cn("p-2", "p-4")` is just "p-4"
// and a component's own classes can always be overridden from the outside.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
