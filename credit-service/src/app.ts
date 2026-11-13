import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from "dotenv";

import { authorize } from './middleware.ts/auth.ts';
import connectDB from './config/db.ts';
import { startAccountConsumer } from './consumer.ts';
import accountRoute from './routes/accountRoute.ts';
import reservationRoute from './routes/reservationRoute.ts';
import transactionRoute from './routes/transactionRoute.ts';

dotenv.config();

connectDB();
void startAccountConsumer();

const app: Express = express();
const port: number = 3002;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
    res.send('credit-service is running');
});

app.use('/account', authorize(), accountRoute);
app.use('/credits', authorize(), reservationRoute);
app.use('/transactions', authorize(), transactionRoute);

app.listen(port, () => {
    console.log("credit-service API is running at port: " + port.toString());
});
