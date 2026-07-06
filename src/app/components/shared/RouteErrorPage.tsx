import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { HomeRounded, RefreshRounded } from '@mui/icons-material';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { isChunkLoadError } from '../../utils/lazyWithRetry';

export default function RouteErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const chunkFailure = isChunkLoadError(error);
  const title = chunkFailure ? 'A newer version is available' : status === 404 ? 'Page not found' : 'This page could not be opened';
  const message = chunkFailure
    ? 'The application was updated while this browser tab was open. Reload once to use the latest files.'
    : 'Your data has not been changed. Reload the page, or return to the home page and try again.';

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 560, p: { xs: 3, sm: 5 }, border: '1px solid', borderColor: 'divider', borderRadius: 5 }}>
        <Alert severity={chunkFailure ? 'info' : 'error'} sx={{ mb: 3 }}>{status ? `Error ${status}` : 'SecureAsset'}</Alert>
        <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: '-.035em' }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.75 }}>{message}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
          <Button variant="contained" startIcon={<RefreshRounded />} onClick={() => window.location.reload()}>Reload application</Button>
          <Button variant="outlined" startIcon={<HomeRounded />} href="/">Go to home</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
