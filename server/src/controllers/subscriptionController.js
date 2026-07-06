import crypto from 'node:crypto';
import { Subscription, User, Property, PropertySpace, Payment, AuditLog, LandlordPlan } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ensureLandlordPlans, syncLandlordLifecycle, usageWithLimits } from '../services/landlordSubscription.js';
import { applyPaidPayment } from '../services/paymentLifecycle.js';
import { env } from '../config/env.js';

export const listPlans = asyncHandler(async (_req, res) => {
  await ensureLandlordPlans();
  const data = await LandlordPlan.find({ active: true }).sort({ rank: 1 }).lean();
  res.json({ success: true, data });
});

export const mySubscription = asyncHandler(async (req, res) => {
  await syncLandlordLifecycle(req.user._id);
  const data = await usageWithLimits(req.user._id);
  const pending = await Subscription.findOne({ user: req.user._id, status: 'pending' }).sort('-createdAt').lean();
  res.json({ success: true, data: { ...data, pending } });
});

export const checkout = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant') throw new ApiError(403, 'Only Tenant accounts can purchase a Landlord subscription');
  await ensureLandlordPlans();
  const planKey = String(req.body.plan || 'starter').toLowerCase();
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const plan = await LandlordPlan.findOne({ key: planKey, active: true }).lean();
  if (!plan) throw new ApiError(422, 'Invalid or inactive subscription plan');
  const amount = Number(plan.prices?.[billingCycle] || 0);
  const now = new Date();

  await Subscription.updateMany({ user: req.user._id, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: now } });
  const subscription = await Subscription.create({
    user: req.user._id,
    plan: plan.key,
    billingCycle,
    amount,
    status: 'pending',
    limits: { ...plan.limits, ...plan.features },
    payment: { method: 'manual', gateway: 'manual-approval', metadata: { planSnapshot: plan } },
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  const payment = await Payment.create({
    invoiceNumber: `SUB-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    payer: req.user._id,
    type: 'landlord_subscription',
    amount,
    paidAmount: 0,
    status: 'pending',
    dueDate: now,
    method: req.body.method === 'bank_transfer' ? 'bank_transfer' : 'offline',
    transactionId: req.body.transactionId ? String(req.body.transactionId) : undefined,
    proofUrl: req.body.proofUrl ? String(req.body.proofUrl) : undefined,
    gateway: { provider: 'manual', subscriptionId: subscription._id },
    notes: `${plan.name} Landlord plan — awaiting verified payment`,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  if (env.PAYMENT_AUTO_APPROVE) {
    payment.status = 'paid'; payment.paidAmount = amount; payment.paidAt = now; payment.transactionId ||= `DEV-SUB-${Date.now()}`;
    await payment.save();
    await applyPaidPayment(payment, { userId: req.user._id, role: req.user.role, ip: req.ip, device: req.get('user-agent') });
  }
  await AuditLog.create({ user: req.user._id, role: req.user.role, action: 'subscription:checkout-created', module: 'subscriptions', recordId: subscription._id, updatedValue: { plan: plan.key, billingCycle, amount, paymentId: payment._id }, ip: req.ip, device: req.get('user-agent') });
  res.status(201).json({ success: true, data: { subscription, payment }, message: env.PAYMENT_AUTO_APPROVE ? 'Landlord subscription activated' : 'Payment submitted and awaiting verification' });
});

export const cancel = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ _id: req.params.id, user: req.user._id, status: { $in: ['active', 'pending'] } });
  if (!subscription) throw new ApiError(404, 'Active or pending subscription not found');
  subscription.status = 'cancelled'; subscription.cancelledAt = new Date(); await subscription.save();
  if (req.user.landlordEnabled) {
    await User.findByIdAndUpdate(req.user._id, { landlordEnabled: false, activeMode: 'regular' });
    await Property.updateMany({ owner: req.user._id, requiresActiveSubscription: true }, { visibility: 'private', publicationStatus: 'draft' });
    await PropertySpace.updateMany({ owner: req.user._id }, { visibility: 'private', publicationStatus: 'draft' });
  }
  res.json({ success: true, data: subscription, message: 'Subscription cancelled. Existing data remains saved and public listings were paused.' });
});
