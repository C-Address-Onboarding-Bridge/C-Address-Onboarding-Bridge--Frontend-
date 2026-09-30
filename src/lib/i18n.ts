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
    disconnectWalletLabel: string;
    disconnectWallet: string;
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
    subtitle: string;
    from_label: string;
    to_label: string;
    amount_label: string;
    amount_placeholder: string;
    max: string;
    maxLabel: string;
    available: string;
    estimated_fee: string;
    you_receive: string;
    review_transfer: string;
    confirm_transfer: string;
    connect_first: string;
    enter_amount: string;
    invalid_amount: string;
    amount_required: string;
    bridge_success: string;
    bridge_failed: string;
    wallet_required: string;
    network_required: string;
    loading_balance: string;
    refresh_balance: string;
    refreshBalanceLabel: string;
    back_to_home: string;
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
  profile: {
    title: string;
    accountOverview: string;
    walletAddress: string;
    copyAddress: string;
    addressCopied: string;
    copyFailed: string;
    network: string;
    balance: string;
    assets: string;
    noAssets: string;
    transactionHistory: string;
    noTransactions: string;
    settings: string;
    language: string;
    notifications: string;
    security: string;
    editProfile: string;
    saveChanges: string;
    profileSaved: string;
    profileSaveFailed: string;
    loadFailed: string;
    retry: string;
    connectedSince: string;
    unknownNetwork: string;
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
      disconnectWalletLabel: 'Disconnect wallet',
      disconnectWallet: 'Disconnect Wallet',
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
      subtitle: 'Move funds from a classic Stellar G-address to a Soroban C-address.',
      from_label: 'From',
      to_label: 'To',
      amount_label: 'Amount',
      amount_placeholder: '0.00',
      max: 'Max',
      maxLabel: 'Use maximum amount',
      available: 'Available',
      estimated_fee: 'Estimated fee',
      you_receive: 'You receive',
      review_transfer: 'Review Transfer',
      confirm_transfer: 'Confirm Transfer',
      connect_first: 'Connect your wallet to bridge assets.',
      enter_amount: 'Enter an amount to continue.',
      invalid_amount: 'Please enter a valid amount.',
      amount_required: 'Amount is required.',
      bridge_success: 'Transfer submitted successfully.',
      bridge_failed: 'Transfer failed. Please try again.',
      wallet_required: 'A connected wallet is required.',
      network_required: 'Please select a network.',
      loading_balance: 'Loading balance...',
      refresh_balance: 'Refresh balance',
      refreshBalanceLabel: 'Refresh balance',
      back_to_home: 'Back to home',
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
    profile: {
      title: 'Profile',
      accountOverview: 'Account Overview',
      walletAddress: 'Wallet Address',
      copyAddress: 'Copy address',
      addressCopied: 'Address copied to clipboard',
      copyFailed: 'Could not copy address',
      network: 'Network',
      balance: 'Balance',
      assets: 'Assets',
      noAssets: 'No assets found',
      transactionHistory: 'Transaction History',
      noTransactions: 'No transactions yet',
      settings: 'Settings',
      language: 'Language',
      notifications: 'Notifications',
      security: 'Security',
      editProfile: 'Edit Profile',
      saveChanges: 'Save Changes',
      profileSaved: 'Profile saved',
      profileSaveFailed: 'Could not save profile',
      loadFailed: 'Could not load profile',
      retry: 'Retry',
      connectedSince: 'Connected since',
      unknownNetwork: 'Unknown network',
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
      disconnectWalletLabel: 'Desconectar billetera',
      disconnectWallet: 'Desconectar billetera',
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
      subtitle: 'Mueve fondos desde una G-address clásica de Stellar a una C-address Soroban.',
      from_label: 'Desde',
      to_label: 'Hacia',
      amount_label: 'Cantidad',
      amount_placeholder: '0,00',
      max: 'Máx',
      maxLabel: 'Usar cantidad máxima',
      available: 'Disponible',
      estimated_fee: 'Tarifa estimada',
      you_receive: 'Recibirás',
      review_transfer: 'Revisar transferencia',
      confirm_transfer: 'Confirmar transferencia',
      connect_first: 'Conecta tu billetera para transferir activos.',
      enter_amount: 'Introduce una cantidad para continuar.',
      invalid_amount: 'Introduce una cantidad válida.',
      amount_required: 'La cantidad es obligatoria.',
      bridge_success: 'Transferencia enviada correctamente.',
      bridge_failed: 'La transferencia falló. Inténtalo de nuevo.',
      wallet_required: 'Se requiere una billetera conectada.',
      network_required: 'Selecciona una red.',
      loading_balance: 'Cargando saldo...',
      refresh_balance: 'Actualizar saldo',
      refreshBalanceLabel: 'Actualizar saldo',
      back_to_home: 'Volver al inicio',
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
    profile: {
      title: 'Perfil',
      accountOverview: 'Resumen de la Cuenta',
      walletAddress: 'Dirección de la Billetera',
      copyAddress: 'Copiar dirección',
      addressCopied: 'Dirección copiada al portapapeles',
      copyFailed: 'No se pudo copiar la dirección',
      network: 'Red',
      balance: 'Saldo',
      assets: 'Activos',
      noAssets: 'No se encontraron activos',
      transactionHistory: 'Historial de Transacciones',
      noTransactions: 'Aún no hay transacciones',
      settings: 'Configuración',
      language: 'Idioma',
      notifications: 'Notificaciones',
      security: 'Seguridad',
      editProfile: 'Editar Perfil',
      saveChanges: 'Guardar Cambios',
      profileSaved: 'Perfil guardado',
      profileSaveFailed: 'No se pudo guardar el perfil',
      loadFailed: 'No se pudo cargar el perfil',
      retry: 'Reintentar',
      connectedSince: 'Conectado desde',
      unknownNetwork: 'Red desconocida',
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
      disconnectWalletLabel: 'Déconnecter le portefeuille',
      disconnectWallet: 'Déconnecter le portefeuille',
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
      subtitle: 'Déplacez des fonds d\'une G-address Stellar classique vers une C-address Soroban.',
      from_label: 'Depuis',
      to_label: 'Vers',
      amount_label: 'Montant',
      amount_placeholder: '0,00',
      max: 'Max',
      maxLabel: 'Utiliser le montant maximum',
      available: 'Disponible',
      estimated_fee: 'Frais estimés',
      you_receive: 'Vous recevez',
      review_transfer: 'Vérifier le transfert',
      confirm_transfer: 'Confirmer le transfert',
      connect_first: 'Connectez votre portefeuille pour transférer des actifs.',
      enter_amount: 'Saisissez un montant pour continuer.',
      invalid_amount: 'Veuillez saisir un montant valide.',
      amount_required: 'Le montant est requis.',
      bridge_success: 'Transfert envoyé avec succès.',
      bridge_failed: 'Le transfert a échoué. Veuillez réessayer.',
      wallet_required: 'Un portefeuille connecté est requis.',
      network_required: 'Veuillez sélectionner un réseau.',
      loading_balance: 'Chargement du solde...',
      refresh_balance: 'Actualiser le solde',
      refreshBalanceLabel: 'Actualiser le solde',
      back_to_home: 'Retour à l\'accueil',
    },
    help: {
      title: 'Centre d\'Aide',
      search_placeholder: 'Rechercher de l\'aide...',
      c_address_explanation: 'Une C-address est un compte intelligent Soroban. Elle commence par C et comporte 56 caractères. Contrairement à une G-address, il s\'agit d\'un contrat intelligent qui peut détenir des actifs et exécuter de la logique sur le réseau Soroban.',
      g_address_explanation: 'Une G-address est un compte Stellar classique. Elle commence par G et comporte 56 caractères. C\'est le type de compte standard sur Stellar et elle peut financer des C-addresses.',
      fee_explanation: 'Les frais sont payés en XLM pour couvrir le coût de la transaction sur le réseau Stellar. Les opérations de contrats intelligents Soroban nécessitent des frais réduits pour compenser les nœuds du réseau.',
      bridge_explanation: 'Le Pont G → C vous permet d\'envoyer des fonds depuis une G-address Stellar classique vers une C-address Soroban. C\'est utile si vous possédez déjà des XLM ou d\'autres actifs sur Stellar et souhaitez les utiliser dans des dApps Soroban.',
      onramp_explanation: 'L\'Onramp Fiat vous permet d\'acheter des cryptomonnaies par carte de crédit et de les envoyer directement à votre C-address. C\'est le moyen le plus simple de commencer si vous ne possédez pas encore d\'actifs Stellar.',
      cex_explanation: 'Le Retrait CEX vous permet de retirer des fonds directement d\'un exchange centralisé vers votre C-address. Cela évite de devoir d\'abord retirer vers une G-address puis effectuer un pont.',
      close: 'Fermer',
      keyboard_hint: 'Utilisez Tab pour naviguer, Entrée pour sélectionner, Échap pour fermer',
    },
    onboarding: {
      welcome: 'Bienvenue sur C-Address',
      connect_step: 'Connectez votre portefeuille pour commencer.',
      verify_step: 'Complétez la vérification d\'identité.',
      complete: 'Commencer',
      skip: 'Ignorer',
    },
    profile: {
      title: 'Profil',
      accountOverview: 'Aperçu du Compte',
      walletAddress: 'Adresse du Portefeuille',
      copyAddress: 'Copier l\'adresse',
      addressCopied: 'Adresse copiée dans le presse-papiers',
      copyFailed: 'Impossible de copier l\'adresse',
      network: 'Réseau',
      balance: 'Solde',
      assets: 'Actifs',
      noAssets: 'Aucun actif trouvé',
      transactionHistory: 'Historique des Transactions',
      noTransactions: 'Aucune transaction pour le moment',
      settings: 'Paramètres',
      language: 'Langue',
      notifications: 'Notifications',
      security: 'Sécurité',
      editProfile: 'Modifier le Profil',
      saveChanges: 'Enregistrer les Modifications',
      profileSaved: 'Profil enregistré',
      profileSaveFailed: 'Impossible d\'enregistrer le profil',
      loadFailed: 'Impossible de charger le profil',
      retry: 'Réessayer',
      connectedSince: 'Connecté depuis',
      unknownNetwork: 'Réseau inconnu',
    },
    errors: {
      wallet_not_found: 'Veuillez installer un portefeuille Stellar pour continuer.',
      connection_failed: 'Impossible de se connecter à votre portefeuille.',
      network_mismatch: 'Veuillez passer au réseau correct.',
      transaction_failed: 'La transaction a échoué. Veuillez réessayer.',
      invalid_address: 'L\'adresse n\'est pas valide.',
    },
  },
  pt: {
    common: {
      connect_wallet: 'Conectar Carteira',
      disconnect: 'Desconectar',
      disconnectWalletLabel: 'Desconectar carteira',
      disconnectWallet: 'Desconectar carteira',
      loading: 'Carregando...',
      error: 'Erro',
      success: 'Sucesso',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      back: 'Voltar',
      next: 'Próximo',
      submit: 'Enviar',
      help: 'Ajuda',
      search_help: 'Pesquisar ajuda...',
      no_results: 'Nenhum resultado encontrado',
    },
    bridge: {
      title: 'Transferir Ativos',
      source_network: 'Rede de Origem',
      destination_network: 'Rede de Destino',
      amount: 'Quantia',
      transfer: 'Transferir',
      insufficient_balance: 'Saldo insuficiente',
      subtitle: 'Mova fundos de uma G-address clássica da Stellar para uma C-address Soroban.',
      from_label: 'De',
      to_label: 'Para',
      amount_label: 'Valor',
      amount_placeholder: '0,00',
      max: 'Máx',
      maxLabel: 'Usar valor máximo',
      available: 'Disponível',
      estimated_fee: 'Taxa estimada',
      you_receive: 'Você recebe',
      review_transfer: 'Revisar transferência',
      confirm_transfer: 'Confirmar transferência',
      connect_first: 'Conecte sua carteira para transferir ativos.',
      enter_amount: 'Insira um valor para continuar.',
      invalid_amount: 'Insira um valor válido.',
      amount_required: 'O valor é obrigatório.',
      bridge_success: 'Transferência enviada com sucesso.',
      bridge_failed: 'A transferência falhou. Tente novamente.',
      wallet_required: 'É necessária uma carteira conectada.',
      network_required: 'Selecione uma rede.',
      loading_balance: 'Carregando saldo...',
      refresh_balance: 'Atualizar saldo',
      refreshBalanceLabel: 'Atualizar saldo',
      back_to_home: 'Voltar ao início',
    },
    help: {
      title: 'Central de Ajuda',
      search_placeholder: 'Pesquisar ajuda...',
      c_address_explanation: 'Uma C-address é uma conta inteligente Soroban. Ela começa com C e tem 56 caracteres. Diferente de uma G-address, é um contrato inteligente que pode manter ativos e executar lógica na rede Soroban.',
      g_address_explanation: 'Uma G-address é uma conta clássica da Stellar. Ela começa com G e tem 56 caracteres. É o tipo de conta padrão na Stellar e pode financiar C-addresses.',
      fee_explanation: 'As taxas são pagas em XLM para cobrir o custo da transação na rede Stellar. As operações de contratos inteligentes Soroban exigem uma pequena taxa para compensar os nós da rede.',
      bridge_explanation: 'A Ponte G → C permite enviar fundos de uma G-address clássica da Stellar para uma C-address Soroban. Isso é útil se você já tem XLM ou outros ativos na Stellar e quer usá-los em dApps Soroban.',
      onramp_explanation: 'O Onramp Fiat permite comprar criptomoedas com cartão de crédito e enviá-las diretamente para sua C-address. Esta é a maneira mais fácil de começar se você ainda não tem ativos Stellar.',
      cex_explanation: 'O Saque CEX permite sacar fundos diretamente de uma exchange centralizada para sua C-address. Isso evita a necessidade de primeiro sacar para uma G-address e depois fazer a ponte.',
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
    profile: {
      title: 'Perfil',
      accountOverview: 'Visão Geral da Conta',
      walletAddress: 'Endereço da Carteira',
      copyAddress: 'Copiar endereço',
      addressCopied: 'Endereço copiado para a área de transferência',
      copyFailed: 'Não foi possível copiar o endereço',
      network: 'Rede',
      balance: 'Saldo',
      assets: 'Ativos',
      noAssets: 'Nenhum ativo encontrado',
      transactionHistory: 'Histórico de Transações',
      noTransactions: 'Ainda não há transações',
      settings: 'Configurações',
      language: 'Idioma',
      notifications: 'Notificações',
      security: 'Segurança',
      editProfile: 'Editar Perfil',
      saveChanges: 'Salvar Alterações',
      profileSaved: 'Perfil salvo',
      profileSaveFailed: 'Não foi possível salvar o perfil',
      loadFailed: 'Não foi possível carregar o perfil',
      retry: 'Tentar novamente',
      connectedSince: 'Conectado desde',
      unknownNetwork: 'Rede desconhecida',
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

export function getTranslations(locale: Locale): TranslationSet {
  return translations[locale] ?? translations[DEFAULT_LOCALE];
}

export function t(locale: Locale, key: string): string {
  const set = getTranslations(locale);
  const parts = key.split('.');
  let current: unknown = set;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}
