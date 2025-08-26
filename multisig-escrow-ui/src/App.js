import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Typography, Grid, Paper } from '@mui/material';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnection } from './components/WalletConnection';
import { EscrowManager } from './components/EscrowManager';
import { Layout } from './components/Layout';
import theme from './theme';

function AppContent() {
  const { connected } = useWallet();

  return (
    <Layout>
      <Container maxWidth="xl">
        {!connected ? (
          <Grid container spacing={3} justifyContent="center" alignItems="center" sx={{ minHeight: '70vh' }}>
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Typography variant="h2" gutterBottom sx={{ fontWeight: 500 }}>
                  Secure multi‑party transactions on Solana
                </Typography>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Create, sign, and execute token escrows that require multiple approvals.
                </Typography>
                <Typography variant="body2">
                  Connect your wallet from the top‑right to get started.
                </Typography>
              </Paper>
            </Grid>
            {/*<Grid item xs={12} md={4}>
              <Paper sx={{ p: 4 }}>
                <Typography variant="h6" gutterBottom>Quick Test Setup</Typography>
                <Typography variant="body2">
                  • Mint: So11111111111111111111111111111111111111112<br/>
                  • Amount: 100000000 (0.1 SOL)<br/>
                  • Required Signatures: 1<br/>
                  • Signers: Your wallet address
                </Typography>
              </Paper>
            </Grid>*/}
          </Grid>
        ) : (
          <EscrowManager />
        )}
      </Container>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WalletConnection>
        <AppContent />
      </WalletConnection>
    </ThemeProvider>
  );
}

export default App;
