import { app } from '../app';
import { maxUsernameLength, HttpStatusCodes, Opcodes, EventTypes, CloseCodes } from '../constants';
import db from '../db';
import { snowflake } from '../snowflake';
import crypto from 'crypto';
import { broadcast, clients } from '../ws';
import { getUser, userAllowed } from './auth';
import { UserState } from '.prisma/client';
import ms from 'ms';

app.post('/users', async (req, res) => {
  const { username, password } = req.body;

  if (
    !username ||
    !password ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.length > maxUsernameLength
  )
    return res.sendStatus(HttpStatusCodes.BadRequest);

  if (username.includes(' '))
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Username cannot have a space.' });

  const user = await db.user.findFirst({
    where: { username: { equals: username.toLowerCase(), mode: 'insensitive' } }
  });
  if (user) return res.status(HttpStatusCodes.Conflict).send({ message: 'This username is already in use.' });

  const id = snowflake.generate();
  const salt = crypto.randomBytes(16);

  const password_hash = crypto
    .createHash('sha256')
    .update(password + salt)
    .digest();
  const token = crypto.randomBytes(16).toString('hex');

  const newUser = await db.user.create({
    data: {
      id,
      username,
      password_hash,
      salt,
      token
    }
  });

  return res.sendStatus(HttpStatusCodes.Created);
});

app.get('/users/:id', async (req, res) => {
  const u = await getUser(req.headers.authorization);
  if (!u) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(u);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  if (typeof req.params.id !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

  let userId;
  try {
    userId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const user = await db.user.findUnique({
    where: { id: userId }
  });

  if (!user) return res.sendStatus(404);

  return res.send({
    id: user.id.toString(),
    username: user.username,
    admin: user.admin
  });
});

app.get('/users', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  const users = await db.user.findMany({
    where: {
      state: {
        not: UserState.Waitlist
      }
    }
  });
  const onlineUsers = [...clients.values()].map(c => c.user.id);

  const data = users
    .map(user => ({
      online: onlineUsers.includes(user.id),
      id: user.id.toString(),
      username: user.username,
      admin: user.admin
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return res.send(data);
});

app.get('/users-admin', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);
  if (!user.admin) return res.sendStatus(HttpStatusCodes.Forbidden);

  const users = await db.user.findMany();

  const data = users
    .map(user => ({
      id: user.id.toString(),
      username: user.username,
      admin: user.admin,
      state: user.state,
      suspended_until: user.suspended_until,
      suspended_reason: user.suspended_reason
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return res.send(data);
});

app.patch('/users/:id', async (req, res) => {
  let userId;
  try {
    userId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return res.sendStatus(HttpStatusCodes.NotFound);

  if (!('password' in req.body)) return res.sendStatus(HttpStatusCodes.BadRequest);
  const { salt, password_hash } = user;

  const hash = crypto
    .createHash('sha256')
    .update(req.body.password + salt)
    .digest();
  if (!hash.equals(password_hash))
    return res.status(HttpStatusCodes.Unauthorized).send({ message: 'Invalid password.' });

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  const changeData: { username?: string; password_hash?: Buffer; salt?: Buffer; token?: string } = {};

  if ('username' in req.body) {
    const { username } = req.body;
    if (!username || typeof username !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

    if (username.length > maxUsernameLength)
      return res
        .status(HttpStatusCodes.BadRequest)
        .send({ message: `Username is too long (max ${maxUsernameLength}).` });

    if (username.includes(' '))
      return res.status(HttpStatusCodes.BadRequest).send({ message: 'Username cannot have a space.' });

    const existingUser = await db.user.findFirst({
      where: { username: { equals: username.toLowerCase(), mode: 'insensitive' } }
    });

    // the whole point here is to allow users to change the casing of their username
    if (existingUser && existingUser.id !== user.id)
      return res.status(HttpStatusCodes.Conflict).send({ message: 'This username is already in use.' });
    if (username === user.username)
      return res.status(HttpStatusCodes.Conflict).send({ message: 'You are already using that username.' });

    changeData.username = username;
  }

  if ('new_password' in req.body) {
    const { new_password } = req.body;

    if (typeof new_password !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

    const salt = crypto.randomBytes(16);
    const password_hash = crypto
      .createHash('sha256')
      .update(new_password + salt)
      .digest();

    const token = crypto.randomBytes(16).toString('hex');

    changeData.password_hash = password_hash;
    changeData.salt = salt;
    changeData.token = token;
  }

  if (Object.keys(changeData).length === 0) return res.sendStatus(HttpStatusCodes.BadRequest);

  const newUser = await db.user.update({
    where: { id: user.id },
    data: changeData
  });

  if ('username' in changeData)
    broadcast({
      op: Opcodes.Dispatch,
      t: EventTypes.UserUpdate,
      d: {
        created: false,
        id: newUser.id.toString(),
        username: newUser.username
      }
    });

  if ('password_hash' in changeData) {
    // disconnect all connections
    clients.forEach(client => {
      if (client.user.id === newUser.id) client.ws.close(CloseCodes.Forced);
    });
  }

  // avatar is a boolean
  res.cookie('token', newUser.token, { maxAge: 2592000000 });
  return res.send({
    id: newUser.id.toString(),
    username: newUser.username,
    avatar_changed: 'avatar' in changeData,
    token: newUser.token
  });
});

app.patch('/users-admin/:id', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);
  if (!user.admin) return res.sendStatus(HttpStatusCodes.Forbidden);

  let userId: bigint;
  try {
    userId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const targetUser = await db.user.findUnique({
    where: { id: userId }
  });

  if (!targetUser) return res.status(HttpStatusCodes.NotFound).send({ message: 'User not found.' });
  if (targetUser.admin) return res.status(HttpStatusCodes.Forbidden).send({ message: 'Cannot update admins.' });

  const {
    state,
    suspended_until,
    suspended_reason
  }: { state: string; suspended_until: string; suspended_reason: string } = req.body;
  if (!state || typeof state !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

  if (state === UserState.Active || state === UserState.Waitlist) {
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { state, suspended_reason: null, suspended_until: null }
    });

    if (targetUser.state === UserState.Waitlist)
      broadcast({
        op: Opcodes.Dispatch,
        t: EventTypes.UserUpdate,
        d: {
          created: true,
          id: updatedUser.id.toString(),
          username: updatedUser.username
        }
      });

    return res.send({
      id: updatedUser.id.toString(),
      admin: updatedUser.admin,
      state,
      suspended_until: updatedUser.suspended_until?.toISOString(),
      suspended_reason: updatedUser.suspended_reason,
      username: updatedUser.username
    });
  }

  // state is Suspended
  if (suspended_until && typeof suspended_until !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);
  if (!suspended_reason) return res.status(HttpStatusCodes.BadRequest).send({ message: 'Reason required.' });
  if (typeof suspended_reason !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);

  let date: Date | null = null;
  if (suspended_until && suspended_until.startsWith('[') && suspended_until.endsWith(']')) {
    const duration = suspended_until.slice(1, -1);
    const inMs = ms(duration);

    if (Number.isNaN(inMs) || inMs < 0)
      return res.status(HttpStatusCodes.BadRequest).send({ message: 'Invalid duration' });

    date = new Date(Date.now() + inMs);
  } else if (suspended_until) {
    date = new Date(suspended_until);
  }

  if (date && (date.toString() === 'Invalid Date' || date.getTime() - Date.now() < 0))
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Invalid duration' });

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: {
      state: UserState.Suspended,
      suspended_until: date,
      suspended_reason
    }
  });

  // disconnect all connections
  clients.forEach(client => {
    if (client.user.id === userId) client.ws.close(CloseCodes.Forced);
  });

  return res.send({
    id: updatedUser.id.toString(),
    admin: updatedUser.admin,
    state,
    suspended_until: updatedUser.suspended_until?.toISOString(),
    suspended_reason: updatedUser.suspended_reason,
    username: updatedUser.username
  });
});

// avatar update is found in avatars ./avatars
