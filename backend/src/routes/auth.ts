import express from 'express';
import User from '../models/User';
import { verifyLoginToken, generateToken } from '../config/jwt';

const router = express.Router();

router.post('/telegram-login', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Login token is required' });
    }

    const decoded = verifyLoginToken(token);
    const telegramId = decoded.telegramId;

    let user = await User.findByTelegramId(telegramId);

    if (!user) {
      user = new User({
        telegramId: telegramId,
        isActive: true,
        lastLoginAt: new Date(),
      });
      await user.save();
    } else {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const authToken = generateToken({
      userId: (user._id as string).toString(),
      telegramId: user.telegramId,
    });

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.username || user.firstName || `User${user.telegramId}`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login token has expired' });
    }
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid login token' });
    }
    
    console.error('Telegram login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;