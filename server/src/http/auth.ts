import { UserState, user } from '.prisma/client';
import { app } from '../app';
import { HttpStatusCodes } from '../constants';
import db from '../db';
import crypto from 'crypto';

app.post('/auth', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string')
    return res.sendStatus(HttpStatusCodes.BadRequest);
  if (typeof username !== 'string' || typeof password !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

  const user = await db.user.findUnique({ where: { username } });
  if (!user) return res.status(HttpStatusCodes.Unauthorized).send({ message: 'Invalid name or password.' });

  const { salt, password_hash, token } = user;

  const hash = crypto
    .createHash('sha256')
    .update(password + salt)
    .digest();
  if (!hash.equals(password_hash))
    return res.status(HttpStatusCodes.Unauthorized).send({ message: 'Invalid name or password.' });

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send({ message: allowed.message });

  res.cookie('token', token, { maxAge: 2592000000 });
  res.cookie('id', user.id, { maxAge: 2592000000 });
  return res.send({ message: 'Cookie set.' });
});

app.get('/logout', async (req, res) => {
  res.clearCookie('token');
  res.clearCookie('id');

  return res.redirect('/login');
});

export async function getUser(token: string | undefined) {
  if (!token || typeof token !== 'string') return null;

  const user = await db.user.findUnique({ where: { token } });
  return user;
}

export function userAllowed(user: user) {
  if (user.state === UserState.Waitlist) return { allowed: false, message: 'You are on the waitlist.' };
  else if (user.state === UserState.Suspended) {
    if (user.suspended_until && user.suspended_until.getTime() - Date.now() <= 0) {
      db.user
        .update({
          where: { id: user.id },
          data: { state: UserState.Active, suspended_reason: null, suspended_until: null }
        })
        .then(() => {});

      return { allowed: true };
    }

    return {
      allowed: false,
      message: `This account is suspended${
        user.suspended_until
          ? ` until ${user.suspended_until.toLocaleString(undefined, {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric'
            })}`
          : '.'
      }.<br>Reason: ${user.suspended_reason}`
    };
  }

  return { allowed: true };
}
