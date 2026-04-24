import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke('getPortalVerificationLink').then(result => {
      setData(result);
      setLoading(false);
    }).catch(() => setLoading(false));

    const interval = setInterval(() => {
      invoke('getPortalVerificationLink').then(result => {
        setData(result);
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const copyLink = () => {
    if (data?.link) {
      navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusMap = {
    PENDING: { bg: '#E6F1FB', color: '#185FA5', label: 'Awaiting completion' },
    SUCCEEDED: { bg: '#EAF3DE', color: '#3B6D11', label: '✅ Verified' },
    FAILED: { bg: '#FFEBE6', color: '#A32D2D', label: '❌ Verification failed' },
    PENDING_REVIEW: { bg: '#FFFAE6', color: '#854F0B', label: '⚠️ Under review' }
  };

  const styles = {
    container: { fontFamily: 'sans-serif', padding: '12px', maxWidth: '100%' },
    header: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' },
    dot: { width: '8px', height: '8px', borderRadius: '50%', background: '#2D2DFF', flexShrink: 0 },
    title: { fontSize: '13px', fontWeight: '600', color: '#172B4D' },
    linkBox: { padding: '12px', background: '#F4F5F7', borderRadius: '4px', border: '1px solid #DFE1E6' },
    resultBox: { padding: '12px', borderRadius: '4px' },
    linkLabel: { fontSize: '11px', color: '#6B778C', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' },
    linkUrl: { fontSize: '11px', color: '#172B4D', wordBreak: 'break-all', marginBottom: '8px', fontFamily: 'monospace', lineHeight: '1.5' },
    copyBtn: { display: 'inline-block', padding: '8px 14px', borderRadius: '4px', background: copied ? '#EAF3DE' : '#fff', color: copied ? '#3B6D11' : '#172B4D', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #DFE1E6' },
    noLink: { fontSize: '12px', color: '#6B778C', fontStyle: 'italic', padding: '8px 0' },
    resultTitle: { fontSize: '13px', fontWeight: '600', marginBottom: '4px' },
    resultSub: { fontSize: '12px' },
    badge: (s) => {
      const m = statusMap[s] || statusMap.PENDING;
      return { display: 'inline-block', padding: '3px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600', background: m.bg, color: m.color, marginBottom: '10px' };
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.dot}></div>
          <span style={styles.title}>Incode Identity Verification</span>
        </div>
        <div style={{ fontSize: '12px', color: '#6B778C' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.dot}></div>
        <span style={styles.title}>Incode Identity Verification</span>
      </div>

      {!data?.link && (
        <div style={styles.noLink}>
          No verification link yet. Your help desk agent will send one shortly.
        </div>
      )}

      {data?.link && data?.status === 'PENDING' && (
        <div style={styles.linkBox}>
          <div style={styles.badge('PENDING')}>
            {statusMap.PENDING.label}
          </div>
          <div style={styles.linkLabel}>Your verification link</div>
          <div style={styles.linkUrl}>{data.link}</div>
          <button style={styles.copyBtn} onClick={copyLink}>
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {data?.status === 'SUCCEEDED' && (
        <div style={{ ...styles.resultBox, background: '#EAF3DE', border: '1px solid #97C459' }}>
          <div style={{ ...styles.resultTitle, color: '#3B6D11' }}>✅ Verification complete</div>
          <div style={{ ...styles.resultSub, color: '#3B6D11' }}>Your identity has been confirmed. Your request is being processed.</div>
        </div>
      )}

      {data?.status === 'FAILED' && (
        <div style={{ ...styles.resultBox, background: '#FFEBE6', border: '1px solid #FF8F73' }}>
          <div style={{ ...styles.resultTitle, color: '#A32D2D' }}>❌ Verification unsuccessful</div>
          <div style={{ ...styles.resultSub, color: '#A32D2D' }}>Please contact your help desk agent for assistance.</div>
        </div>
      )}

      {data?.status === 'PENDING_REVIEW' && (
        <div style={{ ...styles.resultBox, background: '#FFFAE6', border: '1px solid #FFE380' }}>
          <div style={{ ...styles.resultTitle, color: '#854F0B' }}>⚠️ Under review</div>
          <div style={{ ...styles.resultSub, color: '#854F0B' }}>Your verification is being reviewed. Your agent will follow up shortly.</div>
        </div>
      )}
    </div>
  );
}

export default App;