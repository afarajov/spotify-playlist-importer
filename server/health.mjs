import { createServer } from 'node:http'
import OpenAI from 'openai'
import { extractionRequest, normalizeSongText, readSongList } from './extract-songs.mjs'

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey || !apiKey.trim()) {
  console.error('Missing OPENAI_API_KEY. Add it to server/.env and start with node --env-file=server/.env server/health.mjs')
  process.exit(1)
}

const client = new OpenAI()
const port = 8787
const maxBodyBytes = 1_000_000
const modelTimeoutMs = 25_000
const rateWindowMs = 60_000
const rateLimit = 30
const allowedOrigin = 'http://127.0.0.1:5173'
const recentRequests = []

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    applyCors(request, response)
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(request, response, 200, { ok: true })
    return
  }

  if (request.method === 'POST' && request.url === '/api/parse-songs') {
    void handleParseSongs(request, response)
    return
  }

  sendJson(request, response, 404, { ok: false })
})

function sendJson(request, response, statusCode, body) {
  applyCors(request, response)
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function applyCors(request, response) {
  if (request.headers.origin === allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
}

async function handleParseSongs(request, response) {
  let text = ''
  try {
    const body = await readJsonBody(request)
    text = normalizeSongText(body?.text)
  } catch (error) {
    const known = errorCode(error)
    sendJson(request, response, known?.statusCode ?? 400, { ok: false, error: known?.code ?? 'invalid_json' })
    return
  }

  if (!takeRateSlot()) {
    sendJson(request, response, 429, { ok: false, error: 'rate_limited' })
    return
  }

  try {
    const modelResponse = await client.responses.create(extractionRequest(text), {
      signal: AbortSignal.timeout(modelTimeoutMs),
    })
    const songs = readModelSongs(modelResponse.output_text)
    sendJson(request, response, 200, { songs })
  } catch (error) {
    const known = errorCode(error)
    console.error(redact(error instanceof Error ? error.message : 'OpenAI request failed'))
    sendJson(request, response, known?.statusCode ?? 502, {
      ok: false,
      error: known?.code ?? 'model_unavailable',
    })
  }
}

function readModelSongs(output) {
  if (typeof output !== 'string' || output.trim().length === 0) {
    throw Object.assign(new Error('invalid_model_response'), { code: 'invalid_model_response', statusCode: 502 })
  }
  try {
    return readSongList(JSON.parse(output))
  } catch (error) {
    if (errorCode(error)) {
      throw error
    }
    throw Object.assign(new Error('invalid_model_response'), { code: 'invalid_model_response', statusCode: 502 })
  }
}

function takeRateSlot(now = Date.now()) {
  while (recentRequests.length > 0 && now - recentRequests[0] > rateWindowMs) {
    recentRequests.shift()
  }
  if (recentRequests.length >= rateLimit) {
    return false
  }
  recentRequests.push(now)
  return true
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('body_too_large'), { code: 'body_too_large', statusCode: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('invalid_json'), { code: 'invalid_json', statusCode: 400 }))
      }
    })

    request.on('error', () => {
      reject(Object.assign(new Error('invalid_json'), { code: 'invalid_json', statusCode: 400 }))
    })
  })
}

function errorCode(error) {
  if (typeof error !== 'object' || error === null || typeof error.code !== 'string' || typeof error.statusCode !== 'number') {
    return null
  }
  return { code: error.code, statusCode: error.statusCode }
}

function redact(message) {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
}

server.listen(port, '127.0.0.1', () => {
  console.log(`AI server listening on http://127.0.0.1:${port}`)
})
