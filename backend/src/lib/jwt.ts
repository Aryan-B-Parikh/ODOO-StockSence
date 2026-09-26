import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;
}

export function signToken(userId: string, secret: string, expiresIn: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn } as jwt.SignOptions);
}

/** Returns the user id encoded in the token; throws when the token is invalid/expired. */
export function verifyToken(token: string, secret: string): string {
  const payload = jwt.verify(token, secret);
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Invalid token payload');
  }
  return payload.sub;
}
