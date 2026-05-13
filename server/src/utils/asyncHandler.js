const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    const statusCode = Number(error.code) || 500;
    res.status(statusCode >= 100 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { asyncHandler };
