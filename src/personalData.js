import { storage } from '@forge/api';

export async function handler(event) {
  console.log('Personal data event received:', JSON.stringify(event));

  const eventType = event.eventType;
  const accountId = event.accountId;

  if (eventType === 'avi:forge:personal-data-classification:v1') {
    return await handleClassification(accountId);
  } else if (eventType === 'avi:forge:personal-data-deletion:v1') {
    return await handleDeletion(accountId);
  }

  return { success: true };
}

async function handleClassification(accountId) {
  console.log(`Personal data classification request for accountId: ${accountId}`);

  return {
    personalData: [
      {
        dataType: 'name',
        description: 'Employee display name used during identity verification',
        storageLocation: 'Forge Storage',
        retentionPeriod: 'Until deleted or 20 verifications per ticket (rolling)',
        legalBasis: 'Legitimate interest — identity verification for security purposes'
      },
      {
        dataType: 'email',
        description: 'Employee corporate email address used as identity matching key',
        storageLocation: 'Forge Storage',
        retentionPeriod: 'Until deleted or 20 verifications per ticket (rolling)',
        legalBasis: 'Legitimate interest — identity verification for security purposes'
      },
      {
        dataType: 'sessionId',
        description: 'Incode session ID generated during biometric verification',
        storageLocation: 'Forge Storage',
        retentionPeriod: 'Session mapping deleted after 60 seconds post-completion. History kept until deleted.',
        legalBasis: 'Legitimate interest — audit trail for security compliance'
      },
      {
        dataType: 'identityId',
        description: 'Incode identity ID returned after successful biometric verification',
        storageLocation: 'Forge Storage',
        retentionPeriod: 'Until deleted or 20 verifications per ticket (rolling)',
        legalBasis: 'Legitimate interest — audit trail for security compliance'
      }
    ]
  };
}

async function handleDeletion(accountId) {
  console.log(`Personal data deletion request for accountId: ${accountId}`);

  try {
    const keysResult = await storage.list({ limit: 100 });
    const keys = keysResult?.results || [];

    for (const item of keys) {
      const key = item.key;

      if (key.startsWith('history:')) {
        const existing = await storage.get(key);
        if (existing) {
          const history = JSON.parse(existing);
          const filtered = history.filter(entry => {
            return !entry.corporateEmail?.includes(accountId) &&
                   entry.requesterName !== accountId;
          });

          if (filtered.length !== history.length) {
            if (filtered.length === 0) {
              await storage.delete(key);
            } else {
              await storage.set(key, JSON.stringify(filtered));
            }
            console.log(`Cleaned personal data from ${key}`);
          }
        }
      }

      if (key.startsWith('interview:')) {
        const existing = await storage.get(key);
        if (existing) {
          const data = JSON.parse(existing);
          if (data.corporateEmail?.includes(accountId) ||
              data.requesterName === accountId) {
            await storage.delete(key);
            console.log(`Deleted interview record ${key}`);
          }
        }
      }
    }

    return { success: true, message: `Personal data deletion completed for accountId: ${accountId}` };

  } catch (err) {
    console.error('Error during personal data deletion:', err);
    return { success: false, error: err.message };
  }
}