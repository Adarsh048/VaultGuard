import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User, IUser } from '../models/User';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  tokenPayload?: {
    userId: string;
    role?: string;
    email?: string;
    sessionStartedAt?: number;
  };
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token = req.cookies?.vaultguard_token;

    // Also support Authorization header for API testing/tools
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required. No session token provided.' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      role?: string;
      email?: string;
      sessionStartedAt?: number;
    };
    const user = await User.findById(decoded.userId);

    if (!user) {
      res.status(401).json({ success: false, message: 'User account not found.' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ success: false, message: 'User account is suspended or inactive.' });
      return;
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error: any) {
    res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
}

