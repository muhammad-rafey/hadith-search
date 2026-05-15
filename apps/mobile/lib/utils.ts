import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Same helper as apps/web/lib/utils.ts. NativeWind reads className strings,
// so clsx + tailwind-merge behave identically here.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
