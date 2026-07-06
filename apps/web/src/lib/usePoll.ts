import { useEffect, useRef } from "react";

/** Run `fn` once on mount and then every `ms` — used to keep on-chain figures live. */
export function usePoll(fn: () => void, ms = 6000) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    saved.current();
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
