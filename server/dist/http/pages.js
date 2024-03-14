"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const app_1 = require("../app");
const auth_1 = require("./auth");
const constants_1 = require("../constants");
const sendFileOptions = { root: 'public' };
app_1.app.get('/', async (_, res) => {
    return res.redirect('/chat');
});
app_1.app.get('/chat', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.cookies.token);
    if (!user)
        return res.redirect('/login');
    if (user.state !== client_1.UserState.Active)
        return res.redirect('/logout');
    return res.sendFile('chat.html', sendFileOptions);
});
app_1.app.get('/settings', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.cookies.token);
    if (!user)
        return res.redirect('/login?redirect_uri=settings');
    if (user.state !== client_1.UserState.Active)
        return res.redirect('/logout');
    return res.sendFile('settings.html', sendFileOptions);
});
app_1.app.get('/admin', async (req, res) => {
    const user = await (0, auth_1.getUser)(req.cookies.token);
    if (!user)
        return res.redirect(`/login?redirect_uri=admin`);
    if (!user.admin)
        return res.sendStatus(constants_1.HttpStatusCodes.Forbidden);
    return res.sendFile('admin.html', sendFileOptions);
});
app_1.app.get('/login', async (req, res) => {
    if (await (0, auth_1.getUser)(req.cookies.token))
        return res.redirect('/chat');
    return res.sendFile('login.html', sendFileOptions);
});
app_1.app.get('/join', async (req, res) => {
    if (await (0, auth_1.getUser)(req.cookies.token))
        return res.redirect('/chat');
    return res.sendFile('join.html', sendFileOptions);
});
