import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../config/jwt';
import User, { IUser } from '../models/User';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log('🔍 AUTH MIDDLEWARE - Request:', {
    path: req.path,
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    authHeader: req.headers.authorization?.substring(0, 20) + '...'
  });

  // Routes that completely skip auth
  const publicRoutes = [
    '/api/auth',
    '/health'
  ];

  // Routes that optionally authenticate (don't fail if no token)
  const optionalAuthRoutes = [
    '/api/news'
  ];

  // Sources routes with mixed authentication: GET is optional auth, others require auth
  const isSourcesGetRoute = req.baseUrl === '/api/sources' && req.method === 'GET';

  const fullPath = req.baseUrl + req.path;
  const isPublicRoute = publicRoutes.some(route => fullPath.startsWith(route));
  const isOptionalAuthRoute = optionalAuthRoutes.some(route => fullPath.startsWith(route)) || req.baseUrl === '/api/news' || isSourcesGetRoute;

  console.log('🔍 AUTH MIDDLEWARE - Route check:', {
    isPublicRoute,
    isOptionalAuthRoute,
    path: req.path,
    baseUrl: req.baseUrl,
    fullPath,
    method: req.method,
    publicRoutes,
    optionalAuthRoutes,
    matchingPublicRoute: publicRoutes.find(route => fullPath.startsWith(route)),
    matchingOptionalRoute: optionalAuthRoutes.find(route => fullPath.startsWith(route)),
    baseUrlMatchesNews: req.baseUrl === '/api/news',
    isSourcesGetRoute
  });

  if (isPublicRoute) {
    console.log('🔍 AUTH MIDDLEWARE - Public route, skipping auth');
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    console.log('🔍 AUTH MIDDLEWARE - Processing auth header:', {
      hasAuthHeader: !!authHeader,
      startsWithBearer: authHeader?.startsWith('Bearer '),
      authHeaderLength: authHeader?.length
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('🔍 AUTH MIDDLEWARE - No valid token found:', {
        hasAuthHeader: !!authHeader,
        authHeader: authHeader,
        startsWithBearer: authHeader?.startsWith('Bearer '),
        isOptionalAuthRoute,
        baseUrl: req.baseUrl,
        path: req.path,
        fullPath,
        method: req.method
      });

      if (isOptionalAuthRoute) {
        console.log('🔍 AUTH MIDDLEWARE - Optional auth route, no token - continuing without user');
        // For optional auth routes, continue without user if no token
        return next();
      }

      console.log('🔍 AUTH MIDDLEWARE - RETURNING 401: No token provided', {
        reason: 'Not an optional auth route',
        isOptionalAuthRoute,
        baseUrl: req.baseUrl,
        path: req.path,
        fullPath
      });
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('🔍 AUTH MIDDLEWARE - Verifying token...');
    const payload = verifyToken(token);
    console.log('🔍 AUTH MIDDLEWARE - Token verified, payload:', { userId: payload.userId });

    // Fetch user from database using userId from token
    const user = await User.findById(payload.userId);
    console.log('🔍 AUTH MIDDLEWARE - User lookup result:', {
      userFound: !!user,
      userId: user?._id,
      isActive: user?.isActive
    });

    if (!user) {
      if (isOptionalAuthRoute) {
        console.log('🔍 AUTH MIDDLEWARE - Optional auth route, user not found - continuing without user');
        // For optional auth routes, continue without user if user not found
        return next();
      }
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      if (isOptionalAuthRoute) {
        console.log('🔍 AUTH MIDDLEWARE - Optional auth route, user inactive - continuing without user');
        // For optional auth routes, continue without user if user inactive
        return next();
      }
      return res.status(401).json({ error: 'User account is inactive' });
    }

    // Attach user to request
    req.user = user;
    console.log('🔍 AUTH MIDDLEWARE - User successfully attached to request:', { userId: user._id });
    next();
  } catch (error) {
    console.log('🔍 AUTH MIDDLEWARE - Error occurred:', {
      error: error instanceof Error ? error.message : error,
      isOptionalAuthRoute
    });

    if (isOptionalAuthRoute) {
      // For optional auth routes, continue without user if token invalid
      console.log('🔍 AUTH MIDDLEWARE - Optional auth route, error occurred - continuing without user');
      return next();
    }

    if (error instanceof Error && error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export default authMiddleware;
