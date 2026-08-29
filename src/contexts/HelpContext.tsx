'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { HelpCenter } from '@/components/HelpCenter';

interface HelpContextType {
  openHelp: () => void;
  closeHelp: () => void;
}

const HelpContext = createContext<HelpContextType | null>(null);

export function HelpProvider({ children, locale }: { children: ReactNode; locale?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const openHelp = useCallback(() => setIsOpen(true), []);
  const closeHelp = useCallback(() => setIsOpen(false), []);

  return (
    <HelpContext.Provider value={{ openHelp, closeHelp }}>
      {children}
      <HelpCenter isOpen={isOpen} onClose={closeHelp} locale={(locale as 'en' | 'es' | 'fr' | 'pt') || 'en'} />
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
