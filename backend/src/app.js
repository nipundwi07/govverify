const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const contractsRouter = require('./routes/contracts');
const vendorsRouter = require('./routes/vendors');
const officialsRouter = require('./routes/officials');
const submissionsRouter = require('./routes/submissions');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/contracts', contractsRouter);
app.use('/vendors', vendorsRouter);
app.use('/officials', officialsRouter);
app.use('/submissions', submissionsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
