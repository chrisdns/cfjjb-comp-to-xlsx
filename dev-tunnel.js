import {spawn} from 'child_process';

const PORT = 3000;
const URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

console.log('▸ Starting cloudflared quick tunnel...');
const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
});

let server = null;
let tunnelUrl = null;

const onChunk = chunk => {
    const text = chunk.toString();
    process.stderr.write(text);
    if (tunnelUrl) return;
    const match = text.match(URL_REGEX);
    if (!match) return;
    tunnelUrl = match[0];
    console.log(`\n✓ Tunnel ready: ${tunnelUrl}\n▸ Starting server with PUBLIC_BASE_URL=${tunnelUrl}\n`);
    server = spawn('npx', ['nodemon', '--exec', 'node --env-file-if-exists=.env server.js'], {
        env: {...process.env, PUBLIC_BASE_URL: tunnelUrl},
        stdio: 'inherit',
    });
    server.on('exit', code => {
        console.log(`server exited (${code}), stopping tunnel`);
        cf.kill();
        process.exit(code ?? 0);
    });
};

cf.stdout.on('data', onChunk);
cf.stderr.on('data', onChunk);
cf.on('exit', code => {
    console.log(`cloudflared exited (${code})`);
    if (server) server.kill();
    process.exit(code ?? 0);
});

const shutdown = () => {
    cf.kill();
    if (server) server.kill();
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
