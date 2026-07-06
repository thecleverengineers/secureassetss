import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack, Switch, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ProfessionalDialog from '../../components/shared/ProfessionalDialog';
import LocationFields from '../../components/shared/LocationFields';
import { AddRounded, DeleteRounded, EditRounded, ImageRounded, RefreshRounded, SaveRounded, UploadRounded } from '@mui/icons-material';
import { createResource, deleteResource, getFast2SmsSettings, getResource, testFast2SmsSettings, updateFast2SmsSettings, updateResource, uploadSiteAsset } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { useActionDialog } from '../../components/shared/useActionDialog';
import type { Fast2SmsSettings } from '../../services/types';

type FormShape = Record<string, any>;
const get = (object: any, path: string) => path.split('.').reduce((value, key) => value?.[key], object);
const set = (object: any, path: string, value: any) => { const keys = path.split('.'); let current = object; keys.slice(0, -1).forEach((key) => { current[key] ||= {}; current = current[key]; }); current[keys[keys.length - 1]] = value; return object; };
const sentence = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const siteFields = [
  ['siteTitle', 'Site title'], ['shortTitle', 'Short title'], ['tagline', 'Tagline'], ['description', 'Site description'],
  ['logoUrl', 'Primary logo URL'], ['logoLightUrl', 'Light-mode logo URL'], ['faviconUrl', 'Favicon URL'], ['defaultOgImageUrl', 'Default social image URL'],
  ['brand.primaryColor', 'Primary colour'], ['brand.secondaryColor', 'Secondary colour'], ['brand.accentColor', 'Accent colour'], ['brand.fontFamily', 'Font family'],
  ['contact.email', 'Contact email'], ['contact.phone', 'Contact phone'], ['contact.whatsapp', 'WhatsApp'], ['contact.address', 'Office address'], ['contact.supportHours', 'Support hours'],
  ['social.facebook', 'Facebook URL'], ['social.instagram', 'Instagram URL'], ['social.x', 'X URL'], ['social.linkedin', 'LinkedIn URL'], ['social.youtube', 'YouTube URL'],
  ['seo.defaultTitle', 'Default SEO title'], ['seo.defaultDescription', 'Default SEO description'], ['seo.titleTemplate', 'Title template'], ['seo.robots', 'Default robots'], ['seo.canonicalBaseUrl', 'Canonical base URL'], ['seo.googleSiteVerification', 'Google site verification token'],
  ['map.provider', 'Map provider'], ['map.publicApiKey', 'Public map API key'], ['map.defaultLatitude', 'Default map latitude'], ['map.defaultLongitude', 'Default map longitude'], ['map.defaultZoom', 'Default map zoom'], ['maintenance.message', 'Maintenance message'],
  ['authentication.badge', 'Login badge'], ['authentication.headline', 'Login headline'], ['authentication.description', 'Login description'], ['authentication.features', 'Login feature chips (comma separated)'], ['authentication.footerText', 'Login footer'],
  ['authentication.loginTitle', 'Login title'], ['authentication.loginSubtitle', 'Login subtitle'], ['authentication.registerTitle', 'Registration title'], ['authentication.registerSubtitle', 'Registration subtitle'], ['authentication.otpTitle', 'OTP title'], ['authentication.otpSubtitle', 'OTP subtitle'], ['authentication.forgotTitle', 'Forgot-password title'], ['authentication.forgotSubtitle', 'Forgot-password subtitle'],
] as const;

type CollectionDefinition = { resource: string; title: string; description: string; columns: string[]; fields: Array<{ key: string; label: string; type?: 'text'|'number'|'boolean'|'select'|'textarea'|'array'|'json'; options?: string[]; required?: boolean }> };
const definitions: CollectionDefinition[] = [
  { resource: 'seo-pages', title: 'SEO Pages', description: 'Database-controlled title, description, social cards, robots and structured data for each route.', columns: ['path','title','robots','active'], fields: [
    { key:'path',label:'Route path',required:true },{key:'title',label:'SEO title',required:true},{key:'description',label:'Meta description',type:'textarea'},{key:'keywords',label:'Keywords',type:'array'},
    {key:'canonicalUrl',label:'Canonical URL'},{key:'robots',label:'Robots',options:['index,follow','noindex,follow','noindex,nofollow'],type:'select'},
    {key:'ogTitle',label:'Open Graph title'},{key:'ogDescription',label:'Open Graph description',type:'textarea'},{key:'ogImageUrl',label:'Open Graph image URL'},
    {key:'structuredData',label:'JSON-LD structured data',type:'json'},{key:'active',label:'Active',type:'boolean'},
  ]},
  { resource: 'home-carousel', title: 'Homepage Carousel', description: 'Schedule hero slides, responsive images, calls-to-action and audience targeting.', columns: ['sortOrder','title','audience','startsAt','endsAt','active'], fields: [
    {key:'title',label:'Headline',required:true},{key:'subtitle',label:'Subtitle',type:'textarea'},{key:'eyebrow',label:'Eyebrow text'},
    {key:'imageUrl',label:'Desktop image URL'},{key:'mobileImageUrl',label:'Mobile image URL'},{key:'altText',label:'Image alt text'},
    {key:'primaryCta.label',label:'Primary button label'},{key:'primaryCta.url',label:'Primary button URL'},{key:'secondaryCta.label',label:'Secondary button label'},{key:'secondaryCta.url',label:'Secondary button URL'},
    {key:'textAlign',label:'Text alignment',type:'select',options:['left','center','right']},{key:'audience',label:'Audience',type:'select',options:['all','tenant','landlord','surveyor']},
    {key:'sortOrder',label:'Sort order',type:'number'},{key:'startsAt',label:'Start date'},{key:'endsAt',label:'End date'},{key:'active',label:'Active',type:'boolean'},
  ]},
  { resource: 'home-sections', title: 'Homepage Sections', description: 'Control statistics, featured content, locations, testimonials and calls-to-action.', columns: ['sortOrder','key','type','title','active'], fields: [
    {key:'key',label:'Unique key',required:true},{key:'type',label:'Section type',type:'select',options:['stats','features','featured_properties','featured_surveyors','locations','testimonials','cta','custom'],required:true},
    {key:'title',label:'Title'},{key:'subtitle',label:'Subtitle',type:'textarea'},{key:'content',label:'Section content JSON',type:'json'},{key:'sortOrder',label:'Sort order',type:'number'},{key:'active',label:'Active',type:'boolean'},
  ]},
  { resource: 'property-type-configs', title: 'Property Types', description: 'Configure property categories, hierarchy modes and allowed listing purposes.', columns: ['sortOrder','label','category','hierarchyMode','active'], fields: [
    {key:'key',label:'Key',required:true},{key:'label',label:'Display label',required:true},{key:'category',label:'Category',type:'select',options:['residential','commercial','land','hospitality','event','other']},
    {key:'hierarchyMode',label:'Hierarchy mode',type:'select',options:['simple','building','apartment_building','pg_hostel','commercial','land']},{key:'allowedPurposes',label:'Purposes',type:'array'},{key:'fields',label:'Dynamic form fields JSON',type:'json'},{key:'sortOrder',label:'Sort order',type:'number'},{key:'active',label:'Active',type:'boolean'},
  ]},
  { resource: 'area-units', title: 'Area Units', description: 'Manage regional conversion values for square feet, square metres, Bigha, Katha, Lessa and other units.', columns: ['sortOrder','label','symbol','squareMetreFactor','active'], fields: [
    {key:'key',label:'Key',required:true},{key:'label',label:'Label',required:true},{key:'symbol',label:'Symbol'},{key:'squareMetreFactor',label:'Square metre factor',type:'number',required:true},
    {key:'region.country',label:'Country'},{key:'region.state',label:'State / Province'},{key:'region.city',label:'City'},{key:'sortOrder',label:'Sort order',type:'number'},{key:'active',label:'Active',type:'boolean'},
  ]},
  { resource: 'landlord-plans', title: 'Landlord Plans', description: 'Set building, apartment, room, bed, public listing, tenant, storage and team limits.', columns: ['rank','name','prices.monthly','limits.buildings','limits.apartments','limits.rooms','active'], fields: [
    {key:'key',label:'Plan key',required:true},{key:'name',label:'Plan name',required:true},{key:'description',label:'Description',type:'textarea'},{key:'rank',label:'Rank',type:'number'},
    {key:'prices.monthly',label:'Monthly price',type:'number'},{key:'prices.yearly',label:'Yearly price',type:'number'},{key:'limits.properties',label:'Properties',type:'number'},
    {key:'limits.buildings',label:'Buildings',type:'number'},{key:'limits.apartments',label:'Apartments',type:'number'},{key:'limits.rooms',label:'Rooms',type:'number'},{key:'limits.beds',label:'Beds',type:'number'},
    {key:'limits.publicListings',label:'Public listings',type:'number'},{key:'limits.activeTenants',label:'Active tenants',type:'number'},{key:'limits.storageMB',label:'Storage MB',type:'number'},{key:'limits.teamMembers',label:'Team members',type:'number'},
    {key:'features.rentAutomation',label:'Rent automation',type:'boolean'},{key:'features.advancedReports',label:'Advanced reports',type:'boolean'},{key:'features.propertyPromotions',label:'Promotions',type:'boolean'},
    {key:'features.tenantInterviews',label:'Tenant interviews',type:'boolean'},{key:'features.utilityBilling',label:'Utility billing',type:'boolean'},{key:'features.apiAccess',label:'API access',type:'boolean'},
    {key:'graceDays',label:'Grace period days',type:'number'},{key:'featured',label:'Featured plan',type:'boolean'},{key:'active',label:'Active',type:'boolean'},
  ]},
];

function AssetUpload({ value, onChange, label }: { value?: string; onChange: (value:string)=>void; label:string }) {
  const [working,setWorking]=useState(false);
  async function upload(event: ChangeEvent<HTMLInputElement>) { const file=event.target.files?.[0]; if(!file)return; setWorking(true); try { const result=await uploadSiteAsset(file); onChange(result.data.url); } finally { setWorking(false); event.target.value=''; } }
  return <Stack spacing={1}><TextField label={label} value={value || ''} onChange={(event)=>onChange(event.target.value)} fullWidth size="small" /><Button component="label" variant="outlined" startIcon={working?<CircularProgress size={16}/>:<UploadRounded/>} disabled={working}>Upload image<input hidden type="file" accept="image/*" onChange={upload}/></Button>{value&&<Box component="img" src={value} alt={label} sx={{height:72,maxWidth:220,objectFit:'contain',border:'1px solid',borderColor:'divider',borderRadius:2,p:1}}/>}</Stack>;
}

function CollectionEditor({ definition }: { definition: CollectionDefinition }) {
  const actions = useActionDialog();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ row?: any } | null>(null);
  const [form, setForm] = useState<FormShape>({});

  async function load() {
    setLoading(true); setError('');
    try { setRows((await getResource(definition.resource, { limit: 100 })).data); }
    catch (caught) { setError((caught as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [definition.resource]);

  function open(row?: any) {
    const next: FormShape = {};
    definition.fields.forEach((field) => {
      const value = get(row || {}, field.key);
      next[field.key] = field.type === 'array' && Array.isArray(value) ? value.join(', ')
        : field.type === 'json' && value ? JSON.stringify(value, null, 2)
          : value ?? (field.type === 'boolean' ? false : '');
    });
    setForm(next); setDialog({ row });
  }

  async function save() {
    try {
      const payload: FormShape = {};
      definition.fields.forEach((field) => {
        let value = form[field.key];
        if (field.type === 'number') value = value === '' ? undefined : Number(value);
        if (field.type === 'boolean') value = Boolean(value);
        if (field.type === 'array') value = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
        if (field.type === 'json' && typeof value === 'string' && value.trim()) value = JSON.parse(value);
        if (value !== '' && value !== undefined) set(payload, field.key, value);
      });
      dialog?.row ? await updateResource(definition.resource, dialog.row._id, payload) : await createResource(definition.resource, payload);
      setDialog(null); await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function remove(row: any) {
    if (!await actions.askConfirmation(`Delete ${row.title || row.name || row.label || row.key}?`, { title: 'Delete record', danger: true })) return;
    try { await deleteResource(definition.resource, row._id); await load(); }
    catch (caught) { setError((caught as Error).message); }
  }

  const hasRegionalSelector = definition.fields.some((field) => field.key === 'region.country');

  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <Box><Typography variant="h6" fontWeight={900}>{definition.title}</Typography><Typography color="text.secondary" fontSize={13}>{definition.description}</Typography></Box>
      <Stack direction="row" spacing={1}><Button startIcon={<RefreshRounded />} onClick={load}>Refresh</Button><Button variant="contained" startIcon={<AddRounded />} onClick={() => open()}>Add</Button></Stack>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {loading ? <CircularProgress /> : <Grid container spacing={1.5}>{rows.map((row) => <Grid size={{ xs: 12, md: 6, xl: 4 }} key={row._id}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent><Stack direction="row" justifyContent="space-between"><Box sx={{ minWidth: 0 }}><Typography fontWeight={850} noWrap>{row.title || row.name || row.label || row.path || row.key}</Typography><Stack direction="row" gap={.7} flexWrap="wrap" mt={1}>{definition.columns.slice(1).map((column) => <Chip key={column} size="small" label={`${sentence(column.split('.').at(-1) || column)}: ${String(get(row, column) ?? '—')}`} variant="outlined" />)}</Stack></Box><Stack><IconButton onClick={() => open(row)}><EditRounded /></IconButton><IconButton color="error" onClick={() => remove(row)}><DeleteRounded /></IconButton></Stack></Stack></CardContent></Card></Grid>)}</Grid>}
    {!loading && !rows.length && <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderStyle: 'dashed' }}><Typography fontWeight={800}>No records yet</Typography></Paper>}
    {actions.dialogs}
    <ProfessionalDialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="md">
      <DialogTitle fontWeight={900}>{dialog?.row ? 'Edit' : 'Add'} {definition.title}</DialogTitle>
      <DialogContent dividers><Grid container spacing={2}>
        {hasRegionalSelector && <Grid size={{ xs: 12 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}><LocationFields value={{ country: form['region.country'], state: form['region.state'], city: form['region.city'] }} onChange={(next) => setForm((old) => ({ ...old, 'region.country': next.country || '', 'region.state': next.state || '', 'region.city': next.city || '' }))} /></Box></Grid>}
        {definition.fields.map((field) => {
          if (hasRegionalSelector && ['region.country', 'region.state', 'region.city'].includes(field.key)) return null;
          return <Grid size={{ xs: 12, sm: field.type === 'textarea' || field.type === 'json' ? 12 : 6 }} key={field.key}>
            {field.type === 'boolean' ? <FormControlLabel control={<Switch checked={Boolean(form[field.key])} onChange={(_, checked) => setForm((old) => ({ ...old, [field.key]: checked }))} />} label={field.label} />
              : <TextField fullWidth size="small" select={field.type === 'select'} multiline={field.type === 'textarea' || field.type === 'json'} rows={field.type === 'json' ? 7 : field.type === 'textarea' ? 3 : undefined} type={field.type === 'number' ? 'number' : 'text'} required={field.required} label={field.label} value={form[field.key] ?? ''} onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))}>{field.options?.map((option) => <MenuItem key={option} value={option}>{sentence(option)}</MenuItem>)}</TextField>}
          </Grid>;
        })}
      </Grid></DialogContent>
      <DialogActions><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="contained" startIcon={<SaveRounded />} onClick={save}>Save</Button></DialogActions>
    </ProfessionalDialog>
  </Stack>;
}


function Fast2SmsAdministration(){
  const empty:Fast2SmsSettings={enabled:false,endpoint:'https://www.fast2sms.com/dev/bulkV2',route:'dlt',senderId:'SECAST',messageId:'204251',variablesTemplate:'{otp}',scheduleTime:'',authorizationConfigured:false,status:'unconfigured',lastError:''};
  const [form,setForm]=useState<Fast2SmsSettings>(empty);const [authorization,setAuthorization]=useState('');const [testMobile,setTestMobile]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){setLoading(true);setError('');try{setForm((await getFast2SmsSettings()).data);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function save(){setSaving(true);setError('');setMessage('');try{const result=await updateFast2SmsSettings({enabled:form.enabled,endpoint:form.endpoint,route:form.route,senderId:form.senderId,messageId:form.messageId,variablesTemplate:form.variablesTemplate,scheduleTime:form.scheduleTime,authorization:authorization||undefined});setForm(result.data);setAuthorization('');setMessage('Fast2SMS configuration saved.');}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
  async function test(){setSaving(true);setError('');setMessage('');try{const result=await testFast2SmsSettings(testMobile);setMessage(result.message||'Test OTP sent.');await load();}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
  if(loading)return <Box sx={{py:8,display:'grid',placeItems:'center'}}><CircularProgress/></Box>;
  return <Stack spacing={3}><Box><Typography variant="h6" fontWeight={900}>Fast2SMS mobile OTP</Typography><Typography color="text.secondary" fontSize={13}>Controls registration verification, OTP login and password-reset OTP delivery. The authorization key is encrypted before storage and is never returned to the browser.</Typography></Box>{error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success">{message}</Alert>}<Stack direction="row" spacing={1} flexWrap="wrap"><Chip label={`Status: ${form.status||'unconfigured'}`} color={form.status==='healthy'?'success':form.status==='error'?'error':'default'}/><Chip label={form.authorizationConfigured?'Authorization configured':'Authorization missing'} color={form.authorizationConfigured?'success':'warning'}/>{form.lastCheckedAt&&<Chip label={`Last checked: ${new Date(form.lastCheckedAt).toLocaleString()}`} variant="outlined"/>}</Stack>{form.lastError&&<Alert severity="warning">Last provider error: {form.lastError}</Alert>}<FormControlLabel control={<Switch checked={form.enabled} onChange={(_,checked)=>setForm((old)=>({...old,enabled:checked}))}/>} label="Enable Fast2SMS OTP delivery"/><Grid container spacing={2}><Grid size={{xs:12}}><TextField fullWidth label="API endpoint" value={form.endpoint} onChange={(e)=>setForm((old)=>({...old,endpoint:e.target.value}))}/></Grid><Grid size={{xs:12,md:4}}><TextField fullWidth label="Route" value={form.route} onChange={(e)=>setForm((old)=>({...old,route:e.target.value}))}/></Grid><Grid size={{xs:12,md:4}}><TextField fullWidth label="Sender ID" value={form.senderId} onChange={(e)=>setForm((old)=>({...old,senderId:e.target.value.toUpperCase()}))}/></Grid><Grid size={{xs:12,md:4}}><TextField fullWidth label="DLT message/template ID" value={form.messageId} onChange={(e)=>setForm((old)=>({...old,messageId:e.target.value}))}/></Grid><Grid size={{xs:12,md:6}}><TextField fullWidth type="password" label={form.authorizationConfigured?'New authorization key (leave blank to keep current)':'Fast2SMS authorization key'} value={authorization} onChange={(e)=>setAuthorization(e.target.value)} helperText="Enter the complete key from Fast2SMS, not a masked value."/></Grid><Grid size={{xs:12,md:6}}><TextField fullWidth label="Schedule time (optional)" value={form.scheduleTime} onChange={(e)=>setForm((old)=>({...old,scheduleTime:e.target.value}))}/></Grid><Grid size={{xs:12}}><TextField fullWidth label="variables_values template" value={form.variablesTemplate} onChange={(e)=>setForm((old)=>({...old,variablesTemplate:e.target.value}))} helperText="Use {otp} for the six-digit OTP and {name} for the account name. Separate multiple DLT variables with |."/></Grid></Grid><Stack direction="row" spacing={1}><Button variant="contained" startIcon={<SaveRounded/>} disabled={saving} onClick={save}>{saving?'Saving…':'Save OTP settings'}</Button><Button startIcon={<RefreshRounded/>} onClick={load}>Refresh</Button></Stack><Divider/><Box><Typography fontWeight={900}>Send test OTP</Typography><Typography color="text.secondary" fontSize={13}>Sends 123456 using the saved configuration.</Typography></Box><Stack direction={{xs:'column',sm:'row'}} spacing={1}><TextField label="Test mobile number" value={testMobile} onChange={(e)=>setTestMobile(e.target.value.replace(/\D/g,'').slice(0,12))}/><Button variant="outlined" disabled={saving||!form.enabled} onClick={test}>Send test OTP</Button></Stack></Stack>;
}

export default function SiteAdministrationPage(){
  const [tab,setTab]=useState(0);const [settings,setSettings]=useState<FormShape>({});const [settingsId,setSettingsId]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [saved,setSaved]=useState('');const {refresh}=useSite();
  async function load(){setLoading(true);try{const rows=(await getResource('site-settings',{limit:1})).data;const row=rows[0]||{};setSettings(row);setSettingsId(row._id||'');}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function saveSettings(){try{const payload={...settings};delete payload._id;delete payload.createdAt;delete payload.updatedAt;delete payload.__v;settingsId?await updateResource('site-settings',settingsId,payload):await createResource('site-settings',payload);setSaved('Site settings published');await load();await refresh();}catch(e){setError((e as Error).message);}}
  const tabs=useMemo(()=>['Site Identity','SMS / OTP',...definitions.map((item)=>item.title)],[]);
  if(loading)return <Box sx={{py:16,display:'grid',placeItems:'center'}}><CircularProgress/></Box>;
  return <Box sx={{px:{xs:2,sm:3,lg:4},pb:6}}><Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" spacing={2} mb={3}><Box><Typography variant="h4" fontWeight={950}>Site & Marketplace Administration</Typography><Typography color="text.secondary">Publish branding, SEO, homepage content, property types, area units and subscription plans directly from MongoDB.</Typography></Box>{tab===0&&<Button variant="contained" startIcon={<SaveRounded/>} onClick={saveSettings}>Publish site settings</Button>}</Stack>
  {error&&<Alert severity="error" onClose={()=>setError('')} sx={{mb:2}}>{error}</Alert>}{saved&&<Alert severity="success" onClose={()=>setSaved('')} sx={{mb:2}}>{saved}</Alert>}
  <Paper variant="outlined" sx={{borderRadius:4,overflow:'hidden'}}><Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" scrollButtons="auto" sx={{px:2,borderBottom:'1px solid',borderColor:'divider'}}>{tabs.map((label)=><Tab key={label} label={label}/>)}</Tabs><Box sx={{p:{xs:2,md:3}}}>{tab===0?<Stack spacing={3}><Box><Typography variant="h6" fontWeight={900}>Brand and identity</Typography><Typography color="text.secondary" fontSize={13}>These values drive the navigation logo, browser metadata, footer, colours and public pages.</Typography></Box><Grid container spacing={2}>{siteFields.filter(([key])=>!['logoUrl','logoLightUrl','faviconUrl','defaultOgImageUrl'].includes(key)).map(([key,label])=><Grid size={{xs:12,md:key==='description'||key==='tagline'||key==='contact.address'?12:6}} key={key}><TextField fullWidth size="small" multiline={key==='description'||key==='tagline'||key==='contact.address'} rows={key==='description'?4:undefined} label={label} value={key==='authentication.features' && Array.isArray(get(settings,key)) ? get(settings,key).join(', ') : get(settings,key)??''} onChange={(event)=>setSettings((old)=>set({...old},key,key==='authentication.features'?event.target.value.split(',').map((item)=>item.trim()).filter(Boolean):event.target.value))} type={key.includes('Color')?'color':'text'}/></Grid>)}</Grid><Divider/><Typography variant="h6" fontWeight={900}>Brand assets</Typography><Grid container spacing={2}>{[['logoUrl','Primary logo'],['logoLightUrl','Light logo'],['faviconUrl','Favicon'],['defaultOgImageUrl','Social image']].map(([key,label])=><Grid size={{xs:12,md:6}} key={key}><AssetUpload label={label} value={get(settings,key)} onChange={(value)=>setSettings((old)=>set({...old},key,value))}/></Grid>)}</Grid><Divider/><Stack direction="row" gap={3} flexWrap="wrap"><FormControlLabel control={<Switch checked={Boolean(get(settings,'homepage.heroEnabled'))} onChange={(_,value)=>setSettings((old)=>set({...old},'homepage.heroEnabled',value))}/>} label="Homepage hero"/><FormControlLabel control={<Switch checked={Boolean(get(settings,'homepage.featuredPropertiesEnabled'))} onChange={(_,value)=>setSettings((old)=>set({...old},'homepage.featuredPropertiesEnabled',value))}/>} label="Featured properties"/><FormControlLabel control={<Switch checked={Boolean(get(settings,'homepage.featuredSurveyorsEnabled'))} onChange={(_,value)=>setSettings((old)=>set({...old},'homepage.featuredSurveyorsEnabled',value))}/>} label="Featured surveyors"/><FormControlLabel control={<Switch checked={Boolean(get(settings,'homepage.statsEnabled'))} onChange={(_,value)=>setSettings((old)=>set({...old},'homepage.statsEnabled',value))}/>} label="Homepage statistics"/><FormControlLabel control={<Switch checked={Boolean(get(settings,'maintenance.enabled'))} onChange={(_,value)=>setSettings((old)=>set({...old},'maintenance.enabled',value))}/>} label="Maintenance mode"/><FormControlLabel control={<Switch checked={get(settings,'authentication.allowRegistration')!==false} onChange={(_,value)=>setSettings((old)=>set({...old},'authentication.allowRegistration',value))}/>} label="Allow registration"/><FormControlLabel control={<Switch checked={get(settings,'authentication.allowPasswordLogin')!==false} onChange={(_,value)=>setSettings((old)=>set({...old},'authentication.allowPasswordLogin',value))}/>} label="Allow password login"/><FormControlLabel control={<Switch checked={get(settings,'authentication.allowOtpLogin')!==false} onChange={(_,value)=>setSettings((old)=>set({...old},'authentication.allowOtpLogin',value))}/>} label="Allow OTP login"/><FormControlLabel control={<Switch checked={Boolean(get(settings,'authentication.showDemoAccounts'))} onChange={(_,value)=>setSettings((old)=>set({...old},'authentication.showDemoAccounts',value))}/>} label="Show demo accounts"/></Stack></Stack>:tab===1?<Fast2SmsAdministration/>:<CollectionEditor definition={definitions[tab-2]}/>}</Box></Paper></Box>;
}
