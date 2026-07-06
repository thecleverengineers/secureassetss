import { Suspense, useMemo, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Box, CircularProgress, createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { ColorModeContext } from './context/ColorModeContext';
import { SiteProvider, useSite } from './context/SiteContext';
import { RealtimeProvider } from './context/RealtimeContext';

function ThemedApplication() {
  const [mode, setMode] = useState<'light' | 'dark'>(() => (localStorage.getItem('sa_theme') === 'dark' ? 'dark' : 'light'));
  const { data } = useSite();
  const brand = data.settings?.brand || {};
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: brand.primaryColor || '#0B5270', dark: '#073F56', light: '#3B7D96' },
      secondary: { main: brand.secondaryColor || '#4F46E5' },
      success: { main: brand.accentColor || '#22c55e' },
      background: { default: mode === 'light' ? '#F4F7F9' : '#0C1218', paper: mode === 'light' ? '#FFFFFF' : '#131C24' },
    },
    shape: { borderRadius: 12 },
    typography: { fontFamily: `${brand.fontFamily || 'Plus Jakarta Sans'}, Inter, sans-serif`, button: { textTransform: 'none', fontWeight: 750 } },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 999, boxShadow: 'none' } } },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 700 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    },
  }), [mode, brand.primaryColor, brand.secondaryColor, brand.accentColor, brand.fontFamily]);
  const colorMode = useMemo(() => ({ mode, toggle: () => setMode((current) => { const next = current === 'light' ? 'dark' : 'light'; localStorage.setItem('sa_theme', next); return next; }) }), [mode]);
  return <ColorModeContext.Provider value={colorMode}><ThemeProvider theme={theme}><CssBaseline /><AuthProvider><RealtimeProvider><Suspense fallback={<Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}><RouterProvider router={router} /></Suspense></RealtimeProvider></AuthProvider></ThemeProvider></ColorModeContext.Provider>;
}

export default function App() {
  return <SiteProvider><ThemedApplication /></SiteProvider>;
}
