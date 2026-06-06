import { useEffect, useRef } from "react";

export type KeyHandlers = Record<string, (event: KeyboardEvent) => void>;

/**
 * Calls the handler mapped to `event.key` on global keydown. Key events that
 * originate from a form control (input/textarea/select or contentEditable) are
 * ignored so the shortcuts don't fight with typing or native select navigation.
 *
 * Handlers are read through a ref, so passing a fresh map each render is fine
 * and never re-attaches the listener.
 */
export function useKeyboardShortcuts(handlers: KeyHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const handler = handlersRef.current[event.key];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
