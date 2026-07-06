import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { DownloadRounded, PhotoCameraRounded, SaveRounded } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { downloadReport, getReportCatalog, getResource, updateMe, uploadProfileAvatar } from '../../services/api';
import { moduleLabel } from '../../components/layout/AppShell';
import LocationFields from '../../components/shared/LocationFields';

export default function UtilityPage() {
  const { module = '' } = useParams();
  const { user, refreshUser } = useAuth();
  const [related, setRelated] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState({ name: '', phone: '', avatar: '', country: '', state: '', city: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [reportModules, setReportModules] = useState<any[]>([]);

  useEffect(() => {
    setProfile({ name: user?.name || '', phone: user?.phone || '', avatar: user?.avatar || '', country: user?.country || '', state: user?.state || '', city: user?.city || '' });
    if (module === 'my-property') getResource('tenants', { limit: 10 }).then((r) => setRelated(r.data)).catch(() => {});
    if (module === 'reports') getReportCatalog().then((r) => setReportModules(r.data || [])).catch((error) => setNotice((error as Error).message));
  }, [module, user?._id]);

  if (module === 'profile') {
    async function saveProfile() {
      setSavingProfile(true); setNotice('');
      try {
        const result = await updateMe({ name: profile.name, country: profile.country, state: profile.state, city: profile.city });
        await refreshUser(); setNotice(result.message || 'Profile updated');
      } catch (error) { setNotice((error as Error).message); }
      finally { setSavingProfile(false); }
    }
    async function chooseAvatar(file?: File) {
      if (!file) return;
      setUploadingAvatar(true); setNotice('');
      try {
        const result = await uploadProfileAvatar(file);
        setProfile((old) => ({ ...old, avatar: result.data.url }));
        await refreshUser(); setNotice(result.message || 'Profile photo updated');
      } catch (error) { setNotice((error as Error).message); }
      finally { setUploadingAvatar(false); }
    }
    return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 3 }}>
        <Box><Typography variant="h4" sx={{ fontWeight: 900 }}>My Profile</Typography><Typography color="text.secondary">Manage your account image and verified location.</Typography></Box>
        <Button variant="contained" startIcon={<SaveRounded />} disabled={savingProfile} onClick={saveProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</Button>
      </Stack>
      {notice && <Alert severity={notice.toLowerCase().includes('updated') ? 'success' : 'error'} sx={{ mb: 2 }}>{notice}</Alert>}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, border: '1px solid', borderColor: 'divider', maxWidth: 980 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'flex-start' }}>
          <Stack alignItems="center" spacing={1.5} sx={{ minWidth: 150 }}>
            <Avatar src={profile.avatar} sx={{ width: 112, height: 112, bgcolor: 'primary.main', fontSize: 38 }}>{profile.name?.[0] || user?.name?.[0]}</Avatar>
            <Button component="label" variant="outlined" startIcon={<PhotoCameraRounded />} disabled={uploadingAvatar}>
              {uploadingAvatar ? 'Uploading…' : 'Upload avatar'}
              <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void chooseAvatar(event.target.files?.[0])} />
            </Button>
            <Typography color="text.secondary" textAlign="center" sx={{ fontSize: 11.5 }}>JPG, PNG, WebP or GIF. Maximum 8 MB.</Typography>
          </Stack>
          <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Name" value={profile.name} onChange={(event) => setProfile((old) => ({ ...old, name: event.target.value }))} required />
            <TextField label="Verified mobile" value={profile.phone} InputProps={{ readOnly: true }} helperText="Mobile changes require OTP verification." />
            <LocationFields value={profile} onChange={(location) => setProfile((old) => ({ ...old, ...location }))} />
            <TextField label="Email" value={user?.email || ''} InputProps={{ readOnly: true }} />
            <TextField label="Role / mode" value={`${user?.role || ''}${user?.activeMode ? ` · ${user.activeMode}` : ''}`} InputProps={{ readOnly: true }} />
            <TextField label="KYC status" value={user?.kycStatus || ''} InputProps={{ readOnly: true }} />
          </Box>
        </Stack>
      </Paper>
    </Box>;
  }

  if (module === 'reports') return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}><Typography variant="h4" sx={{ fontWeight: 900 }}>Reports & Analytics</Typography><Typography color="text.secondary" sx={{ mt: .5, mb: 3 }}>Download live, permission-scoped MongoDB records as CSV, Excel or PDF.</Typography><Grid container spacing={2}>{reportModules.map((report: any) => <Grid size={{ xs: 12, sm: 6, md: 4 }} key={report.key}><Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}><CardContent><Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={{ fontWeight: 850 }}>{report.label || moduleLabel(report.key)}</Typography><Chip size="small" label={`${Number(report.count || 0).toLocaleString()} records`} /></Stack><Typography color="text.secondary" sx={{ fontSize: 12, my: 1.5 }}>{report.description || 'Permission-scoped MongoDB records.'}</Typography><Stack direction="row" gap={1} flexWrap="wrap">{(report.formats || ['csv','xlsx','pdf']).map((format: 'csv'|'xlsx'|'pdf') => <Button key={format} startIcon={<DownloadRounded />} variant="outlined" size="small" onClick={() => downloadReport(report.key, format).catch((e) => setNotice(e.message))}>{format === 'xlsx' ? 'Excel' : format.toUpperCase()}</Button>)}</Stack></CardContent></Card></Grid>)}</Grid>{notice && <Alert severity="error" sx={{ mt: 2 }}>{notice}</Alert>}</Box>;

  if (module === 'my-property') return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}><Typography variant="h4" sx={{ fontWeight: 900, mb: 3 }}>My Property</Typography>{related.length ? related.map((tenant) => <Card key={tenant._id} elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', maxWidth: 900 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}><Box><Chip label={tenant.status} color="success" size="small" /><Typography sx={{ mt: 1.5, fontSize: 24, fontWeight: 900 }}>{tenant.property?.title || 'Assigned property'}</Typography><Typography color="text.secondary">{tenant.property?.address?.line1}, {tenant.property?.address?.city}</Typography><Typography sx={{ mt: 1, fontWeight: 700 }}>Unit {tenant.unit?.unitNumber || '—'}</Typography></Box><Box><Typography color="text.secondary" sx={{ fontSize: 12 }}>MOVE-IN DATE</Typography><Typography sx={{ fontWeight: 800 }}>{tenant.moveInDate ? new Date(tenant.moveInDate).toLocaleDateString('en-IN', { dateStyle: 'long' }) : '—'}</Typography></Box></Stack></CardContent></Card>) : <Alert severity="info">No active property allocation was found.</Alert>}</Box>;

  return <Box sx={{ px: 4, py: 6 }}><Alert severity="info">{moduleLabel(module)} is not available for this account or has not been enabled by an administrator.</Alert></Box>;
}
