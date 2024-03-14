"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wss = exports.app = void 0;
const tslib_1 = require("tslib");
const express_1 = tslib_1.__importDefault(require("express"));
const body_parser_1 = tslib_1.__importDefault(require("body-parser"));
const ws_1 = tslib_1.__importDefault(require("ws"));
const http_1 = tslib_1.__importDefault(require("http"));
const path_1 = tslib_1.__importDefault(require("path"));
const cookie_parser_1 = tslib_1.__importDefault(require("cookie-parser"));
exports.app = (0, express_1.default)();
exports.app.use(body_parser_1.default.json());
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.static(path_1.default.join(__dirname, '../../public')));
const server = http_1.default.createServer(exports.app);
exports.wss = new ws_1.default.Server({ server });
server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
