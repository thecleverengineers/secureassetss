import { connectDatabase, disconnectDatabase } from '../server/src/config/db.js';
import { notifyOnce } from '../server/src/services/notifications.js';
import { Tenancy, RentalInvoice, ReminderRule, Subscription, AuditLog } from '../server/src/models/index.js';

const DAY = 86400000;
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const differenceDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);
const invoiceNumber = (tenancy, month) => `RNT-${month.replace('-', '')}-${String(tenancy._id).slice(-7).toUpperCase()}`;

async function createMonthlyInvoices(now) {
  const activeOwners = await Subscription.distinct('user', { status: 'active', expiresAt: { $gt: now }, 'limits.rentAutomation': true });
  const tenancies = await Tenancy.find({ landlord: { $in: activeOwners }, status: 'active', startDate: { $lte: now }, $or: [{ endDate: null }, { endDate: { $gte: now } }, { endDate: { $exists: false } }] }).lean();
  let created = 0;
  for (const tenancy of tenancies) {
    const month = monthKey(now);
    const dueDay = Math.min(Math.max(Number(tenancy.dueDay || 1), 1), 28);
    const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay, 23, 59, 59, 999);
    const baseRent = Number(tenancy.monthlyRent || 0);
    const result = await RentalInvoice.updateOne(
      { tenancy: tenancy._id, billingMonth: month },
      { $setOnInsert: {
        invoiceNumber: invoiceNumber(tenancy, month), tenancy: tenancy._id, tenant: tenancy.tenant, landlord: tenancy.landlord,
        property: tenancy.property, space: tenancy.space, billingMonth: month, dueDate,
        charges: { baseRent, electricity: 0, water: 0, maintenance: 0, parking: 0, internet: 0, gas: 0, cleaning: 0, commonArea: 0, securityDeposit: 0, lateFee: 0, other: [] },
        discounts: 0, previousBalance: 0, totalAmount: baseRent, paidAmount: 0, balanceAmount: baseRent,
        status: dueDate < now ? 'overdue' : 'upcoming', createdBy: tenancy.landlord, updatedBy: tenancy.landlord,
      } },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
  }
  return created;
}

async function updateStatuses(now) {
  const result = await RentalInvoice.updateMany({ status: { $in: ['upcoming', 'pending', 'partially_paid'] }, dueDate: { $lt: now }, balanceAmount: { $gt: 0 } }, { $set: { status: 'overdue' } });
  await RentalInvoice.updateMany({ balanceAmount: { $lte: 0 }, status: { $ne: 'paid' } }, { $set: { status: 'paid' } });
  return result.modifiedCount;
}

async function sendReminders(now) {
  const invoices = await RentalInvoice.find({ status: { $in: ['upcoming', 'pending', 'partially_paid', 'overdue'] }, balanceAmount: { $gt: 0 }, dueDate: { $gte: new Date(now.getTime() - 120 * DAY), $lte: new Date(now.getTime() + 30 * DAY) } }).lean();
  let sent = 0;
  for (const invoice of invoices) {
    const rule = await ReminderRule.findOne({
      owner: invoice.landlord,
      active: true,
      $or: [
        { property: invoice.property },
        { property: null },
        { property: { $exists: false } },
      ],
    }).sort({ property: -1 }).lean();
    const offsets = rule?.offsetsDays?.length ? rule.offsetsDays.map(Number) : [-7, -3, -1, 0, 1, 3, 7];
    const offset = differenceDays(now, new Date(invoice.dueDate)); // negative before due; positive overdue
    const weekly = Boolean(rule?.repeatWeeklyUntilPaid && offset > 7 && offset % 7 === 0);
    if (!offsets.includes(offset) && !weekly) continue;
    const reminderKey = `${invoice._id}:${offset}`;
    const balance = Number(invoice.balanceAmount || invoice.totalAmount || 0);
    const dueText = offset < 0 ? `due in ${Math.abs(offset)} day${Math.abs(offset) === 1 ? '' : 's'}` : offset === 0 ? 'due today' : `${offset} day${offset === 1 ? '' : 's'} overdue`;
    const message = rule?.template?.message
      ? rule.template.message.replaceAll('{{invoice}}', invoice.invoiceNumber).replaceAll('{{amount}}', String(balance)).replaceAll('{{due}}', dueText)
      : `Invoice ${invoice.invoiceNumber} has ₹${balance.toLocaleString('en-IN')} ${dueText}.`;
    await notifyOnce({ user: invoice.tenant, key: `rent-reminder-${reminderKey}`, title: rule?.template?.subject || (offset > 0 ? 'Rent payment overdue' : 'Upcoming rent payment'), message, category: 'payment', actionUrl: '/app/rental-invoices' });
    await RentalInvoice.updateOne({ _id: invoice._id }, { $set: { lastReminderAt: now } });
    sent += 1;
  }
  return sent;
}

try {
  await connectDatabase();
  const now = new Date();
  const created = await createMonthlyInvoices(now);
  const overdue = await updateStatuses(now);
  const reminders = await sendReminders(now);
  await AuditLog.create({ action: 'automation_run', module: 'rental-automation', role: 'system', updatedValue: { created, overdue, reminders, ranAt: now } });
  console.log(JSON.stringify({ success: true, createdInvoices: created, markedOverdue: overdue, remindersSent: reminders, ranAt: now.toISOString() }));
} catch (error) {
  console.error('Rental automation failed:', error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase().catch(() => {});
}
