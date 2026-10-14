#!/usr/bin/env node
// Local stand-in for the Lambda. Production is server/lambda.mjs behind API Gateway.
// The root .env is read only here. Lambda keeps the variables from serverless.yml.
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleHttpRequest} from './http-app.mjs';

function loadLocalEnv() {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
    let text;
    try {
        text = readFileSync(file, 'utf8');
    } catch {
        return;
    }
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

loadLocalEnv();

const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787;

const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const headers = {...req.headers};
    if (!headers['x-forwarded-proto']) headers['x-forwarded-proto'] = 'http';
    const out = await handleHttpRequest({
        method: req.method,
        path: req.url,
        headers,
        body,
    });
    res.writeHead(out.statusCode, out.headers);
    res.end(out.body);
});

server.listen(port, () => {
    process.stdout.write(`rabbit-mcp listening on http://127.0.0.1:${port}/mcp\n`);
    process.stdout.write(`API ${process.env.RABBITWORK_API_BASE_URL}\n`);
});
