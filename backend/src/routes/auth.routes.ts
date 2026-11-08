import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import { User } from '../models/User';
import { loginSchema } from '../validations/auth.validation';
import { auditService } from '../services/audit.service';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

// POST /api/auth/login
router.post('/login', authLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Invalid input',
      });
      return;
    }

    const { email, password } = parseResult.data;
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      await auditService.log({
        username: email,
        action: 'LOGIN_FAILURE',
        result: 'FAILURE',
        ipAddress: req.ip || '127.0.0.1',
        metadata: { reason: 'User not found' },
      });
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await auditService.log({
        userId: user._id,
        username: user.name,
        action: 'LOGIN_FAILURE',
        result: 'FAILURE',
        ipAddress: req.ip || '127.0.0.1',
        metadata: { reason: 'Password mismatch' },
      });
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'active') {
      await auditService.log({
        userId: user._id,
        username: user.name,
        action: 'LOGIN_DENIED',
        result: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        metadata: { reason: 'Account suspended' },
      });
      res.status(403).json({ success: false, message: 'Your account is suspended' });
      return;
    }

    // Sign JWT with strong secret
    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      config.jwtSecret,
      { expiresIn: '8h' }
    );

    // Cryptographically secure random CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // Set HTTP-only secure authentication cookie
    res.cookie('vaultguard_token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.cookieSameSite,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    // Set CSRF protection cookie (readable by frontend client to attach as X-CSRF-Token)
    res.cookie('vaultguard_csrf', csrfToken, {
      httpOnly: false,
      secure: config.nodeEnv === 'production',
      sameSite: config.cookieSameSite,
      maxAge: 8 * 60 * 60 * 1000,
    });

    await auditService.log({
      userId: user._id,
      username: user.name,
      action: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      metadata: { role: user.role },
    });

    // CRITICAL SECURITY FIX: Do not include JWT token in JSON response body.
    // Authentication relies exclusively on HTTP-only cookies.
    res.status(200).json({
      success: true,
      csrfToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during authentication' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user) {
      await auditService.log({
        userId: req.user._id,
        username: req.user.name,
        action: 'LOGOUT',
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
      });
    }

    res.clearCookie('vaultguard_token', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.cookieSameSite,
    });

    res.clearCookie('vaultguard_csrf', {
      httpOnly: false,
      secure: config.nodeEnv === 'production',
      sameSite: config.cookieSameSite,
    });

    res.status(200).json({ success: true, message: 'Successfully logged out' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Logout error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }

  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      createdAt: req.user.createdAt,
    },
  });
});

export default router;
