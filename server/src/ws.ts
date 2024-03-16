import { wss } from './app';
import { ClientInfo, Message } from '../types';
import { CloseCodes, EventTypes, Opcodes } from './constants';
import db from './db';
import { UserState } from '@prisma/client';
import type WebSocket from 'ws';

export const clients = new Map<number, ClientInfo>();

let currentId = 0;
function nextId() {
  currentId++;
  return currentId;
}

wss.on('connection', (ws: WebSocket & { id: number }) => {
  ws.on('message', async message => {
    const data: Message = JSON.parse(message.toString());

    if (data.op === Opcodes.Identify) {
      if ('id' in data) return ws.close(CloseCodes.AlreadyAuthenticated);

      const { authorization } = data.d;
      if (typeof authorization !== 'string') return ws.close(CloseCodes.DecodeError);

      const user = await db.user.findUnique({
        where: { token: authorization }
      });
      if (!user) return ws.close(CloseCodes.AuthenticationFailed);

      if (user.state === UserState.Suspended) {
        if (user.suspended_until && user.suspended_until.getTime() - Date.now() <= 0)
          await db.user.update({
            where: { id: user.id },
            data: { state: UserState.Active, suspended_reason: null, suspended_until: null }
          });
        else return ws.close(CloseCodes.Forbidden);
      } else if (user.state === UserState.Waitlist) return ws.close(CloseCodes.Forbidden);

      const clientAlreadyConnected = [...clients.values()].some(c => c.user.id === user.id);

      ws.id = nextId();
      clients.set(currentId, {
        user,
        ws
      });

      if (!clientAlreadyConnected)
        broadcast({
          op: Opcodes.Dispatch,
          t: EventTypes.PresenceUpdate,
          d: {
            id: user.id.toString(),
            new_presence: 'ONLINE' // | OFFLINE
          }
        });

      return ws.send(
        JSON.stringify({
          op: Opcodes.Dispatch,
          d: { id: user.id.toString(), username: user.username, admin: user.admin },
          t: EventTypes.Ready
        })
      );
    } else if (data.op === Opcodes.Heartbeat) {
      return ws.send(JSON.stringify({ op: Opcodes.HeartbeatACK, t: null, d: null }));
    } else {
      return ws.close(CloseCodes.UnknownOpcode);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws.id);
    if (!client) return;

    clients.delete(ws.id);

    const clientStillConnecteted = [...clients.values()].some(c => c.user.id === client.user.id);
    if (clientStillConnecteted) return;

    setTimeout(() => {
      if ([...clients.values()].some(c => c.user.id === client.user.id)) return;

      broadcast({
        op: Opcodes.Dispatch,
        t: EventTypes.PresenceUpdate,
        d: {
          id: client.user.id.toString(),
          new_presence: 'OFFLINE' // | ONLINE
        }
      });
    }, 5000);
  });
});

export function broadcast(data: Message | string) {
  data = JSON.stringify(data);
  clients.forEach(client => client.ws.send(data as string));
}
