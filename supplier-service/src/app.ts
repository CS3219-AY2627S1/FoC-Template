//The express app itself. Kept free of app.listen so tests can drive it with supertest.
//Co-authored with claude code

import dotenv from 'dotenv';
import express from "express";
import supplierRouter from "@api/router";
import errorHandler from "@/middleware/error-handler";
import pool from "@database/db";

import {Request, Response} from "express";

dotenv.config();

export const app = express();

app.use(express.json());

// Health check for Docker/Kubernetes
app.get('/health', async (_req: Request, res: Response) => {
    let dbUp = true;
    try {
        await pool.query('SELECT 1');
    } catch {
        dbUp = false;
    }
    res.status(dbUp ? 200 : 503).json({
        status: dbUp ? 'ok' : 'degraded',
        db: dbUp ? 'up' : 'down',
    });
});

app.use(supplierRouter);

//Send message
app.get('/', (req:Request, res: Response) => {
    res.send("Server is running \n \supplier");
});

//Error handling middleware
app.use(errorHandler);

export default app;
