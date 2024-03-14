import { user } from "@prisma/client";
import { Opcodes, EventTypes } from "../src/constants"
import type WebSocket from "ws"

// the user object users can see. Does not include private information
export type VisibleUser = {
  id: string;
  username: string;
  admin: boolean;
  avatar: string;
}

export type Message = {
  op: Opcodes
  d?: any;
  t?: EventTypes
}

export type ClientInfo = {
  user: user,
  ws: WebSocket & { id: number }
}