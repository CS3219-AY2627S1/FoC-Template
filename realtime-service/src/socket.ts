import {Server} from 'socket.io';
import {verifyAccessToken} from './auth.js';

const formatUserRoom = (userId: string) => `user:${userId}`;

export const emitToUser = (socketServer: Server, userId: string, event: string, data: unknown): void => {
    const userRoom = formatUserRoom(userId);
    socketServer.to(userRoom).emit(event, data);
};

export const broadcast = (socketServer: Server, event: string, data: unknown): void => {
    socketServer.emit(event, data);
};

export const createSocketIoServer = (jwksUrl: string) => {
    const socketServer = new Server();
    socketServer.use(async (socket, next) => {
        const accessToken = socket.handshake.auth.token as string;
        try {
            const payload = await verifyAccessToken(accessToken, jwksUrl);
            socket.data.userId = payload.sub;
        } catch {
            next(new Error('Unauthorized'));
            return;
        }
        next();
    });
    socketServer.on('connection', (socket) => {
        const userRoom = formatUserRoom(socket.data.userId);
        socket.join(userRoom);
    });
    return socketServer;
};
