import { app } from '../app';
import { EventTypes, HttpStatusCodes, Opcodes } from '../constants';
import db from '../db';
import { broadcast } from '../ws';
import { getUser, userAllowed } from './auth';
import multer from 'multer';

const upload = multer();

app.get('/avatars/:id', async (req, res) => {
  let userId: bigint;
  try {
    userId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const avatar = await db.avatar.findUnique({
    where: {
      user_id: userId
    }
  });

  if (!avatar) return res.sendFile('resources/default_pfp.png', { root: 'public' });

  return res.type(avatar.type).send(avatar.data);
});

app.patch('/avatars/:id', upload.single('file'), async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  let userId: bigint;
  try {
    userId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  if (user.id !== userId) return res.sendStatus(HttpStatusCodes.Forbidden);

  const { file, type } = req.body;

  if (!file || !type || typeof file !== 'string' || typeof type !== 'string' || type.length > 50)
    return res.sendStatus(HttpStatusCodes.BadRequest);
  if (file.length > 1e6) return res.status(HttpStatusCodes.PayloadTooLarge).send({ message: 'File too large.' });

  const buffer = Buffer.from(file.split(',')[1], 'base64');

  await db.avatar.upsert({
    create: {
      type,
      data: buffer,
      user_id: userId
    },
    where: { user_id: userId },
    update: {
      type,
      data: buffer
    }
  });

  broadcast({
    op: Opcodes.Dispatch,
    t: EventTypes.UserUpdate,
    d: {
      created: false,
      avatar: true,
      id: userId.toString()
    }
  });

  return res.sendStatus(HttpStatusCodes.NoContent);
});

app.get('/default_pfp', async (_, res) => {
  return res.sendFile('resources/default_pfp.png', { root: 'public' });
});
