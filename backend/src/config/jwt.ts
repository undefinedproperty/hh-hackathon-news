import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  telegramId: number;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(
    payload as object,
    JWT_SECRET as string,
    {
      expiresIn: JWT_EXPIRES_IN as string,
    } as SignOptions
  );
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
};

export const generateLoginToken = (telegramId: number): string => {
  return jwt.sign(
    { telegramId },
    JWT_SECRET as string,
    {
      expiresIn: '2m', // 2 minutes
    } as SignOptions
  );
};

export const verifyLoginToken = (token: string): { telegramId: number } => {
  return jwt.verify(token, JWT_SECRET as string) as { telegramId: number };
};
