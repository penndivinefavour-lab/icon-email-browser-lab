/**
 * ICON Email & Browser Lab — Main Application
 * 
 * Premium dark dashboard with ICON Studios branding.
 */

import React, { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { getDatabase } from '@shared/index';
import { exportIdentitiesToCSV } from '@shared/csv';
import type { Identity, BrowserProfile, Session, TestRun, ActivityLog, VerificationCode, MessageDetail } from '@shared/index';

interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

// ─── Icons (inline SVG components) ───
interface IconProps {
  className?: string;
  style?: CSSProperties;
}

function IconDashboard({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconIdentities({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconInbox({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function IconOTP({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconBrowser({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconSessions({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconAutomation({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogs({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconSettings({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconSearch({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconPlus({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconCopy({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconCheck({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconFilter({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconDownload({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconTrash({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconExternalLink({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconBell({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconMail({ className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

// ─── Status Colors ───
const statusColors: Record<string, string> = {
  available: '#4ADE80',
  assigned: '#F5C518',
  used: '#6B21A8',
  disabled: '#6B7280',
  'verification pending': '#F97316',
  verified: '#4ADE80',
  error: '#EF4444',
  active: '#4ADE80',
  completed: '#6B7280',
  failed: '#EF4444',
  terminated: '#F97316',
  queued: '#F97316',
  running: '#3B82F6',
  passed: '#4ADE80',
  cancelled: '#6B7280',
  detected: '#3B82F6',
  'otp used': '#4ADE80',
  expired: '#F97316',
  invalid: '#EF4444',
  pending: '#F97316',
  inactive: '#6B7280',
  chromium: '#3B82F6',
  firefox: '#FF7139',
  webkit: '#42B883',
};

const statusBgColors: Record<string, string> = {
  available: 'rgba(74, 222, 128, 0.12)',
  assigned: 'rgba(245, 197, 24, 0.12)',
  used: 'rgba(107, 33, 168, 0.12)',
  disabled: 'rgba(107, 114, 128, 0.12)',
  'verification pending': 'rgba(249, 115, 22, 0.12)',
  verified: 'rgba(74, 222, 128, 0.12)',
  error: 'rgba(239, 68, 68, 0.12)',
  active: 'rgba(74, 222, 128, 0.12)',
  completed: 'rgba(107, 114, 128, 0.12)',
  failed: 'rgba(239, 68, 68, 0.12)',
  terminated: 'rgba(249, 115, 22, 0.12)',
  queued: 'rgba(249, 115, 22, 0.12)',
  running: 'rgba(59, 130, 246, 0.12)',
  passed: 'rgba(74, 222, 128, 0.12)',
  cancelled: 'rgba(107, 114, 128, 0.12)',
  detected: 'rgba(59, 130, 246, 0.12)',
  'otp used': 'rgba(74, 222, 128, 0.12)',
  expired: 'rgba(249, 115, 22, 0.12)',
  invalid: 'rgba(239, 68, 68, 0.12)',
  pending: 'rgba(249, 115, 22, 0.12)',
  inactive: 'rgba(107, 114, 128, 0.12)',
};

function statusBadge(status: string): React.ReactNode {
  const color = statusColors[status.toLowerCase()] || '#6B7280';
  const bg = statusBgColors[status.toLowerCase()] || 'rgba(107, 114, 128, 0.12)';
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: "'Poppins', sans-serif",
        color,
        backgroundColor: bg,
        letterSpacing: '0.02em',
        textTransform: 'capitalize',
      }}
    >
      {label}
    </span>
  );
}

// ─── Card Component ───
function StatCard({
  title,
  value,
  subtitle,
  icon: IconComponent,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(30, 30, 46, 0.8), rgba(26, 39, 68, 0.6))',
        border: '1px solid rgba(107, 33, 168, 0.25)',
        borderRadius: '12px',
        padding: '20px',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: color ? `${color}18` : 'rgba(107, 33, 168, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color || '#6B21A8',
            border: `1px solid ${color ? `${color}30` : 'rgba(107, 33, 168, 0.2)'}`,
          }}
        >
          <IconComponent className="w-5 h-5" />
        </div>
      </div>
      <div
        style={{
          fontSize: '32px',
          fontWeight: 700,
          fontFamily: "'Poppins', sans-serif",
          color: '#FFFFFF',
          lineHeight: 1.1,
          marginBottom: '4px',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.5)',
          fontWeight: 400,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.35)',
            marginTop: '4px',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ─── Table Row ───
function TableRow({
  children,
  isLast,
}: {
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 140px 100px',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: isLast ? 'transparent' : 'rgba(255,255,255,0.02)',
        borderBottom: isLast
          ? '1px solid rgba(107, 33, 168, 0.12)'
          : '1px solid rgba(107, 33, 168, 0.06)',
        transition: 'background 0.15s ease',
      }}
    >
      {children}
    </div>
  );
}

// ─── Main App ───
function App(): React.ReactElement {
  const [db, setDb] = useState<ReturnType<typeof getDatabase> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Data state
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [verificationCodes, setVerificationCodes] = useState<VerificationCode[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  // Modal state
  const [showCreateIdentity, setShowCreateIdentity] = useState(false);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [newIdentity, setNewIdentity] = useState({
    email: '',
    display_name: '',
    provider: 'example.test',
    notes: '',
  });
  const [newProfile, setNewProfile] = useState({
    name: '',
    browser: 'chromium' as 'chromium' | 'firefox' | 'webkit',
    notes: '',
  });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<any | null>(null);

  useEffect(() => {
    async function init() {
      const database = getDatabase();
      await database.initialize();
      setDb(database);
      loadData(database);
      setLoading(false);
    }
    init();
  }, []);

  function loadData(database: ReturnType<typeof getDatabase>) {
    // Use the freshly queried list — reading the `identities` state here would be stale
    // on first load (still [] during mount) and silently skip messages/OTP data.
    const freshIdentities = database.getAllIdentities();
    setIdentities(freshIdentities);
    setProfiles(database.getAllBrowserProfiles());
    setSessions(database.getActiveSessions());
    setActivityLogs(database.getRecentActivityLogs(50));
    setTestRuns(database.getAllTestRuns());

    const allCodes: VerificationCode[] = [];
    for (const id of freshIdentities) {
      allCodes.push(...database.getVerificationCodesByIdentity(id.id));
    }
    setVerificationCodes(allCodes);

    // Load accounts and messages for the first identity that has an account
    for (const id of freshIdentities) {
      const account = database.getEmailAccountsByIdentity(id.id);
      if (account && account.length > 0) {
        setAccounts(account);
        setMessages(database.getMessagesByAccount(account[0].id));
        break;
      }
    }
  }

  function refreshData() {
    if (db) loadData(db);
  }

  async function createIdentity() {
    if (!db || !newIdentity.email) return;
    db.createIdentity({
      email: newIdentity.email,
      display_name: newIdentity.display_name || null,
      provider: newIdentity.provider,
      status: 'available',
      tags: JSON.stringify(['manual']),
      notes: newIdentity.notes || null,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: JSON.stringify({}),
    });
    setShowCreateIdentity(false);
    setNewIdentity({ email: '', display_name: '', provider: 'example.test', notes: '' });
    refreshData();
  }

  async function createProfile() {
    if (!db || !newProfile.name) return;
    const id = `prof-${Date.now()}`;
    const dir = `/d/Hermes Agent/ICON Email Browser Lab/data/browser-profiles/${id}`;
    db.createBrowserProfile({
      name: newProfile.name,
      browser: newProfile.browser,
      directory: dir,
      identity_id: null,
    });
    setShowCreateProfile(false);
    setNewProfile({ name: '', browser: 'chromium', notes: '' });
    refreshData();
  }

  async function deleteIdentity(id: string) {
    if (!db) return;
    db.deleteIdentity(id);
    refreshData();
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopyFeedback(email);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      // Fallback: select text
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  function formatDuration(ms: number | null): string {
    if (ms === null) return '—';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const secRem = sec % 60;
    return `${min}m ${secRem}s`;
  }

  // ─── Render ───
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#1A2744',
          color: '#FFFFFF',
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(107, 33, 168, 0.2)',
              borderTopColor: '#6B21A8',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
            Loading ICON Email & Browser Lab...
          </div>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const totalIdentities = identities.length;
  const availableIdentities = identities.filter((i) => i.status === 'available').length;
  const usedIdentities = identities.filter((i) => i.status === 'used' || i.status === 'assigned').length;
  const activeProfiles = profiles.filter((p) => p.status === 'active').length;
  const activeSessionsCount = sessions.length;
  const pendingVerification = verificationCodes.filter(
    (c) => c.status === 'detected' || c.status === 'pending'
  ).length;

  const recentTestRuns = testRuns.filter((t) => t.started_at).slice(0, 3);
  const recentActivity = activityLogs.slice(0, 8);

  const filteredIdentities = filterStatus === 'all'
    ? identities
    : identities.filter((i) => i.status.toLowerCase() === filterStatus.toLowerCase());

  const searchedIdentities = searchQuery
    ? identities.filter(
        (i) =>
          i.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredIdentities;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0F1525',
        color: '#FFFFFF',
        fontFamily: "'Poppins', sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* ─── Top Bar ─── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: '56px',
          background: 'rgba(15, 21, 37, 0.95)',
          borderBottom: '1px solid rgba(107, 33, 168, 0.2)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #6B21A8, #F5C518)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '16px',
              color: '#FFFFFF',
            }}
          >
            I
          </div>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '-0.01em',
            }}
          >
            ICON Email & Browser Lab
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.3)',
              background: 'rgba(107, 33, 168, 0.15)',
              padding: '2px 8px',
              borderRadius: '4px',
              marginLeft: '8px',
              fontWeight: 500,
            }}
          >
            v1.0.0
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            {db ? `DB: ${typeof process !== 'undefined' && process.env?.DATABASE_PATH ? process.env.DATABASE_PATH.split('/').pop() : 'icon-lab.db'}` : '—'}
          </span>
        </div>
      </header>

      {/* ─── Main Layout ─── */}
      <div
        style={{
          display: 'flex',
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        {/* ─── Sidebar ─── */}
        <nav
          style={{
            width: '220px',
            background: 'rgba(15, 21, 37, 0.6)',
            borderRight: '1px solid rgba(107, 33, 168, 0.15)',
            padding: '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {[
            { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
            { id: 'identities', label: 'Identity Manager', icon: IconIdentities },
            { id: 'inbox', label: 'Inbox Manager', icon: IconInbox },
            { id: 'otp', label: 'OTP / Verification', icon: IconOTP },
            { id: 'profiles', label: 'Browser Profiles', icon: IconBrowser },
            { id: 'sessions', label: 'Sessions', icon: IconSessions },
            { id: 'automation', label: 'Automation / QA', icon: IconAutomation },
            { id: 'activity', label: 'Activity Log', icon: IconLogs },
            { id: 'settings', label: 'Settings', icon: IconSettings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: activeTab === item.id
                  ? 'linear-gradient(135deg, rgba(107, 33, 168, 0.2), rgba(245, 197, 24, 0.1))'
                  : 'transparent',
                borderRadius: '8px',
                color: activeTab === item.id ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                fontFamily: "'Poppins', sans-serif",
                fontSize: '13px',
                fontWeight: activeTab === item.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                width: '100%',
                border: activeTab === item.id
                  ? '1px solid rgba(107, 33, 168, 0.3)'
                  : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* ─── Content Area ─── */}
        <main
          style={{
            flex: 1,
            padding: '24px',
            overflowY: 'auto',
            maxWidth: '1200px',
          }}
        >
          {/* ─── Dashboard ─── */}
          {activeTab === 'dashboard' && (
            <>
              <div
                style={{
                  marginBottom: '24px',
                }}
              >
                <h1
                  style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: '0 0 4px 0',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Dashboard
                </h1>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.4)',
                    margin: 0,
                  }}
                >
                  System overview and recent activity
                </p>
              </div>

              {/* Stats Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                <StatCard
                  title="Total Identities"
                  value={totalIdentities}
                  subtitle="All registered identities"
                  icon={IconIdentities}
                  color="#6B21A8"
                />
                <StatCard
                  title="Available"
                  value={availableIdentities}
                  subtitle="Ready to use"
                  icon={IconIdentities}
                  color="#4ADE80"
                />
                <StatCard
                  title="Used / Assigned"
                  value={usedIdentities}
                  subtitle="In active use"
                  icon={IconIdentities}
                  color="#F5C518"
                />
                <StatCard
                  title="Active Profiles"
                  value={activeProfiles}
                  subtitle={`${profiles.length} total profiles`}
                  icon={IconBrowser}
                  color="#3B82F6"
                />
                <StatCard
                  title="Active Sessions"
                  value={activeSessionsCount}
                  subtitle="Currently running"
                  icon={IconSessions}
                  color="#3B82F6"
                />
                <StatCard
                  title="Pending Verification"
                  value={pendingVerification}
                  subtitle="OTP codes awaiting use"
                  icon={IconOTP}
                  color="#F97316"
                />
              </div>

              {/* Two-column layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                }}
              >
                {/* Recent Identities */}
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.5)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        margin: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Recent Identities
                    </h3>
                    <button
                      onClick={() => setActiveTab('identities')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6B21A8',
                        fontFamily: "'Poppins', sans-serif",
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      View all →
                    </button>
                  </div>
                  {identities.length === 0 ? (
                    <div
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '13px',
                      }}
                    >
                      No identities yet. Create one to get started.
                    </div>
                  ) : (
                    identities.slice(0, 5).map((id, i) => (
                      <div
                        key={id.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: i < 4 ? '1px solid rgba(107, 33, 168, 0.06)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: statusColors[id.status.toLowerCase()] || '#6B7280',
                            }}
                          />
                          <div
                            style={{
                              fontSize: '13px',
                              color: 'rgba(255,255,255,0.85)',
                            }}
                          >
                            {id.display_name || id.email}
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                          {formatDate(id.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recent Activity */}
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.5)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        margin: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Recent Activity
                    </h3>
                    <button
                      onClick={() => setActiveTab('logs')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6B21A8',
                        fontFamily: "'Poppins', sans-serif",
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      View all →
                    </button>
                  </div>
                  {activityLogs.length === 0 ? (
                    <div
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '13px',
                      }}
                    >
                      No activity recorded yet.
                    </div>
                  ) : (
                    recentActivity.map((log, i) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '6px 0',
                          borderBottom: i < recentActivity.length - 1 ? '1px solid rgba(107, 33, 168, 0.06)' : 'none',
                        }}
                      >
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background:
                              log.result === 'success'
                                ? '#4ADE80'
                                : log.result === 'error'
                                ? '#EF4444'
                                : '#F97316',
                            marginTop: '6px',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'rgba(255,255,255,0.7)',
                              fontWeight: 500,
                            }}
                          >
                            {log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255,255,255,0.35)',
                            }}
                          >
                            {formatDate(log.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Test Runs */}
              {recentTestRuns.length > 0 && (
                <div
                  style={{
                    marginTop: '20px',
                    background: 'rgba(30, 30, 46, 0.5)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        margin: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Recent Test Runs
                    </h3>
                    <button
                      onClick={() => setActiveTab('automation')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6B21A8',
                        fontFamily: "'Poppins', sans-serif",
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      View all →
                    </button>
                  </div>
                  {recentTestRuns.map((run) => (
                    <div
                      key={run.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(107, 33, 168, 0.06)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.85)',
                            fontWeight: 500,
                          }}
                        >
                          {run.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                          {formatDate(run.started_at)} · {run.target_environment}
                        </div>
                      </div>
                      {statusBadge(run.status)}
                    </div>
                  ))}
                </div>
              )}

              {/* System Health */}
              <div
                style={{
                  marginTop: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  padding: '12px 16px',
                  background: 'rgba(74, 222, 128, 0.06)',
                  border: '1px solid rgba(74, 222, 128, 0.15)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#4ADE80',
                      boxShadow: '0 0 8px rgba(74, 222, 128, 0.4)',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.6)',
                      fontWeight: 500,
                    }}
                  >
                    System Healthy
                  </span>
                </div>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.3)',
                  }}
                >
                  SQLite {db ? 'connected' : '—'} · {identities.length} identities · {profiles.length} profiles
                </span>
              </div>
            </>
          )}

          {/* ─── Identity Manager ─── */}
          {activeTab === 'identities' && (
            <>
              <div
                style={{
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      margin: '0 0 4px 0',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Identity Manager
                  </h1>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                    Manage email identities and test accounts
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateIdentity(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: 'linear-gradient(135deg, #6B21A8, #7B3EC1)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(107, 33, 168, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <IconPlus className="w-4 h-4" />
                  Create Identity
                </button>
              </div>

              {/* Toolbar */}
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(30, 30, 46, 0.6)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    flex: 1,
                    minWidth: '200px',
                  }}
                >
                  <IconSearch className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    type="text"
                    placeholder="Search identities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FFFFFF',
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: '13px',
                      outline: 'none',
                      width: '100%',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                    >
                      <IconX className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{
                    background: 'rgba(30, 30, 46, 0.6)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '13px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="used">Used</option>
                  <option value="disabled">Disabled</option>
                  <option value="verification pending">Verification Pending</option>
                  <option value="verified">Verified</option>
                  <option value="error">Error</option>
                </select>

                <button
                  onClick={() => {
                    const csv = exportIdentitiesToCSV(identities);
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `identities-export-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: 'rgba(30, 30, 46, 0.6)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '8px',
                    color: 'rgba(255,255,255,0.6)',
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <IconDownload className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              {/* Table */}
              <div
                style={{
                  background: 'rgba(30, 30, 46, 0.4)',
                  border: '1px solid rgba(107, 33, 168, 0.15)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 140px 100px',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(107, 33, 168, 0.12)',
                    backgroundColor: 'rgba(15, 21, 37, 0.3)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    #
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Email
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Display Name
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Provider
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Source
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Status
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    Actions
                  </div>
                </div>

                {/* Rows */}
                {searchedIdentities.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '13px',
                    }}
                  >
                    {searchQuery
                      ? 'No identities match your search.'
                      : filterStatus !== 'all'
                      ? 'No identities with this status.'
                      : 'No identities found. Create your first identity to get started.'}
                  </div>
                ) : (
                  searchedIdentities.map((identity, index) => (
                    <TableRow key={identity.id}>
                      <div key={identity.id + '-idx'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                        {index + 1}
                      </div>
                      <div key={identity.id + '-email'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            background: 'linear-gradient(135deg, rgba(107,33,168,0.3), rgba(245,197,24,0.1))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '11px',
                            color: '#6B21A8',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                          }}
                        >
                          {(identity.email.charAt(0).toUpperCase())}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              color: '#FFFFFF',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {identity.email}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255,255,255,0.35)',
                            }}
                          >
                            {identity.verification_status === 'verified' ? '✓ Verified' : identity.verification_status}
                          </div>
                        </div>
                      </div>,
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'rgba(255,255,255,0.8)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {identity.display_name || '—'}
                      </div>,
                      <div
                        key={identity.id + '-provider'}
                        style={{
                          fontSize: '12px',
                          color: 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {identity.provider}
                      </div>,
                      <div
                        key={identity.id + '-source'}
                        style={{
                          fontSize: '12px',
                          color: 'rgba(255,255,255,0.4)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {identity.source}
                      </div>,
                      <div key={identity.id + '-status'} style={{ display: 'flex', alignItems: 'center' }}>
                        {statusBadge(identity.status)}
                      </div>,
                      <div key={identity.id + '-actions'} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          onClick={() => copyEmail(identity.email)}
                          title="Copy email"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '30px',
                            height: '30px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '6px',
                            color: 'rgba(255,255,255,0.4)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.color = '#FFFFFF';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                          }}
                        >
                          <IconCopy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteIdentity(identity.id)}
                          title="Delete"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '30px',
                            height: '30px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.12)',
                            borderRadius: '6px',
                            color: 'rgba(239, 68, 68, 0.5)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                            e.currentTarget.style.color = '#EF4444';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                            e.currentTarget.style.color = 'rgba(239, 68, 68, 0.5)';
                          }}
                        >
                          <IconTrash className="w-3 h-3" />
                        </button>
                      </div>
                    </TableRow>
                  ))
                )}
              </div>

              {/* Copy feedback */}
              {copyFeedback && (
                <div
                  style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    background: 'rgba(74, 222, 128, 0.12)',
                    border: '1px solid rgba(74, 222, 128, 0.2)',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    color: '#4ADE80',
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s ease',
                  }}
                >
                  <IconCheck className="w-4 h-4" />
                  Copied: {copyFeedback}
                </div>
              )}

              {/* Create Identity Modal */}
              {showCreateIdentity && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(30, 30, 46, 0.95)',
                      border: '1px solid rgba(107, 33, 168, 0.3)',
                      borderRadius: '12px',
                      padding: '24px',
                      width: '420px',
                      maxWidth: '90vw',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '20px',
                      }}
                    >
                      <h2
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#FFFFFF',
                          margin: 0,
                        }}
                      >
                        Create Identity
                      </h2>
                      <button
                        onClick={() => setShowCreateIdentity(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(255,255,255,0.4)',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        <IconX className="w-5 h-5" />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.5)',
                            marginBottom: '6px',
                            fontWeight: 500,
                          }}
                        >
                          Email Address <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input
                          type="email"
                          value={newIdentity.email}
                          onChange={(e) =>
                            setNewIdentity({ ...newIdentity, email: e.target.value })
                          }
                          placeholder="user@example.test"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = '#6B21A8')
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = 'rgba(107, 33, 168, 0.2)')
                          }
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.5)',
                            marginBottom: '6px',
                            fontWeight: 500,
                          }}
                        >
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={newIdentity.display_name}
                          onChange={(e) =>
                            setNewIdentity({ ...newIdentity, display_name: e.target.value })
                          }
                          placeholder="User Display Name"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = '#6B21A8')
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = 'rgba(107, 33, 168, 0.2)')
                          }
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.5)',
                            marginBottom: '6px',
                            fontWeight: 500,
                          }}
                        >
                          Provider
                        </label>
                        <select
                          value={newIdentity.provider}
                          onChange={(e) =>
                            setNewIdentity({ ...newIdentity, provider: e.target.value })
                          }
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="example.test">Example Test</option>
                          <option value="gmail.com">Gmail</option>
                          <option value="outlook.com">Outlook</option>
                          <option value="yahoo.com">Yahoo</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.5)',
                            marginBottom: '6px',
                            fontWeight: 500,
                          }}
                        >
                          Notes
                        </label>
                        <textarea
                          value={newIdentity.notes}
                          onChange={(e) =>
                            setNewIdentity({ ...newIdentity, notes: e.target.value })
                          }
                          placeholder="Optional notes..."
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                            resize: 'vertical',
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = '#6B21A8')
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = 'rgba(107, 33, 168, 0.2)')
                          }
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button
                          onClick={() => setShowCreateIdentity(false)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'rgba(255,255,255,0.6)',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={createIdentity}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: 'linear-gradient(135deg, #6B21A8, #7B3EC1)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Create Identity
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── Inbox Manager ─── */}
          {activeTab === 'inbox' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Inbox Manager
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  View messages from authorized email accounts
                </p>
              </div>

              {accounts.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconInbox className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>
                    No email accounts configured
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    The mock email provider is active. Create an identity with an email account to see messages.
                  </div>
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '8px 12px',
                      background: 'rgba(245, 197, 24, 0.08)',
                      border: '1px solid rgba(245, 197, 24, 0.15)',
                      borderRadius: '6px',
                      color: '#F5C518',
                      fontSize: '12px',
                      display: 'inline-block',
                    }}
                  >
                    ℹ️ Seeded demo messages are available. Check the OTP center.
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconInbox className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>
                    No messages in inbox
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    Messages will appear here when they arrive.
                  </div>
                </div>
              ) : (
                <>
                  {/* Message List */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0',
                      background: 'rgba(30, 30, 46, 0.4)',
                      border: '1px solid rgba(107, 33, 168, 0.15)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Sidebar - message list */}
                    <div
                      style={{
                        width: '340px',
                        borderRight: '1px solid rgba(107, 33, 168, 0.1)',
                        overflow: 'auto',
                        maxHeight: 'calc(100vh - 200px)',
                      }}
                    >
                      <div
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(107, 33, 168, 0.1)',
                          background: 'rgba(15, 21, 37, 0.3)',
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                          Inbox
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                          {messages.filter((m: any) => !m.is_read).length} unread
                        </div>
                      </div>
                      {messages.map((msg: any) => (
                        <div
                          key={msg.id}
                          onClick={() => setMessageDetail(msg)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid rgba(107, 33, 168, 0.06)',
                            cursor: 'pointer',
                            background: messageDetail?.id === msg.id ? 'rgba(107, 33, 168, 0.08)' : 'transparent',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (messageDetail?.id !== msg.id) {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (messageDetail?.id !== msg.id) {
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            {!msg.is_read && (
                              <div
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: '#F5C518',
                                  marginTop: '6px',
                                  flexShrink: 0,
                                  boxShadow: '0 0 6px rgba(245, 197, 24, 0.4)',
                                }}
                              />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: !msg.is_read ? 600 : 400,
                                  color: '#FFFFFF',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {msg.subject}
                              </div>
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: 'rgba(255,255,255,0.4)',
                                  marginTop: '2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {msg.sender}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'rgba(255,255,255,0.25)',
                              textAlign: 'right',
                              marginTop: '4px',
                            }}
                          >
                            {formatDate(msg.received_at)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Detail pane */}
                    <div
                      style={{
                        flex: 1,
                        padding: '20px',
                        overflow: 'auto',
                        maxHeight: 'calc(100vh - 200px)',
                        background: 'rgba(15, 21, 37, 0.2)',
                      }}
                    >
                      {messageDetail ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '16px',
                            }}
                          >
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: 'rgba(107, 33, 168, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#6B21A8',
                                fontWeight: 600,
                                fontSize: '14px',
                              }}
                            >
                              {messageDetail.subject.charAt(0)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '16px',
                                  fontWeight: 600,
                                  color: '#FFFFFF',
                                }}
                              >
                                {messageDetail.subject}
                              </div>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: 'rgba(255,255,255,0.4)',
                                  marginTop: '2px',
                                }}
                              >
                                {formatDate(messageDetail.received_at)}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              padding: '12px 16px',
                              backgroundColor: 'rgba(30, 30, 46, 0.4)',
                              borderRadius: '8px',
                              marginBottom: '16px',
                            }}
                          >
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
                              From
                            </div>
                            <div style={{ fontSize: '13px', color: '#FFFFFF' }}>
                              {messageDetail.sender}
                            </div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>
                              To
                            </div>
                            <div style={{ fontSize: '13px', color: '#FFFFFF' }}>
                              {messageDetail.recipient}
                            </div>
                          </div>

                          <div
                            style={{
                              padding: '16px',
                              backgroundColor: 'rgba(30, 30, 46, 0.4)',
                              borderRadius: '8px',
                              borderLeft: '3px solid #6B21A8',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '14px',
                                color: 'rgba(255,255,255,0.8)',
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {messageDetail.body}
                            </div>
                          </div>

                          <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                if (db) {
                                  db.markMessageRead(messageDetail.id, true);
                                  setMessageDetail((prev: MessageDetail | null) =>
                                    prev?.id === messageDetail.id
                                      ? { ...prev, is_read: 1 }
                                      : null
                                  );
                                  refreshData();
                                }
                              }}
                              style={{
                                padding: '8px 14px',
                                background: 'rgba(74, 222, 128, 0.1)',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                borderRadius: '6px',
                                color: '#4ADE80',
                                fontFamily: "'Poppins', sans-serif",
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Mark as Read
                            </button>
                            <button
                              onClick={() => setMessageDetail(null)}
                              style={{
                                padding: '8px 14px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'rgba(255,255,255,0.5)',
                                fontFamily: "'Poppins', sans-serif",
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Back to List
                            </button>
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'rgba(255,255,255,0.3)',
                            fontSize: '13px',
                          }}
                        >
                          Select a message to view details
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── OTP / Verification Center ─── */}
          {activeTab === 'otp' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  OTP / Verification Center
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Detected verification codes from authorized inboxes
                </p>
              </div>

              {verificationCodes.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconOTP className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>
                    No verification codes detected
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    OTP codes from incoming messages will appear here.
                  </div>
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '8px 12px',
                      background: 'rgba(245, 197, 24, 0.08)',
                      border: '1px solid rgba(245, 197, 24, 0.15)',
                      borderRadius: '6px',
                      color: '#F5C518',
                      fontSize: '12px',
                      display: 'inline-block',
                    }}
                  >
                    ℹ️ {pendingVerification > 0 ? `${pendingVerification} pending codes available` : 'Seeded demo codes available in database'}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 140px 120px 120px 100px',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(107, 33, 168, 0.12)',
                      backgroundColor: 'rgba(15, 21, 37, 0.3)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Code
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Service
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Sender
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Received
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Expires
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                      Status
                    </div>
                  </div>

                  {/* Rows */}
                  {verificationCodes.map((vc) => (
                    <TableRow key={vc.id}>
                        <div key={vc.id + '-code'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: "'Courier New', monospace",
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#3B82F6',
                              letterSpacing: '2px',
                            }}
                          >
                            {vc.code}
                          </div>
                        </div>,
                        <div key={vc.id + '-service'} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          {vc.service_label || '—'}
                        </div>,
                        <div key={vc.id + '-sender'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {vc.sender}
                        </div>,
                        <div key={vc.id + '-received'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {formatDate(vc.received_at)}
                        </div>,
                        <div key={vc.id + '-expires'} style={{ fontSize: '12px', color: vc.expires_at ? 'rgba(249, 115, 22, 0.7)' : 'rgba(255,255,255,0.2)' }}>
                          {vc.expires_at ? formatDate(vc.expires_at) : '—'}
                        </div>,
                        <div key={vc.id + '-status'} style={{ display: 'flex', alignItems: 'center' }}>
                          {statusBadge(vc.status)}
                        </div>
                    </TableRow>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Browser Profiles ─── */}
          {activeTab === 'profiles' && (
            <>
              <div
                style={{
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                    Browser Profiles
                  </h1>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                    Isolated browser environments for QA testing
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateProfile(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: 'linear-gradient(135deg, #6B21A8, #7B3EC1)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <IconPlus className="w-4 h-4" />
                  Create Profile
                </button>
              </div>

              {profiles.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconBrowser className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>
                    No browser profiles
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    Create a profile to launch isolated browser sessions for testing.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {profiles.map((profile) => (
                    <div
                      key={profile.id}
                      style={{
                        background: 'rgba(30, 30, 46, 0.4)',
                        border: `1px solid ${profile.status === 'active' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(107, 33, 168, 0.15)'}`,
                        borderRadius: '12px',
                        padding: '16px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: `rgba(${profile.browser === 'chromium' ? '59, 130, 246' : profile.browser === 'firefox' ? '255, 113, 57' : '66, 184, 131'}, 0.12)`,
                              border: `1px solid ${profile.browser === 'chromium' ? 'rgba(59, 130, 246, 0.25)' : profile.browser === 'firefox' ? 'rgba(255, 113, 57, 0.25)' : 'rgba(66, 184, 131, 0.25)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: profile.browser === 'chromium' ? '#3B82F6' : profile.browser === 'firefox' ? '#FF7139' : '#42B883',
                            }}
                          >
                            <IconBrowser className="w-5 h-5" />
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#FFFFFF',
                                marginBottom: '2px',
                              }}
                            >
                              {profile.name}
                            </div>
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.35)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {profile.browser} · {profile.directory.split('/').pop()}
                            </div>
                          </div>
                        </div>
                        {statusBadge(profile.status)}
                      </div>

                      <div
                        style={{
                          padding: '10px 0',
                          borderTop: '1px solid rgba(107, 33, 168, 0.1)',
                          borderBottom: '1px solid rgba(107, 33, 168, 0.06)',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                          Created: {formatDate(profile.created_at)}
                        </div>
                        {profile.last_used_at && (
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                            Last used: {formatDate(profile.last_used_at)}
                          </div>
                        )}
                        {profile.notes && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'rgba(255,255,255,0.4)',
                              marginTop: '8px',
                              fontStyle: 'italic',
                            }}
                          >
                            {profile.notes}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          style={{
                            flex: 1,
                            padding: '8px',
                            background: profile.status === 'active' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            border: `1px solid ${profile.status === 'active' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                            borderRadius: '6px',
                            color: profile.status === 'active' ? '#EF4444' : '#3B82F6',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                          disabled={profile.status === 'active'}
                        >
                          {profile.status === 'active' ? 'Stop' : 'Launch'}
                        </button>
                        <button
                          style={{
                            padding: '8px 10px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '6px',
                            color: 'rgba(255,255,255,0.4)',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <IconExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create Profile Modal */}
              {showCreateProfile && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(30, 30, 46, 0.95)',
                      border: '1px solid rgba(107, 33, 168, 0.3)',
                      borderRadius: '12px',
                      padding: '24px',
                      width: '420px',
                      maxWidth: '90vw',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '20px',
                      }}
                    >
                      <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
                        Create Browser Profile
                      </h2>
                      <button
                        onClick={() => setShowCreateProfile(false)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px' }}
                      >
                        <IconX className="w-5 h-5" />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 500 }}>
                          Profile Name <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={newProfile.name}
                          onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                          placeholder="QA Profile - Chrome"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                          }}
                          onFocus={(e) => (e.target.style.borderColor = '#6B21A8')}
                          onBlur={(e) => (e.target.style.borderColor = 'rgba(107, 33, 168, 0.2)')}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 500 }}>
                          Browser Engine
                        </label>
                        <select
                          value={newProfile.browser}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              browser: e.target.value as 'chromium' | 'firefox' | 'webkit',
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="chromium">Chromium (Chrome/Edge)</option>
                          <option value="firefox">Firefox</option>
                          <option value="webkit">WebKit (Safari)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 500 }}>
                          Notes
                        </label>
                        <textarea
                          value={newProfile.notes}
                          onChange={(e) => setNewProfile({ ...newProfile, notes: e.target.value })}
                          placeholder="Optional notes..."
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'rgba(15, 21, 37, 0.6)',
                            border: '1px solid rgba(107, 33, 168, 0.2)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            outline: 'none',
                            resize: 'vertical',
                          }}
                          onFocus={(e) => (e.target.style.borderColor = '#6B21A8')}
                          onBlur={(e) => (e.target.style.borderColor = 'rgba(107, 33, 168, 0.2)')}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button
                          onClick={() => setShowCreateProfile(false)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'rgba(255,255,255,0.6)',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={createProfile}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: 'linear-gradient(135deg, #6B21A8, #7B3EC1)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontFamily: "'Poppins', sans-serif",
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Create Profile
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── Sessions ─── */}
          {activeTab === 'sessions' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Sessions
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Browser session history and tracking
                </p>
              </div>

              {sessions.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconSessions className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>No active sessions</div>
                  <div style={{ fontSize: '13px' }}>Launch a browser profile to start a session.</div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 120px 120px 120px 100px',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(107, 33, 168, 0.12)',
                      backgroundColor: 'rgba(15, 21, 37, 0.3)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Session</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Started</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Duration</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Status</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Test Run</div>
                  </div>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                        <div key={session.id + '-name'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: session.status === 'active' ? '#4ADE80' : '#6B7280',
                            }}
                          />
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                            {session.id.slice(0, 8)}...
                          </div>
                        </div>,
                        <div key={session.id + '-started'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{formatDate(session.started_at)}</div>,
                        <div key={session.id + '-duration'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {formatDuration(session.duration_ms)}
                        </div>,
                        <div key={session.id + '-status'} style={{ display: 'flex', alignItems: 'center' }}>{statusBadge(session.status)}</div>,
                        <div key={session.id + '-testrun'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                          {session.test_run_id ? session.test_run_id.slice(0, 8) + '...' : '—'}
                        </div>
                    </TableRow>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Automation / QA ─── */}
          {activeTab === 'automation' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Automation / QA
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Test runs and automated QA workflows
                </p>
              </div>

              {testRuns.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconAutomation className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>No test runs yet</div>
                  <div style={{ fontSize: '13px' }}>Run a test to see results here.</div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 120px 100px 100px 200px',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(107, 33, 168, 0.12)',
                      backgroundColor: 'rgba(15, 21, 37, 0.3)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Test Run</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Started</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Status</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Result</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Environment</div>
                  </div>
                  {testRuns.map((run) => (
                    <TableRow key={run.id}>
                        <div key={run.id + '-name'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background:
                                run.status === 'passed'
                                  ? '#4ADE80'
                                  : run.status === 'failed'
                                  ? '#EF4444'
                                  : run.status === 'running'
                                  ? '#3B82F6'
                                  : '#F97316',
                            }}
                          />
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                            {run.name}
                          </div>
                        </div>,
                        <div key={run.id + '-started'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {formatDate(run.started_at)}
                        </div>,
                        <div key={run.id + '-status'} style={{ display: 'flex', alignItems: 'center' }}>{statusBadge(run.status)}</div>,
                        <div key={run.id + '-result'} style={{ fontSize: '12px', color: run.result === 'passed' ? '#4ADE80' : run.result === 'failed' ? '#EF4444' : 'rgba(255,255,255,0.4)' }}>
                          {run.result ? run.result.toUpperCase() : '—'}
                        </div>,
                        <div key={run.id + '-env'} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {run.target_environment}
                        </div>
                    </TableRow>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Activity Logs ─── */}
          {activeTab === 'logs' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Activity Logs
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Audit trail of all system actions
                </p>
              </div>

              {activityLogs.length === 0 ? (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <IconLogs className="w-10 h-10" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>No activity recorded</div>
                  <div style={{ fontSize: '13px' }}>Actions will be logged here.</div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(30, 30, 46, 0.4)',
                    border: '1px solid rgba(107, 33, 168, 0.15)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    maxHeight: 'calc(100vh - 280px)',
                    overflowY: 'auto',
                  }}
                >
                  {activityLogs.map((log, i) => (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '10px 16px',
                        borderBottom: i < activityLogs.length - 1 ? '1px solid rgba(107, 33, 168, 0.06)' : 'none',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background:
                            log.result === 'success'
                              ? '#4ADE80'
                              : log.result === 'error'
                              ? '#EF4444'
                              : '#F97316',
                          marginTop: '5px',
                          flexShrink: 0,
                          boxShadow: log.result === 'success' ? '0 0 6px rgba(74, 222, 128, 0.3)' : 'none',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              color: 'rgba(255,255,255,0.8)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(255,255,255,0.04)',
                              color: 'rgba(255,255,255,0.3)',
                            }}
                          >
                            {log.entity}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.35)',
                            marginTop: '2px',
                          }}
                        >
                          {formatDate(log.timestamp)} · {log.actor}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {statusBadge(log.result === 'success' ? 'success' : log.result === 'error' ? 'error' : 'info')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Settings ─── */}
          {activeTab === 'settings' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Settings
                </h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Application configuration
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(30, 30, 46, 0.4)',
                  border: '1px solid rgba(107, 33, 168, 0.15)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {[
                  { section: 'General', items: ['Application Name', 'Environment', 'Port'] },
                  { section: 'Database', items: ['Path', 'Type: SQLite (sql.js)', 'WAL Mode'] },
                  { section: 'Email Providers', items: ['Mock Provider (active)', 'IMAP (not configured)', 'Gmail (not configured)', 'Outlook (not configured)'] },
                  { section: 'Browser', items: ['Default: Chromium', 'Profiles Directory', 'Playwright 1.62.1'] },
                  { section: 'Automation', items: ['Test Timeout', 'Screenshot on Failure', 'Screenshots Directory'] },
                  { section: 'Data Storage', items: ['Local SQLite Database', 'Browser Profile Storage', 'Test Screenshots'] },
                  { section: 'Logs', items: ['Activity Log Level', 'Max Stored Logs'] },
                  { section: 'Import/Export', items: ['CSV Identity Import', 'CSV Identity Export'] },
                  { section: 'About', items: ['ICON Email & Browser Lab v1.0.0', 'Built by ICON Studios', 'License: MIT'] },
                ].map((group, gi) => (
                  <div key={gi}>
                    <div
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'rgba(15, 21, 37, 0.3)',
                        borderBottom: gi < 8 ? '1px solid rgba(107, 33, 168, 0.1)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.4)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {group.section}
                      </span>
                    </div>
                    {group.items.map((item, ii) => (
                      <div
                        key={ii}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 16px',
                          borderBottom: ii < group.items.length - 1 ? '1px solid rgba(107, 33, 168, 0.06)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{item}</span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: item.includes('not configured') ? 'rgba(249, 115, 22, 0.6)' : 'rgba(255,255,255,0.35)',
                          }}
                        >
                          {item.includes('not configured') || item.includes('not configured') ? '—' : '✓ configured'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  background: 'rgba(245, 197, 24, 0.06)',
                  border: '1px solid rgba(245, 197, 24, 0.12)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#F5C518',
                  lineHeight: 1.5,
                }}
              >
                ⚙️ <strong>Provider credentials</strong> are stored in <code>.env</code> (git-ignored). Never commit secrets.
              </div>
            </>
          )}
        </main>
      </div>

      {/* Inline styles for modals and animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus, textarea:focus, select:focus {
          outline: none;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(15, 21, 37, 0.3);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(107, 33, 168, 0.3);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 33, 168, 0.5);
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}

export default App;
