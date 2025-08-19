import { 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  Transaction
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { getConnection } from './constants';
import { getProgram } from './program';
import { PROGRAM_ID } from './constants';

export const createEscrowWithAnchorCoder = async (wallet, params) => {
  const {
    recipientPubkey,
    amount,
    requiredSignatures,
    signersPubkeys,
    mintPubkey,
    escrowPda,
    vaultPda,
    depositorTokenAccount
  } = params;

  console.log('Creating escrow with CORRECTED parameter encoding...');

  const connection = getConnection();

  try {
    // Check if an escrow with these seeds already exists
    try {
      const existingEscrowInfo = await connection.getAccountInfo(escrowPda);
      if (existingEscrowInfo) {
        throw new Error('Escrow account already exists for this depositor and recipient. Cancel it first or change parameters.');
      }
    } catch (escrowExistCheckErr) {
      if (escrowExistCheckErr.message.includes('already exists')) {
        throw escrowExistCheckErr;
      }
      // Ignore network blips; continue if account truly not found
    }
    // Sanity checks: depositor token account exists, correct mint, and sufficient balance
    try {
      console.log('Verifying depositor token account and balance...');
      const parsedInfo = await connection.getParsedAccountInfo(depositorTokenAccount);
      if (!parsedInfo.value) {
        throw new Error('Depositor token account does not exist. You need an associated token account for the specified mint with sufficient balance.');
      }
      const data = parsedInfo.value.data;
      if (data?.program !== 'spl-token' || !data?.parsed) {
        throw new Error('Depositor token account is not an SPL Token account.');
      }
      const mintOnAccount = data.parsed.info.mint;
      const ownerOnAccount = data.parsed.info.owner;
      const amountRaw = data.parsed.info.tokenAmount.amount; // string
      console.log('Depositor ATA check:', { mintOnAccount, ownerOnAccount, amountRaw });
      if (mintOnAccount !== mintPubkey.toString()) {
        throw new Error('Depositor token account mint does not match the provided mint.');
      }
      if (ownerOnAccount !== wallet.publicKey.toString()) {
        throw new Error('Depositor token account owner mismatch.');
      }
      const requested = BN.isBN(amount) ? amount : new BN(amount);
      if (new BN(amountRaw).lt(requested)) {
        throw new Error('Insufficient token balance in depositor token account.');
      }
    } catch (precheckErr) {
      console.error('Pre-check failed:', precheckErr?.message || precheckErr);
      throw precheckErr;
    }

    // Prefer Anchor Program client to build and send the transaction to avoid manual buffer issues
    try {
      console.log('Attempting escrow initialize via Anchor Program client...');
      const program = getProgram({
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions || wallet.signTransaction,
      });

      const amountU64 = BN.isBN(amount) ? amount : new BN(amount);
      const requiredSigsU8 = Number(requiredSignatures);
      if (!Number.isInteger(requiredSigsU8) || requiredSigsU8 < 1 || requiredSigsU8 > 255) {
        throw new Error(`required_signatures invalid u8: ${requiredSigsU8}`);
      }

      // Build method and run Anchor simulate first to capture on-chain logs
      const methodBuilder = program.methods
        .initialize(recipientPubkey, amountU64, requiredSigsU8, signersPubkeys)
        .accounts({
          escrow: escrowPda,
          depositor: wallet.publicKey,
          depositorTokenAccount,
          escrowVault: vaultPda,
          mint: mintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        });

      try {
        const sim = await methodBuilder.simulate();
        if (sim?.logs?.length) {
          console.log('Program simulate logs (preflight):');
          sim.logs.forEach((l, i) => console.log(`${i}: ${l}`));
        }
      } catch (simErr) {
        console.error('Anchor simulate failed (preflight):', simErr);
        throw new Error(`Preflight simulation failed: ${simErr?.message || simErr}`);
      }

      const tx = await methodBuilder.transaction();

      const connection = getConnection();
      const signature = await (wallet.sendTransaction
        ? wallet.sendTransaction(tx, connection, { preflightCommitment: 'confirmed', skipPreflight: false })
        : program.provider.sendAndConfirm?.(tx, [], { commitment: 'confirmed' }));

      if (!signature) {
        throw new Error('No signature returned from wallet/provider');
      }

      const latest = await connection.getLatestBlockhash('confirmed');
      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        }, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      } catch (confirmErr) {
        try {
          const txMeta = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
          if (txMeta?.meta?.logMessages?.length) {
            console.error('On-chain logs for failed confirmation:');
            txMeta.meta.logMessages.forEach((l, i) => console.error(`${i}: ${l}`));
          }
        } catch {}
        throw confirmErr;
      }

      console.log('✅ Escrow created via Anchor Program client');
      return signature;
    } catch (anchorPathError) {
      console.warn('Anchor client path failed, falling back to manual instruction encoding:', anchorPathError?.message || anchorPathError);
    }
    // First, try using Anchor Program API directly (most reliable)
    try {
      console.log('Attempting initialize via Anchor Program API...');
      const program = getProgram({
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions || wallet.signTransaction,
      });

      const txSig = await program.methods
        .initialize(recipientPubkey, new BN(amount), Number(requiredSignatures), signersPubkeys)
        .accounts({
          escrow: escrowPda,
          depositor: wallet.publicKey,
          depositorTokenAccount,
          escrowVault: vaultPda,
          mint: mintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log('✅ Escrow created via Anchor Program API');
      return txSig;
    } catch (anchorErr) {
      console.warn('Anchor Program API path failed, falling back to manual encoding:', anchorErr);
    }

    // Load your IDL
    const IDL = require('../idl/multisig_escrow.json');
    
    console.log('IDL loaded for instruction encoding');
    
    // CRITICAL DEBUG: Check what your IDL expects for the initialize instruction
    const initializeInstruction = IDL.instructions.find(ix => ix.name === 'initialize');
    if (initializeInstruction) {
      console.log('📋 IDL initialize instruction structure:', {
        name: initializeInstruction.name,
        args: initializeInstruction.args.map(arg => ({
          name: arg.name,
          type: arg.type
        }))
      });
    }
    
    // Create Anchor's instruction coder
    const instructionCoder = new BorshInstructionCoder(IDL);
    
    // CRITICAL FIX: Ensure requiredSignatures is the correct type and value
    console.log('🔍 Parameter debugging BEFORE encoding:', {
      recipient: recipientPubkey.toString(),
      amount: amount.toString(),
      requiredSignatures: requiredSignatures,
      requiredSignaturesType: typeof requiredSignatures,
      requiredSignaturesValue: Number(requiredSignatures),
      signersCount: signersPubkeys.length,
      signers: signersPubkeys.map(s => s.toString())
    });

    // BULLETPROOF: Double-check requiredSignatures value
    if (!requiredSignatures || requiredSignatures < 1) {
      throw new Error(`CRITICAL: requiredSignatures is invalid: ${requiredSignatures}. This should never happen after validation.`);
    }

    // FIXED: Use exact parameter names and types that match your Rust program
    // Check your Rust program's initialize function to see the exact parameter names
    const instructionArgs = {
      recipient: recipientPubkey,
      amount: new BN(amount),
      requiredSignatures: Number(requiredSignatures), // Ensure it's a JavaScript number
      signers: signersPubkeys
    };
    
    console.log('✅ Fixed instruction arguments BEFORE encoding:', {
      recipient: instructionArgs.recipient.toString(),
      amount: instructionArgs.amount.toString(),
      requiredSignatures: instructionArgs.requiredSignatures,
      requiredSignaturesType: typeof instructionArgs.requiredSignatures,
      signers: instructionArgs.signers.map(s => s.toString())
    });

    // Encode using Anchor's instruction coder with correct snake_case arg names
    let instructionData;
    try {
      const requiredSigsValue = Number(requiredSignatures);
      instructionData = instructionCoder.encode('initialize', {
        recipient: recipientPubkey,
        amount: new BN(amount),
        required_signatures: requiredSigsValue,
        signers: signersPubkeys,
      });
      console.log('✅ Instruction data encoded via Anchor coder', { length: instructionData.length });
    } catch (encodeErr) {
      console.error('Anchor coder encode failed, falling back to manual encoding:', encodeErr);
      // Fallback to manual encoding
    const discriminator = Buffer.from(initializeInstruction.discriminator);
    const recipientBytes = recipientPubkey.toBytes();
    const amountBytes = Buffer.alloc(8);
    new BN(amount).toArrayLike(Buffer, 'le', 8).copy(amountBytes);
      const requiredSigsBytes = Buffer.alloc(1);
    const requiredSigsValue = Number(requiredSignatures);
      if (requiredSigsValue < 1 || requiredSigsValue > 255) {
        throw new Error(`required_signatures out of range for u8: ${requiredSigsValue}`);
      }
      requiredSigsBytes.writeUInt8(requiredSigsValue, 0);
    const signersLengthBytes = Buffer.alloc(4);
    signersLengthBytes.writeUInt32LE(signersPubkeys.length, 0);
    const signersBytes = Buffer.concat(signersPubkeys.map(signer => Buffer.from(signer.toBytes())));
    const manualInstructionData = Buffer.concat([
      discriminator,
      Buffer.from(recipientBytes),
      amountBytes,
      requiredSigsBytes,
      signersLengthBytes,
      signersBytes
    ]);
      console.log('📦 Manual instruction data created (fallback):', {
      totalLength: manualInstructionData.length,
      discriminatorLength: discriminator.length,
      recipientLength: recipientBytes.length,
      amountLength: amountBytes.length,
      requiredSigsLength: requiredSigsBytes.length,
        requiredSigsValue: requiredSigsBytes.readUInt8(0),
      signersLengthLength: signersLengthBytes.length,
        signersBytesLength: signersBytes.length,
        signersCount: signersPubkeys.length,
      });
      instructionData = manualInstructionData;
    }

    // Account keys must match IDL order for initialize
    // IDL order: escrow (w), depositor (w, s), depositor_token_account (w), escrow_vault (w), mint, token_program, system_program, rent
    const keys = [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: depositorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    console.log('Account keys prepared:', keys.length);

    // Create transaction instruction
    const instruction = new TransactionInstruction({
      keys,
      programId: PROGRAM_ID,
      data: instructionData,
    });

    // Create transaction with proper structure
    const transaction = new Transaction();
    transaction.add(instruction);

    // Always set a fresh blockhash and fee payer for consistency
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = wallet.publicKey;

    // Proceed to wallet signing/sending; unsigned preflight simulation can fail in some web3 versions

    // Try manual sign + simulate + send path first for best diagnostics
    if (wallet.signTransaction) {
      try {
        console.log('Requesting wallet signature (manual path)...');
        const signedTransaction = await wallet.signTransaction(transaction);
        console.log('Signed. Simulating with signature...');
        const sim = await connection.simulateTransaction(signedTransaction, { commitment: 'confirmed' });
        if (sim.value.err) {
          console.error('Simulation with signature failed:', sim.value.err);
          sim.value.logs?.forEach((log, i) => console.error(`${i}: ${log}`));
          throw new Error(`Simulation after signing failed: ${JSON.stringify(sim.value.err)}`);
        }
        console.log('Simulation passed. Sending raw transaction...');
        const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed',
        });
        console.log('Sent. Confirming...', signature);
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        console.log('✅ Escrow created successfully');
        return signature;
      } catch (signPathErr) {
        console.warn('Manual sign+send path failed, falling back to wallet.sendTransaction if available:', signPathErr);
      }
    }

    // Fallback: use wallet.sendTransaction if provided
    if (wallet.sendTransaction) {
      try {
        console.log('Sending transaction via wallet.sendTransaction (fallback)');
        const signature = await wallet.sendTransaction(transaction, connection, {
          preflightCommitment: 'confirmed',
          skipPreflight: false,
        });
        console.log('Sent via wallet. Confirming...', signature);
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        console.log('✅ Escrow created successfully');
        return signature;
      } catch (sendErr) {
        console.error('wallet.sendTransaction failed:', sendErr);
        const details = { name: sendErr?.name, message: sendErr?.message, code: sendErr?.code, data: sendErr?.data };
        throw new Error(`Wallet send failed: ${JSON.stringify(details)}`);
      }
    }

    // Fallback: manually get recent blockhash, set fee payer, sign and send
    console.log('sendTransaction not available, falling back to signTransaction + sendRawTransaction');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    console.log('Requesting wallet signature...');
    const signedTransaction = await wallet.signTransaction(transaction);
    console.log('Transaction signed, simulating...');
    
    const simulation = await connection.simulateTransaction(signedTransaction);
    
    // Check simulation results
    if (simulation.value.err) {
      console.error('Simulation failed with program error:', simulation.value.err);
      console.error('Simulation logs:');
      simulation.value.logs?.forEach((log, index) => {
        console.error(`${index}: ${log}`);
      });
      
      // Check for the specific error
      if (simulation.value.logs?.some(log => log.includes('ZeroRequiredSignatures'))) {
        throw new Error('ENCODING ERROR: The manual encoding is still producing requiredSignatures = 0. This indicates a fundamental mismatch between the frontend parameter structure and your Rust program expectations.');
      } else {
        throw new Error(`Program execution failed: ${JSON.stringify(simulation.value.err)}`);
      }
    }
    
    console.log('✅ Simulation successful with manual encoding!');
    console.log('Simulation logs:');
    simulation.value.logs?.forEach((log, index) => {
      console.log(`${index}: ${log}`);
    });
    
    // Send transaction
    console.log('Sending raw transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });
    
    console.log('Transaction sent with signature:', signature);
    
    // Confirm transaction
    console.log('Confirming transaction...');
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Escrow created successfully with manual encoding');
    return signature;

  } catch (error) {
    console.error('Escrow creation failed:', error);
    throw error;
  }
};
