import { User } from '../models/index.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required');
  let payload;
  try { payload = verifyAccessToken(token); } catch { throw new ApiError(401, 'Access token is invalid or expired'); }
  const user = await User.findById(payload.sub).select('-refreshTokens');
  if (!user || user.status !== 'active') throw new ApiError(401, 'Account is unavailable');
  req.user = user;
  next();
});

export const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await User.findById(payload.sub).select('-refreshTokens');
    if (user?.status === 'active') req.user = user;
  } catch { /* public route stays anonymous */ }
  next();
});

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission to perform this action'));
  next();
};

export const authorizeSurveyorMode = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  if (req.user.role === 'admin' || req.user.role === 'surveyor') return next();
  if (req.user.role !== 'tenant') throw new ApiError(403, 'Surveyor Mode is not available for this account');
  const { getActiveSurveyorSubscription } = await import('../services/surveyorSubscription.js');
  await getActiveSurveyorSubscription(req.user._id);
  next();
});
