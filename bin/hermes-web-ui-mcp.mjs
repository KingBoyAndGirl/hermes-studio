#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_PORT = process.env.HERMES_WEB_UI_PORT || process.env.PORT || '8648'
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const SERVER_NAME = process.env.HERMES_MCP_SERVER_NAME || 'hermes-web-ui-mcp'
const VERSION = '0.1.0'

function printHelp() {
  process.stdout.write(`hermes-web-ui-mcp v${VERSION}

Hermes Web UI MCP stdio server.

Usage:
  hermes-web-ui-mcp
  hermes-web-ui-mcp --help
  hermes-web-ui-mcp --version

Environment:
  HERMES_WEB_UI_URL       Web UI base URL. Default: ${DEFAULT_BASE_URL}
  HERMES_WEB_UI_HOME      Web UI state directory. Default: ~/.hermes-web-ui
  HERMES_WEBUI_STATE_DIR  Fallback Web UI state directory.
  HERMES_WEB_UI_TOKEN     Optional explicit API token.
  AUTH_TOKEN              Optional explicit API token fallback.

When run without options, this process waits for MCP JSON-RPC messages on stdin.
`)
}

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  printHelp()
  process.exit(0)
}

if (process.argv.includes('-v') || process.argv.includes('--version')) {
  process.stdout.write(`${SERVER_NAME} v${VERSION}\n`)
  process.exit(0)
}

function appHome() {
  return process.env.HERMES_WEB_UI_HOME ||
    process.env.HERMES_WEBUI_STATE_DIR ||
    join(homedir(), '.hermes-web-ui')
}

function readToken(tokenOverride, allowTokenFile = true) {
  const explicit = tokenOverride || process.env.HERMES_WEB_UI_TOKEN || process.env.AUTH_TOKEN
  if (explicit) return explicit.trim()
  if (!allowTokenFile) return ''
  try {
    return readFileSync(join(appHome(), '.token'), 'utf8').trim()
  } catch {
    return ''
  }
}

function authHint() {
  return `Web UI token was not accepted. Pass a current model run token argument or set HERMES_WEB_UI_TOKEN.`
}

function baseUrl() {
  return (process.env.HERMES_WEB_UI_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function jsonText(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

function errorText(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  }
}

async function request(path, options = {}) {
  const token = readToken(options.token, options.allowTokenFile !== false)
  const profile = typeof options.profile === 'string' ? options.profile.trim() : ''
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(profile ? { 'X-Hermes-Profile': profile } : {}),
  }
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`${data?.error || 'Unauthorized'}. ${authHint()}`)
    }
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  return data
}

const authArgumentProperties = {
  token: {
    type: 'string',
    description: 'Optional Hermes Web UI bearer token. Use the current model run token when one is provided in the run instructions.',
  },
  profile: {
    type: 'string',
    description: 'Optional Hermes profile name for profile-scoped Web UI requests.',
  },
}

function inputSchema(properties = {}, required = []) {
  return {
    type: 'object',
    properties: { ...authArgumentProperties, ...properties },
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  }
}

function withAuthArgs(args, options = {}) {
  return {
    ...options,
    token: args.token,
    profile: args.profile,
    allowTokenFile: false,
  }
}

const tools = [
  {
    name: 'hermes_lan_devices_list',
    description: 'List known LAN and remote devices from Hermes Web UI, including pairing and online status.',
    inputSchema: inputSchema(),
  },
  {
    name: 'hermes_lan_devices_scan',
    description: 'Refresh LAN device discovery cache and return known devices with pairing and online status.',
    inputSchema: inputSchema(),
  },
  {
    name: 'hermes_lan_peer_connect',
    description: 'Connect to a paired LAN device by device id.',
    inputSchema: inputSchema({ device_id: { type: 'string' } }, ['device_id']),
  },
  {
    name: 'hermes_lan_peer_connections',
    description: 'List active LAN peer socket connections.',
    inputSchema: inputSchema(),
  },
  {
    name: 'hermes_lan_peer_disconnect',
    description: 'Disconnect an active LAN peer socket connection.',
    inputSchema: inputSchema({ connection_id: { type: 'string' } }, ['connection_id']),
  },
  {
    name: 'hermes_lan_terminal_create',
    description: 'Create an interactive terminal on a connected LAN peer.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        shell: { type: 'string' },
        cols: { type: 'number' },
        rows: { type: 'number' },
      }, ['connection_id']),
  },
  {
    name: 'hermes_lan_terminal_list',
    description: 'List interactive terminals tracked for a connected LAN peer, including IDs that can be read or closed.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
      }, ['connection_id']),
  },
  {
    name: 'hermes_lan_terminal_input',
    description: 'Write input to an interactive terminal on a connected LAN peer.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        terminal_id: { type: 'string' },
        data: { type: 'string' },
      }, ['connection_id', 'terminal_id', 'data']),
  },
  {
    name: 'hermes_lan_terminal_read',
    description: 'Read buffered terminal output from an interactive terminal.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        terminal_id: { type: 'string' },
      }, ['connection_id', 'terminal_id']),
  },
  {
    name: 'hermes_lan_terminal_resize',
    description: 'Resize an interactive terminal on a connected LAN peer.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        terminal_id: { type: 'string' },
        cols: { type: 'number' },
        rows: { type: 'number' },
      }, ['connection_id', 'terminal_id', 'cols', 'rows']),
  },
  {
    name: 'hermes_lan_terminal_close',
    description: 'Close an interactive terminal on a connected LAN peer.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        terminal_id: { type: 'string' },
      }, ['connection_id', 'terminal_id']),
  },
  {
    name: 'hermes_lan_command_exec',
    description: 'Run a command on a connected LAN peer using command plus args, without shell string execution.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeout_ms: { type: 'number' },
      }, ['connection_id', 'command']),
  },
  {
    name: 'hermes_lan_file_download',
    description: 'Download a file from a connected LAN peer remote path to a local path on this machine.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        remote_path: { type: 'string' },
        local_path: { type: 'string' },
        timeout_ms: { type: 'number' },
      }, ['connection_id', 'remote_path', 'local_path']),
  },
  {
    name: 'hermes_lan_file_upload',
    description: 'Upload a local file path from this machine to a connected LAN peer remote path.',
    inputSchema: inputSchema({
        connection_id: { type: 'string' },
        local_path: { type: 'string' },
        remote_path: { type: 'string' },
        timeout_ms: { type: 'number' },
      }, ['connection_id', 'local_path', 'remote_path']),
  },
]

async function callTool(name, args = {}) {
  switch (name) {
    case 'hermes_lan_devices_list':
      return jsonText(await request('/api/devices', withAuthArgs(args)))
    case 'hermes_lan_devices_scan':
      return jsonText(await request('/api/devices/scan', withAuthArgs(args, { method: 'POST' })))
    case 'hermes_lan_peer_connect':
      return jsonText(await request(`/api/devices/${encodeURIComponent(args.device_id)}/connect`, withAuthArgs(args, { method: 'POST' })))
    case 'hermes_lan_peer_connections':
      return jsonText(await request('/api/devices/peer-connections', withAuthArgs(args)))
    case 'hermes_lan_peer_disconnect':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/disconnect`, withAuthArgs(args, { method: 'POST' })))
    case 'hermes_lan_terminal_create':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminal`, withAuthArgs(args, {
        method: 'POST',
        body: { shell: args.shell, cols: args.cols, rows: args.rows },
      })))
    case 'hermes_lan_terminal_list':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminals`, withAuthArgs(args)))
    case 'hermes_lan_terminal_input':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminal/${encodeURIComponent(args.terminal_id)}/input`, withAuthArgs(args, {
        method: 'POST',
        body: { data: args.data },
      })))
    case 'hermes_lan_terminal_read':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminal/${encodeURIComponent(args.terminal_id)}/read`, withAuthArgs(args)))
    case 'hermes_lan_terminal_resize':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminal/${encodeURIComponent(args.terminal_id)}/resize`, withAuthArgs(args, {
        method: 'POST',
        body: { cols: args.cols, rows: args.rows },
      })))
    case 'hermes_lan_terminal_close':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/terminal/${encodeURIComponent(args.terminal_id)}/close`, withAuthArgs(args, { method: 'POST' })))
    case 'hermes_lan_command_exec':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/exec`, withAuthArgs(args, {
        method: 'POST',
        body: { command: args.command, args: args.args || [], cwd: args.cwd, timeout_ms: args.timeout_ms },
      })))
    case 'hermes_lan_file_download':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/download`, withAuthArgs(args, {
        method: 'POST',
        body: { remote_path: args.remote_path, local_path: args.local_path, timeout_ms: args.timeout_ms },
      })))
    case 'hermes_lan_file_upload':
      return jsonText(await request(`/api/devices/peer-connections/${encodeURIComponent(args.connection_id)}/upload`, withAuthArgs(args, {
        method: 'POST',
        body: { local_path: args.local_path, remote_path: args.remote_path, timeout_ms: args.timeout_ms },
      })))
    default:
      return errorText(`Unknown tool: ${name}`)
  }
}

async function handle(message) {
  if (!message || message.id === undefined) return null

  try {
    switch (message.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: VERSION },
          },
        }
      case 'tools/list':
        return { jsonrpc: '2.0', id: message.id, result: { tools } }
      case 'tools/call':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: await callTool(message.params?.name, message.params?.arguments || {}),
        }
      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        }
    }
  } catch (err) {
    return { jsonrpc: '2.0', id: message.id, result: errorText(err?.message || String(err)) }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async line => {
  const text = line.trim()
  if (!text) return
  let message
  try {
    message = JSON.parse(text)
  } catch {
    return
  }
  const response = await handle(message)
  if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
})
