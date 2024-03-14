export const Opcodes = {
  Dispatch: 0, // receive
  Heartbeat: 1, // send
  HeartbeatACK: 3, // receive
  Identify: 4 // send
};

export const CloseCodes = {
  UnknownError: 4000,
  UnkonwnOpcode: 4001,
  DecodeError: 4002,
  NotAuthenticated: 4003,
  AuthenticationFailed: 4004,
  Forbidden: 4005,
  AlreadyAuthenticated: 4006,
  RateLimited: 4007,
  Forced: 4008
};

export const EventTypes = {
  Ready: 0,
  MessageCreate: 1,
  MessageEdit: 2,
  MessageDelete: 3,
  PresenceUpdate: 4,
  TypingStart: 5,
  UserUpdate: 6
};

export const HttpStatusCodes = {
  Ok: 200,
  Created: 201,
  NoContent: 204,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  RateLimit: 429
};
