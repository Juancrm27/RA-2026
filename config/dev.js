// Runs webpack-dev-server over HTTPS (required for camera access on phones).
// Accepts a bare `--host` (Vite style) and expands it to `--host 0.0.0.0`
// so the server is reachable from other devices on the network.
const {spawn} = require('child_process')
const path = require('path')

const args = process.argv.slice(2)
const hostIndex = args.indexOf('--host')
if (hostIndex !== -1) {
  const next = args[hostIndex + 1]
  if (!next || next.startsWith('-')) {
    args.splice(hostIndex + 1, 0, '0.0.0.0')
  }
}

const devServer = require.resolve('webpack-dev-server/bin/webpack-dev-server.js')
const child = spawn(process.execPath, [
  devServer,
  '--mode=development',
  '--config', path.join(__dirname, 'webpack.config.js'),
  '--server-type', 'https',
  ...args,
], {stdio: 'inherit'})

child.on('exit', code => process.exit(code ?? 0))
