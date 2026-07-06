import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import {
  ApartmentRounded, MeetingRoomRounded, PeopleRounded, FactCheckRounded, AssignmentRounded, PaymentsRounded,
  AccountBalanceWalletRounded, BuildRounded, DescriptionRounded, ApprovalRounded, AddRounded, RouteRounded,
  CloudSyncRounded, LoginRounded, LogoutRounded, BusinessRounded, BedRounded, CalendarMonthRounded, ReceiptLongRounded, HomeWorkRounded,
} from '@mui/icons-material';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { checkIn, checkOut, getDashboardOverview, getLandlordOverview } from '../../services/api';
import type { DashboardOverview } from '../../services/types';
import { useRealtime } from '../../context/RealtimeContext';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const sentence = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const baseCards = [
  ['totalProperties', 'Total Properties', ApartmentRounded], ['totalUnits', 'Total Units', MeetingRoomRounded],
  ['occupiedUnits', 'Occupied Units', MeetingRoomRounded], ['vacantUnits', 'Vacant Units', MeetingRoomRounded],
  ['totalTenants', 'Total Tenants', PeopleRounded], ['activeUsers', 'Active Users', PeopleRounded],
  ['pendingApplications', 'Pending Applications', FactCheckRounded], ['pendingSurveys', 'Pending Surveys', AssignmentRounded],
  ['monthlyRentCollection', 'Monthly Collection', PaymentsRounded], ['outstandingDues', 'Outstanding Dues', AccountBalanceWalletRounded],
  ['openComplaints', 'Open Complaints', BuildRounded], ['expiringLeases', 'Expiring Leases', DescriptionRounded],
  ['pendingApprovals', 'Pending Approvals', ApprovalRounded],
] as const;

const cardsByRole: Record<string, string[]> = {
  admin: ['totalProperties', 'totalUnits', 'occupiedUnits', 'vacantUnits', 'totalTenants', 'activeUsers', 'pendingApplications', 'pendingSurveys', 'monthlyRentCollection', 'outstandingDues', 'openComplaints', 'expiringLeases'],
  manager: ['totalProperties', 'occupiedUnits', 'vacantUnits', 'pendingApplications', 'pendingSurveys', 'monthlyRentCollection', 'outstandingDues', 'openComplaints', 'expiringLeases', 'pendingApprovals'],
  tenant: ['monthlyRentCollection', 'outstandingDues', 'openComplaints', 'expiringLeases'],
  user: ['pendingApplications', 'outstandingDues', 'openComplaints'],
  surveyor: ['pendingSurveys'],
};

function KpiCard({ label, value, Icon }: { label: string; value: string | number; Icon: any }) {
  return <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 4, height: '100%' }}><CardContent sx={{ p: 2.5 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 700 }}>{label}</Typography><Typography sx={{ mt: .7, fontSize: { xs: 24, lg: 29 }, fontWeight: 850, letterSpacing: '-.04em' }}>{value}</Typography></Box><Box sx={{ width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}><Icon /></Box></Stack>
  </CardContent></Card>;
}

export default function RoleDashboardPage() {
  const { user } = useAuth();
  const realtime = useRealtime();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [landlord, setLandlord] = useState<any>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function load() { try { const [overview, landlordOverview] = await Promise.all([getDashboardOverview(), user?.role === 'tenant' && user?.activeMode === 'landlord' ? getLandlordOverview() : Promise.resolve(null)]); setData(overview.data); setLandlord(landlordOverview?.data || null); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { load(); }, [user?.activeMode]);
  useEffect(() => realtime.subscribe('dashboard:invalidate', () => void load()), [realtime.subscribe, user?.activeMode]);
  const visible = useMemo(() => baseCards.filter(([key]) => cardsByRole[user?.role || 'user'].includes(key)), [user?.role]);

  async function attendance(action: 'in' | 'out') {
    setWorking(true); setError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const gps = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
        action === 'in' ? await checkIn(gps) : await checkOut(gps);
        await load();
      } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
    }, (e) => { setError(e.message); setWorking(false); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  if (!data && !error) return <Box sx={{ py: 18, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

  if (user?.role === 'tenant' && user.activeMode === 'landlord' && landlord) {
    const usageCards = [
      ['buildings','Buildings',BusinessRounded],['apartments','Apartments',ApartmentRounded],['rooms','Rooms',MeetingRoomRounded],['beds','Beds',BedRounded],
    ] as const;
    const businessCards = [
      ['occupiedRooms','Occupied',MeetingRoomRounded],['vacantRooms','Vacant',MeetingRoomRounded],['reservedRooms','Reserved',HomeWorkRounded],
      ['pendingApplications','Applications',FactCheckRounded],['scheduledInterviews','Interviews',PeopleRounded],['scheduledSiteVisits','Site visits',CalendarMonthRounded],
      ['monthlyRentExpected','Rent expected',ReceiptLongRounded],['rentCollected','Rent collected',PaymentsRounded],['pendingRent','Pending rent',AccountBalanceWalletRounded],['overdueRent','Overdue rent',BuildRounded],
    ] as const;
    return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 6 }}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={2} mb={3}><Box><Typography variant="h4" fontWeight={950}>Landlord Dashboard</Typography><Typography color="text.secondary">Live portfolio, occupancy, applications, visits, billing and subscription usage.</Typography></Box><Stack direction="row" gap={1}><Button variant="outlined" onClick={()=>navigate('/app/subscription')}>Manage plan</Button><Button variant="contained" startIcon={<AddRounded/>} onClick={()=>navigate('/app/properties?new=1')}>Add property</Button></Stack></Stack>
      <Grid container spacing={2} mb={2.5}>{usageCards.map(([key,label,Icon])=>{const used=Number(landlord.usage?.[key]||0),limit=Number(landlord.limits?.[key]||0),unlimited=limit>=999999;return <Grid size={{xs:12,sm:6,lg:3}} key={key}><Card variant="outlined" sx={{height:'100%',borderRadius:4}}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography color="text.secondary" fontSize={12} fontWeight={750}>{label.toUpperCase()}</Typography><Typography fontSize={28} fontWeight={950}>{used}<Typography component="span" color="text.secondary" fontSize={13}> / {unlimited?'∞':limit}</Typography></Typography></Box><Icon color="primary"/></Stack>{!unlimited&&<LinearProgress variant="determinate" value={limit?Math.min(100,used/limit*100):0} sx={{mt:2,height:7,borderRadius:9}}/>}<Typography color="text.secondary" fontSize={11.5} mt={1}>{unlimited?'Unlimited':`${Math.max(Number(landlord.remaining?.[key]||0),0)} remaining`}</Typography></CardContent></Card></Grid>;})}</Grid>
      <Grid container spacing={2}>{businessCards.map(([key,label,Icon])=>{const raw=landlord.kpis?.[key]||0;const value=['monthlyRentExpected','rentCollected','pendingRent','overdueRent'].includes(key)?money(Number(raw)):raw;return <Grid size={{xs:12,sm:6,md:4,lg:3}} key={key}><KpiCard label={label} value={value} Icon={Icon}/></Grid>;})}</Grid>
      <Grid container spacing={2.5} mt={.5}><Grid size={{xs:12,lg:8}}><Paper variant="outlined" sx={{p:3,borderRadius:4}}><Typography fontWeight={900}>Landlord operations</Typography><Typography color="text.secondary" fontSize={13} mb={2}>Manage the complete property-to-payment lifecycle from database-backed modules.</Typography><Stack direction="row" gap={1} flexWrap="wrap">{[['Structure','property-management'],['Applications','applications'],['Interviews','tenant-interviews'],['Site visits','property-visits'],['Tenancies','tenancies'],['Invoices','rental-invoices'],['Utilities','utility-readings'],['Promotions','property-promotions']].map(([label,path])=><Button key={path} variant="outlined" onClick={()=>navigate(`/app/${path}`)}>{label}</Button>)}</Stack></Paper></Grid><Grid size={{xs:12,lg:4}}><Paper variant="outlined" sx={{p:3,borderRadius:4}}><Typography fontWeight={900}>Collection health</Typography><Stack direction="row" justifyContent="space-between" mt={2}><Typography color="text.secondary" fontSize={13}>Collected this month</Typography><Typography fontWeight={900}>{money(Number(landlord.kpis?.rentCollected||0))}</Typography></Stack><LinearProgress variant="determinate" value={landlord.kpis?.monthlyRentExpected?Math.min(100,Number(landlord.kpis.rentCollected||0)/Number(landlord.kpis.monthlyRentExpected)*100):0} sx={{height:10,borderRadius:9,mt:1}}/><Typography color="text.secondary" fontSize={12} mt={1}>{money(Number(landlord.kpis?.pendingRent||0))} pending</Typography></Paper></Grid></Grid>
    </Box>;
  }

  return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Box><Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-.04em' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}</Typography><Typography color="text.secondary" sx={{ mt: .5, fontSize: 13.5 }}>Here is what needs your attention today.</Typography></Box>
      <Stack direction="row" spacing={1}>
        {user?.role === 'surveyor' ? <><Button variant="outlined" disabled={working} startIcon={<LoginRounded />} onClick={() => attendance('in')}>Check in</Button><Button variant="contained" disabled={working} startIcon={<LogoutRounded />} onClick={() => attendance('out')}>Check out</Button></> : <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate(`/app/${user?.role === 'user' ? 'applications' : user?.role === 'tenant' ? 'complaints' : 'properties'}`)}>Quick action</Button>}
      </Stack>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    <Grid container spacing={2.2}>
      {visible.map(([key, label, Icon]) => {
        const raw = data?.kpis[key as keyof DashboardOverview['kpis']] || 0;
        const value = ['monthlyRentCollection', 'outstandingDues'].includes(key) ? money(Number(raw)) : raw;
        return <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={key}><KpiCard label={label} value={value} Icon={Icon} /></Grid>;
      })}
      {user?.role === 'surveyor' && <><Grid size={{ xs: 12, sm: 6, md: 4 }}><KpiCard label="Today's Assignments" value={data?.todayAssignments || 0} Icon={RouteRounded} /></Grid><Grid size={{ xs: 12, sm: 6, md: 4 }}><KpiCard label="Approved Surveys" value={data?.completedSurveys || 0} Icon={CloudSyncRounded} /></Grid></>}
    </Grid>

    {user?.role === 'tenant' && data?.nextPayment && <Paper elevation={0} sx={{ mt: 2.5, p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}><Box><Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>NEXT PAYMENT</Typography><Typography sx={{ fontSize: 26, fontWeight: 900 }}>{money(data.nextPayment.amount - (data.nextPayment.paidAmount || 0))}</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>Due {new Date(data.nextPayment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Typography></Box><Button variant="contained" onClick={() => navigate('/app/payments')}>View invoice</Button></Stack></Paper>}

    <Grid container spacing={2.5} sx={{ mt: .5 }}>
      <Grid size={{ xs: 12, lg: 8 }}><Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: 390 }}><Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}><Box><Typography sx={{ fontWeight: 850 }}>Payment collection trend</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>Last six months</Typography></Box><Chip label={`${data?.occupancyRate || 0}% occupancy`} color="primary" variant="outlined" /></Stack><ResponsiveContainer width="100%" height={285}><AreaChart data={data?.revenueTrend || []}><defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="currentColor" stopOpacity={0.3}/><stop offset="95%" stopColor="currentColor" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2}/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}K`}/><Tooltip formatter={(value: number) => money(value)}/><Area type="monotone" dataKey="amount" stroke="currentColor" fill="url(#revenue)" strokeWidth={3}/></AreaChart></ResponsiveContainer></Paper></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: 390 }}><Typography sx={{ fontWeight: 850 }}>Survey status</Typography><Typography color="text.secondary" sx={{ fontSize: 12 }}>Current workload mix</Typography><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={data?.surveyStatus?.length ? data.surveyStatus : [{ name: 'No surveys', value: 1 }]} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} fill="currentColor" opacity={0.75}/><Tooltip formatter={(value: number, name: string) => [value, sentence(name)]}/></PieChart></ResponsiveContainer><Stack spacing={1}>{(data?.surveyStatus || []).slice(0, 4).map((item) => <Stack key={item.name} direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sentence(item.name)}</Typography><Typography sx={{ fontSize: 12, fontWeight: 800 }}>{item.value}</Typography></Stack>)}</Stack></Paper></Grid>
    </Grid>

    <Grid container spacing={2.5} sx={{ mt: .2 }}>
      <Grid size={{ xs: 12, lg: 7 }}><Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontWeight: 850, mb: 2 }}>Recent activity</Typography><Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>{(data?.recentActivities || []).map((activity: any) => <Stack key={activity._id} direction="row" justifyContent="space-between" sx={{ py: 1.5 }}><Box><Typography sx={{ fontSize: 13, fontWeight: 700 }}>{sentence(activity.action || 'Activity')} · {sentence(activity.module || 'system')}</Typography><Typography color="text.secondary" sx={{ fontSize: 11.5 }}>{activity.user?.name || user?.name}</Typography></Box><Typography color="text.secondary" sx={{ fontSize: 11 }}>{new Date(activity.createdAt).toLocaleString('en-IN')}</Typography></Stack>)}</Stack>{!data?.recentActivities?.length && <Typography color="text.secondary">No recent activity.</Typography>}</Paper></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontWeight: 850 }}>Portfolio occupancy</Typography><Stack direction="row" justifyContent="space-between" sx={{ mt: 3, mb: 1 }}><Typography color="text.secondary" sx={{ fontSize: 12 }}>Occupied units</Typography><Typography sx={{ fontWeight: 900 }}>{data?.occupancyRate || 0}%</Typography></Stack><LinearProgress variant="determinate" value={data?.occupancyRate || 0} sx={{ height: 10, borderRadius: 5 }} /><Stack spacing={1.4} sx={{ mt: 3 }}>{(data?.complaintStatus || []).map((item) => <Stack key={item.name} direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sentence(item.name)} complaints</Typography><Chip size="small" label={item.value} /></Stack>)}</Stack></Paper></Grid>
    </Grid>
  </Box>;
}
