import { storage } from '@forge/api';
import api, { route } from '@forge/api';

export async function handler(req) {
  console.log('Webhook received:', JSON.stringify(req.body));

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