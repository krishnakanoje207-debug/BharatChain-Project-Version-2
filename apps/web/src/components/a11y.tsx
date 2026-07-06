import { useEffect, useState } from "react";

// Accessibility preferences (text size + high contrast), persisted and applied
// to <html> so they hold across every surface — public site and portals alike.
type Size = "sm" | "" | "lg";

const SIZE_KEY = "bc_a11y_size";
const CONTRAST_KEY = "bc_a11y_contrast";

function apply(size: Size, contrast: boolean) {
  const el = document.documentElement;
  el.classList.toggle("fs-sm", size === "sm");
  el.classList.toggle("fs-lg", size === "lg");
  if (contrast) el.setAttribute("data-contrast", "high");
  else el.removeAttribute("data-contrast");
}

// Apply any saved preference immediately on first load.
if (typeof document !== "undefined") {
  apply((localStorage.getItem(SIZE_KEY) as Size) || "", localStorage.getItem(CONTRAST_KEY) === "1");
}

export function useA11y() {
  const [size, setSize] = useState<Size>(() => (localStorage.getItem(SIZE_KEY) as Size) || "");
  const [contrast, setContrast] = useState<boolean>(() => localStorage.getItem(CONTRAST_KEY) === "1");

  useEffect(() => {
    apply(size, contrast);
    localStorage.setItem(SIZE_KEY, size);
    localStorage.setItem(CONTRAST_KEY, contrast ? "1" : "0");
  }, [size, contrast]);

  return { size, setSize, contrast, setContrast };
}
