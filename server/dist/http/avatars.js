"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const app_1 = require("../app");
const constants_1 = require("../constants");
const db_1 = tslib_1.__importDefault(require("../db"));
const ws_1 = require("../ws");
const auth_1 = require("./auth");
const multer_1 = tslib_1.__importDefault(require("multer"));
const upload = (0, multer_1.default)();
app_1.app.get('/avatars/:id', async (req, res) => {
    let userId;
    try {
        userId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const avatar = await db_1.default.avatar.findUnique({
        where: {
            user_id: userId
        }
    });
    if (!avatar)
        return res.sendFile('resources/default_pfp.png', { root: 'public' });
    return res.type(avatar.type).send(avatar.data);
});
app_1.app.patch('/avatars/:id', upload.single('file'), async (req, res) => {
    const user = await (0, auth_1.getUser)(req.headers.authorization);
    if (!user)
        return res.sendStatus(constants_1.HttpStatusCodes.Unauthorized);
    const allowed = (0, auth_1.userAllowed)(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send(allowed.message);
    let userId;
    try {
        userId = BigInt(req.params.id);
    }
    catch {
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    }
    const { file, type } = req.body;
    if (!file || !type || typeof file !== 'string' || typeof type !== 'string' || type.length > 50)
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (file.length > 1e6)
        return res.status(constants_1.HttpStatusCodes.PayloadTooLarge).send({ message: 'File too large.' });
    const buffer = Buffer.from(file.split(',')[1], 'base64');
    await db_1.default.avatar.upsert({
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
    (0, ws_1.broadcast)({
        op: constants_1.Opcodes.Dispatch,
        t: constants_1.EventTypes.UserUpdate,
        d: {
            created: false,
            avatar: true,
            id: userId.toString()
        }
    });
    return res.sendStatus(constants_1.HttpStatusCodes.NoContent);
});
app_1.app.get('/default_pfp', async (_, res) => {
    return res.sendFile('resources/default_pfp.png', { root: 'public' });
});
