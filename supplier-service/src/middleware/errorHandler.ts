import { type Request, type Response, type NextFunction } from 'express';

const errorHandling = (err: any, req: Request, res: Response, next: NextFunction): void => {
    console.log(err.stack);

    // express.json() payload-too-large (cropped image_url base64).
    if (err?.type === 'entity.too.large' || err?.status === 413) {
        res.status(413).json({
            status: 413,
            message: 'Request body is too large. Use a smaller cropped image, then Save again.',
        });
        return;
    }

    res.status(500).json({
        status: 500, 
        message: "Error :" + err.message,
    });
};

export default errorHandling;