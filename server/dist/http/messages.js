"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const app_1 = require("../app");
const constants_1 = require("../constants");
const auth_1 = require("./auth");
const db_1 = tslib_1.__importDefault(require("../db"));
const snowflake_1 = require("../snowflake");
const ws_1 = require("../ws");
const rateLimitMap = new Map();
const usersRateLimitedUntil = new Map();
var RateLimit;
(function (RateLimit) {
    RateLimit.amount = 6;
    RateLimit.milliseconds = 3000;
    RateLimit.cooldown = 5000;
})(RateLimit || (RateLimit = {}));
app_1.app.post('/messages', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    const rateLimitedUntil = usersRateLimitedUntil.get(user.id);
    if (rateLimitedUntil) {
        if (Date.now() >= rateLimitedUntil)
            usersRateLimitedUntil.delete(user.id);
        else
            return res.status(constants_1.HttpStatusCodes.RateLimited).send({ rate_limited_until: rateLimitedUntil });
    }
    const userRateLimit = rateLimitMap.get(user.id)?.concat([Date.now()]) ?? [Date.now()];
    rateLimitMap.set(user.id, userRateLimit);
    if (userRateLimit.length === RateLimit.amount) {
        const speed = userRateLimit[userRateLimit.length - 1] - userRateLimit[0];
        if (speed < RateLimit.milliseconds) {
            rateLimitMap.set(user.id, []);
            const rateLimitedUntil = Date.now() + RateLimit.cooldown;
            usersRateLimitedUntil.set(user.id, rateLimitedUntil);
            return res.status(constants_1.HttpStatusCodes.RateLimited).send({ rate_limited_until: rateLimitedUntil });
        }
        rateLimitMap.set(user.id, userRateLimit.slice(1));
    }
    let { content } = req.body;
    content = content.trim();
    if (!content)
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (content.length > constants_1.maxContentLength)
        return res.status(constants_1.HttpStatusCodes.PayloadTooLarge).send({ message: 'Content too large.' });
    const data = { author_id: user.id, content, id: snowflake_1.snowflake.generate() };
    await db_1.default.message.create({ data });
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.MessageCreate,
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
    const serializedData = { id: data.id.toString(), author_id: user.id.toString(), content };
    return res.send(serializedData);
});
app_1.app.get('/messages', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    let { after, before, query } = req.query;
    if ((after && typeof after !== 'string') || (before && typeof before !== 'string'))
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (query && (typeof query !== 'string' || query.length > constants_1.maxContentLength))
        return res.send(constants_1.HttpStatusCodes.BadRequest);
    let afterInt = 0n;
    let beforeInt = (1n << 63n) - 1n; // max psql bigint size
    try {
        if (after)
            afterInt = BigInt(after);
        if (before)
            beforeInt = BigInt(before);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    if (beforeInt < afterInt)
        return res.status(constants_1.HttpStatusCodes.BadRequest);
    const messages = await db_1.default.$queryRaw `SELECT id, content, author
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
    LIMIT ${constants_1.messagesPerFetch}
  ) AS msgs
  ORDER BY id ASC`;
    return res.send(messages);
});
app_1.app.delete('/messages/:id', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    let messageId;
    try {
        messageId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const message = await db_1.default.message.findUnique({
        where: { id: messageId }
    });
    if (!message)
        return res.sendStatus(constants_1.HttpStatusCodes.NotFound);
    if (!user.admin && message.author_id !== user.id)
        return res.sendStatus(constants_1.HttpStatusCodes.Forbidden);
    await db_1.default.message.delete({
        where: { id: messageId }
    });
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.MessageDelete,
        d: {
            id: req.params.id
        }
    });
    return res.sendStatus(constants_1.HttpStatusCodes.NoContent);
});
app_1.app.patch('/messages/:id', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    let { content } = req.body;
    content = content.trim();
    if (!content)
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (content.length > constants_1.maxContentLength)
        return res.status(constants_1.HttpStatusCodes.PayloadTooLarge).send({ message: 'Content too large.' });
    let messageId;
    try {
        messageId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const message = await db_1.default.message.findUnique({
        where: { id: messageId }
    });
    if (!message)
        return res.sendStatus(constants_1.HttpStatusCodes.NotFound);
    if (message.author_id !== user.id)
        return res.sendStatus(constants_1.HttpStatusCodes.Forbidden);
    await db_1.default.message.update({
        where: { id: messageId },
        data: {
            content
        }
    });
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.MessageEdit,
        d: {
            id: req.params.id,
            content
        }
    });
    return res.send({ id: req.params.id, author_id: user.id.toString(), content });
});
app_1.app.post('/typing', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.TypingStart,
        d: {
            username: user.username
        }
    });
    return res.sendStatus(constants_1.HttpStatusCodes.NoContent);
});
