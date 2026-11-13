import { type Request, type Response, type NextFunction } from 'express';

const errorHandling = (err: any, req: Request, res: Response, next: NextFunction): void => {
    console.log(err.stack);
    res.status(500).json({
        status: 500, 
        message: "Error :" + err.message,
    });
};

export default errorHandling;