import { 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction 
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';

export const createInitializeInstruction = (params) => {
  const {
    escrowPda,
    depositor,
    depositorTokenAccount,
    escrowVault,
    mint,
    recipient,
    amount,
    requiredSignatures,
    signers,
    programId
  } = params;

  // Get the instruction discriminator from your IDL
  // The initialize instruction discriminator from your IDL
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
  
  // Encode the instruction data
  const recipientBytes = recipient.toBytes();
  const amountBytes = new BN(amount).toArray('le', 8);
  const requiredSigsBytes = new BN(requiredSignatures).toArray('le', 4);
  const signersCountBytes = new BN(signers.length).toArray('le', 4);
  
  // Flatten all signer public keys
  const signersBytes = signers.reduce((acc, signer) => {
    return acc.concat(Array.from(signer.toBytes()));
  }, []);

  const instructionData = Buffer.concat([
    discriminator,
    Buffer.from(recipientBytes),
    Buffer.from(amountBytes),
    Buffer.from(requiredSigsBytes),
    Buffer.from(signersCountBytes),
    Buffer.from(signersBytes)
  ]);

  const keys = [
    { pubkey: escrowPda, isSigner: false, isWritable: true },
    { pubkey: depositor, isSigner: true, isWritable: true },
    { pubkey: depositorTokenAccount, isSigner: false, isWritable: true },
    { pubkey: escrowVault, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data: instructionData,
  });
};
