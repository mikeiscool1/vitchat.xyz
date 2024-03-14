"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userAllowed = exports.getUser = void 0;
const tslib_1 = require("tslib");
const client_1 = require(".prisma/client");
const app_1 = require("../app");
const constants_1 = require("../constants");
const db_1 = tslib_1.__importDefault(require("../db"));
const crypto_1 = tslib_1.__importDefault(require("crypto"));
app_1.app.post('/auth', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    if (typeof username !== 'string' || typeof password !== 'string')
        return res.sendStatus(constants_1.HttpStatusCodes.BadRequest);
    const user = await db_1.default.user.findUnique({ where: { username } });
    if (!user)
        return res.status(constants_1.HttpStatusCodes.Unauthorized).send({ message: 'Invalid name or password.' });
    const { salt, password_hash, token } = user;
    const hash = crypto_1.default
        .createHash('sha256')
        .update(password + salt)
        .digest();
    if (!hash.equals(password_hash))
        return res.status(constants_1.HttpStatusCodes.Unauthorized).send({ message: 'Invalid name or password.' });
    const allowed = userAllowed(user);
    if (!allowed.allowed)
        return res.status(constants_1.HttpStatusCodes.Forbidden).send({ message: allowed.message });
    res.cookie('token', token, { maxAge: 2592000000 });
    res.cookie('id', user.id, { maxAge: 2592000000 });
    return res.send({ message: 'Cookie set.' });
});
app_1.app.get('/logout', async (req, res) => {
    res.clearCookie('token');
    res.clearCookie('id');
    return res.redirect('/login');
});
async function getUser(token) {
    if (!token || typeof token !== 'string')
        return null;
    const user = await db_1.default.user.findUnique({ where: { token } });
    return user;
}
exports.getUser = getUser;
function userAllowed(user) {
    if (user.state === client_1.UserState.Waitlist)
        return { allowed: false, message: 'You are on the waitlist.' };
    else if (user.state === client_1.UserState.Suspended) {
        if (user.suspended_until && user.suspended_until.getTime() - Date.now() <= 0) {
            db_1.default.user
                .update({
                where: { id: user.id },
                data: { state: client_1.UserState.Active, suspended_reason: null, suspended_until: null }
            })
                .then(() => { });
            return { allowed: true };
        }
        return {
            allowed: false,
            message: `This account is suspended${user.suspended_until
                ? ` until ${user.suspended_until.toLocaleString(undefined, {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                })}`
                : '.'}.<br>Reason: ${user.suspended_reason}`
        };
    }
    return { allowed: true };
}
exports.userAllowed = userAllowed;
