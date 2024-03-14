"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const app_1 = require("../app");
const constants_1 = require("../constants");
const db_1 = tslib_1.__importDefault(require("../db"));
const snowflake_1 = require("../snowflake");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const ws_1 = require("../ws");
const auth_1 = require("./auth");
const client_1 = require(".prisma/client");
const ms_1 = tslib_1.__importDefault(require("ms"));
app_1.app.post('/users', async (req, res) => {
    const { username, password } = req.body;
    if (!username ||
        !password ||
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        username.length > constants_1.maxUsernameLength)
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (username.includes(' '))
        return res.status(constants_1.HttpStatusCodes.BadRequest).send({ message: 'Username cannot have a space.' });
    const user = await db_1.default.user.findFirst({
        where: { username: { equals: username.toLowerCase(), mode: 'insensitive' } }
    });
    if (user)
        return res.status(constants_1.HttpStatusCodes.Conflict).send({ message: 'This username is already in use.' });
    const id = snowflake_1.snowflake.generate();
    const salt = crypto_1.default.randomBytes(16);
    const password_hash = crypto_1.default
        .createHash('sha256')
        .update(password + salt)
        .digest();
    const token = crypto_1.default.randomBytes(16).toString('hex');
    const newUser = await db_1.default.user.create({
        data: {
            id,
            username,
            password_hash,
            salt,
            token
        }
    });
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.UserUpdate,
        d: {
            created: true,
            id: newUser.id.toString(),
            username
        }
    });
    return res.sendStatus(constants_1.HttpStatusCodes.Created);
});
app_1.app.get('/users/:id', async (req, res) => {
    const u = await (0, auth_1.getUser)(req.headers.authorization);
    if (!u)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(u);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    if (typeof req.params.id !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    let userId;
    try {
        userId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const user = await db_1.default.user.findUnique({
        where: { id: userId }
    });
    if (!user)
        return res.sendStatus(404);
    return res.send({
        id: user.id.toString(),
        username: user.username,
        admin: user.admin
    });
});
app_1.app.get('/users', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    const users = await db_1.default.user.findMany();
    const onlineUsers = [...ws_1.clients.values()].map(c => c.user.id);
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
app_1.app.get('/users-admin', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    if (!user.admin)
        return res.sendStatus(constants_1.HttpStatusCodes.Forbidden);
    const users = await db_1.default.user.findMany();
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
app_1.app.patch('/users/:id', async (req, res) => {
    let userId;
    try {
        userId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const user = await db_1.default.user.findUnique({ where: { id: userId } });
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.NotFound);
    if (!('password' in req.body))
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    const { salt, password_hash } = user;
    const hash = crypto_1.default
        .createHash('sha256')
        .update(req.body.password + salt)
        .digest();
    if (!hash.equals(password_hash))
        return res.status(constants_1.HttpStatusCodes.Unauthorized).send({ message: 'Invalid password.' });
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    const changeData = {};
    if ('username' in req.body) {
        const { username } = req.body;
        if (!username || typeof username !== 'string')
            return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
        if (username.length > constants_1.maxUsernameLength)
            return res
                .status(constants_1.HttpStatusCodes.BadRequest)
                .send({ message: `Username is too long (max ${constants_1.maxUsernameLength}).` });
        if (username.includes(' '))
            return res.status(constants_1.HttpStatusCodes.BadRequest).send({ message: 'Username cannot have a space.' });
        const existingUser = await db_1.default.user.findFirst({
            where: { username: { equals: username.toLowerCase(), mode: 'insensitive' } }
        });
        // the whole point here is to allow users to change the casing of their username
        if (existingUser && existingUser.id !== user.id)
            return res.status(constants_1.HttpStatusCodes.Conflict).send({ message: 'This username is already in use.' });
        if (username === user.username)
            return res.status(constants_1.HttpStatusCodes.Conflict).send({ message: 'You are already using that username.' });
        changeData.username = username;
    }
    if ('new_password' in req.body) {
        const { new_password } = req.body;
        if (typeof new_password !== 'string')
            return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
        const salt = crypto_1.default.randomBytes(16);
        const password_hash = crypto_1.default
            .createHash('sha256')
            .update(new_password + salt)
            .digest();
        const token = crypto_1.default.randomBytes(16).toString('hex');
        changeData.password_hash = password_hash;
        changeData.salt = salt;
        changeData.token = token;
    }
    if (Object.keys(changeData).length === 0)
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    const newUser = await db_1.default.user.update({
        where: { id: user.id },
        data: changeData
    });
    if ('username' in changeData)
        (0, ws_1.broadcast)({
            op: constants_1.Opcodes.Dispatch,
            t: constants_1.EventTypes.UserUpdate,
            d: {
                created: false,
                id: newUser.id.toString(),
                username: newUser.username
            }
        });
    if ('password_hash' in changeData) {
        // disconnect all connections
        ws_1.clients.forEach(client => {
            if (client.user.id === newUser.id)
                client.ws.close(constants_1.CloseCodes.Forced);
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
app_1.app.patch('/users-admin/:id', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    if (!user.admin)
        return res.sendStatus(constants_1.HttpStatusCodes.Forbidden);
    let userId;
    try {
        userId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const targetUser = await db_1.default.user.findUnique({
        where: { id: userId }
    });
    if (!targetUser)
        return res.status(constants_1.HttpStatusCodes.NotFound).send({ message: 'User not found.' });
    if (targetUser.admin)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send({ message: 'Cannot update admins.' });
    const { state, suspended_until, suspended_reason } = req.body;
    if (!state || typeof state !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (state === client_1.UserState.Active || state === client_1.UserState.Waitlist) {
        const updatedUser = await db_1.default.user.update({
            where: { id: userId },
            data: { state, suspended_reason: null, suspended_until: null }
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
    if (suspended_until && typeof suspended_until !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (!suspended_reason)
        return res.status(constants_1.HttpStatusCodes.BadRequest).send({ message: 'Reason required.' });
    if (typeof suspended_reason !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    let date = null;
    if (suspended_until && suspended_until.startsWith('[') && suspended_until.endsWith(']')) {
        const duration = suspended_until.slice(1, -1);
        const inMs = (0, ms_1.default)(duration);
        if (Number.isNaN(inMs) || inMs < 0)
            return res.status(constants_1.HttpStatusCodes.BadRequest).send({ message: 'Invalid duration' });
        date = new Date(Date.now() + inMs);
    }
    else if (suspended_until) {
        date = new Date(suspended_until);
    }
    if (date && (date.toString() === 'Invalid Date' || date.getTime() - Date.now() < 0))
        return res.status(constants_1.HttpStatusCodes.BadRequest).send({ message: 'Invalid duration' });
    const updatedUser = await db_1.default.user.update({
        where: { id: userId },
        data: {
            state: client_1.UserState.Suspended,
            suspended_until: date,
            suspended_reason
        }
    });
    // disconnect all connections
    ws_1.clients.forEach(client => {
        if (client.user.id === userId)
            client.ws.close(constants_1.CloseCodes.Forced);
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
