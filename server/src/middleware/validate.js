import { ApiError } from '../utils/ApiError.js';

export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', details));
    }
    if (part === 'query') {
      for (const k of Object.keys(req.query)) delete req.query[k];
      Object.assign(req.query, r.data);
    } else req[part] = r.data;
  }
  next();
};
