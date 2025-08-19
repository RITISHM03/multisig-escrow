import React from 'react';
import { AppBar, Toolbar, Container, Box, Typography, Link as MuiLink, Stack } from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const Layout = ({ children }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: '1px solid rgba(148,163,184,0.15)', backdropFilter: 'blur(8px)' }}>
        <Toolbar sx={{ py: 1.5 }}>
          <Container maxWidth="xl" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1.2}>
              <SecurityIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Multi‑Signature Escrow</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <WalletMultiButton />
            </Stack>
          </Container>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: 6 }}>
        <Container maxWidth="xl">{children}</Container>
      </Box>

      <Box component="footer" sx={{ py: 4, borderTop: '1px solid rgba(148,163,184,0.15)' }}>
        <Container maxWidth="xl">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Typography variant="body2">© {new Date().getFullYear()} Multisig Escrow</Typography>
            <Stack direction="row" spacing={2}>
              <MuiLink href="#create" underline="hover" color="inherit">Create Escrow</MuiLink>
              <MuiLink href="#mine" underline="hover" color="inherit">My Escrows</MuiLink>
              <MuiLink href="#pending" underline="hover" color="inherit">Pending Signatures</MuiLink>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};


