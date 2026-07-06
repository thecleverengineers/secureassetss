import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { globalSearch } from '../../services/api';
import { moduleLabel } from '../../components/layout/AppShell';

function titleFor(item: any) {
  return item.title || item.name || item.applicationNumber || item.surveyNumber || item.jobNumber || item.projectNumber || item.complaintNumber || item.invoiceNumber || item.code || item.email || item._id;
}
function subtitleFor(item: any) {
  return item.description || item.status || item.address?.city || item.email || item.type || item.purpose || '';
}

export default function SearchPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const query = params.get('q') || '';
  const [groups, setGroups] = useState<any[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (query.length < 2) { setGroups([]); return; } setLoading(true); setError(''); globalSearch(query, 8).then((result) => setGroups(result.data)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [query]);
  return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 6 }}><Typography variant="h4" fontWeight={950}>Search</Typography><Typography color="text.secondary" sx={{ mb: 3 }}>Permission-scoped results for “{query}”.</Typography>{error && <Alert severity="error">{error}</Alert>}{loading ? <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : !groups.length ? <Alert severity="info">No accessible records matched this search.</Alert> : <Stack spacing={3}>{groups.map((group) => <Box key={group.resource}><Stack direction="row" gap={1} alignItems="center" mb={1.2}><Typography variant="h6" fontWeight={900}>{moduleLabel(group.resource)}</Typography><Chip size="small" label={group.count} /></Stack><Grid container spacing={1.5}>{group.data.map((item: any) => <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={item._id}><Card variant="outlined" onClick={() => navigate(`/app/${group.resource}?record=${item._id}`)} sx={{ height: '100%', cursor: 'pointer', borderRadius: 3, '&:hover': { boxShadow: 2 } }}><CardContent><Typography fontWeight={850}>{titleFor(item)}</Typography><Typography color="text.secondary" fontSize={12.5} sx={{ mt: .5 }}>{String(subtitleFor(item)).slice(0, 150)}</Typography>{item.status && <Chip size="small" label={String(item.status).replaceAll('_', ' ')} sx={{ mt: 1.2 }} />}</CardContent></Card></Grid>)}</Grid></Box>)}</Stack>}</Box>;
}
