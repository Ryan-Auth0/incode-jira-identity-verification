import { storage } from '@forge/api';
import api, { route } from '@forge/api';

async function verifyWebhookSecret(req) {
  const headers = req.headers || {};
  const secretHeaderRaw = headers['x-incode-secret'] || '';
  const secret = Array.isArray(secretHeaderRaw) ? secretHeaderRaw[0] : String(secretHeaderRaw);

  try {
    const stored = await storage.get('webhook-config');
    if (!stored) {
      console.log('No webhook config found in storage — falling back to env var');
      const envSecret = process.env.WEBHOOK_SECRET;
      if (envSecret && secret === envSecret) {
        console.log('Webhook secret verified via env var');
        return true;
      }
      console.log('Webhook rejected: no secret configured');
      return false;
    }

    const config = JSON.parse(stored);
    if (!secret || secret !== config.secret) {
      console.log('Webhook rejected: invalid or missing x-incode-secret header');
      return false;
    }

    console.log('Webhook secret verified successfully');
    return true;
  } catch (err) {
    console.error('Token verification error:', err);
    return false;
  }
}

export async function handler(req) {
  console.log('Webhook received:', JSON.stringify(req.body));

  if (!await verifyWebhookSecret(req)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const body = JSON.parse(req.body);
    const { eventType, interviewId, loginHint, identityId } = body;

    console.log(`Session webhook: ${eventType} for interviewId: ${interviewId}`);

    if (eventType === 'SESSION_STARTED') {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    const stored = await storage.get(`interview:${interviewId}`);
    if (!stored) {
      console.log(`No ticket found for interviewId: ${interviewId}`);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    const { issueKey, requesterName } = JSON.parse(stored);
    console.log(`Updating ticket ${issueKey} for ${eventType}`);

    const savedConfig = await storage.get('admin-config');
    const adminConfig = savedConfig ? JSON.parse(savedConfig) : {};

    let resultStatus;
    let targetTransitionName;

    if (eventType === 'SESSION_SUCCEEDED') {
      resultStatus = 'SUCCEEDED';
      targetTransitionName = adminConfig.passTransitionName;
    } else if (eventType === 'SESSION_FAILED') {
      resultStatus = 'FAILED';
      targetTransitionName = adminConfig.failTransitionName;
    } else if (eventType === 'SESSION_PENDING_REVIEW') {
      resultStatus = 'PENDING_REVIEW';
      targetTransitionName = adminConfig.pendingTransitionName;
    } else {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    await storage.set(`interview:${interviewId}`, JSON.stringify({
      issueKey,
      requesterName,
      status: resultStatus
    }));

    const historyKey = `history:${issueKey}`;
    const existingHistory = await storage.get(historyKey);
    const history = existingHistory ? JSON.parse(existingHistory) : [];
    const entryIndex = history.findIndex(h => h.interviewId === interviewId);
    if (entryIndex !== -1) {
      history[entryIndex].status = resultStatus;
      history[entryIndex].identityId = identityId || '';
      history[entryIndex].completedAt = new Date().toISOString();
      await storage.set(historyKey, JSON.stringify(history));
    }

    if (targetTransitionName) {
      const transitionsRes = await api.asApp().requestJira(
        route`/rest/api/3/issue/${issueKey}/transitions`
      );
      const transitionsData = await transitionsRes.json();
      const match = transitionsData.transitions.find(
        t => t.name.toLowerCase() === targetTransitionName.toLowerCase()
      );

      if (match) {
        await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: match.id } })
        });
        console.log(`Ticket ${issueKey} transitioned to "${targetTransitionName}"`);
      }
    }

    setTimeout(async () => {
      await storage.delete(`interview:${interviewId}`);
    }, 60000);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }
}