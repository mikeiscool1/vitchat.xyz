"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messagesPerFetch = exports.maxContentLength = exports.heartbeatInterval = exports.maxUsernameLength = exports.HttpStatusCodes = exports.EventTypes = exports.CloseCodes = exports.Opcodes = void 0;
var Opcodes;
(function (Opcodes) {
    Opcodes[Opcodes["Dispatch"] = 0] = "Dispatch";
    Opcodes[Opcodes["Heartbeat"] = 1] = "Heartbeat";
    Opcodes[Opcodes["HeartbeatACK"] = 3] = "HeartbeatACK";
    Opcodes[Opcodes["Identify"] = 4] = "Identify"; // send
})(Opcodes || (exports.Opcodes = Opcodes = {}));
var CloseCodes;
(function (CloseCodes) {
    CloseCodes[CloseCodes["UnknownError"] = 4000] = "UnknownError";
    CloseCodes[CloseCodes["UnknownOpcode"] = 4001] = "UnknownOpcode";
    CloseCodes[CloseCodes["DecodeError"] = 4002] = "DecodeError";
    CloseCodes[CloseCodes["NotAuthenticated"] = 4003] = "NotAuthenticated";
    CloseCodes[CloseCodes["AuthenticationFailed"] = 4004] = "AuthenticationFailed";
    CloseCodes[CloseCodes["Forbidden"] = 4005] = "Forbidden";
    CloseCodes[CloseCodes["AlreadyAuthenticated"] = 4006] = "AlreadyAuthenticated";
    CloseCodes[CloseCodes["RateLimited"] = 4007] = "RateLimited";
    CloseCodes[CloseCodes["Forced"] = 4008] = "Forced";
})(CloseCodes || (exports.CloseCodes = CloseCodes = {}));
var EventTypes;
(function (EventTypes) {
    EventTypes[EventTypes["Ready"] = 0] = "Ready";
    EventTypes[EventTypes["MessageCreate"] = 1] = "MessageCreate";
    EventTypes[EventTypes["MessageEdit"] = 2] = "MessageEdit";
    EventTypes[EventTypes["MessageDelete"] = 3] = "MessageDelete";
    EventTypes[EventTypes["PresenceUpdate"] = 4] = "PresenceUpdate";
    EventTypes[EventTypes["TypingStart"] = 5] = "TypingStart";
    EventTypes[EventTypes["UserUpdate"] = 6] = "UserUpdate";
})(EventTypes || (exports.EventTypes = EventTypes = {}));
var HttpStatusCodes;
(function (HttpStatusCodes) {
    HttpStatusCodes[HttpStatusCodes["Ok"] = 200] = "Ok";
    HttpStatusCodes[HttpStatusCodes["Created"] = 201] = "Created";
    HttpStatusCodes[HttpStatusCodes["NoContent"] = 204] = "NoContent";
    HttpStatusCodes[HttpStatusCodes["BadRequest"] = 400] = "BadRequest";
    HttpStatusCodes[HttpStatusCodes["Unauthorized"] = 401] = "Unauthorized";
    HttpStatusCodes[HttpStatusCodes["Forbidden"] = 403] = "Forbidden";
    HttpStatusCodes[HttpStatusCodes["NotFound"] = 404] = "NotFound";
    HttpStatusCodes[HttpStatusCodes["Conflict"] = 409] = "Conflict";
    HttpStatusCodes[HttpStatusCodes["PayloadTooLarge"] = 413] = "PayloadTooLarge";
    HttpStatusCodes[HttpStatusCodes["RateLimited"] = 429] = "RateLimited";
})(HttpStatusCodes || (exports.HttpStatusCodes = HttpStatusCodes = {}));
exports.maxUsernameLength = 32;
exports.heartbeatInterval = 20000;
exports.maxContentLength = 2000;
exports.messagesPerFetch = 100;
