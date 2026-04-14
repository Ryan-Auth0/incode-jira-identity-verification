import Resolver from '@forge/resolver';
import { storage } from '@forge/api';
import api, { route } from '@forge/api';

const INCODE_URLS = {
  demo: {
    auth: 'https://auth.demo.incode.com',
    api: 'https://demo-api.incodesmile.com'
  },
  production: {
    auth: 'https://auth.incode.com',
    api: 'https://saas-api.incodesmile.com'
  }
};

async function getIncodeToken(environment, clientId, clientSecret) {
  const urls = INCODE_URLS[environment] || INCODE_URLS.demo;
  const response = await fetch(`${urls.auth}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=openid`
  });
  const data = await response.json();
  return data.access_token;
}

async function getIncodeConfig() {
  const savedConfig = await storage.get('admin-config');
  if (savedConfig) {
    const config = JSON.parse(savedConfig);
    if (config.clientId && config.clientSecret && config.apiKey && config.integrationReference) {
      return config;
    }
  }
  return {
    environment: 'demo',
    apiKey: process.env.INCODE_API_KEY,
    clientId: process.env.INCODE_CLIENT_ID,
    clientSecret: process.env.INCODE_CLIENT_SECRET,
    integrationReference: process.env.INCODE_INTEGRATION_REFERENCE,
    linkExpiryMinutes: 10,
    defaultDeliveryMethod: 'SMS'
  };
}

function renderMessage(template, vars) {
  return template
    .replace(/{{name}}/g, vars.name || '')
    .replace(/{{email}}/g, vars.email || '')
    .replace(/{{identityId}}/g, vars.identityId || '');
}

const resolver = new Resolver();

resolver.define('getConfig', async (req) => {
  const config = await getIncodeConfig();
  return {
    defaultDeliveryMethod: config.defaultDeliveryMethod || 'SMS',
    linkExpiryMinutes: config.linkExpiryMinutes || 10
  };
});

resolver.define('sendVerification', async (req) => {
  const issueKey = req.context.extension.request.key;
  const { corporateEmail, deliveryMethod, deliveryEmail, deliveryPhone } = req.payload;

  try {
    const incodeConfig = await getIncodeConfig();
    const urls = INCODE_URLS[incodeConfig.environment] || INCODE_URLS.demo;

    const issueRes = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,reporter`
    );
    const issue = await issueRes.json();
    const requesterName = issue.fields.reporter?.displayName || 'Unknown';

    console.log(`Starting Incode verification for ${requesterName} (${corporateEmail}) via ${deliveryMethod}`);

    const token = await getIncodeToken(incodeConfig.environment, incodeConfig.clientId, incodeConfig.clientSecret);

    const notification = deliveryMethod === 'SMS'
      ? { type: 'SMS', phone: deliveryPhone }
      : { type: 'EMAIL', email: deliveryEmail };

    const requestBody = {
      integrationReference: incodeConfig.integrationReference,
      loginHint: corporateEmail,
      linkValidityInMinutes: incodeConfig.linkExpiryMinutes || 10,
      notification
    };

    console.log('Incode request body:', JSON.stringify(requestBody));

    const incodeRes = await fetch(`${urls.api}/omni/b2b/onboarding/request-new`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'api-version': '1.0',
        'x-api-key': incodeConfig.apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await incodeRes.text();
    console.log('Incode raw response:', responseText);
    console.log('Incode status:', incodeRes.status);

    if (!incodeRes.ok) {
      throw new Error(`Incode API error: ${responseText}`);
    }

    const incodeData = JSON.parse(responseText);

    if (incodeData.interviewId) {
      await storage.set(`interview:${incodeData.interviewId}`, JSON.stringify({
        issueKey,
        requesterName,
        corporateEmail,
        status: 'PENDING'
      }));
      console.log(`Stored interviewId ${incodeData.interviewId} for ticket ${issueKey}`);
    }

    const deliveryDetail = deliveryMethod === 'SMS'
      ? `SMS to ${deliveryPhone}`
      : `email to ${deliveryEmail}`;

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
                {
                  type: 'text',
                  text: `Incode verification link sent via ${deliveryDetail} for ${corporateEmail}. Awaiting employee completion.`
                }
              ]
            }
          ]
        }
      })
    });

    return {
      success: true,
      requesterName,
      corporateEmail,
      deliveryMethod,
      issueKey,
      interviewId: incodeData.interviewId,
      verificationUrl: incodeData.url,
      message: `Verification link sent via ${deliveryMethod}`
    };

  } catch (err) {
    console.error('Error:', err);
    throw new Error(err.message || 'Failed to send verification');
  }
});

resolver.define('checkVerificationResult', async (req) => {
  const { interviewId } = req.payload;
  if (!interviewId) return { status: 'PENDING' };

  try {
    const stored = await storage.get(`interview:${interviewId}`);
    if (!stored) return { status: 'COMPLETE' };
    const data = JSON.parse(stored);
    return { status: data.status || 'PENDING' };
  } catch (err) {
    console.error('Error checking result:', err);
    return { status: 'PENDING' };
  }
});

resolver.define('testIncodeCredentials', async (req) => {
  const { environment, apiKey, clientId, clientSecret } = req.payload;
  try {
    const token = await getIncodeToken(environment, clientId, clientSecret);
    if (token) return { success: true };
    return { success: false };
  } catch (err) {
    console.error('Credential test failed:', err);
    return { success: false };
  }
});

resolver.define('getAdminConfig', async (req) => {
  try {
    const savedConfig = await storage.get('admin-config');

    const searchRes = await api.asApp().requestJira(
      route`/rest/api/3/search/jql?jql=project+is+not+EMPTY+ORDER+BY+created+DESC&maxResults=10&fields=summary,status`
    );
    const searchData = await searchRes.json();

    const transitionMap = {};
    for (const issue of searchData.issues || []) {
      const transitionsRes = await api.asApp().requestJira(
        route`/rest/api/3/issue/${issue.key}/transitions`
      );
      const transitionsData = await transitionsRes.json();
      for (const t of transitionsData.transitions) {
        transitionMap[t.name] = { id: t.id, name: t.name };
      }
    }

    const transitions = Object.values(transitionMap);

    const defaultConfig = {
      environment: 'demo',
      apiKey: '',
      clientId: '',
      clientSecret: '',
      integrationReference: '',
      linkExpiryMinutes: 10,
      defaultDeliveryMethod: 'SMS',
      passTransitionName: '',
      failTransitionName: '',
      pendingTransitionName: '',
      passMessage: '✅ Incode verification PASSED for {{name}} ({{email}}). Identity confirmed — you may proceed with the request. Identity ID: {{identityId}}',
      failMessage: '❌ Incode verification FAILED for {{name}} ({{email}}). Do not proceed — escalate to senior agent for manual review.',
      pendingMessage: '⚠️ Incode verification requires MANUAL REVIEW for {{name}} ({{email}}). Do not proceed until review is complete.'
    };

    return {
      transitions,
      config: savedConfig ? { ...defaultConfig, ...JSON.parse(savedConfig) } : defaultConfig
    };
  } catch (err) {
    console.error('Error getting admin config:', err);
    throw err;
  }
});

resolver.define('saveAdminConfig', async (req) => {
  const { config } = req.payload;
  await storage.set('admin-config', JSON.stringify(config));
  console.log('Admin config saved');
  return { success: true };
});

export { renderMessage };

resolver.define('getSetupStatus', async (req) => {
  try {
    const savedConfig = await storage.get('admin-config');
    if (!savedConfig) return { configured: false };
    const config = JSON.parse(savedConfig);
    const configured = !!(config.clientId && config.clientSecret && config.apiKey && config.integrationReference);
    return { configured };
  } catch (err) {
    return { configured: false };
  }
});

export const handler = resolver.getDefinitions();