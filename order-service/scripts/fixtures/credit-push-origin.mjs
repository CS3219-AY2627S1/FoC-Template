// Synthetic wire-contract fixture. NOT Credit auth, DB or financial verification.
import { createServer } from 'node:http';
const expectedBody = JSON.stringify({ message: { data: 'synthetic-test' }, subscription: 'synthetic' });
const expectedPaths = new Set([
  '/api/credits/internal/order-events/open-refund',
  '/api/credits/internal/order-events/completion',
]);
createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    if (!expectedPaths.has(request.url)) {
      response.writeHead(404).end();
      return;
    }
    if (!request.headers.authorization) {
      response.writeHead(401).end();
      return;
    }
    const correct = request.method === 'POST'
      && request.headers.authorization === 'Bearer routing-test-not-a-token'
      && request.headers['x-request-id'] === 'wire-test-request'
      && request.headers['content-type'] === 'application/json'
      && Buffer.concat(chunks).toString('utf8') === expectedBody;
    response.writeHead(correct ? 204 : 400, { 'X-Fixture-Request-Id': request.headers['x-request-id'] ?? '' }).end();
  });
}).listen(8080, '0.0.0.0');
