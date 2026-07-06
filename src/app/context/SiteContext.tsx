import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSiteConfig } from '../services/api';

export type SiteData = {
  settings: Record<string, any>;
  seo?: Record<string, any> | null;
  carousel: Record<string, any>[];
  sections: Record<string, any>[];
  landlordPlans: Record<string, any>[];
  propertyTypes: Record<string, any>[];
  areaUnits: Record<string, any>[];
  publicNavigation: Record<string, any>[];
  featuredProperties: Record<string, any>[];
  featuredSurveyors: Record<string, any>[];
  page?: Record<string, any> | null;
};

type SiteContextValue = { data: SiteData; loading: boolean; refresh: (path?: string) => Promise<void> };
const defaults: SiteData = {
  settings: { siteTitle: 'SecureAsset', shortTitle: 'SecureAsset', tagline: 'Property, tenancy and survey management in one secure platform.', brand: { primaryColor: '#0B5270', secondaryColor: '#0f172a', accentColor: '#22c55e', fontFamily: 'Plus Jakarta Sans' }, contact: {}, social: {}, seo: {}, authentication: { badge: 'Enterprise property operations', headline: 'Every property workflow. One secure platform.', description: 'Manage properties, tenants, payments, surveys, legal records and communication with secure role-based access.', features: ['Role-based access','Encrypted document vault','Real-time messaging','Automated billing','Audit trails'], footerText: 'Enterprise property, tenancy and survey operations', loginSubtitle: 'Sign in using your email address or mobile number.', registerSubtitle: 'Create your account and verify your mobile number with OTP.', otpSubtitle: 'Use a secure one-time password sent to your registered mobile.', forgotSubtitle: 'The reset OTP is sent to your registered mobile.', allowRegistration: true, allowPasswordLogin: true, allowOtpLogin: true, showDemoAccounts: false } },
  carousel: [], sections: [], landlordPlans: [], propertyTypes: [], areaUnits: [], publicNavigation: [], featuredProperties: [], featuredSurveyors: [], seo: null, page: null,
};
const SiteContext = createContext<SiteContextValue>({ data: defaults, loading: true, refresh: async () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(defaults); const [loading, setLoading] = useState(true);
  async function refresh(path = window.location.pathname) {
    try { const response = await getSiteConfig(path); setData({ ...defaults, ...(response.data || {}) }); }
    catch { setData((current) => current); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const handle = () => void refresh(window.location.pathname);
    window.addEventListener('secureasset:site-changed', handle);
    return () => window.removeEventListener('secureasset:site-changed', handle);
  }, []);
  const value = useMemo(() => ({ data, loading, refresh }), [data, loading]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
export function useSite() { return useContext(SiteContext); }
