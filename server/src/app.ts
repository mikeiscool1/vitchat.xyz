import express from 'express';
import bodyParser from 'body-parser';
import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';

export const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../../public')));

const server = http.createServer(app);
export const wss = new WebSocket.Server({ server });

server.listen(process.env.PORT!, () => {
  console.log(`Server running on port ${process.env.PORT!}`);
});
