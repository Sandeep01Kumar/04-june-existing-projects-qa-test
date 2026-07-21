const express = require('express');

const hostname = '127.0.0.1';
const port = 3000;

const app = express();

app.get('/', (req, res) => res.type('text/plain').send('Hello, World!\n'));
app.get('/good-evening', (req, res) => res.type('text/plain').send('Good evening'));

// Start the HTTP server. Capture the returned http.Server instance so we can
// respond to its lifecycle events explicitly.
const server = app.listen(port, hostname);

// Announce readiness only once the socket is genuinely bound. Emitting the
// startup line from the 'listening' event (rather than the app.listen callback)
// guarantees the message is printed only on a successful bind — never when
// startup fails, so the log can never falsely claim the server is running.
server.on('listening', () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

// Fail fast and loudly on a startup error such as EADDRINUSE (port already in
// use): report a diagnostic on stderr and exit with a non-zero status, so a
// process that never acquired the port is not mistaken for a healthy server.
server.on('error', (err) => {
  console.error(`Server failed to start: ${err.message}`);
  process.exit(1);
});
