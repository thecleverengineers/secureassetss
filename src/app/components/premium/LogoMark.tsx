import { Box, Typography } from '@mui/material';
import { useSite } from '../../context/SiteContext';

export function LogoMark({ light = false }: { light?: boolean }) {
  const { data } = useSite();
  const settings = data.settings || {};
  const logoUrl = light ? (settings.logoLightUrl || settings.logoUrl) : settings.logoUrl;
  const name = settings.shortTitle || settings.siteTitle || 'SecureAsset';
  const textColor = light ? '#ffffff' : '#0f172a';
  const boxBg = light ? 'rgba(255, 255, 255, 0.15)' : '#0f172a';
  const boxBorder = light ? 'rgba(255, 255, 255, 0.3)' : 'transparent';
  const shapeBorder = '#ffffff';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {logoUrl ? (
        <Box component="img" src={logoUrl} alt={`${name} logo`} sx={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 1 }} />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, bgcolor: boxBg, border: `1px solid ${boxBorder}`, position: 'relative', overflow: 'hidden', borderRadius: '6px' }}>
          <Box sx={{ position: 'absolute', width: '100%', height: '50%', top: 0, bgcolor: 'rgba(255,255,255,0.1)' }} />
          <Box sx={{ width: 10, height: 10, border: `1.5px solid ${shapeBorder}`, transform: 'rotate(45deg)', borderRadius: '2px' }} />
        </Box>
      )}
      <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '1.02rem', color: textColor, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {name}
      </Typography>
    </Box>
  );
}
