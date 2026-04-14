import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@forge/bridge';

function App() {
  const [status, setStatus] = useState('idle');
  const [employee, setEmployee] = useState(null);
  const [corporateEmail, setCorporateEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('SMS');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [linkExpiry, setLinkExpiry] = useState(10);
  const [verificationResult, setVerificationResult] = useState(null);
  const [configured, setConfigured] = useState(null);
  const pollInterval = useRef(null);

  useEffect(() => {
    invoke('getSetupStatus').then(result => {
      setConfigured(result.configured);
    }).catch(() => setConfigured(false));

    invoke('getConfig').then(cfg => {
      if (cfg.defaultDeliveryMethod) setDeliveryMethod(cfg.defaultDeliveryMethod);
      if (cfg.linkExpiryMinutes) setLinkExpiry(cfg.linkExpiryMinutes);
    }).catch(err => console.error('Error loading config:', err));
  }, []);

  useEffect(() => {
    if (status !== 'pending' || !employee?.interviewId) return;

    pollInterval.current = setInterval(async () => {
      try {
        const result = await invoke('checkVerificationResult', {
          interviewId: employee.interviewId
        });
        if (result.status === 'SUCCEEDED') {
          setVerificationResult('SUCCEEDED');
          setStatus('complete');
          clearInterval(pollInterval.current);
        } else if (result.status === 'FAILED') {
          setVerificationResult('FAILED');
          setStatus('complete');
          clearInterval(pollInterval.current);
        } else if (result.status === 'PENDING_REVIEW') {
          setVerificationResult('PENDING_REVIEW');
          setStatus('complete');
          clearInterval(pollInterval.current);
        } else if (result.status === 'COMPLETE') {
          setVerificationResult('SUCCEEDED');
          setStatus('complete');
          clearInterval(pollInterval.current);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);

    return () => clearInterval(pollInterval.current);
  }, [status, employee]);

  const sendVerification = async () => {
    if (!corporateEmail) {
      alert('Please enter the corporate email');
      return;
    }
    if (deliveryMethod === 'EMAIL' && !deliveryEmail) {
      alert('Please enter a delivery email');
      return;
    }
    if (deliveryMethod === 'SMS' && !deliveryPhone) {
      alert('Please enter a phone number');
      return;
    }
    setStatus('sending');
    try {
      const response = await invoke('sendVerification', {
        corporateEmail,
        deliveryMethod,
        deliveryEmail: deliveryMethod === 'EMAIL' ? deliveryEmail : null,
        deliveryPhone: deliveryMethod === 'SMS' ? deliveryPhone : null
      });
      setEmployee({
        name: response.requesterName,
        corporateEmail,
        deliveryMethod,
        issueKey: response.issueKey,
        interviewId: response.interviewId
      });
      setStatus('pending');
    } catch (err) {
      setStatus('error');
    }
  };

  const initials = employee
    ? employee.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : 'RF';

  const styles = {
    container: { fontFamily: 'sans-serif', padding: '16px', maxWidth: '100%' },
    header: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' },
    dot: { width: '10px', height: '10px', borderRadius: '50%', background: '#2D2DFF' },
    title: { fontSize: '14px', fontWeight: '600', color: '#172B4D' },
    employeeRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
    avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#185FA5' },
    empName: { fontSize: '13px', fontWeight: '600', color: '#172B4D' },
    empDetail: { fontSize: '11px', color: '#6B778C' },
    label: { fontSize: '11px', fontWeight: '600', color: '#6B778C', marginBottom: '4px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
    input: { width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #DFE1E6', fontSize: '13px', marginBottom: '12px', color: '#172B4D', boxSizing: 'border-box' },
    select: { width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #DFE1E6', fontSize: '13px', marginBottom: '12px', color: '#172B4D', background: '#fff', boxSizing: 'border-box' },
    btn: { width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#2D2DFF', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
    btnDisabled: { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #DFE1E6', background: '#F4F5F7', color: '#A5ADBA', fontSize: '13px', cursor: 'not-allowed' },
    smsSent: { marginTop: '10px', padding: '10px', background: '#E6F1FB', borderRadius: '4px', fontSize: '12px', color: '#185FA5' },
    divider: { border: 'none', borderTop: '1px solid #DFE1E6', margin: '12px 0' },
    stepRow: { display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' },
    stepNum: { width: '20px', height: '20px', borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    stepNumDone: { width: '20px', height: '20px', borderRadius: '50%', background: '#EAF3DE', color: '#3B6D11', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    stepNumFail: { width: '20px', height: '20px', borderRadius: '50%', background: '#FFEBE6', color: '#A32D2D', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    stepText: { fontSize: '12px', color: '#172B4D', lineHeight: '1.5' },
    stepSub: { fontSize: '11px', color: '#6B778C' },
    resultPass: { marginTop: '10px', padding: '12px', background: '#EAF3DE', borderRadius: '4px', border: '1px solid #97C459' },
    resultFail: { marginTop: '10px', padding: '12px', background: '#FFEBE6', borderRadius: '4px', border: '1px solid #FF8F73' },
    resultPending: { marginTop: '10px', padding: '12px', background: '#FFFAE6', borderRadius: '4px', border: '1px solid #FFE380' },
    resultTitle: { fontSize: '13px', fontWeight: '600', marginBottom: '4px' },
    resultSub: { fontSize: '12px' },
    infoBox: { padding: '8px 10px', background: '#FFFAE6', borderRadius: '4px', border: '1px solid #FFE380', fontSize: '11px', color: '#172B4D', marginBottom: '12px' },
    setupBox: { padding: '16px', background: '#F4F5F7', borderRadius: '4px', border: '1px solid #DFE1E6', textAlign: 'center' },
    setupTitle: { fontSize: '13px', fontWeight: '600', color: '#172B4D', marginBottom: '6px' },
    setupSub: { fontSize: '12px', color: '#6B778C', marginBottom: '12px' },
    pulsingDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#2D2DFF', marginRight: '6px', animation: 'pulse 1.5s infinite' }
  };

  const getStep3Style = () => {
    if (verificationResult === 'SUCCEEDED') return styles.stepNumDone;
    if (verificationResult === 'FAILED') return styles.stepNumFail;
    return styles.stepNum;
  };

  if (configured === null) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.dot}></div>
          <span style={styles.title}>Incode identity verification</span>
        </div>
        <div style={{ fontSize: '12px', color: '#6B778C' }}>Loading...</div>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.dot}></div>
          <span style={styles.title}>Incode identity verification</span>
        </div>
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>Setup required</div>
          <div style={styles.setupSub}>
            An admin needs to configure your Incode API credentials before this panel can be used.
          </div>
          <div style={{ fontSize: '11px', color: '#6B778C' }}>
            Go to <strong>Jira Settings → Apps → Incode Verification Settings</strong> to complete setup.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      <div style={styles.header}>
        <div style={styles.dot}></div>
        <span style={styles.title}>Incode identity verification</span>
      </div>

      <div style={styles.employeeRow}>
        <div style={styles.avatar}>{initials}</div>
        <div>
          <div style={styles.empName}>{employee ? employee.name : 'Requester'}</div>
          <div style={styles.empDetail}>{employee ? employee.corporateEmail : 'Enter details below to verify'}</div>
        </div>
      </div>

      <hr style={styles.divider} />

      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6B778C', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verification steps</div>

      <div style={styles.stepRow}>
        <div style={styles.stepNumDone}>1</div>
        <div>
          <div style={styles.stepText}>Employee identity confirmed on record</div>
          <div style={styles.stepSub}>Matched to IAM directory</div>
        </div>
      </div>
      <div style={styles.stepRow}>
        <div style={status === 'idle' ? styles.stepNum : styles.stepNumDone}>2</div>
        <div>
          <div style={styles.stepText}>Biometric check via Incode</div>
          <div style={styles.stepSub}>Liveness + face match against ID on file</div>
        </div>
      </div>
      <div style={styles.stepRow}>
        <div style={getStep3Style()}>3</div>
        <div>
          <div style={styles.stepText}>Result synced to ticket</div>
          <div style={styles.stepSub}>
            {status === 'pending' ? 'Waiting for employee to complete...' : 'Status, score and audit trail logged'}
          </div>
        </div>
      </div>

      <hr style={styles.divider} />

      {status === 'idle' && (
        <>
          <label style={styles.label}>Corporate email (used for identity matching)</label>
          <input
            style={styles.input}
            type="email"
            placeholder="employee@company.com"
            value={corporateEmail}
            onChange={e => setCorporateEmail(e.target.value)}
          />

          <label style={styles.label}>Delivery method</label>
          <select
            style={styles.select}
            value={deliveryMethod}
            onChange={e => {
              setDeliveryMethod(e.target.value);
              if (e.target.value === 'EMAIL') setDeliveryEmail(corporateEmail);
              if (e.target.value === 'SMS') setDeliveryEmail('');
            }}
          >
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </select>

          {deliveryMethod === 'EMAIL' && (
            <>
              <label style={styles.label}>Delivery email</label>
              {deliveryEmail !== corporateEmail && deliveryEmail !== '' && (
                <div style={styles.infoBox}>
                  Using alternate email — corporate email still used for identity matching
                </div>
              )}
              <input
                style={styles.input}
                type="email"
                placeholder="Delivery email address"
                value={deliveryEmail}
                onChange={e => setDeliveryEmail(e.target.value)}
              />
            </>
          )}

          {deliveryMethod === 'SMS' && (
            <>
              <label style={styles.label}>Mobile phone number</label>
              <div style={styles.infoBox}>
                Employee is locked out — sending via SMS to personal phone
              </div>
              <input
                style={styles.input}
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={deliveryPhone}
                onChange={e => setDeliveryPhone(e.target.value)}
              />
            </>
          )}

          <button style={styles.btn} onClick={sendVerification}>
            Send verification link
          </button>
        </>
      )}

      {status === 'sending' && (
        <button style={styles.btnDisabled} disabled>
          Sending...
        </button>
      )}

      {status === 'pending' && (
        <>
          <button style={styles.btnDisabled} disabled>
            <span style={styles.pulsingDot}></span>
            Awaiting employee verification...
          </button>
          <div style={styles.smsSent}>
            Verification link sent via {employee?.deliveryMethod} — expires in {linkExpiry} min
          </div>
        </>
      )}

      {status === 'complete' && verificationResult === 'SUCCEEDED' && (
        <div style={styles.resultPass}>
          <div style={{ ...styles.resultTitle, color: '#3B6D11' }}>✅ Verification passed</div>
          <div style={{ ...styles.resultSub, color: '#3B6D11' }}>Identity confirmed — you may proceed with the request</div>
        </div>
      )}

      {status === 'complete' && verificationResult === 'FAILED' && (
        <div style={styles.resultFail}>
          <div style={{ ...styles.resultTitle, color: '#A32D2D' }}>❌ Verification failed</div>
          <div style={{ ...styles.resultSub, color: '#A32D2D' }}>Do not proceed — escalate to senior agent for manual review</div>
        </div>
      )}

      {status === 'complete' && verificationResult === 'PENDING_REVIEW' && (
        <div style={styles.resultPending}>
          <div style={{ ...styles.resultTitle, color: '#854F0B' }}>⚠️ Manual review required</div>
          <div style={{ ...styles.resultSub, color: '#854F0B' }}>Incode flagged this session — do not proceed until review is complete</div>
        </div>
      )}

      {status === 'error' && (
        <div style={styles.resultFail}>
          <div style={{ ...styles.resultTitle, color: '#A32D2D' }}>Error sending verification</div>
          <div style={{ ...styles.resultSub, color: '#A32D2D' }}>Please try again or contact support.</div>
        </div>
      )}
    </div>
  );
}

export default App;