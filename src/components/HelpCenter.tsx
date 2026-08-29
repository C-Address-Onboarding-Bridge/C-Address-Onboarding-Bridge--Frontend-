'use client';

import { useState, useMemo, useCallback } from 'react';
import { Search, X, HelpCircle } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

interface HelpArticle {
  id: string;
  titleKey: string;
  bodyKey: string;
  keywords: string[];
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'c-address',
    titleKey: 'help.c_address_explanation',
    bodyKey: 'help.c_address_explanation',
    keywords: ['c-address', 'smart account', 'soroban', 'contract', 'C-address'],
  },
  {
    id: 'g-address',
    titleKey: 'help.g_address_explanation',
    bodyKey: 'help.g_address_explanation',
    keywords: ['g-address', 'classic', 'stellar', 'account', 'G-address'],
  },
  {
    id: 'fees',
    titleKey: 'help.fee_explanation',
    bodyKey: 'help.fee_explanation',
    keywords: ['fee', 'cost', 'xlm', 'transaction', 'network'],
  },
  {
    id: 'bridge',
    titleKey: 'help.bridge_explanation',
    bodyKey: 'help.bridge_explanation',
    keywords: ['bridge', 'g-to-c', 'transfer', 'fund', 'source'],
  },
  {
    id: 'onramp',
    titleKey: 'help.onramp_explanation',
    bodyKey: 'help.onramp_explanation',
    keywords: ['onramp', 'fiat', 'credit card', 'buy', 'purchase'],
  },
  {
    id: 'cex',
    titleKey: 'help.cex_explanation',
    bodyKey: 'help.cex_explanation',
    keywords: ['cex', 'exchange', 'withdraw', 'centralized', 'binance', 'coinbase'],
  },
];

export interface HelpCenterProps {
  isOpen: boolean;
  onClose: () => void;
  locale?: Locale;
}

export function HelpCenter({ isOpen, onClose, locale = 'en' }: HelpCenterProps) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return HELP_ARTICLES;
    const q = query.toLowerCase();
    return HELP_ARTICLES.filter((article) => {
      const title = t(locale, article.titleKey).toLowerCase();
      const body = t(locale, article.bodyKey).toLowerCase();
      return (
        title.includes(q) ||
        body.includes(q) ||
        article.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [query, locale]);

  const handleClose = useCallback(() => {
    setQuery('');
    setActiveId(null);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'help.title')}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">{t(locale, 'help.title')}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-[var(--surface-2)] transition-colors"
            aria-label={t(locale, 'help.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b border-[var(--border)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, 'help.search_placeholder')}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              autoFocus
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">{t(locale, 'help.keyboard_hint')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{t(locale, 'common.no_results')}</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((article) => {
                const isActive = activeId === article.id;
                const title = t(locale, article.titleKey);
                const body = t(locale, article.bodyKey);
                return (
                  <div key={article.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setActiveId(isActive ? null : article.id)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--surface-2)] transition-colors"
                      aria-expanded={isActive}
                    >
                      <span className="text-sm font-medium">{title}</span>
                      <HelpCircle className="w-4 h-4 text-[var(--text-muted)]" />
                    </button>
                    {isActive && (
                      <div className="p-3 pt-0 text-sm text-[var(--text-muted)] leading-relaxed">{body}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HelpCenter;
