import 'dotenv/config';
import './app';
import './db';

import './http/auth';
import './http/avatars';
import './http/messages';
import './http/pages';
import './http/users';

import './ws';

process.on('uncaughtException', console.error);
