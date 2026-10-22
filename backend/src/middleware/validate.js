import { badRequest } from '../utils/errors.js';

function formatIssues(issues) {
  return issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Validates req[part] with a zod schema and stores the parsed result on req.validated[part].
 * (Express 5 exposes req.query as a read-only getter, so parsed values are not written back.)
 */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      return next(badRequest(`Invalid request ${part}`, formatIssues(result.error.issues)));
    }
    req.validated = { ...req.validated, [part]: result.data };
    return next();
  };
}
