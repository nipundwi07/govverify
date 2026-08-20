// Wraps async route handlers so rejected promises reach the error middleware
// instead of crashing the process with an unhandled rejection.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
