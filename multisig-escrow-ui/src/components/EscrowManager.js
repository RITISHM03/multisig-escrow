import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  Container, Card, CardContent, Typography, TextField, Button, 
  Box, Grid, Alert, LinearProgress, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Tab, Tabs, Paper, Divider
} from '@mui/material';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';
import { getProgram } from '../utils/program';
import { PROGRAM_ID, ESCROW_SEED, VAULT_SEED } from '../utils/constants';
import { createEscrowWithAnchorCoder } from '../utils/manualEscrow';



function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export const EscrowManager = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [escrows, setEscrows] = useState([]);
  const [tabValue, setTabValue] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedEscrow, setSelectedEscrow] = useState(null);
  
  // Form state for creating new escrow
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    requiredSignatures: '',
    signers: '',
    mintAddress: ''
  });

  // ENHANCED VALIDATION FUNCTION
const validateFormData = useCallback(() => {
  const errors = [];
  
  if (!formData.recipient) {
    errors.push('Recipient address is required');
  } else {
    try {
      new PublicKey(formData.recipient);
    } catch {
      errors.push('Invalid recipient address');
    }
  }
  
  if (!formData.mintAddress) {
    errors.push('Token mint address is required');
  } else {
    try {
      new PublicKey(formData.mintAddress);
    } catch {
      errors.push('Invalid token mint address');
    }
  }
  
  if (!formData.amount || parseFloat(formData.amount) <= 0) {
    errors.push('Amount must be greater than 0');
  }
  
  // ENHANCED: More strict required signatures validation
  if (!formData.requiredSignatures || formData.requiredSignatures.trim() === '') {
    errors.push('Required signatures field cannot be empty');
  } else {
    const parsed = parseInt(formData.requiredSignatures.trim(), 10);
    if (isNaN(parsed) || parsed < 1) {
      errors.push('Required signatures must be a valid number >= 1');
    }
  }
  
  if (!formData.signers) {
    errors.push('At least one signer is required');
  } else {
    const signersList = formData.signers.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const reqSigs = parseInt(formData.requiredSignatures) || 0;
    
    if (reqSigs > signersList.length) {
      errors.push('Required signatures cannot exceed number of signers');
    }

    // Additional validation: recipient cannot be same as depositor
    if (formData.recipient === publicKey?.toString()) {
      errors.push('Recipient cannot be the same as depositor');
    }
    
    signersList.forEach((signer, index) => {
      try {
        new PublicKey(signer);
      } catch {
        errors.push(`Invalid signer address at position ${index + 1}`);
      }
    });
  }
  
  return errors;
}, [formData, publicKey]);


  // Program validation helper
  const validateProgramInstance = (program) => {
    if (!program) {
      throw new Error('Program instance is null');
    }
    
    if (!program.account) {
      throw new Error('Program account interface is missing');
    }
    
    if (!program.account.escrowAccount) {
      throw new Error('EscrowAccount interface not found in program');
    }
    
    if (!program.methods) {
      throw new Error('Program methods interface is missing');
    }
    
    const requiredMethods = ['initialize', 'sign', 'execute', 'cancel'];
    const availableMethods = Object.keys(program.methods);
    const missingMethods = requiredMethods.filter(method => !availableMethods.includes(method));
    
    if (missingMethods.length > 0) {
      throw new Error(`Program missing required methods: ${missingMethods.join(', ')}`);
    }
    
    console.log('✅ Program validation passed');
    return true;
  };

  // Get program instance
  const getWalletProgram = useCallback(() => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not properly connected');
    }
    
    try {
      const program = getProgram({ 
        publicKey, 
        signTransaction,
        signAllTransactions: signTransaction
      });
      
      // Validate the program instance
      validateProgramInstance(program);
      
      return program;
    } catch (error) {
      console.error('Failed to get program:', error);
      throw error;
    }
  }, [publicKey, signTransaction]);

  // Debug token balance function
  const debugTokenBalance = async () => {
    if (!publicKey || !formData.mintAddress) {
      setError('Please connect wallet and enter a token mint address');
      return;
    }
    
    try {
      const mintPubkey = new PublicKey(formData.mintAddress);
      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey);
      
      console.log('Token Account:', tokenAccount.toString());
      
      const balance = await connection.getTokenAccountBalance(tokenAccount);
      console.log('Token Balance:', balance.value.amount);
      console.log('Decimals:', balance.value.decimals);
      
      setSuccess(`Token balance: ${balance.value.amount} (${balance.value.uiAmount} with decimals)`);
    } catch (error) {
      console.error('Token balance check failed:', error);
      setError(`Token balance check failed: ${error.message}`);
    }
  };

  // Debug function to show all user tokens
  const debugAllTokens = async () => {
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    try {
      console.log('Checking all token accounts for wallet:', publicKey.toString());
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      console.log('Found token accounts:', tokenAccounts.value.length);
      
      const tokenList = tokenAccounts.value.map(acc => ({
        mint: acc.account.data.parsed.info.mint,
        balance: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
        rawAmount: acc.account.data.parsed.info.tokenAmount.amount
      }));
      
      console.log('Your tokens:', tokenList);
      
      if (tokenList.length === 0) {
        setError('No token accounts found. You need to receive some tokens first before creating an escrow. Try using Wrapped SOL: So11111111111111111111111111111111111111112');
      } else {
        let tokenInfo = `Found ${tokenList.length} token accounts:\n`;
        tokenList.forEach((token, index) => {
          tokenInfo += `${index + 1}. Mint: ${token.mint}\n   Balance: ${token.balance} (${token.rawAmount} raw)\n`;
        });
        setSuccess(tokenInfo);
        console.table(tokenList);
      }
      
    } catch (error) {
      console.error('Failed to fetch token accounts:', error);
      setError('Failed to fetch your token accounts');
    }
  };

  // FIXED: Fetch all escrows with proper error handling
  const fetchEscrows = useCallback(async () => {
    if (!publicKey) {
      console.log('No wallet connected, skipping escrow fetch');
      setEscrows([]);
      return;
    }

    try {
      console.log('Attempting to fetch escrows for wallet (RPC path):', publicKey.toString());
      // Load raw IDL to get discriminator and decoding layout
      const rawIDL = require('../idl/multisig_escrow.json');
      const coder = new BorshAccountsCoder(rawIDL);
      const escrowAccountDef = rawIDL.accounts.find(a => a.name === 'EscrowAccount');
      if (!escrowAccountDef) {
        throw new Error('EscrowAccount definition missing in IDL');
      }
      const discriminator = Buffer.from(escrowAccountDef.discriminator);
      const discriminatorBase58 = bs58.encode(discriminator);

      const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: discriminatorBase58 } }],
      });

      console.log('Fetched program accounts:', programAccounts.length);

      const decoded = programAccounts.map(({ pubkey, account }) => {
        const acc = coder.decode('EscrowAccount', account.data);
        // Normalize to camelCase fields expected by UI
        const normalized = {
          depositor: acc.depositor,
          recipient: acc.recipient,
          mint: acc.mint,
          amount: acc.amount,
          requiredSignatures: acc.required_signatures,
          currentSignatures: acc.current_signatures,
          signers: acc.signers,
          signatures: acc.signatures,
          createdAt: acc.created_at,
          isExecuted: acc.is_executed,
          isCancelled: acc.is_cancelled,
          bump: acc.bump,
        };
        return { publicKey: pubkey, account: normalized };
      });

      const userEscrows = decoded.filter(escrow => {
        const account = escrow.account;
        try {
          return (
            account.signers.some(signer => signer.equals(publicKey)) ||
            account.depositor.equals(publicKey) ||
            account.recipient.equals(publicKey)
          );
        } catch (e) {
          return false;
        }
      });

      console.log(`Found ${userEscrows.length} escrows for current user (RPC)`);
      setEscrows(userEscrows);
      
    } catch (err) {
      console.error('Error fetching escrows:', err);
      
      // Handle specific error types gracefully
      if (err.message.includes('size') || 
          err.message.includes('undefined') ||
          err.message.includes('Program instantiation failed')) {
        console.log('Account data reading issue - likely no escrows exist yet');
        setEscrows([]);
        // Don't show error to user for this common case
      } else if (err.message.includes('Account does not exist')) {
        console.log('No escrow accounts exist yet - this is normal');
        setEscrows([]);
      } else {
        // Only show actual errors to the user
        setError(`Failed to fetch escrows: ${err.message}`);
      }
    }
  }, [publicKey, connection]);

 // BULLETPROOF: Create new escrow function with robust parameter handling
const createEscrow = async () => {
  if (!publicKey) {
    setError('Please connect your wallet first');
    return;
  }

  setLoading(true);
  setError('');
  setSuccess('');

  try {
    // ENHANCED: Pre-validation of required signatures
    console.log('🔍 Raw form data before processing:', {
      recipient: formData.recipient,
      amount: formData.amount,
      requiredSignatures: formData.requiredSignatures,
      signers: formData.signers,
      mintAddress: formData.mintAddress
    });

    // BULLETPROOF: Handle required signatures with multiple fallbacks
    let requiredSignatures;
    if (!formData.requiredSignatures || formData.requiredSignatures.trim() === '') {
      setError('Required Signatures field cannot be empty. Please enter a number >= 1.');
      return;
    }

    const rawRequiredSigs = formData.requiredSignatures.trim();
    const parsedRequiredSigs = parseInt(rawRequiredSigs, 10);
    
    if (isNaN(parsedRequiredSigs) || parsedRequiredSigs < 1) {
      setError(`Invalid Required Signatures value: "${rawRequiredSigs}". Please enter a valid number >= 1.`);
      return;
    }

    requiredSignatures = Math.max(1, parsedRequiredSigs);

    console.log('✅ Required signatures validation passed:', {
      raw: rawRequiredSigs,
      parsed: parsedRequiredSigs,
      final: requiredSignatures
    });

    // Basic validation
    const validationErrors = validateFormData();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    console.log('Creating escrow with enhanced parameter validation...');

    // Parse other form data
    const recipientPubkey = new PublicKey(formData.recipient);
    const mintPubkey = new PublicKey(formData.mintAddress);
    const amount = new BN(formData.amount);
    
    const signersPubkeys = formData.signers
      .split(',')
      .map(s => new PublicKey(s.trim()));

    // FINAL VALIDATION: Ensure required signatures doesn't exceed signers
    if (requiredSignatures > signersPubkeys.length) {
      setError(`Required signatures (${requiredSignatures}) cannot exceed number of signers (${signersPubkeys.length}).`);
      return;
    }

    // COMPREHENSIVE DEBUG: Log all final parameters
    console.log('🚀 Final parameters for escrow creation:', {
      recipient: recipientPubkey.toString(),
      amount: amount.toString(),
      requiredSignatures: requiredSignatures,
      requiredSignaturesType: typeof requiredSignatures,
      signersCount: signersPubkeys.length,
      signers: signersPubkeys.map(s => s.toString()),
      formDataRaw: formData
    });

    // Derive PDA addresses
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(ESCROW_SEED), recipientPubkey.toBuffer(), publicKey.toBuffer()],
      PROGRAM_ID
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_SEED), escrowPda.toBuffer()],
      PROGRAM_ID
    );

    const depositorTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      publicKey
    );

    // FINAL CHECK: Verify required signatures is still valid
    if (!requiredSignatures || requiredSignatures < 1) {
      throw new Error(`Critical error: Required signatures became invalid (${requiredSignatures}). Please refresh and try again.`);
    }

    console.log('Creating escrow with VERIFIED parameters:', {
      escrow: escrowPda.toString(),
      recipient: recipientPubkey.toString(),
      amount: amount.toString(),
      requiredSignatures: requiredSignatures,
      signersCount: signersPubkeys.length
    });

    // Create escrow with validated parameters
    const txSignature = await createEscrowWithAnchorCoder(
      {
        publicKey,
        signTransaction,
        sendTransaction
      },
      {
        recipientPubkey,
        amount,
        requiredSignatures, // This is now guaranteed to be >= 1
        signersPubkeys,
        mintPubkey,
        escrowPda,
        vaultPda,
        depositorTokenAccount
      }
    );

    setSuccess(`Escrow created successfully! Transaction: ${txSignature}`);
    
    // Reset form
    setFormData({
      recipient: '',
      amount: '',
      requiredSignatures: '',
      signers: '',
      mintAddress: ''
    });

    console.log('✅ Escrow created successfully');

    // Try to refresh escrows
    try {
      await fetchEscrows();
    } catch (fetchError) {
      console.warn('Failed to refresh escrows after creation:', fetchError);
    }

  } catch (err) {
    console.error('Escrow creation error:', err);
    
    // Enhanced error handling
    if (err.message.includes('ZeroRequiredSignatures') || err.message.includes('Required signatures parameter is zero')) {
      setError('Critical parameter error: Required signatures is zero. Please refresh the page and ensure you enter a valid number >= 1 in the "Required Signatures" field.');
    } else if (err.message.includes('InstructionDidNotDeserialize')) {
      setError('Instruction format error. Please check your parameters and try again.');
    } else if (err.message.includes('insufficient funds')) {
      setError('Insufficient SOL for transaction fees or insufficient tokens for escrow.');
    } else if (err.message.includes('TokenAccountNotFoundError')) {
      setError('Token account not found. Make sure you have the specified token in your wallet.');
    } else if (err.message.includes('Simulation failed')) {
      setError('Transaction simulation failed. Check your parameters and token balances.');
    } else if (err.message.includes('could not find account')) {
      setError('Token account not found. You need to have the specified token in your wallet first. Try using "Show My Tokens" to see what tokens you have.');
    } else {
      setError(`Escrow creation failed: ${err.message}`);
    }
  } finally {
    setLoading(false);
  }
};


  // Sign existing escrow
  const signEscrow = async (escrowAddress) => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const program = getWalletProgram();
      
      const txSignature = await program.methods
        .sign()
        .accounts({
          escrow: new PublicKey(escrowAddress),
          signer: publicKey,
        })
        .rpc();

      setSuccess(`Escrow signed successfully! Transaction: ${txSignature}`);
      await fetchEscrows();
    } catch (err) {
      setError(`Error signing escrow: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute escrow when threshold is met
  const executeEscrow = async (escrowData) => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const program = getWalletProgram();
      
      const recipientTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(escrowData.mint),
        new PublicKey(escrowData.recipient)
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(VAULT_SEED), new PublicKey(escrowData.address).toBuffer()],
        PROGRAM_ID
      );

      const txSignature = await program.methods
        .execute()
        .accounts({
          escrow: new PublicKey(escrowData.address),
          escrowVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setSuccess(`Escrow executed successfully! Transaction: ${txSignature}`);
      await fetchEscrows();
    } catch (err) {
      setError(`Error executing escrow: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };


  
  // Cancel escrow (depositor only)
  const cancelEscrow = async (escrowData) => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const program = getWalletProgram();
      
      const depositorTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(escrowData.mint),
        new PublicKey(escrowData.depositor)
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(VAULT_SEED), new PublicKey(escrowData.address).toBuffer()],
        PROGRAM_ID
      );

      const txSignature = await program.methods
        .cancel()
        .accounts({
          escrow: new PublicKey(escrowData.address),
          escrowVault: vaultPda,
          depositorTokenAccount: depositorTokenAccount,
          depositor: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setSuccess(`Escrow cancelled successfully! Transaction: ${txSignature}`);
      await fetchEscrows();
    } catch (err) {
      setError(`Error cancelling escrow: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchEscrows();
    }
  }, [publicKey, fetchEscrows]);

  // Wallet Info Component
  const WalletInfo = () => {
    const { publicKey, connected } = useWallet();
    
    if (!connected) {
      return (
        <Alert severity="info" sx={{ mb: 2 }}>
          Please connect your wallet to see your address
        </Alert>
      );
    }
    
    if (!publicKey) {
      return (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Wallet connected but public key not available
        </Alert>
      );
    }

    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Wallet Information</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          <strong>Address:</strong> {publicKey.toString()}
        </Typography>
        <Button 
          size="small" 
          onClick={() => navigator.clipboard.writeText(publicKey.toString())}
          sx={{ mt: 1 }}
        >
          Copy Address
        </Button>
      </Paper>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <WalletInfo />
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{success}</pre>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(e, newValue) => setTabValue(newValue)}
          centered
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Create Escrow" />
          <Tab label="My Escrows" />
          <Tab label="Pending Signatures" />
        </Tabs>

        {/* Create Escrow Tab */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h5" gutterBottom>
            Create New Multi-Signature Escrow
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Set up a new escrow that requires multiple signatures to execute
          </Typography>
          
          {/* Quick Setup Helper */}
          <Paper sx={{ p: 2, mb: 3, backgroundColor: '#1e3a8a' }}>
            <Typography variant="h6" gutterBottom>
              🚀 Quick Test Setup
            </Typography>
            <Typography variant="body2" gutterBottom>
              For testing with Wrapped SOL (easiest option):
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
              • Token Mint: So11111111111111111111111111111111111111112<br/>
              • Amount: 100000000 (0.1 SOL)<br/>
              • Required Signatures: 1<br/>
              • Signers: Your wallet address
            </Typography>
          </Paper>
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Recipient Address"
                value={formData.recipient}
                onChange={(e) => setFormData({...formData, recipient: e.target.value})}
                placeholder="Public key of the recipient"
                helperText="The address that will receive the tokens"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Token Mint Address"
                value={formData.mintAddress}
                onChange={(e) => setFormData({...formData, mintAddress: e.target.value})}
                placeholder="SPL Token mint address"
                helperText="The token you want to escrow"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                helperText="Amount of tokens to escrow (in smallest unit)"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Required Signatures"
                type="number"
                value={formData.requiredSignatures}
                onChange={(e) => setFormData({...formData, requiredSignatures: e.target.value})}
                helperText="How many signatures needed to execute"
                inputProps={{ min: 1 }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Authorized Signers"
                multiline
                rows={3}
                value={formData.signers}
                onChange={(e) => setFormData({...formData, signers: e.target.value})}
                placeholder="Public keys of authorized signers, separated by commas"
                helperText="Enter public keys separated by commas (e.g., 7xK...abc, 9pL...xyz)"
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              onClick={createEscrow}
              disabled={loading || !publicKey || !formData.recipient || !formData.amount || !formData.signers}
            >
              Create Escrow
            </Button>
            
            <Button 
              onClick={debugTokenBalance} 
              variant="outlined"
              disabled={!publicKey || !formData.mintAddress}
            >
              Check Token Balance
            </Button>
            
            <Button 
              onClick={debugAllTokens} 
              variant="outlined"
              color="secondary"
              disabled={!publicKey || loading}
            >
              Show My Tokens
            </Button>
          </Box>
        </TabPanel>

        {/* My Escrows Tab */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h5" gutterBottom>
            My Escrows
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Escrows you've created, are a signer for, or are the recipient of
          </Typography>
          
          {escrows.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="textSecondary">
                No escrows found
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Create your first escrow or ask someone to add you as a signer
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {escrows.map((escrow, index) => (
                <Grid item xs={12} key={index}>
                  <EscrowCard 
                    escrow={escrow} 
                    currentUser={publicKey}
                    onSign={() => signEscrow(escrow.publicKey.toString())}
                    onExecute={() => executeEscrow({
                      address: escrow.publicKey.toString(),
                      ...escrow.account
                    })}
                    onCancel={() => cancelEscrow({
                      address: escrow.publicKey.toString(),
                      ...escrow.account
                    })}
                    onViewDetails={(escrow) => {
                      setSelectedEscrow(escrow);
                      setOpenDialog(true);
                    }}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </TabPanel>

        {/* Pending Signatures Tab */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h5" gutterBottom>
            Pending Signatures
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Escrows waiting for your signature
          </Typography>
          
          {escrows.filter(escrow => 
            escrow.account.signers.some(signer => signer.equals(publicKey)) && 
            !escrow.account.signatures.some(sig => sig.equals(publicKey)) &&
            !escrow.account.isExecuted &&
            !escrow.account.isCancelled
          ).length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="textSecondary">
                No pending signatures
              </Typography>
              <Typography variant="body2" color="textSecondary">
                All escrows you're involved in are either signed or completed
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {escrows
                .filter(escrow => 
                  escrow.account.signers.some(signer => signer.equals(publicKey)) && 
                  !escrow.account.signatures.some(sig => sig.equals(publicKey)) &&
                  !escrow.account.isExecuted &&
                  !escrow.account.isCancelled
                )
                .map((escrow, index) => (
                  <Grid item xs={12} key={index}>
                    <EscrowCard 
                      escrow={escrow} 
                      currentUser={publicKey}
                      onSign={() => signEscrow(escrow.publicKey.toString())}
                      onExecute={() => executeEscrow({
                        address: escrow.publicKey.toString(),
                        ...escrow.account
                      })}
                      onCancel={() => cancelEscrow({
                        address: escrow.publicKey.toString(),
                        ...escrow.account
                      })}
                      onViewDetails={(escrow) => {
                        setSelectedEscrow(escrow);
                        setOpenDialog(true);
                      }}
                      highlightPending={true}
                    />
                  </Grid>
                ))}
            </Grid>
          )}
        </TabPanel>
      </Paper>
      
      {/* Escrow Details Dialog */}
      <EscrowDetailsDialog 
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        escrow={selectedEscrow}
      />
      
      {loading && <LinearProgress sx={{ mt: 2 }} />}
    </Container>
  );
};

// Individual Escrow Card Component
const EscrowCard = ({ escrow, currentUser, onSign, onExecute, onCancel, onViewDetails, highlightPending }) => {
  const data = escrow.account;
  const progress = (data.currentSignatures / data.requiredSignatures) * 100;
  const isDepositor = data.depositor.equals(currentUser);
  const isRecipient = data.recipient.equals(currentUser);
  const isSigner = data.signers.some(signer => signer.equals(currentUser));
  const hasUserSigned = data.signatures.some(sig => sig.equals(currentUser));
  const canExecute = !data.isExecuted && !data.isCancelled && data.currentSignatures >= data.requiredSignatures;
  const canSign = !data.isExecuted && !data.isCancelled && isSigner && !hasUserSigned;
  const canCancel = !data.isExecuted && !data.isCancelled && isDepositor;
  
  return (
    <Card sx={{ 
      border: highlightPending ? '2px solid #ff9800' : '1px solid #333',
      backgroundColor: highlightPending ? 'rgba(255, 152, 0, 0.1)' : 'background.paper'
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Escrow: {escrow.publicKey.toString().slice(0, 8)}...
            </Typography>
            
            {/* User Role Badges */}
            <Box sx={{ mb: 2 }}>
              {isDepositor && <Chip label="Depositor" color="primary" size="small" sx={{ mr: 1 }} />}
              {isRecipient && <Chip label="Recipient" color="secondary" size="small" sx={{ mr: 1 }} />}
              {isSigner && <Chip label="Signer" color="info" size="small" sx={{ mr: 1 }} />}
            </Box>
          </Box>
          
          {/* Status Badges */}
          <Box>
            {data.isExecuted && <Chip label="Executed" color="success" />}
            {data.isCancelled && <Chip label="Cancelled" color="error" />}
            {!data.isExecuted && !data.isCancelled && (
              <Chip 
                label={canExecute ? "Ready to Execute" : "Pending Signatures"} 
                color={canExecute ? "success" : "warning"} 
              />
            )}
          </Box>
        </Box>
        
        <Grid container spacing={2}>
          <Grid item xs={12} sm={8}>
            <Typography variant="body2" gutterBottom>
              <strong>Amount:</strong> {data.amount.toString()} tokens
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Recipient:</strong> {data.recipient.toString().slice(0, 8)}...{data.recipient.toString().slice(-4)}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Created:</strong> {new Date(data.createdAt.toNumber() * 1000).toLocaleDateString()}
            </Typography>
          </Grid>
          
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" gutterBottom>
              <strong>Signatures:</strong> {data.currentSignatures}/{data.requiredSignatures}
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              color={canExecute ? "success" : "primary"}
              sx={{ mt: 1, mb: 2 }} 
            />
          </Grid>
        </Grid>
        
        {/* Signer Status */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Signers Status:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {data.signers.map((signer, index) => (
              <Chip
                key={index}
                label={signer.toString().slice(0, 4) + '...' + signer.toString().slice(-4)}
                color={data.signatures.some(s => s.equals(signer)) ? 'success' : 'default'}
                variant={data.signatures.some(s => s.equals(signer)) ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>
        </Box>
        
        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canSign && (
            <Button
              variant="contained"
              color="warning"
              onClick={onSign}
              size="small"
            >
              Sign Escrow
            </Button>
          )}
          
          {canExecute && (
            <Button
              variant="contained"
              color="success"
              onClick={onExecute}
              size="small"
            >
              Execute
            </Button>
          )}
          
          {canCancel && (
            <Button
              variant="outlined"
              color="error"
              onClick={onCancel}
              size="small"
            >
              Cancel
            </Button>
          )}
          
          <Button
            variant="outlined"
            onClick={() => onViewDetails(escrow)}
            size="small"
          >
            View Details
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

// Escrow Details Dialog Component
const EscrowDetailsDialog = ({ open, onClose, escrow }) => {
  if (!escrow) return null;

  const data = escrow.account;
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Escrow Details: {escrow.publicKey.toString().slice(0, 16)}...
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle1" gutterBottom>Basic Information</Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Address:</strong> {escrow.publicKey.toString()}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Depositor:</strong> {data.depositor.toString()}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Recipient:</strong> {data.recipient.toString()}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Token Mint:</strong> {data.mint.toString()}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Amount:</strong> {data.amount.toString()} tokens
            </Typography>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle1" gutterBottom>Status Information</Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Required Signatures:</strong> {data.requiredSignatures}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Current Signatures:</strong> {data.currentSignatures}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Created:</strong> {new Date(data.createdAt.toNumber() * 1000).toLocaleString()}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Executed:</strong> {data.isExecuted ? 'Yes' : 'No'}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Cancelled:</strong> {data.isCancelled ? 'Yes' : 'No'}
            </Typography>
          </Grid>
          
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" gutterBottom>Authorized Signers</Typography>
            <Grid container spacing={1}>
              {data.signers.map((signer, index) => (
                <Grid item xs={12} key={index}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip
                      label={data.signatures.some(s => s.equals(signer)) ? 'Signed' : 'Pending'}
                      color={data.signatures.some(s => s.equals(signer)) ? 'success' : 'default'}
                      size="small"
                      sx={{ mr: 2 }}
                    />
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {signer.toString()}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
