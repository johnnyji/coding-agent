import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';

export type HonoEnv = {
  Variables: {
    userId: string;
    userLogin: string;
  };
};

export const validateSession = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return c.json({ error: 'Server misconfiguration' }, 500);
  }

  try {
    const secretBytes = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretBytes);

    if (
      typeof payload.userId !== 'string' ||
      typeof payload.userLogin !== 'string'
    ) {
      return c.json({ error: 'Invalid token payload' }, 401);
    }

    c.set('userId', payload.userId);
    c.set('userLogin', payload.userLogin);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});
