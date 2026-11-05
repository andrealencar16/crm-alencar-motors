import { cn } from "@/lib/utils";

/** Official artwork, unchanged. White backing preserves the black logo in both themes. */
export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-white", compact ? "h-8 w-8 p-0.5" : "px-3 py-2", className)}>
      <img src="/alencar-motors-logo.webp" alt="Alencar Motors" width={180} height={60}
        className={compact ? "h-auto w-full object-contain" : "h-auto w-36 max-w-full object-contain"} />
    </span>
  );
}
