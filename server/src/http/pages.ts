import { UserState } from '@prisma/client';
import { app } from '../app';
import { getUser } from './auth';
import { HttpStatusCodes } from '../constants';

const sendFileOptions = { root: 'public' };

app.get('/', async (_, res) => {
  return res.redirect('/chat');
});

app.get('/chat', async (req, res) => {
  const user = await getUser(req.cookies.token);
  if (!user) return res.redirect('/login');
  if (user.state !== UserState.Active) return res.redirect('/logout');

  return res.sendFile('chat.html', sendFileOptions);
});

app.get('/settings', async (req, res) => {
  const user = await getUser(req.cookies.token);
  if (!user) return res.redirect('/login?redirect_uri=settings');
  if (user.state !== UserState.Active) return res.redirect('/logout');

  return res.sendFile('settings.html', sendFileOptions);
});

app.get('/admin', async (req, res) => {
  const user = await getUser(req.cookies.token);
  if (!user) return res.redirect(`/login?redirect_uri=admin`);
  if (!user.admin) return res.sendStatus(HttpStatusCodes.Forbidden);

  return res.sendFile('admin.html', sendFileOptions);
});

app.get('/login', async (req, res) => {
  if (await getUser(req.cookies.token)) return res.redirect('/chat');

  return res.sendFile('login.html', sendFileOptions);
});

app.get('/join', async (req, res) => {
  if (await getUser(req.cookies.token)) return res.redirect('/chat');

  return res.sendFile('join.html', sendFileOptions);
});
