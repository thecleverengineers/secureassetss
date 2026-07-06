import { Notification, NotificationDelivery, NotificationPreference, User } from '../models/index.js';
import { emitNotification } from './realtime.js';
import { deliveryChannelConfigured } from './notificationDelivery.js';

const categoryKey = {
  payment: 'payment', survey: 'survey', complaint: 'complaint', lease: 'lease', maintenance: 'maintenance',
  message: 'message', system: 'system',
};

export async function createNotification({ user: userId, title, message, category = 'system', actionUrl, metadata = {} }) {
  const [user, preference] = await Promise.all([
    User.findById(userId).select('email phone status').lean(),
    NotificationPreference.findOne({ user: userId }).lean(),
  ]);
  if (!user || user.status !== 'active') return null;
  const key = categoryKey[category] || 'system';
  if (preference?.categories?.[key] === false) return null;
  const channels = preference?.channels || { inApp: true, email: true };
  let notification = null;
  if (channels.inApp !== false) {
    notification = await Notification.create({ user: userId, title, message, category, actionUrl, metadata });
    emitNotification(notification);
  }
  const commonMetadata = { category, title, message, actionUrl, ...metadata };
  for (const channel of ['email', 'sms', 'whatsapp', 'push']) {
    if (!channels[channel]) continue;
    const destination = channel === 'email' ? user.email : user.phone;
    const configured = deliveryChannelConfigured(channel);
    await NotificationDelivery.create({
      notification: notification?._id,
      user: userId,
      channel,
      destination,
      status: configured && destination ? 'pending' : 'skipped',
      lastError: !destination ? `User has no ${channel === 'email' ? 'email address' : 'phone number'}` : configured ? '' : `${channel} provider is not configured`,
      metadata: commonMetadata,
    });
  }
  return notification;
}

export async function notifyOnce({ user, key, title, message, actionUrl, category = 'system' }) {
  if (await Notification.exists({ user, 'metadata.key': key })) return null;
  return createNotification({ user, title, message, actionUrl, category, metadata: { key } });
}
