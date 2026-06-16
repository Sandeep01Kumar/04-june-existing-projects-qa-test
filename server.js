// Import Node.js's built-in 'http' module, which provides the API used to create an HTTP server (no third-party framework is required).
const http = require('http');

// Define the host the server binds to; '127.0.0.1' is the loopback address, so the server is reachable only from the local machine.
const hostname = '127.0.0.1';
// Define the TCP port the server listens on.
const port = 3000;

/**
 * Handles every incoming HTTP request for the server.
 *
 * This handler is intentionally branchless: it ignores the request's method,
 * URL/path, query string, headers, and body, and always returns the same
 * static plain-text response. This determinism is what makes the server a
 * reliable test fixture for the backprop integration workflow.
 *
 * @param {http.IncomingMessage} req - The incoming request object. Never inspected.
 * @param {http.ServerResponse} res - The response object used to send the reply.
 * @returns {void} No value is returned; the response is written and ended directly.
 */
const server = http.createServer((req, res) => { // Create the HTTP server and register the request-handler callback above.
  res.statusCode = 200; // Set the HTTP response status code to 200 (OK).
  res.setHeader('Content-Type', 'text/plain'); // Set the response Content-Type header to plain text.
  res.end('Hello, World!\n'); // Write the 14-byte body "Hello, World!\n" and end the response.
}); // Close the request-handler callback and the http.createServer() call.

/**
 * Startup callback invoked once the server is bound and ready for connections.
 *
 * Its only side effect is logging a human-readable startup message to stdout so
 * an operator can confirm the server is listening and see the reachable URL.
 *
 * @returns {void} No value is returned; emits a startup log line as a side effect.
 */
server.listen(port, hostname, () => { // Start listening on the configured port and host; invoke the callback once ready.
  console.log(`Server running at http://${hostname}:${port}/`); // Log the URL where the server is reachable.
}); // Close the server.listen() call.
