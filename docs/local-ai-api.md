# Local ViChat AI API

This bridge is for a workstation-only demo. It is not deployed to the
production VPS and it only answers while the Windows process is running.

## Flow

```text
Knowledge/Q&A service -> POST /api/ask on this PC -> Knowledge API -> local LLM -> JSON answer
```

The bridge accepts both `question` and `query` so the caller does not need to
change its first prototype.

### Request

```http
POST http://<pc-ip>:8000/api/ask
Content-Type: application/json
X-Local-AI-Token: <local-token>
```

```json
{
  "question": "Quy trinh xin nghi phep la gi?",
  "history": []
}
```

`query` and `message` are accepted as aliases for `question`. The body is
limited to 64 KiB and the question is limited to 4,000 characters.

### Response

```json
{
  "answer": "...",
  "reply": "...",
  "grounded": true,
  "sources": [
    {
      "title": "quy-trinh-nghi-phep.pdf",
      "file_name": "quy-trinh-nghi-phep.pdf",
      "snippet": "...",
      "score": 0.91
    }
  ]
}
```

## Run on Windows

Run the commands from the repository directory. If PowerShell opens in
`C:\Users\Admin`, switch to the project first:

```powershell
Set-Location 'D:\vichat-web-master\vichat-web'
```

1. Install a local model runtime and store its model on the data drive. The
   provided portable setup uses llama.cpp plus `qwen2.5:1.5b` and starts it
   with:

   ```powershell
   .\scripts\start-local-vichat-llm.ps1
   ```

   Ollama remains supported if it is already installed; in that case use
   `ollama pull qwen2.5:1.5b` and keep the Ollama values in the env file.
2. Copy `.env.local-ai-api.example` to `.env.local-ai-api` and fill the
   Knowledge API key and a private incoming token. Do not commit that file.
3. Start Ollama and pull the model:

   ```powershell
   ollama pull qwen2.5:1.5b
   ```

4. Start the bridge:

   ```powershell
   .\scripts\start-local-vichat-api.ps1
   ```

The portable llama.cpp setup uses these local values in `.env.local-ai-api`:

```dotenv
LOCAL_AI_LLM_URL=http://127.0.0.1:8080/v1/chat/completions
LOCAL_AI_LLM_MODEL=qwen2.5:1.5b
LOCAL_AI_LLM_FORMAT=openai
LOCAL_AI_MAX_TOKENS=256
```

The script prints the LAN URL, for example
`http://192.168.1.12:8000/api/ask`. The caller must be on the same private
network. If Windows blocks the request, run PowerShell as Administrator once:

```powershell
.\scripts\allow-local-vichat-api-firewall.ps1
```

For a caller outside the LAN, use an approved HTTPS tunnel or domain. Do not
expose port 8000 publicly without the token and an HTTPS boundary.

If Cloudflare Quick Tunnel is approved for a temporary test, install
`cloudflared` and run:

```powershell
winget install --id Cloudflare.cloudflared
.\scripts\start-local-vichat-tunnel.ps1
```

If the system drive is low on space, use the portable binary on the data drive
instead. The launcher auto-detects `D:\ViChatLocalAI\bin\cloudflared.exe`:

```powershell
New-Item -ItemType Directory -Path D:\ViChatLocalAI\bin -Force
Invoke-WebRequest `
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe `
  -OutFile D:\ViChatLocalAI\bin\cloudflared.exe
.\scripts\start-local-vichat-tunnel.ps1
```

Keep that window open. The command prints a temporary HTTPS hostname; append
`/api/ask` to that hostname for the colleague. The hostname changes when the
tunnel stops.

The quick tunnel is suitable for a temporary test only. For a stable hostname,
create a named Cloudflare Tunnel on a domain owned by the team; the workstation
and the local API still need to remain online while requests are served.

## Message to send the colleague

```text
URL: http://192.168.1.12:8000/api/ask
Method: POST
Header: X-Local-AI-Token: <token>
Body: {"question":"..."}
Response: {"answer":"...","reply":"...","grounded":true,"sources":[]}
```

When using an ngrok free URL, API clients should also send
`ngrok-skip-browser-warning: true`; the browser warning `ERR_NGROK_6024` is
not an application failure.

Replace the IP and token with the values printed/configured on the local
machine. The PC must remain on while the service sends requests.

## Health check

```powershell
Invoke-RestMethod http://127.0.0.1:8000/healthz
```

The health response reports only whether the Knowledge URL, local model, and
incoming token are configured; it never returns secret values.
