// Express 4 does not forward a rejected promise from an `async` route handler
// to the error middleware: the rejection goes unhandled, and on current Node
// that terminates the whole process. Several routes (login, send-otp,
// verify-otp, ...) call string methods on body fields, so a single request
// with the wrong JSON type (e.g. {"email": 1}) could take the server down for
// everyone.
//
// This patches the router once so a rejected handler is passed to next(err)
// like a thrown one already is. Import it before any router is created.
import Layer from 'express/lib/router/layer.js';

if (!Layer.prototype.__asyncErrorsPatched) {
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) {
      // Error-handling middleware — only invoked via handle_error.
      return next();
    }
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncErrorsPatched = true;
}
