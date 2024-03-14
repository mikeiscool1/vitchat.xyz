"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = exports.clients = void 0;
const tslib_1 = require("tslib");
const app_1 = require("./app");
const constants_1 = require("./constants");
const db_1 = tslib_1.__importDefault(require("./db"));
const client_1 = require("@prisma/client");
exports.clients = new Map();
let currentId = 0;
function nextId() {
    currentId++;
    return currentId;
}
app_1.wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message.toString());
        if (data.op === constants_1.Opcodes.Identify) {
            if ('id' in data)
                return ws.close(constants_1.CloseCodes.AlreadyAuthenticated);
            const { authorization } = data.d;
            if (typeof authorization !== 'string')
                return ws.close(constants_1.CloseCodes.DecodeError);
            const user = await db_1.default.user.findUnique({
                where: { token: authorization }
            });
            if (!user)
                return ws.close(constants_1.CloseCodes.AuthenticationFailed);
            if (user.state === client_1.UserState.Suspended) {
                if (user.suspended_until && user.suspended_until.getTime() - Date.now() <= 0)
                    await db_1.default.user.update({
                        where: { id: user.id },
                        data: { state: client_1.UserState.Active, suspended_reason: null, suspended_until: null }
                    });
                else
                    return ws.close(constants_1.CloseCodes.Forbidden);
            }
            else if (user.state === client_1.UserState.Waitlist)
                return ws.close(constants_1.CloseCodes.Forbidden);
            const clientAlreadyConnected = [...exports.clients.values()].some(c => c.user.id === user.id);
            ws.id = nextId();
            exports.clients.set(currentId, {
                user,
                ws
            });
            if (!clientAlreadyConnected)
                broadcast({
                    op: constants_1.Opcodes.Dispatch,
                    t: constants_1.EventTypes.PresenceUpdate,
                    d: {
                        id: user.id.toString(),
                        new_presence: 'ONLINE' // | OFFLINE
                    }
                });
            return ws.send(JSON.stringify({
                op: constants_1.Opcodes.Dispatch,
                d: { id: user.id.toString(), username: user.username, admin: user.admin },
                t: constants_1.EventTypes.Ready
            }));
        }
        else if (data.op === constants_1.Opcodes.Heartbeat) {
            return ws.send(JSON.stringify({ op: constants_1.Opcodes.HeartbeatACK, t: null, d: null }));
        }
        else {
            return ws.close(constants_1.CloseCodes.UnknownOpcode);
        }
    });
    ws.on('close', () => {
        const client = exports.clients.get(ws.id);
        if (!client)
            return;
        exports.clients.delete(ws.id);
        const clientStillConnecteted = [...exports.clients.values()].some(c => c.user.id === client.user.id);
        if (clientStillConnecteted)
            return;
        setTimeout(() => {
            if ([...exports.clients.values()].some(c => c.user.id === client.user.id))
                return;
            broadcast({
                op: constants_1.Opcodes.Dispatch,
                t: constants_1.EventTypes.PresenceUpdate,
                d: {
                    id: client.user.id.toString(),
                    new_presence: 'OFFLINE' // | ONLINE
                }
            });
        }, 5000);
    });
});
function broadcast(data) {
    data = JSON.stringify(data);
    exports.clients.forEach(client => client.ws.send(data));
}
exports.broadcast = broadcast;
