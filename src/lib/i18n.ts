/**
 * Localization system for C-Address Onboarding Bridge.
 * Supports en, es, fr, pt with RTL-safe layout handling.
 * #361
 */

export type Locale = 'en' | 'es' | 'fr' | 'pt';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'fr', 'pt'];
export const DEFAULT_LOCALE: Locale = 'en';

export interface TranslationSet {
  common: {
    connect_wallet: string;
    disconnect: string;
    loading: string;
    error: string;
    success: string;
    cancel: string;
    confirm: string;
    back: string;
    next: string;
    submit: string;
  };
  bridge: {
    title: string;
    source_network: string;
    destination_network: string;
    amount: string;
    transfer: string;
    insufficient_balance: string;
  };
  onboarding: {
    welcome: string;
    connect_step: string;
    verify_step: string;
    complete: string;
    skip: string;
  };
  errors: {
    wallet_not_found: string;
    connection_failed: string;
    network_mismatch: string;
    transaction_failed: string;
    invalid_address: string;
  };
}

const translations: Record<Locale, TranslationSet> = {
  en: {
    common: {
      connect_wallet: 'Connect Wallet',
      disconnect: 'Disconnect',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      cancel: 'Cancel',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      submit: 'Submit',
    },
    bridge: {
      title: 'Bridge Assets',
      source_network: 'Source Network',
      destination_network: 'Destination Network',
      amount: 'Amount',
      transfer: 'Transfer',
      insufficient_balance: 'Insufficient balance',
    },
    onboarding: {
      welcome: 'Welcome to C-Address',
      connect_step: 'Connect your wallet to get started.',
      verify_step: 'Complete identity verification.',
      complete: 'Get Started',
      skip: 'Skip',
    },
    errors: {
      wallet_not_found: 'Please install a Stellar wallet to continue.',
      connection_failed: 'Could not connect to your wallet.',
      network_mismatch: 'Please switch to the correct network.',
      transaction_failed: 'Transaction failed. Please try again.',
      invalid_address: 'The address is not valid.',
    },
  },
  es: {
    common: {
      connect_wallet: 'Conectar Billetera',
      disconnect: 'Desconectar',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      back: 'Atrás',
      next: 'Siguiente',
      submit: 'Enviar',
    },
    bridge: {
      title: 'Transferir Activos',
      source_network: 'Red de Origen',
      destination_network: 'Red de Destino',
      amount: 'Cantidad',
      transfer: 'Transferir',
      insufficient_balance: 'Saldo insuficiente',
    },
    onboarding: {
      welcome: 'Bienvenido a C-Address',
      connect_step: 'Conecta tu billetera para comenzar.',
      verify_step: 'Completa la verificación de identidad.',
      complete: 'Comenzar',
      skip: 'Omitir',
    },
    errors: {
      wallet_not_found: 'Instale una billetera Stellar para continuar.',
      connection_failed: 'No se pudo conectar a su billetera.',
      network_mismatch: 'Cambie a la red correcta.',
      transaction_failed: 'La transacción falló. Inténtelo de nuevo.',
      invalid_address: 'La dirección no es válida.',
    },
  },
  fr: {
    common: {
      connect_wallet: 'Connecter le Portefeuille',
      disconnect: 'Déconnecter',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succès',
      cancel: 'Annuler',
      confirm: 'Confirmer',
      back: 'Retour',
      next: 'Suivant',
      submit: 'Soumettre',
    },
    bridge: {
      title: 'Transférer des Actifs',
      source_network: 'Réseau Source',
      destination_network: 'Réseau de Destination',
      amount: 'Montant',
      transfer: 'Transférer',
      insufficient_balance: 'Solde insuffisant',
    },
    onboarding: {
      welcome: 'Bienvenue sur C-Address',
      connect_step: 'Connectez votre portefeuille pour commencer.',
      verify_step: "Complétez la vérification d'identité.",
      complete: 'Commencer',
      skip: 'Passer',
    },
    errors: {
      wallet_not_found: 'Installez un portefeuille Stellar pour continuer.',
      connection_failed: 'Impossible de se connecter à votre portefeuille.',
      network_mismatch: 'Veuillez changer de réseau.',
      transaction_failed: 'La transaction a échoué. Veuillez réessayer.',
      invalid_address: "L'adresse n'est pas valide.",
    },
  },
  pt: {
    common: {
      connect_wallet: 'Conectar Carteira',
      disconnect: 'Desconectar',
      loading: 'Carregando...',
      error: 'Erro',
      success: 'Sucesso',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      back: 'Voltar',
      next: 'Próximo',
      submit: 'Enviar',
    },
    bridge: {
      title: 'Transferir Ativos',
      source_network: 'Rede de Origem',
      destination_network: 'Rede de Destino',
      amount: 'Valor',
      transfer: 'Transferir',
      insufficient_balance: 'Saldo insuficiente',
    },
    onboarding: {
      welcome: 'Bem-vindo ao C-Address',
      connect_step: 'Conecte sua carteira para começar.',
      verify_step: 'Complete a verificação de identidade.',
      complete: 'Começar',
      skip: 'Pular',
    },
    errors: {
      wallet_not_found: 'Instale uma carteira Stellar para continuar.',
      connection_failed: 'Não foi possível conectar à sua carteira.',
      network_mismatch: 'Mude para a rede correta.',
      transaction_failed: 'A transação falhou. Tente novamente.',
      invalid_address: 'O endereço não é válido.',
    },
  },
};

/**
 * Get translations for a locale.
 */
export function getTranslations(locale: Locale = DEFAULT_LOCALE): TranslationSet {
  return translations[locale] ?? translations[DEFAULT_LOCALE];
}

/**
 * Translate a dot-path key like 'common.connect_wallet'.
 */
export function t(locale: Locale, key: string): string {
  const set = getTranslations(locale);
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = set;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return key;
    }
    current = current[part];
  }
  if (typeof current !== 'string') return key;
  return current;
}

/**
 * Detect locale from browser or fallback to default.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const lang = navigator.language?.split('-')[0]?.toLowerCase();
  if (lang && (SUPPORTED_LOCALES as string[]).includes(lang)) {
    return lang as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Format a number for the given locale.
 */
export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Format a currency amount for the given locale.
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: Locale = DEFAULT_LOCALE,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
