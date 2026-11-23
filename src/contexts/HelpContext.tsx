'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { HelpCenter } from '@/components/HelpCenter';
import { useLocale } from '@/contexts/LocaleContext';

interface HelpContextType {
  openHelp: () => void;
  closeHelp: () => void;
}

const HelpContext = createContext<HelpContextType | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const openHelp = useCallback(() => setIsOpen(true), []);
  const closeHelp = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
          return;
        }
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <HelpContext.Provider value={{ openHelp, closeHelp }}>
      {children}
      <HelpCenter isOpen={isOpen} onClose={closeHelp} locale={locale} />
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) {
    // Fallback for components outside the provider
    return { openHelp: () => {}, closeHelp: () => {} };
  }
  return context;
}
