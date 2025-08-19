import { createTheme } from '@mui/material/styles';

const primary = '#7C3AED'; // violet-600
const secondary = '#22D3EE'; // cyan-400
const backgroundDefault = '#0B1220';
const backgroundPaper = '#121826';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: primary },
    secondary: { main: secondary },
    background: { default: backgroundDefault, paper: backgroundPaper },
    success: { main: '#10B981' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    h1: { fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontWeight: 800, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700 },
    subtitle1: { color: 'rgba(255,255,255,0.72)' },
    body2: { color: 'rgba(255,255,255,0.72)' },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        html: { scrollBehavior: 'smooth' },
        body: {
          background: backgroundDefault,
          minHeight: '100vh',
          backgroundImage:
            'radial-gradient(1200px 600px at 100% -10%, rgba(124,58,237,0.15), transparent), radial-gradient(1000px 500px at -10% 0%, rgba(34,211,238,0.12), transparent)',
        },
        '::-webkit-scrollbar': { width: 10, height: 10 },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderRadius: 999,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
          border: '1px solid rgba(148,163,184,0.15)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: 12 },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiCard: {
      styleOverrides: {
        root: { backdropFilter: 'saturate(120%) blur(6px)' },
      },
    },
  },
});

export default theme;


