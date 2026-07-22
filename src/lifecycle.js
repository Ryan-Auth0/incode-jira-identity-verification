import { storage, webTrigger } from '@forge/api';
import crypto from 'crypto';

export async function handler(event) {
  try {
    console.log('Lifecycle event received:', event.type);

    const webhookUrl = await webTrigger.getUrl('incode-webhook');
    console.log('Webhook URL captured:', webhookUrl);

    const existing = await storage.get('webhook-config');
    const existingConfig = existing ? JSON.parse(existing) : {};

    const config = {
      secret: existingConfig.secret || crypto.randomBytes(32).toString('hex'),
      webhookUrl
    };

    await storage.set('webhook-config', JSON.stringify(config));
    console.log('Webhook config stored successfully');
  } catch (err) {
    console.error('Lifecycle handler error:', err);
  }
}