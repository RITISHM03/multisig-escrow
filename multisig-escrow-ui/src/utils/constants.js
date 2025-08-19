import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('HQwzh6fp5GmYvKyy9j9nNXBJWtZnkcNQqjbqaSAGPCnG');
export const NETWORK = 'devnet';

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const RENT_SYSVAR_ID = new PublicKey('SysvarRent111111111111111111111111111111111');

export const ESCROW_SEED = 'escrow';
export const VAULT_SEED = 'vault';

export const getConnection = () => {
  return new Connection(clusterApiUrl(NETWORK), 'confirmed');
};
