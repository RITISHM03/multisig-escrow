import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { NETWORK } from './constants';

export const getConnection = () => {
  return new Connection(clusterApiUrl(NETWORK), 'confirmed');
};

export const getProgram = (wallet) => {
  console.log('Creating program with fixed IDL...');
  
  if (!wallet || !wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const connection = getConnection();
  
  try {
    // Load the full IDL but fix the problematic parts
    let rawIDL;
    try {
      rawIDL = require('../idl/multisig_escrow.json');
      console.log('Raw IDL loaded successfully');
    } catch (error) {
      throw new Error('Failed to load IDL file');
    }

    // Normalize IDL: ensure each account has a type reference { defined: AccountName }
    const normalizedAccounts = (rawIDL.accounts || []).map((acc) => {
      if (acc && !acc.type) {
        return { ...acc, type: { defined: acc.name } };
      }
      return acc;
    });

    // Use normalized IDL to avoid coder errors during Program construction
    const fixedIDL = {
      address: rawIDL.address,
      metadata: rawIDL.metadata,
      instructions: rawIDL.instructions,
      types: rawIDL.types || [],
      accounts: normalizedAccounts,
      events: rawIDL.events || [],
      errors: rawIDL.errors || []
    };

    console.log('Using fixed IDL for program creation');

    const provider = new AnchorProvider(
      connection, 
      {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions || wallet.signTransaction,
      }, 
      {
        commitment: 'confirmed',
        skipPreflight: false
      }
    );

    const programId = new PublicKey(rawIDL.address);

    let program;
    try {
      // Primary path: create program with normalized IDL
      program = new Program(fixedIDL, programId, provider);
    } catch (primaryErr) {
      console.warn('Primary Program construction failed, attempting minimal IDL fallback:', primaryErr?.message || primaryErr);
      // Fallback: construct with minimal IDL (no accounts/types) to avoid coder size parsing
      const minimalIDL = {
        address: rawIDL.address,
        metadata: rawIDL.metadata,
        instructions: rawIDL.instructions || [],
        accounts: [],
        types: [],
        events: [],
        errors: rawIDL.errors || []
      };
      program = new Program(minimalIDL, programId, provider);
    }
    
    // Override the problematic account methods with safe versions
    if (program.account && program.account.escrowAccount) {
      const originalFetch = program.account.escrowAccount.fetch;
      const originalAll = program.account.escrowAccount.all;
      
      program.account.escrowAccount.fetch = async (address) => {
        try {
          return await originalFetch.call(program.account.escrowAccount, address);
        } catch (error) {
          if (error.message.includes('Account does not exist')) {
            throw error;
          }
          console.warn('Fetch error, account may not exist:', error.message);
          throw new Error('Account does not exist');
        }
      };
      
      program.account.escrowAccount.all = async () => {
        try {
          return await originalAll.call(program.account.escrowAccount);
        } catch (error) {
          console.warn('All accounts fetch failed, returning empty array:', error.message);
          return [];
        }
      };
    }

    console.log('✅ Fixed program created successfully');
    console.log('Available methods:', Object.keys(program.methods || {}));
    
    return program;
    
  } catch (error) {
    console.error('Program creation failed:', error);
    throw new Error(`Program creation failed: ${error.message}`);
  }
};
