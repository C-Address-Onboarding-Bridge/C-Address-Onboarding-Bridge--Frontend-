/**
 * Minimal stub for @stellar/freighter-api so tests that transitively import
 * src/lib/stellar.ts can resolve the module without the real package being
 * installed. The app moved to @creit.tech/stellar-wallets-kit; this stub
 * prevents test-collection failures until the import in stellar.ts is removed.
 */
export const getNetwork = async () => ({ network: "TESTNET", networkPassphrase: "", error: "" });
export const getAddress = async () => ({ address: "", error: "" });
export const isConnected = async () => ({ isConnected: false, error: "" });
export const signTransaction = async (_xdr: string) => ({ signedTxXdr: _xdr, signerAddress: "", error: "" });
