import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Alert, Avatar, Box, Breadcrumbs, Button, Chip, CircularProgress, DialogActions, DialogContent, DialogTitle,
  Divider, Drawer, FormControl, IconButton, InputAdornment, LinearProgress, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import ProfessionalDialog from '../../components/shared/ProfessionalDialog';
import {
  AddRounded, ArchiveRounded, AudioFileRounded, CloudUploadRounded, DeleteForeverRounded, DeleteOutlineRounded,
  DescriptionRounded, DownloadRounded, DriveFileMoveRounded, FolderCopyRounded, FolderOpenRounded, FolderRounded,
  GridViewRounded, ImageRounded, InsertDriveFileRounded, LinkRounded, ListRounded, LockRounded, MoreVertRounded,
  MovieRounded, PeopleRounded, PreviewRounded, PublicRounded, RefreshRounded, RestoreFromTrashRounded, SearchRounded,
  ShareRounded, StarBorderRounded, StarRounded, GavelRounded, HistoryRounded, StorageRounded, VerifiedRounded, CameraAltRounded,
} from '@mui/icons-material';
import { toast } from 'sonner';
import {
  addDriveComment, bulkDriveAction, createDriveFolder, createDriveLegalTemplates, createDrivePublicLink, createDriveScannedPdf,
  downloadDriveFile, downloadDriveFolder, driveItemAction, fetchDriveFileBlob, getDriveActivity, getDriveBootstrap,
  getDriveBreadcrumbs, getDriveComments, getDriveFile, getDriveItems, getDriveSharedWithMe, permanentlyDeleteDriveItem,
  revokeDrivePublicLink, setDriveFileApproval, shareDriveItem, updateDriveFile, updateDriveFolder, uploadDriveFile, uploadDriveVersion,
} from '../../services/api';
import { useActionDialog } from '../../components/shared/useActionDialog';

const systemSections = [
  ['my-drive', 'My Drive', FolderOpenRounded], ['recent', 'Recent Files', HistoryRounded], ['starred', 'Starred', StarRounded],
  ['shared', 'Shared With Me', PeopleRounded], ['legal-documents', 'Legal Documents', GavelRounded],
  ['property-documents', 'Property Documents', FolderRounded], ['survey-documents', 'Survey Documents', FolderRounded],
  ['archived-files', 'Archived', ArchiveRounded], ['trash', 'Trash', DeleteOutlineRounded],
] as const;

type DriveItem = Record<string, any> & { _id: string; name: string; itemType?: 'file' | 'folder' };

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
function itemIcon(item: DriveItem) {
  if (item.itemType === 'folder') return <FolderRounded color="primary" />;
  if (item.category === 'image') return <ImageRounded color="success" />;
  if (item.category === 'video') return <MovieRounded color="secondary" />;
  if (item.category === 'audio') return <AudioFileRounded color="warning" />;
  if (item.category === 'legal') return <GavelRounded color="error" />;
  if (item.mimeType?.includes('pdf') || item.category === 'document') return <DescriptionRounded color="error" />;
  return <InsertDriveFileRounded />;
}
function visibilityChip(item: DriveItem) {
  const value = item.visibility || 'private';
  return <Chip size="small" icon={value === 'public' ? <PublicRounded /> : <LockRounded />} label={value.replaceAll('_', ' ')} variant="outlined" sx={{ textTransform: 'capitalize', height: 24 }} />;
}

export default function DocumentVaultPage() {
  const actions = useActionDialog();
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<Record<string, any> | null>(null);
  const [section, setSection] = useState('my-drive');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveItem[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; item: DriveItem } | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [shareDialog, setShareDialog] = useState<DriveItem | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('viewer');
  const [linkDialog, setLinkDialog] = useState<DriveItem | null>(null);
  const [linkOptions, setLinkOptions] = useState({ slug: '', password: '', startsAt: '', expiresAt: '', allowDownload: true, allowPreview: true, maxViews: '', maxDownloads: '', allowedEmails: '', allowedDomains: '', allowedCountries: '', confirmSensitive: false });
  const [publicUrl, setPublicUrl] = useState('');
  const [preview, setPreview] = useState<{ item: DriveItem; url: string } | null>(null);
  const [details, setDetails] = useState<Record<string, any> | null>(null);
  const [activity, setActivity] = useState<Record<string, any>[]>([]);
  const [comments, setComments] = useState<Record<string, any>[]>([]);
  const [comment, setComment] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const systemFolders = useMemo(() => new Map((bootstrap?.folders || []).map((f: DriveItem) => [f.systemKey, f])), [bootstrap]);
  const allItems = useMemo<DriveItem[]>(() => [...folders.map((x) => ({ ...x, itemType: 'folder' } as DriveItem)), ...files.map((x) => ({ ...x, itemType: 'file' } as DriveItem))], [folders, files]);
  const filtered = useMemo(() => search ? allItems.filter((item) => `${item.name} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())) : allItems, [allItems, search]);

  const loadBootstrap = useCallback(async () => {
    const result = await getDriveBootstrap(); setBootstrap(result.data);
    return result.data;
  }, []);

  const load = useCallback(async (targetSection = section, targetFolder = folderId) => {
    setLoading(true); setSelected(new Set());
    try {
      const base = bootstrap || await loadBootstrap();
      if (targetSection === 'shared') {
        const response = await getDriveSharedWithMe();
        setFolders((response.data.folders || []) as DriveItem[]); setFiles((response.data.files || []) as DriveItem[]); setBreadcrumbs([]); setFolderId(null);
      } else if (targetSection === 'recent') {
        setFolders([]); setFiles((base.recent || []) as DriveItem[]); setBreadcrumbs([]); setFolderId(null);
      } else if (targetSection === 'starred') {
        const response = await getDriveItems({ folderId: targetFolder || undefined, starred: true }); setFolders(response.data.folders as DriveItem[]); setFiles(response.data.files as DriveItem[]);
      } else {
        const systemFolder = systemFolders.get(targetSection) || (base.folders || []).find((x: DriveItem) => x.systemKey === targetSection);
        const resolvedFolder = targetFolder || systemFolder?._id || null;
        const status = targetSection === 'trash' ? 'trashed' : targetSection === 'archived-files' ? 'archived' : 'active';
        const response = await getDriveItems({ folderId: resolvedFolder || undefined, status }); setFolders(response.data.folders as DriveItem[]); setFiles(response.data.files as DriveItem[]); setFolderId(resolvedFolder);
        if (resolvedFolder) setBreadcrumbs((await getDriveBreadcrumbs(resolvedFolder)).data as DriveItem[]); else setBreadcrumbs([]);
      }
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [bootstrap, folderId, loadBootstrap, section, systemFolders]);

  useEffect(() => { load(); }, []);

  async function chooseSection(key: string) {
    setSection(key); setFolderId(null); setSearch('');
    const base = bootstrap || await loadBootstrap(); const target = (base.folders || []).find((x: DriveItem) => x.systemKey === key)?._id || null;
    await load(key, target);
  }
  async function openFolder(item: DriveItem) { setFolderId(item._id); await load(section, item._id); }

  async function createFolder() {
    if (!folderName.trim()) return;
    try { await createDriveFolder({ name: folderName, parent: folderId, category: section.includes('legal') ? 'legal' : 'general', sensitive: section.includes('legal') }); toast.success('Folder created'); setFolderDialog(false); setFolderName(''); await load(); }
    catch (error: any) { toast.error(error.message); }
  }

  async function uploadChosenFiles(chosen: File[]) {
    if (!chosen.length) return;
    for (const file of chosen) {
      setUploadProgress((current) => ({ ...current, [file.name]: 0 }));
      try {
        await uploadDriveFile(file, { folder: folderId || '', category: section === 'legal-documents' ? 'legal' : '', confidentiality: section === 'legal-documents' ? 'legal_record' : 'private' }, (percent) => setUploadProgress((current) => ({ ...current, [file.name]: percent })));
        toast.success(`${file.name} uploaded`);
      } catch (error: any) { toast.error(`${file.name}: ${error.message}`); }
      finally { setUploadProgress((current) => { const next = { ...current }; delete next[file.name]; return next; }); }
    }
    await load(); await loadBootstrap();
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files || []); event.target.value = ''; await uploadChosenFiles(chosen);
  }

  async function handleScan(event: ChangeEvent<HTMLInputElement>) {
    const pages = Array.from(event.target.files || []); event.target.value = ''; if (!pages.length) return;
    const progressKey = `Scanned document (${pages.length} page${pages.length === 1 ? '' : 's'})`;
    setUploadProgress((current) => ({ ...current, [progressKey]: 0 }));
    try {
      await createDriveScannedPdf(pages, { folder: folderId || '', name: `Scanned document ${new Date().toISOString().slice(0, 10)}.pdf`, legal: String(section === 'legal-documents') }, (percent) => setUploadProgress((current) => ({ ...current, [progressKey]: percent })));
      toast.success('Scanned pages combined into a PDF'); await load(); await loadBootstrap();
    } catch (error: any) { toast.error(error.message); }
    finally { setUploadProgress((current) => { const next = { ...current }; delete next[progressKey]; return next; }); }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); setDragActive(false);
    const chosen = Array.from(event.dataTransfer.files || []); void uploadChosenFiles(chosen);
  }

  async function itemAction(item: DriveItem, action: string) {
    setMenu(null);
    try {
      if (action === 'open') return item.itemType === 'folder' ? openFolder(item) : openPreview(item);
      if (action === 'download') return item.itemType === 'folder' ? downloadDriveFolder(item._id, item.name) : downloadDriveFile(item._id, item.name);
      if (action === 'star') item.itemType === 'folder' ? await updateDriveFolder(item._id, { starred: !item.starred }) : await updateDriveFile(item._id, { starred: !item.starred });
      if (action === 'trash') await driveItemAction(item.itemType!, item._id, 'trash');
      if (action === 'restore') await driveItemAction(item.itemType!, item._id, 'restore');
      if (action === 'delete') { if (!await actions.askConfirmation(`Permanently delete “${item.name}”? This cannot be undone.`, { title: 'Permanently delete item', danger: true })) return; await permanentlyDeleteDriveItem(item.itemType!, item._id); }
      if (action === 'share') { setShareDialog(item); return; }
      if (action === 'link') { setLinkDialog(item); setPublicUrl(''); return; }
      if (action === 'details') { await openDetails(item); return; }
      toast.success('Updated'); await load(); await loadBootstrap();
    } catch (error: any) { toast.error(error.message); }
  }

  async function openPreview(item: DriveItem) {
    if (item.itemType === 'folder') return openFolder(item);
    try { const blob = await fetchDriveFileBlob(item._id); const url = URL.createObjectURL(blob); setPreview({ item, url }); }
    catch (error: any) { toast.error(error.message); }
  }
  function closePreview() { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); }

  async function openDetails(item: DriveItem) {
    if (item.itemType === 'file') {
      const [fileData, logs, notes] = await Promise.all([getDriveFile(item._id), getDriveActivity(item._id), getDriveComments(item._id)]);
      setDetails(fileData.data); setActivity(logs.data); setComments(notes.data);
    } else { setDetails({ file: item, versions: [], shares: [] }); setActivity((await getDriveActivity(item._id)).data); setComments([]); }
  }

  async function submitShare() {
    if (!shareDialog || !shareEmail) return;
    try { await shareDriveItem(shareDialog.itemType!, shareDialog._id, { email: shareEmail, permission: sharePermission }); toast.success('Access shared'); setShareDialog(null); setShareEmail(''); }
    catch (error: any) { toast.error(error.message); }
  }

  async function createLink() {
    if (!linkDialog) return;
    try {
      const result = await createDrivePublicLink(linkDialog.itemType!, linkDialog._id, { ...linkOptions, expiresAt: linkOptions.expiresAt || undefined }); setPublicUrl(result.data.url); await navigator.clipboard?.writeText(result.data.url); toast.success('Public link created and copied'); await load();
    } catch (error: any) { toast.error(error.message); }
  }

  async function removePublicLink() {
    if (!linkDialog) return; try { await revokeDrivePublicLink(linkDialog.itemType!, linkDialog._id); toast.success('Public access revoked'); setLinkDialog(null); await load(); }
    catch (error: any) { toast.error(error.message); }
  }

  async function buildTemplates() { try { await createDriveLegalTemplates(); toast.success('Legal folders created'); await chooseSection('legal-documents'); } catch (error: any) { toast.error(error.message); } }

  async function addCommentNow() {
    if (!details?.file?._id || !comment.trim()) return; await addDriveComment(details.file._id, comment); setComment(''); setComments((await getDriveComments(details.file._id)).data);
  }

  async function uploadVersionNow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !details?.file?._id) return;
    try { await uploadDriveVersion(details.file._id, file, 'New version uploaded from Document Vault'); toast.success('New version uploaded'); await openDetails({ ...details.file, itemType: 'file' }); await load(); }
    catch (error: any) { toast.error(error.message); } event.target.value = '';
  }

  const usage = bootstrap?.usage?.usedBytes || 0; const quota = bootstrap?.quotaBytes || 1; const percent = Math.min(100, usage / quota * 100);

  return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2.5 }}>
      <Box><Typography variant="h4" sx={{ fontWeight: 900 }}>Document Vault</Typography><Typography color="text.secondary">Your private cloud drive for property, survey and legal records.</Typography></Box>
      <Stack direction="row" gap={1} flexWrap="wrap"><Button variant="outlined" startIcon={<AddRounded />} onClick={() => setFolderDialog(true)}>New folder</Button><Button variant="outlined" startIcon={<CameraAltRounded />} onClick={() => scanRef.current?.click()}>Scan to PDF</Button><Button variant="contained" startIcon={<CloudUploadRounded />} onClick={() => inputRef.current?.click()}>Upload files</Button><input ref={inputRef} hidden type="file" multiple onChange={handleFiles} /><input ref={scanRef} hidden type="file" accept="image/jpeg,image/png" multiple capture="environment" onChange={handleScan} /></Stack>
    </Stack>

    {Object.entries(uploadProgress).map(([name, progress]) => <Paper key={name} sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ fontWeight: 700 }}>{name}</Typography><Typography variant="caption">{progress}%</Typography></Stack><LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 9 }} /></Paper>)}

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '250px minmax(0,1fr)' }, gap: 2.5 }}>
      <Paper sx={{ p: 1.2, borderRadius: 4, alignSelf: 'start', position: { lg: 'sticky' }, top: { lg: 92 } }}>
        <List dense>{systemSections.map(([key, label, Icon]) => <ListItemButton key={key} selected={section === key} onClick={() => chooseSection(key)} sx={{ borderRadius: 2.5, mb: .4 }}><ListItemIcon sx={{ minWidth: 38 }}><Icon fontSize="small" /></ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontWeight: section === key ? 800 : 600, fontSize: 13 }} /></ListItemButton>)}</List>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ p: 1.5 }}><Stack direction="row" alignItems="center" gap={1}><StorageRounded color="primary" /><Typography variant="body2" sx={{ fontWeight: 800 }}>Storage</Typography></Stack><LinearProgress variant="determinate" value={percent} color={percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'primary'} sx={{ mt: 1.2, height: 8, borderRadius: 9 }} /><Typography variant="caption" color="text.secondary">{formatBytes(usage)} of {formatBytes(quota)} used</Typography></Box>
      </Paper>

      <Paper onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }} onDrop={handleDrop} sx={{ borderRadius: 4, overflow: 'hidden', minHeight: 590, position: 'relative', outline: dragActive ? '2px dashed' : 'none', outlineColor: 'primary.main', outlineOffset: -8 }}>
        {dragActive && <Box sx={{ position: 'absolute', inset: 0, zIndex: 5, bgcolor: 'rgba(11,82,112,.12)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><Paper sx={{ px: 4, py: 3, borderRadius: 4, textAlign: 'center' }}><CloudUploadRounded color="primary" sx={{ fontSize: 52 }} /><Typography variant="h6" sx={{ fontWeight: 900 }}>Drop files to upload</Typography><Typography color="text.secondary">Files remain private by default.</Typography></Paper></Box>}
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box>
            <Breadcrumbs maxItems={5}>{breadcrumbs.map((crumb) => <Button key={crumb._id} size="small" onClick={() => openFolder(crumb)} sx={{ minWidth: 0 }}>{crumb.name}</Button>)}</Breadcrumbs>
            <Typography variant="caption" color="text.secondary">{filtered.length} item{filtered.length === 1 ? '' : 's'}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center"><TextField size="small" placeholder="Search this folder" value={search} onChange={(e) => setSearch(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} sx={{ minWidth: { sm: 230 } }} /><Tooltip title="Refresh"><IconButton onClick={() => load()}><RefreshRounded /></IconButton></Tooltip><IconButton onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? <ListRounded /> : <GridViewRounded />}</IconButton></Stack>
        </Stack>

        {section === 'legal-documents' && <Alert severity="info" action={<Button color="inherit" size="small" onClick={buildTemplates}>Create templates</Button>} sx={{ m: 2 }}>Legal records are private by default. Public sharing requires explicit confirmation and creates a permanent audit record.</Alert>}
        {section === 'trash' && <Alert severity="warning" sx={{ m: 2 }}>Items are retained for the configured recovery period. Final signed legal records cannot be permanently deleted by normal users.</Alert>}

        {loading ? <Box sx={{ py: 12, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : filtered.length === 0 ? <Box sx={{ py: 12, px: 3, textAlign: 'center' }}><FolderOpenRounded sx={{ fontSize: 62, color: 'text.disabled' }} /><Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>Nothing here yet</Typography><Typography color="text.secondary">Upload files or create a folder to get started.</Typography></Box> : view === 'grid' ?
          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 1.5 }}>{filtered.map((item) => <Paper key={`${item.itemType}-${item._id}`} variant="outlined" onDoubleClick={() => itemAction(item, 'open')} sx={{ p: 1.8, borderRadius: 3, cursor: 'pointer', position: 'relative', transition: '.18s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box sx={{ width: 48, height: 48, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', borderRadius: 2.5 }}>{itemIcon(item)}</Box><IconButton size="small" onClick={(e) => setMenu({ anchor: e.currentTarget, item })}><MoreVertRounded fontSize="small" /></IconButton></Stack><Typography noWrap sx={{ mt: 1.5, fontWeight: 800, fontSize: 13.5 }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.itemType === 'folder' ? 'Folder' : formatBytes(item.sizeBytes)}</Typography><Stack direction="row" gap={.5} sx={{ mt: 1.2 }} flexWrap="wrap">{visibilityChip(item)}{item.starred && <StarRounded color="warning" sx={{ fontSize: 20 }} />}{item.immutable && <VerifiedRounded color="success" sx={{ fontSize: 20 }} />}</Stack></Paper>)}</Box> :
          <Box>{filtered.map((item) => <Box key={`${item.itemType}-${item._id}`} onDoubleClick={() => itemAction(item, 'open')} sx={{ px: 2, py: 1.3, display: 'grid', gridTemplateColumns: '42px minmax(150px,1fr) 120px 125px 42px', gap: 1, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}><Box>{itemIcon(item)}</Box><Box><Typography noWrap sx={{ fontWeight: 750, fontSize: 13.5 }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.description || item.category || 'Folder'}</Typography></Box><Box>{visibilityChip(item)}</Box><Typography variant="caption" color="text.secondary">{item.itemType === 'folder' ? '—' : formatBytes(item.sizeBytes)}</Typography><IconButton size="small" onClick={(e) => setMenu({ anchor: e.currentTarget, item })}><MoreVertRounded fontSize="small" /></IconButton></Box>)}</Box>}
      </Paper>
    </Box>

    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)} PaperProps={{ sx: { minWidth: 210, borderRadius: 3 } }}>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'open')}><PreviewRounded fontSize="small" sx={{ mr: 1.3 }} />Open / Preview</MenuItem>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'download')}><DownloadRounded fontSize="small" sx={{ mr: 1.3 }} />Download</MenuItem>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'star')}>{menu?.item.starred ? <StarRounded fontSize="small" sx={{ mr: 1.3 }} /> : <StarBorderRounded fontSize="small" sx={{ mr: 1.3 }} />} {menu?.item.starred ? 'Remove star' : 'Add to Starred'}</MenuItem>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'share')}><ShareRounded fontSize="small" sx={{ mr: 1.3 }} />Share privately</MenuItem>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'link')}><LinkRounded fontSize="small" sx={{ mr: 1.3 }} />Public / restricted link</MenuItem>
      <MenuItem onClick={() => menu && itemAction(menu.item, 'details')}><DescriptionRounded fontSize="small" sx={{ mr: 1.3 }} />Details & versions</MenuItem><Divider />
      {section === 'trash' ? <><MenuItem onClick={() => menu && itemAction(menu.item, 'restore')}><RestoreFromTrashRounded fontSize="small" sx={{ mr: 1.3 }} />Restore</MenuItem><MenuItem onClick={() => menu && itemAction(menu.item, 'delete')} sx={{ color: 'error.main' }}><DeleteForeverRounded fontSize="small" sx={{ mr: 1.3 }} />Delete permanently</MenuItem></> : <MenuItem onClick={() => menu && itemAction(menu.item, 'trash')} sx={{ color: 'error.main' }}><DeleteOutlineRounded fontSize="small" sx={{ mr: 1.3 }} />Move to Trash</MenuItem>}
    </Menu>

    <ProfessionalDialog open={folderDialog} onClose={() => setFolderDialog(false)} fullWidth maxWidth="xs"><DialogTitle sx={{ fontWeight: 900 }}>Create folder</DialogTitle><DialogContent><TextField autoFocus fullWidth label="Folder name" value={folderName} onChange={(e) => setFolderName(e.target.value)} sx={{ mt: 1 }} /></DialogContent><DialogActions><Button onClick={() => setFolderDialog(false)}>Cancel</Button><Button variant="contained" onClick={createFolder}>Create</Button></DialogActions></ProfessionalDialog>

    <ProfessionalDialog open={Boolean(shareDialog)} onClose={() => setShareDialog(null)} fullWidth maxWidth="sm"><DialogTitle sx={{ fontWeight: 900 }}>Share “{shareDialog?.name}”</DialogTitle><DialogContent><Stack gap={2} sx={{ mt: 1 }}><TextField label="User or external email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} /><FormControl><Select value={sharePermission} onChange={(e) => setSharePermission(e.target.value)}>{['viewer','commenter','downloader','uploader','editor','manager','co_owner'].map((x) => <MenuItem key={x} value={x}>{x.replace('_',' ')}</MenuItem>)}</Select></FormControl><Alert severity="info">Removing access immediately removes the item from the recipient’s Shared With Me section.</Alert></Stack></DialogContent><DialogActions><Button onClick={() => setShareDialog(null)}>Cancel</Button><Button variant="contained" onClick={submitShare}>Share</Button></DialogActions></ProfessionalDialog>

    <ProfessionalDialog open={Boolean(linkDialog)} onClose={() => setLinkDialog(null)} fullWidth maxWidth="sm"><DialogTitle sx={{ fontWeight: 900 }}>Public or restricted link</DialogTitle><DialogContent><Stack gap={2} sx={{ mt: 1 }}><TextField label="Custom link name (optional)" value={linkOptions.slug} onChange={(e) => setLinkOptions({ ...linkOptions, slug: e.target.value })} /><TextField label="Optional password" type="password" value={linkOptions.password} onChange={(e) => setLinkOptions({ ...linkOptions, password: e.target.value })} /><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField fullWidth label="Access starts" type="datetime-local" InputLabelProps={{ shrink: true }} value={linkOptions.startsAt} onChange={(e) => setLinkOptions({ ...linkOptions, startsAt: e.target.value })} /><TextField fullWidth label="Link expiry" type="datetime-local" InputLabelProps={{ shrink: true }} value={linkOptions.expiresAt} onChange={(e) => setLinkOptions({ ...linkOptions, expiresAt: e.target.value })} /></Stack><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField fullWidth label="Maximum views" type="number" value={linkOptions.maxViews} onChange={(e) => setLinkOptions({ ...linkOptions, maxViews: e.target.value })} /><TextField fullWidth label="Maximum downloads" type="number" value={linkOptions.maxDownloads} onChange={(e) => setLinkOptions({ ...linkOptions, maxDownloads: e.target.value })} /></Stack><TextField label="Allowed emails (comma separated)" value={linkOptions.allowedEmails} onChange={(e) => setLinkOptions({ ...linkOptions, allowedEmails: e.target.value })} /><TextField label="Allowed email domains (comma separated)" placeholder="company.com" value={linkOptions.allowedDomains} onChange={(e) => setLinkOptions({ ...linkOptions, allowedDomains: e.target.value })} /><TextField label="Allowed country codes (comma separated)" placeholder="IN, SG" value={linkOptions.allowedCountries} onChange={(e) => setLinkOptions({ ...linkOptions, allowedCountries: e.target.value })} /><Stack direction="row" gap={1}><Button fullWidth variant={linkOptions.allowPreview ? 'contained' : 'outlined'} onClick={() => setLinkOptions({ ...linkOptions, allowPreview: !linkOptions.allowPreview })}>{linkOptions.allowPreview ? 'Preview allowed' : 'Preview blocked'}</Button><Button fullWidth variant={linkOptions.allowDownload ? 'contained' : 'outlined'} onClick={() => setLinkOptions({ ...linkOptions, allowDownload: !linkOptions.allowDownload })}>{linkOptions.allowDownload ? 'Downloads allowed' : 'Downloads blocked'}</Button></Stack>{linkDialog && (linkDialog.category === 'legal' || ['confidential','highly_confidential','legal_record','identity_document','financial_document'].includes(linkDialog.confidentiality)) && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setLinkOptions({ ...linkOptions, confirmSensitive: true })}>{linkOptions.confirmSensitive ? 'Confirmed' : 'I understand'}</Button>}>This file may contain identity numbers, signatures, financial details or confidential legal information. Consider sharing a redacted copy.</Alert>}{publicUrl && <TextField label="Share link" value={publicUrl} InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end"><Button onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy</Button></InputAdornment> }} />}</Stack></DialogContent><DialogActions><Button color="error" onClick={removePublicLink}>Revoke existing link</Button><Box sx={{ flex: 1 }} /><Button onClick={() => setLinkDialog(null)}>Close</Button><Button variant="contained" onClick={createLink}>Generate link</Button></DialogActions></ProfessionalDialog>

    <ProfessionalDialog open={Boolean(preview)} onClose={closePreview} fullScreen><DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Box><Typography sx={{ fontWeight: 900 }}>{preview?.item.name}</Typography><Typography variant="caption" color="text.secondary">{preview?.item.mimeType}</Typography></Box><Stack direction="row"><Button startIcon={<DownloadRounded />} onClick={() => preview && downloadDriveFile(preview.item._id, preview.item.name)}>Download</Button><Button onClick={closePreview}>Close</Button></Stack></DialogTitle><DialogContent dividers sx={{ bgcolor: '#101418', display: 'grid', placeItems: 'center', p: 1 }}>{preview && (preview.item.mimeType?.startsWith('image/') ? <img src={preview.url} alt={preview.item.name} style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} /> : preview.item.mimeType?.startsWith('video/') ? <video src={preview.url} controls style={{ maxWidth: '100%', maxHeight: '85vh' }} /> : preview.item.mimeType?.startsWith('audio/') ? <audio src={preview.url} controls /> : preview.item.mimeType?.includes('pdf') || preview.item.mimeType?.startsWith('text/') ? <iframe title={preview.item.name} src={preview.url} style={{ width: '100%', height: '86vh', border: 0, background: 'white' }} /> : <Alert severity="info">Preview is unavailable for this file type. Download the file to open it.</Alert>)}</DialogContent></ProfessionalDialog>

    {actions.dialogs}
    <Drawer anchor="right" open={Boolean(details)} onClose={() => setDetails(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 2.5 } }}>
      {details && <><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{details.file?.name}</Typography><Typography variant="caption" color="text.secondary">{formatBytes(details.file?.sizeBytes)} · Version {details.file?.currentVersion || 1}</Typography></Box><IconButton onClick={() => setDetails(null)}><MoreVertRounded /></IconButton></Stack><Tabs value={0} sx={{ mt: 2 }}><Tab label="Details" /><Tab label="Activity" /><Tab label="Comments" /></Tabs><Divider />
        <Stack gap={1.3} sx={{ py: 2 }}><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Visibility</Typography>{visibilityChip(details.file)}</Stack><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Confidentiality</Typography><Typography sx={{ textTransform: 'capitalize' }}>{details.file?.confidentiality?.replaceAll('_',' ')}</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Approval</Typography><Chip size="small" label={details.file?.approval?.status || 'draft'} /></Stack><Button component="label" variant="outlined" startIcon={<CloudUploadRounded />}>Upload new version<input hidden type="file" onChange={uploadVersionNow} /></Button><Stack direction="row" gap={1}><Button fullWidth variant="outlined" onClick={() => setDriveFileApproval(details.file._id, { status: 'submitted' }).then(() => openDetails({ ...details.file, itemType: 'file' }))}>Request approval</Button><Button fullWidth variant="outlined" color="success" onClick={() => setDriveFileApproval(details.file._id, { status: 'final' }).then(() => openDetails({ ...details.file, itemType: 'file' }))}>Mark final</Button></Stack></Stack>
        <Typography sx={{ fontWeight: 850, mb: 1 }}>Version history</Typography>{(details.versions || []).map((version: any) => <Paper key={version._id} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2.5 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" sx={{ fontWeight: 750 }}>Version {version.version}</Typography><Typography variant="caption" color="text.secondary">{formatBytes(version.sizeBytes)} · {new Date(version.createdAt).toLocaleString()}</Typography></Box>{version.immutable && <VerifiedRounded color="success" />}</Stack></Paper>)}
        <Typography sx={{ fontWeight: 850, mt: 2, mb: 1 }}>Comments</Typography><Stack direction="row" gap={1}><TextField size="small" fullWidth placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><Button variant="contained" onClick={addCommentNow}>Post</Button></Stack>{comments.map((row) => <Stack key={row._id} direction="row" gap={1.2} sx={{ mt: 1.5 }}><Avatar sx={{ width: 30, height: 30 }}>{row.user?.name?.[0]}</Avatar><Box><Typography variant="body2" sx={{ fontWeight: 750 }}>{row.user?.name}</Typography><Typography variant="body2">{row.body}</Typography></Box></Stack>)}
        <Typography sx={{ fontWeight: 850, mt: 2, mb: 1 }}>Recent activity</Typography>{activity.slice(0, 10).map((row) => <Box key={row._id} sx={{ py: .8, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{row.action.replaceAll('_',' ')}</Typography><Typography variant="caption" color="text.secondary">{new Date(row.createdAt).toLocaleString()}</Typography></Box>)}</>}
    </Drawer>
  </Box>;
}
