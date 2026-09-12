import app from './app.js';

const DEFAULT_PORT = 5001;
const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;
const tryFallbackPort = process.env.PORT ? null : DEFAULT_PORT + 1;
let currentPort = requestedPort;

function listenOnPort(port) {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      if (tryFallbackPort && port === requestedPort) {
        console.warn(
          `Port ${port} is already in use. Falling back to port ${tryFallbackPort} since PORT was not explicitly set.`
        );
        currentPort = tryFallbackPort;
        listenOnPort(tryFallbackPort);
        return;
      }
      console.error(`Port ${port} is already in use. Please stop the other process or set a different PORT in .env.`);
      process.exit(1);
    }
    console.error('Server error:', error);
    process.exit(1);
  });
}

listenOnPort(currentPort);
