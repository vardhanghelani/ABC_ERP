import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '../utils/ApiError';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
      return next(new ApiError(400, 'Validation failed', errors));
    }
    req[source] = result.data;
    next();
  };
};
