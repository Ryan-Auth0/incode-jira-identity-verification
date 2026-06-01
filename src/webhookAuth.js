import { storage } from '@forge/api';
import crypto from 'crypto';

export async function handler(req) {
  console.log('Webhook auth request received');
  console.log('Auth headers raw:', JSON.stringify(req.headers));
  console.log('Auth body raw:', JSON.stringify(req.body));
  console.log('Auth query raw:', JSON.stringify(req.queryParameters));
  console.log('Auth method:', req.method);

  // Check if body contains session data
  try {
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (bodyStr && bodyStr.includes('eventType')) {
      console.log('SESSION DATA FOUND IN AUTH BODY:', bodyStr);
    }
    if (bodyStr && bodyStr.includes('interviewId')) {
      console.log('INTERVIEW ID FOUND IN AUTH BODY:', bodyStr);
    }
  } catch(e) {}

  try {
    const headers = req.headers || {};
    const authHeaderRaw = headers['authorization'] || headers['Authorization'] || '';
    const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : String(authHeaderRaw);

    if (!authHeader.startsWith('Basic ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    const base64Credentials = authHeader.slice('Basic '.length);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const colonIndex = credentials.indexOf(':');
    const clientId = credentials.slice(0, colonIndex);
    const clientSecret = credentials.slice(colonIndex + 1);

    const expectedClientId = process.env.WEBHOOK_CLIENT_ID;
    const expectedSecret = process.env.WEBHOOK_SECRET_KEY;

    if (!expectedClientId || !expectedSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    if (clientId !== expectedClientId || clientSecret !== expectedSecret) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresIn = 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    await storage.set(`webhook-token:${accessToken}`, JSON.stringify({
      createdAt: Date.now(),
      expiresAt
    }));

    console.log('Webhook auth token issued successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({
        access_token: accessToken,
        expires_in: expiresIn
      }),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (err) {
    console.error('Webhook auth error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
}