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
    help: string;
    search_help: string;
    no_results: string;
  };
  bridge: {
    title: string;
    source_network: string;
    destination_network: string;
    amount: string;
    transfer: string;
    insufficient_balance: string;
  };
  help: {
    title: string;
    search_placeholder: string;
    c_address_explanation: string;
    g_address_explanation: string;
    fee_explanation: string;
    bridge_explanation: string;
    onramp_explanation: string;
    cex_explanation: string;
    close: string;
    keyboard_hint: string;
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
      help: 'Help',
      search_help: 'Search help...',
      no_results: 'No results found',
    },
    bridge: {
      title: 'Bridge Assets',
      source_network: 'Source Network',
      destination_network: 'Destination Network',
      amount: 'Amount',
      transfer: 'Transfer',
      insufficient_balance: 'Insufficient balance',
    },
    help: {
      title: 'Help Centre',
      search_placeholder: 'Search for help...',
      c_address_explanation: 'A C-address is a Soroban smart account. It starts with C and is 56 characters long. Unlike a G-address, it is a smart contract that can hold assets and execute logic on the Soroban network.',
      g_address_explanation: 'A G-address is a classic Stellar account. It starts with G and is 56 characters long. It is the standard account type on Stellar and can fund C-addresses.',
      fee_explanation: 'Fees are paid in XLM to cover the transaction cost on the Stellar network. Soroban smart contract operations require a small fee to compensate network nodes.',
      bridge_explanation: 'The G → C Bridge lets you send funds from a classic Stellar G-address to a Soroban C-address. This is useful if you already have XLM or other assets on Stellar and want to use them in Soroban dApps.',
      onramp_explanation: 'The Fiat Onramp lets you buy crypto with a credit card and send it directly to your C-address. This is the easiest way to get started if you do not already have Stellar assets.',
      cex_explanation: 'CEX Withdrawal lets you withdraw funds directly from a centralized exchange to your C-address. This avoids the need to first withdraw to a G-address and then bridge.',
      close: 'Close',
      keyboard_hint: 'Use Tab to navigate, Enter to select, Escape to close',
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
      help: 'Ayuda',
      search_help: 'Buscar ayuda...',
      no_results: 'No se encontraron resultados',
    },
    bridge: {
      title: 'Transferir Activos',
      source_network: 'Red de Origen',
      destination_network: 'Red de Destino',
      amount: 'Cantidad',
      transfer: 'Transferir',
      insufficient_balance: 'Saldo insuficiente',
    },
    help: {
      title: 'Centro de Ayuda',
      search_placeholder: 'Buscar ayuda...',
      c_address_explanation: 'Una C-address es una cuenta inteligente Soroban. Comienza con C y tiene 56 caracteres. A diferencia de una G-address, es un contrato inteligente que puede mantener activos y ejecutar lógica en la red Soroban.',
      g_address_explanation: 'Una G-address es una cuenta clásica de Stellar. Comienza con G y tiene 56 caracteres. Es el tipo de cuenta estándar en Stellar y puede financiar C-addresses.',
      fee_explanation: 'Las tarifas se pagan en XLM para cubrir el costo de la transacción en la red Stellar. Las operaciones de contratos inteligentes Soroban requieren una pequeña tarifa para compensar los nodos de la red.',
      bridge_explanation: 'El Puente G → C te permite enviar fondos desde una G-address clásica de Stellar a una C-address Soroban. Esto es útil si ya tienes XLM u otros activos en Stellar y quieres usarlos en dApps de Soroban.',
      onramp_explanation: 'El Onramp Fiat te permite comprar criptomonedas con una tarjeta de crédito y enviarlas directamente a tu C-address. Esta es la forma más fácil de empezar si no tienes activos de Stellar.',
      cex_explanation: 'El Retiro CEX te permite retirar fondos directamente desde un exchange centralizado a tu C-address. Esto evita la necesidad de retirar primero a una G-address y luego hacer un puente.',
      close: 'Cerrar',
      keyboard_hint: 'Usa Tab para navegar, Enter para seleccionar, Escape para cerrar',
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
      help: 'Aide',
      search_help: 'Rechercher de l\'aide...',
      no_results: 'Aucun résultat trouvé',
    },
    bridge: {
      title: 'Transférer des Actifs',
      source_network: 'Réseau Source',
      destination_network: 'Réseau de Destination',
      amount: 'Montant',
      transfer: 'Transférer',
      insufficient_balance: 'Solde insuffisant',
    },
    help: {
      title: 'Centre d\'Aide',
      search_placeholder: 'Rechercher de l\'aide...',
      c_address_explanation: 'Une C-address est un compte intelligent Soroban. Elle commence par C et fait 56 caractères. Contrairement à une G-address, c\'est un contrat intelligent qui peut détenir des actifs et exécuter de la logique sur le réseau Soroban.',
      g_address_explanation: 'Une G-address est un compte classique Stellar. Elle commence par G et fait 56 caractères. C\'est le type de compte standard sur Stellar et peut financer des C-addresses.',
      fee_explanation: 'Les frais sont payés en XLM pour couvrir le coût de la transaction sur le réseau Stellar. Les opérations de contrats intelligents Soroban nécessitent de petits frais pour compenser les nœuds du réseau.',
      bridge_explanation: 'Le Pont G → C vous permet d\'envoyer des fonds d\'une G-address classique Stellar vers une C-address Soroban. C\'est utile si vous avez déjà des XLM ou autres actifs sur Stellar et que vous voulez les utiliser dans des dApps Soroban.',
      onramp_explanation: 'L\'Onramp Fiat vous permet d\'acheter des crypto-monnaies avec une carte de crédit et de les envoyer directement à votre C-address. C\'est le moyen le plus simple de commencer si vous n\'avez pas encore d\'actifs Stellar.',
      cex_explanation: 'Le Retrait CEX vous permet de retirer des fonds directement d\'un exchange centralisé vers votre C-address. Cela évite de devoir d\'abord retirer vers une G-address puis faire un pont.',
      close: 'Fermer',
      keyboard_hint: 'Utilisez Tab pour naviguer, Entrée pour sélectionner, Échap pour fermer',
    },
    onboarding: {
      welcome: 'Bienvenue sur C-Address',
      connect_step: 'Connectez votre portefeuille pour commencer.',
      verify_step: 'Complétez la vérification d\'identité.',
      complete: 'Commencer',
      skip: 'Passer',
    },
    errors: {
      wallet_not_found: 'Installez un portefeuille Stellar pour continuer.',
      connection_failed: 'Impossible de se connecter à votre portefeuille.',
      network_mismatch: 'Veuillez changer de réseau.',
      transaction_failed: 'La transaction a échoué. Veuillez réessayer.',
      invalid_address: 'L\'adresse n\'est pas valide.',
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
      help: 'Ajuda',
      search_help: 'Buscar ajuda...',
      no_results: 'Nenhum resultado encontrado',
    },
    bridge: {
      title: 'Transferir Ativos',
      source_network: 'Rede de Origem',
      destination_network: 'Rede de Destino',
      amount: 'Valor',
      transfer: 'Transferir',
      insufficient_balance: 'Saldo insuficiente',
    },
    help: {
      title: 'Central de Ajuda',
      search_placeholder: 'Buscar ajuda...',
      c_address_explanation: 'Uma C-address é uma conta inteligente Soroban. Começa com C e tem 56 caracteres. Ao contrário de uma G-address, é um contrato inteligente que pode manter ativos e executar lógica na rede Soroban.',
      g_address_explanation: 'Uma G-address é uma conta clássica Stellar. Começa com G e tem 56 caracteres. É o tipo de conta padrão no Stellar e pode financiar C-addresses.',
      fee_explanation: 'As taxas são pagas em XLM para cobrir o custo da transação na rede Stellar. Operações de contratos inteligentes Soroban requerem uma pequena taxa para compensar os nós da rede.',
      bridge_explanation: 'A Ponte G → C permite enviar fundos de uma G-address clássica Stellar para uma C-address Soroban. Isso é útil se você já tem XLM ou outros ativos no Stellar e quer usá-los em dApps Soroban.',
      onramp_explanation: 'O Onramp Fiat permite comprar criptomoedas com cartão de crédito e enviá-las diretamente para sua C-address. Esta é a maneira mais fácil de começar se você ainda não tem ativos Stellar.',
      cex_explanation: 'A Retirada CEX permite retirar fundos diretamente de uma exchange centralizada para sua C-address. Isso evita a necessidade de primeiro retirar para uma G-address e depois fazer uma ponte.',
      close: 'Fechar',
      keyboard_hint: 'Use Tab para navegar, Enter para selecionar, Escape para fechar',
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
  const entry = translations[locale];
  if (!entry) return translations[DEFAULT_LOCALE];
  return entry;
}

/**
 * Translate a dot-path key like 'common.connect_wallet'.
 */
export function t(locale: Locale, key: string): string {
  const parts = key.split('.');
  let current: unknown = getTranslations(locale);
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

/**
 * Detect locale from browser or fallback to default.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const browser = window.navigator.language.slice(0, 2).toLowerCase();
  return SUPPORTED_LOCALES.includes(browser as Locale) ? (browser as Locale) : DEFAULT_LOCALE;
}

/**
 * Format a number for the given locale.
 */
export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format a currency amount for the given locale.
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
