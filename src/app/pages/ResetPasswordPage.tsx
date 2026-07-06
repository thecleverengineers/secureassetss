import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { forgotPassword, resetPassword } from '../services/api';
import { useSite } from '../context/SiteContext';

export default function ResetPasswordPage() {
  const { data } = useSite();
  const [identifier,setIdentifier]=useState(''); const [otp,setOtp]=useState(''); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState('');
  const [sent,setSent]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [done,setDone]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try{
      if(!sent){const result=await forgotPassword(identifier);setSent(true);setMessage(result.developmentOtp?`Development OTP: ${result.developmentOtp}`:result.message||'OTP sent to the registered mobile.');return;}
      if(password!==confirm)throw new Error('Passwords do not match');
      await resetPassword(identifier,otp,password);setDone(true);
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  return <Box sx={{minHeight:'100vh',display:'grid',placeItems:'center',bgcolor:'#eef3f6',p:2}}><Container maxWidth="sm"><Paper sx={{p:{xs:3,sm:5},borderRadius:5}}><Typography variant="h4" fontWeight={900}>{data.settings?.shortTitle || 'SecureAsset'}</Typography><Typography variant="h5" fontWeight={900} mt={3}>Reset password with mobile OTP</Typography><Typography color="text.secondary" mt={1} mb={3}>Enter your registered email or mobile number. The OTP is sent only to the mobile number registered on that account.</Typography>{error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}{done?<Stack spacing={2}><Alert severity="success">Password reset successfully.</Alert><Button component={Link} to="/login" variant="contained">Sign in</Button></Stack>:<Box component="form" onSubmit={submit}><Stack spacing={2}><TextField label="Registered email or mobile" value={identifier} onChange={(e)=>setIdentifier(e.target.value)} disabled={sent} required/>{sent&&<><TextField label="6-digit OTP" value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} required/><TextField label="New password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} helperText="At least 8 characters with uppercase, lowercase and a number." required/><TextField label="Confirm password" type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required/></>}<Button type="submit" variant="contained" disabled={loading}>{loading?<CircularProgress size={22}/>:sent?'Reset password':'Send reset OTP'}</Button>{sent&&<Button onClick={()=>{setSent(false);setOtp('');setMessage('');}}>Use another account</Button>}<Button component={Link} to="/login">Return to sign in</Button></Stack></Box>}</Paper></Container></Box>;
}
