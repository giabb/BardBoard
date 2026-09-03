const express = require('express');

function createSpy(implementation = () => undefined) {
  const calls = [];
  const spy = (...args) => {
    calls.push(args);
    return implementation(...args);
  };
  spy.calls = calls;
  return spy;
}

async function withTestServer(router, callback) {
  const app = express();
  app.use(express.json());
  app.use(router);

  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

async function request(baseUrl, path, options = {}) {
  const headers = { ...options.headers };
  let body = options.body;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && typeof body !== 'string' && !isFormData) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body
  });
  const contentType = response.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return {
    status: response.status,
    body: responseBody
  };
}

function createCookieClient(baseUrl) {
  let cookie = '';

  return async (path, options = {}) => {
    const headers = { ...options.headers };
    if (cookie) headers.cookie = cookie;
    const hasObjectBody = options.body !== undefined && typeof options.body !== 'string';
    if (hasObjectBody) headers['content-type'] = 'application/json';

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body: !hasObjectBody
        ? options.body
        : JSON.stringify(options.body)
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body, headers: response.headers };
  };
}

module.exports = {
  createSpy,
  createCookieClient,
  request,
  withTestServer
};
