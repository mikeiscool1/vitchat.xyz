import { app } from '../app';
import { EventTypes, HttpStatusCodes, Opcodes, maxContentLength, messagesPerFetch } from '../constants';
import { getUser, userAllowed } from './auth';
import db from '../db';
import { snowflake } from '../snowflake';
import { broadcast } from '../ws';

const rateLimitMap = new Map<bigint, number[]>();
const usersRateLimitedUntil = new Map<bigint, number>();

namespace RateLimit {
  export const amount = 6;
  export const milliseconds = 3000;
  export const cooldown = 5000;
}

app.post('/messages', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  const rateLimitedUntil = usersRateLimitedUntil.get(user.id);
  if (rateLimitedUntil) {
    if (Date.now() >= rateLimitedUntil) usersRateLimitedUntil.delete(user.id);
    else return res.status(HttpStatusCodes.RateLimited).send({ rate_limited_until: rateLimitedUntil });
  }

  const userRateLimit = rateLimitMap.get(user.id)?.concat([Date.now()]) ?? [Date.now()];
  rateLimitMap.set(user.id, userRateLimit);

  if (userRateLimit.length === RateLimit.amount) {
    const speed = userRateLimit[userRateLimit.length - 1] - userRateLimit[0];
    if (speed < RateLimit.milliseconds) {
      rateLimitMap.set(user.id, []);
      const rateLimitedUntil = Date.now() + RateLimit.cooldown;

      usersRateLimitedUntil.set(user.id, rateLimitedUntil);

      return res.status(HttpStatusCodes.RateLimited).send({ rate_limited_until: rateLimitedUntil });
    }

    rateLimitMap.set(user.id, userRateLimit.slice(1));
  }

  let { content }: { content: string } = req.body;

  if (!content || typeof content !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);
  content = content.trim();

  if (content.length > maxContentLength)
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Content too large.' });
  if (content.split('\n').length > 20)
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Too many lines.' });

  const data = { author_id: user.id, content, id: snowflake.generate() };
  await db.message.create({ data });

  broadcast({
    op: Opcodes.Dispatch,
    t: EventTypes.MessageCreate,
    d: {
      author: {
        id: user.id.toString(),
        username: user.username,
        admin: user.admin
      },
      content,
      id: data.id.toString()
    }
  });

  const serializedData = {
    id: data.id.toString(),
    content,
    author: { id: user.id.toString(), username: user.username, admin: user.admin }
  };
  return res.send(serializedData);
});

app.get('/messages', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  let { after, before, query } = req.query;

  if ((after && typeof after !== 'string') || (before && typeof before !== 'string'))
    return res.sendStatus(HttpStatusCodes.BadRequest);

  if (query && (typeof query !== 'string' || query.length > maxContentLength))
    return res.send(HttpStatusCodes.BadRequest);

  let afterInt: bigint = 0n;
  let beforeInt: bigint = (1n << 63n) - 1n; // max psql bigint size

  try {
    if (after) afterInt = BigInt(after as string);
    if (before) beforeInt = BigInt(before as string);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  if (beforeInt < afterInt) return res.status(HttpStatusCodes.BadRequest);

  const messages = await db.$queryRaw`SELECT id, content, author
  FROM (
    SELECT CAST(message.id AS TEXT), content, json_build_object(
	    'id', CAST(author.id AS TEXT),
	    'username', author.username,
	    'admin', author.admin
	  ) as author
    FROM message
	  INNER JOIN public.user AS author ON author.id = author_id
    WHERE message.id < ${beforeInt} AND message.id > ${afterInt}
    ORDER BY message.id DESC
    LIMIT ${messagesPerFetch}
  ) AS msgs
  ORDER BY CAST(id AS BIGINT) ASC`;

  return res.send(messages);
});

app.delete('/messages/:id', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  let messageId;
  try {
    messageId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const message = await db.message.findUnique({
    where: { id: messageId }
  });

  if (!message) return res.sendStatus(HttpStatusCodes.NotFound);

  if (!user.admin && message.author_id !== user.id) return res.sendStatus(HttpStatusCodes.Forbidden);

  await db.message.delete({
    where: { id: messageId }
  });

  broadcast({
    op: Opcodes.Dispatch,
    t: EventTypes.MessageDelete,
    d: {
      id: req.params.id
    }
  });

  return res.sendStatus(HttpStatusCodes.NoContent);
});

app.patch('/messages/:id', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  let { content }: { content: string } = req.body;
  if (!content || typeof content !== 'string') return res.sendStatus(HttpStatusCodes.BadRequest);
  content = content.trim();

  if (content.length > maxContentLength)
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Content too large.' });
  if (content.split('\n').length > 20)
    return res.status(HttpStatusCodes.BadRequest).send({ message: 'Too many lines.' });

  let messageId: bigint;
  try {
    messageId = BigInt(req.params.id);
  } catch {
    return res.sendStatus(HttpStatusCodes.BadRequest);
  }

  const message = await db.message.findUnique({
    where: { id: messageId }
  });

  if (!message) return res.sendStatus(HttpStatusCodes.NotFound);

  if (message.author_id !== user.id) return res.sendStatus(HttpStatusCodes.Forbidden);

  await db.message.update({
    where: { id: messageId },
    data: {
      content
    }
  });

  broadcast({
    op: Opcodes.Dispatch,
    t: EventTypes.MessageEdit,
    d: {
      id: req.params.id,
      content
    }
  });

  const serializedData = {
    id: req.params.id,
    content,
    author: { id: user.id.toString(), username: user.username, admin: user.admin }
  };
  return res.send(serializedData);
});

app.post('/typing', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.sendStatus(HttpStatusCodes.Unauthorized);

  const allowed = userAllowed(user);
  if (!allowed.allowed) return res.status(HttpStatusCodes.Forbidden).send(allowed.message);

  broadcast({
    op: Opcodes.Dispatch,
    t: EventTypes.TypingStart,
    d: {
      username: user.username
    }
  });

  return res.sendStatus(HttpStatusCodes.NoContent);
});
