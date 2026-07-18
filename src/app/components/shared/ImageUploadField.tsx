import { useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { UploadRounded } from '@mui/icons-material';
import { uploadUserImage } from '../../services/api';

export default function ImageUploadField({
  label,
  value,
  onChange,
  helperText,
  required,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  helperText?: string;
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const result = await uploadUserImage(file);
      onChange(result.data.url);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.5 }}>
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box
        component={value ? 'img' : 'div'}
        src={value || undefined}
        alt={value ? label : undefined}
        sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 2, objectFit: 'cover', border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover' }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography fontWeight={700} fontSize={13}>{label}{required ? ' *' : ''}</Typography>
        <Typography color="text.secondary" fontSize={11.5} noWrap>{error || helperText || 'Upload JPG, PNG, WebP or GIF (max 8MB).'}</Typography>
      </Box>
      <Button component="label" size="small" variant="outlined" startIcon={busy ? <CircularProgress size={16} /> : <UploadRounded />} disabled={busy}>
        {value ? 'Replace' : 'Upload'}
        <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => choose(event.target.files?.[0])} />
      </Button>
    </Stack>
  </Box>;
}
