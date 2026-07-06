import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider, FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { CheckCircleOutlineRounded, DeleteOutlineRounded, DoneAllRounded, NotificationsActiveRounded, RefreshRounded, SettingsRounded } from '@mui/icons-material';
import { deleteNotification, getNotificationPreferences, getNotifications, markAllNotificationsRead, markNotificationRead, updateNotificationPreferences } from '../../services/api';
import { useRealtime } from '../../context/RealtimeContext';

const categories = ['all', 'payment', 'survey', 'complaint', 'lease', 'maintenance', 'message', 'system'];
const channels = ['inApp', 'email', 'sms', 'whatsapp', 'push'];

export default function NotificationCenterPage() {
  const { subscribe } = useRealtime();
  const [rows, setRows] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferences, setPreferences] = useState<any>({ channels: {}, categories: {}, quietHours: {} });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [notifications, prefs] = await Promise.all([
        getNotifications({ limit: 100, unread: unreadOnly, category: category === 'all' ? '' : category }),
        getNotificationPreferences(),
      ]);
      setRows(notifications.data || []); setPreferences(prefs.data || { channels: {}, categories: {}, quietHours: {} });
    } catch (error) { setNotice((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [category, unreadOnly]);
  useEffect(() => subscribe('notification:new', (payload: any) => setRows((current) => current.some((item) => item._id === payload._id) ? current : [payload, ...current])), [subscribe]);

  const unread = useMemo(() => rows.filter((item) => !item.readAt).length, [rows]);
  async function savePreferences() { try { await updateNotificationPreferences(preferences); setNotice('Notification preferences saved'); } catch (error) { setNotice((error as Error).message); } }

  return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box><Typography variant="h4" sx={{ fontWeight: 900 }}>Notification Centre</Typography><Typography color="text.secondary">Live alerts, delivery controls and notification history from MongoDB.</Typography></Box>
      <Stack direction="row" gap={1}><Button startIcon={<RefreshRounded />} onClick={load} disabled={loading}>Refresh</Button><Button variant="contained" startIcon={<DoneAllRounded />} onClick={async () => { await markAllNotificationsRead(); setRows((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); }}>Mark all read</Button></Stack>
    </Stack>
    {notice && <Alert severity={notice.includes('saved') ? 'success' : 'error'} onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mb: 2 }}><TextField select size="small" label="Category" value={category} onChange={(event) => setCategory(event.target.value)} sx={{ minWidth: 190 }}>{categories.map((item) => <MenuItem key={item} value={item}>{item.replaceAll('_', ' ')}</MenuItem>)}</TextField><FormControlLabel control={<Switch checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />} label={`Unread only (${unread})`} /></Stack>
          <Stack divider={<Divider flexItem />}>
            {rows.map((item) => <Box key={item._id} sx={{ py: 2, px: 1, bgcolor: item.readAt ? 'transparent' : 'action.hover', borderRadius: 2 }}><Stack direction="row" gap={1.5} alignItems="flex-start"><NotificationsActiveRounded color={item.readAt ? 'disabled' : 'primary'} /><Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={{ fontWeight: item.readAt ? 650 : 900 }}>{item.title}</Typography><Chip size="small" label={item.category || 'system'} /></Stack><Typography color="text.secondary" sx={{ mt: .5, whiteSpace: 'pre-wrap' }}>{item.message}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.createdAt).toLocaleString()}</Typography></Box><Stack direction="row">{!item.readAt && <IconButton title="Mark read" onClick={async () => { await markNotificationRead(item._id); setRows((current) => current.map((row) => row._id === item._id ? { ...row, readAt: new Date().toISOString() } : row)); }}><CheckCircleOutlineRounded /></IconButton>}<IconButton title="Delete" onClick={async () => { await deleteNotification(item._id); setRows((current) => current.filter((row) => row._id !== item._id)); }}><DeleteOutlineRounded /></IconButton></Stack></Stack></Box>)}
            {!rows.length && <Alert severity="info">No matching notifications.</Alert>}
          </Stack>
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 4 }}><CardContent><Stack direction="row" gap={1} alignItems="center" sx={{ mb: 2 }}><SettingsRounded color="primary" /><Typography variant="h6" sx={{ fontWeight: 850 }}>Delivery preferences</Typography></Stack><Typography variant="overline" color="text.secondary">Channels</Typography>{channels.map((key) => <FormControlLabel key={key} sx={{ display: 'flex' }} control={<Checkbox checked={preferences.channels?.[key] ?? key === 'inApp'} onChange={(event) => setPreferences((current: any) => ({ ...current, channels: { ...current.channels, [key]: event.target.checked } }))} />} label={key.replace(/([A-Z])/g, ' $1')} />)}<Divider sx={{ my: 2 }} /><Typography variant="overline" color="text.secondary">Quiet hours</Typography><FormControlLabel sx={{ display: 'flex' }} control={<Switch checked={Boolean(preferences.quietHours?.enabled)} onChange={(event) => setPreferences((current: any) => ({ ...current, quietHours: { ...current.quietHours, enabled: event.target.checked } }))} />} label="Enable quiet hours" /><Stack direction="row" spacing={1} sx={{ mt: 1 }}><TextField size="small" label="Start" type="time" InputLabelProps={{ shrink: true }} value={preferences.quietHours?.start || '22:00'} onChange={(event) => setPreferences((current: any) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))} /><TextField size="small" label="End" type="time" InputLabelProps={{ shrink: true }} value={preferences.quietHours?.end || '07:00'} onChange={(event) => setPreferences((current: any) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))} /></Stack><Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={savePreferences}>Save preferences</Button></CardContent></Card>
      </Grid>
    </Grid>
  </Box>;
}
