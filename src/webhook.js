import { storage } from '@forge/api';
import api, { route } from '@forge/api';

function renderMessage(template, vars) {
  return template
    .replace(/{{name}}/g, vars.name || '')
    .replace(/{{email}}/g, vars.email || '')
    .replace(/{{identityId}}/g, vars.identityId || '')
    .replace(/{{sessionId}}/g, vars.sessionId || '');
}

const DEFAULT_MESSAGES = {
  pass: '✅ Incode verification PASSED for {{name}} ({{email}}). Identity confirmed — you may proceed with the request. Identity ID: {{identityId}} | Session ID: {{sessionId}}',
  fail: '❌ Incode verification FAILED for {{name}} ({{email}}). Do not proceed — escalate to senior agent for manual review. Session ID: {{sessionId}}',
  pending: '⚠️ Incode verification requires MANUAL REVIEW for {{name}} ({{email}}). Do not proceed until review is complete. Session ID: {{sessionId}}'
};

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

    const vars = {
      name: requesterName,
      email: loginHint,
      identityId: identityId || '',
      sessionId: interviewId || ''
    };

    let commentText;
    let targetTransitionName;
    let resultStatus;

    if (eventType === 'SESSION_SUCCEEDED') {
      commentText = renderMessage(adminConfig.passMessage || DEFAULT_MESSAGES.pass, vars);
      targetTransitionName = adminConfig.passTransitionName;
      resultStatus = 'SUCCEEDED';
    } else if (eventType === 'SESSION_FAILED') {
      commentText = renderMessage(adminConfig.failMessage || DEFAULT_MESSAGES.fail, vars);
      targetTransitionName = adminConfig.failTransitionName;
      resultStatus = 'FAILED';
    } else if (eventType === 'SESSION_PENDING_REVIEW') {
      commentText = renderMessage(adminConfig.pendingMessage || DEFAULT_MESSAGES.pending, vars);
      targetTransitionName = adminConfig.pendingTransitionName;
      resultStatus = 'PENDING_REVIEW';
    } else {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: commentText }
              ]
            }
          ]
        }
      })
    });

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
          body: JSON.stringify({
            transition: { id: match.id }
          })
        });
        console.log(`Ticket ${issueKey} transitioned to "${targetTransitionName}"`);
      } else {
        console.log(`No matching transition found for "${targetTransitionName}"`);
      }
    }

    await storage.set(`interview:${interviewId}`, JSON.stringify({
      issueKey,
      requesterName,
      status: resultStatus
    }));

    setTimeout(async () => {
      await storage.delete(`interview:${interviewId}`);
    }, 60000);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }
}