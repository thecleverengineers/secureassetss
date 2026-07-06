import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Divider, IconButton, InputAdornment, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import { EmailRounded, LockRounded, PhoneAndroidRounded, SecurityRounded, VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material';
import { LogoMark } from '../components/premium/LogoMark';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { forgotPassword, resendRegistrationOtp, resetPassword, sendOtp } from '../services/api';

const demoAccounts = [
  ['Admin', 'admin@secureasset.in'], ['Manager', 'manager@secureasset.in'], ['Tenant / Landlord', 'tenant@secureasset.in'], ['Surveyor', 'surveyor@secureasset.in'],
];
type Mode = 'login' | 'register' | 'otp' | 'forgot' | 'two-factor';

export default function LoginPage() {
  const navigate = useNavigate(); const auth = useAuth(); const { data } = useSite();
  const settings = data.settings || {}; const content = settings.authentication || {};
  const showDemoAccounts = Boolean(content.showDemoAccounts) && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true');
  const modes = useMemo(() => [content.allowPasswordLogin !== false && 'login', content.allowRegistration !== false && 'register', content.allowOtpLogin !== false && 'otp'].filter(Boolean) as Mode[], [content]);
  const [mode, setMode] = useState<Mode>(modes[0] || 'login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState(showDemoAccounts ? 'admin@secureasset.in' : '');
  const [password, setPassword] = useState(showDemoAccounts ? 'Demo@123' : ''); const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState(''); const [otpSent, setOtpSent] = useState(false);
  const [challengeToken, setChallengeToken] = useState(''); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const titles: Record<Mode,string> = { login: content.loginTitle || 'Welcome back', register: content.registerTitle || 'Create your account', otp: content.otpTitle || 'Mobile OTP login', forgot: content.forgotTitle || 'Reset password', 'two-factor': 'Two-factor verification' };
  const subtitles: Record<Mode,string> = {
    login: content.loginSubtitle || 'Sign in using your email address or mobile number.',
    register: content.registerSubtitle || 'Create an account and verify your mobile number.',
    otp: content.otpSubtitle || 'Receive a secure OTP on your registered mobile.',
    forgot: content.forgotSubtitle || 'Enter your registered email or mobile. The OTP will be sent to your registered mobile.',
    'two-factor': 'Enter an authenticator code or one of your backup codes.',
  };

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      if (mode === 'two-factor') { await auth.completeTwoFactor(challengeToken, otp); navigate('/app/dashboard'); return; }
      if (mode === 'login') {
        const result = await auth.login(identifier, password);
        if (result.challenge) { setChallengeToken(result.challenge.challengeToken); setMode('two-factor'); setOtp(''); return; }
        navigate('/app/dashboard'); return;
      }
      if (mode === 'register') {
        if (!otpSent) {
          const challenge = await auth.register({ name, email, phone, password });
          setPhone(challenge.identifier); setOtpSent(true); setMessage(`OTP sent to ${challenge.maskedMobile}.`); return;
        }
        await auth.verifyRegistration(phone, otp); navigate('/app/dashboard'); return;
      }
      if (mode === 'forgot') {
        if (!otpSent) {
          const result = await forgotPassword(identifier);
          setOtpSent(true); setMessage(result.message || 'Password reset OTP sent to the registered mobile.');
          if (result.developmentOtp) setMessage(`Development OTP: ${result.developmentOtp}`);
          return;
        }
        if (password !== confirmPassword) throw new Error('Passwords do not match');
        await resetPassword(identifier, otp, password); setMessage('Password reset successfully. You can now sign in.'); setOtpSent(false); setOtp(''); setPassword(''); setConfirmPassword(''); return;
      }
      if (mode === 'otp') {
        if (!otpSent) {
          const result = await sendOtp({ identifier }); setOtpSent(true);
          setMessage(result.developmentOtp ? `Development OTP: ${result.developmentOtp}` : result.message || 'OTP sent to the registered mobile.'); return;
        }
        const result = await auth.verifyOtp({ identifier, otp });
        if (result.challenge) { setChallengeToken(result.challenge.challengeToken); setMode('two-factor'); setOtp(''); return; }
        navigate('/app/dashboard');
      }
    } catch (exception) { setError((exception as Error).message); }
    finally { setLoading(false); }
  }

  function changeMode(next: Mode) {
    setMode(next); setOtpSent(false); setChallengeToken(''); setOtp(''); setError(''); setMessage(''); setConfirmPassword('');
  }
  function selectDemo(account: string) { changeMode('login'); setIdentifier(account); setPassword('Demo@123'); }
  async function resendRegistration() {
    setLoading(true); setError('');
    try { const result = await resendRegistrationOtp(phone); setMessage(result.developmentOtp ? `Development OTP: ${result.developmentOtp}` : result.message || 'OTP resent.'); }
    catch (exception) { setError((exception as Error).message); }
    finally { setLoading(false); }
  }

  const identifierField = <TextField label="Email or mobile number" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required InputProps={{ startAdornment: <InputAdornment position="start"><EmailRounded fontSize="small" /></InputAdornment> }} />;
  const passwordField = (label = 'Password') => <TextField label={label} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required helperText={mode === 'register' || mode === 'forgot' ? 'At least 8 characters with uppercase, lowercase and a number.' : undefined} InputProps={{ startAdornment: <InputAdornment position="start"><LockRounded fontSize="small" /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment> }} />;

  let actionLabel = 'Continue';
  if (mode === 'login') actionLabel = 'Sign in';
  if (mode === 'register') actionLabel = otpSent ? 'Verify mobile and create account' : 'Send verification OTP';
  if (mode === 'forgot') actionLabel = otpSent ? 'Reset password' : 'Send reset OTP';
  if (mode === 'otp') actionLabel = otpSent ? 'Verify OTP' : 'Send OTP';
  if (mode === 'two-factor') actionLabel = 'Verify and sign in';

  return <Box sx={{ minHeight: '100vh', bgcolor: '#eef3f6', display: 'grid', placeItems: 'center', py: 4 }}>
    <Container maxWidth="lg"><Paper elevation={0} sx={{ overflow: 'hidden', borderRadius: 6, border: '1px solid rgba(11,82,112,.12)', boxShadow: '0 35px 80px rgba(7,63,86,.12)' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' } }}>
      <Box sx={{ bgcolor: settings.brand?.primaryColor || '#073F56', color: 'white', p: { xs: 4, md: 7 }, minHeight: { md: 680 }, display: 'flex', flexDirection: 'column' }}>
        {settings.logoLightUrl ? <Box component="img" src={settings.logoLightUrl} alt={settings.siteTitle || 'SecureAsset'} sx={{ height: 42, width: 'auto', alignSelf: 'flex-start' }} /> : <LogoMark light />}
        <Box sx={{ my: 'auto', py: 5 }}><Chip label={content.badge || 'Enterprise property operations'} sx={{ bgcolor: 'rgba(255,255,255,.12)', color: 'white', mb: 3 }} />
          <Typography sx={{ fontSize: { xs: 34, md: 50 }, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-.055em' }}>{content.headline || 'Every property workflow. One secure platform.'}</Typography>
          <Typography sx={{ mt: 2.5, maxWidth: 520, color: 'rgba(255,255,255,.68)', fontSize: 15, lineHeight: 1.8 }}>{content.description || settings.description}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 4 }}>{(content.features || []).map((item: string) => <Chip key={item} label={item} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,.25)', color: 'rgba(255,255,255,.82)' }} />)}</Stack>
        </Box><Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{settings.shortTitle || 'SecureAsset'} · {content.footerText || settings.tagline}</Typography>
      </Box>
      <Box sx={{ p: { xs: 3, sm: 5, md: 6 }, bgcolor: 'white' }}><Typography sx={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.04em' }}>{titles[mode]}</Typography><Typography color="text.secondary" sx={{ mt: .8, mb: 3, fontSize: 13.5 }}>{subtitles[mode]}</Typography>
        {mode !== 'two-factor' && <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: .7 }}>{modes.map((item) => <Button key={item} size="small" variant={mode === item ? 'contained' : 'outlined'} onClick={() => changeMode(item)}>{item === 'otp' ? 'OTP login' : item}</Button>)}</Stack>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        <Box component="form" onSubmit={submit}><Stack spacing={2}>
          {mode === 'login' && identifierField}
          {mode === 'login' && passwordField()}

          {mode === 'register' && !otpSent && <><TextField label="Full name" value={name} onChange={(event) => setName(event.target.value)} required /><TextField label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required InputProps={{ startAdornment: <InputAdornment position="start"><EmailRounded fontSize="small" /></InputAdornment> }} /><TextField label="Mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 12))} required helperText="Indian mobile number used for OTP verification." InputProps={{ startAdornment: <InputAdornment position="start"><PhoneAndroidRounded fontSize="small" /></InputAdornment> }} />{passwordField()}</>}
          {mode === 'register' && otpSent && <><Alert severity="info">Enter the six-digit OTP sent to your mobile. Your account remains inactive until verification succeeds.</Alert><TextField label="6-digit mobile OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required inputProps={{ inputMode: 'numeric', maxLength: 6 }} /><Button onClick={resendRegistration} disabled={loading}>Resend OTP</Button></>}

          {mode === 'otp' && identifierField}
          {mode === 'otp' && otpSent && <TextField label="6-digit OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required inputProps={{ inputMode: 'numeric', maxLength: 6 }} />}

          {mode === 'forgot' && identifierField}
          {mode === 'forgot' && otpSent && <><TextField label="6-digit reset OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required inputProps={{ inputMode: 'numeric', maxLength: 6 }} />{passwordField('New password')}<TextField label="Confirm new password" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></>}

          {mode === 'two-factor' && <TextField label="Authenticator or backup code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\s/g, '').slice(0, 16))} InputProps={{ startAdornment: <InputAdornment position="start"><SecurityRounded /></InputAdornment> }} required />}
          <Button type="submit" variant="contained" size="large" disabled={loading} sx={{ py: 1.45, borderRadius: 3, fontWeight: 800 }}>{loading ? <CircularProgress size={22} color="inherit" /> : actionLabel}</Button>
          {mode === 'login' && <Button size="small" onClick={() => changeMode('forgot')}>Forgot password?</Button>}
          {mode === 'forgot' && otpSent && <Button size="small" onClick={() => setOtpSent(false)}>Use another email or mobile number</Button>}
          {mode === 'two-factor' && <Button size="small" onClick={() => changeMode('login')}>Return to sign in</Button>}
        </Stack></Box>
        {showDemoAccounts && mode !== 'two-factor' && <><Divider sx={{ my: 3 }}>Demo workspaces</Divider><Typography color="text.secondary" sx={{ fontSize: 11.5, mb: 1.5 }}>All demo accounts use <b>Demo@123</b>.</Typography><Stack direction="row" flexWrap="wrap" gap={1}>{demoAccounts.map(([label, account]) => <Chip key={account} clickable label={label} onClick={() => selectDemo(account)} variant="outlined" />)}</Stack></>}
      </Box>
    </Box></Paper></Container>
  </Box>;
}
