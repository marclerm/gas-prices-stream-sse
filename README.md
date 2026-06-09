# gas-prices-stream-sse

![Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![RxJS](https://img.shields.io/badge/RxJS-7-B7178C?logo=reactivex&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![C#](https://img.shields.io/badge/C%23-13-239120?logo=csharp&logoColor=white)
![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-Minimal%20API-5C2D91?logo=dotnet&logoColor=white)
![Server-Sent Events](https://img.shields.io/badge/Server--Sent%20Events-streaming-FF6F00)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![nginx](https://img.shields.io/badge/nginx-reverse%20proxy-009639?logo=nginx&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

A small full-stack sample that streams gas-station prices from an ASP.NET Core
**Minimal API** to an Angular SPA over **Server-Sent Events** — one station
per second, no polling, no WebSocket, no buffered payload.

The point is to show how to do real-time UI updates _cleanly_ on a modern
stack: streaming `IResult`s on the server, and signal-based change detection
on a zoneless Angular client.

![demo](/demo.gif)

> Demo

## What's in here

| Piece | Stack | Notes |
| --- | --- | --- |
| `GasApi/` | ASP.NET Core 10 Minimal API | One SSE endpoint + `/api/health`. Pricing is deterministic per zip code. |
| `GasFrontend/` | Angular 21, standalone, **zoneless**, signals | Editable zip input, Stop button, exponential-backoff reconnect, cheapest-station highlight. |
| `docker-compose.yml` | nginx + .NET | One command brings the whole thing up. nginx reverse-proxies `/api/*` to the API container with SSE-friendly settings. |

## Why I wrote this

I wanted a compact reference for a few details that are easy to get subtly
wrong on this stack:

1. **Streaming a Minimal API response.** Writing each chunk with
   `Response.WriteAsync` followed by `FlushAsync` so the client sees data the
   instant it's produced, instead of waiting for the entire response.
2. **Async UI updates in zoneless Angular.** In Angular 21's default zoneless
   mode, `NgZone.run()` is a no-op — pushing to a plain array from an
   `EventSource.onmessage` handler will _not_ update the view. The component
   uses `signal()` and `computed()` so async writes trigger change detection.
3. **SSE behind nginx.** Without the right `proxy_*` directives, nginx
   buffers the whole stream and your "real-time" feed arrives all at once at
   the end.
4. **Reconnect with backoff without spamming on EOF.** `EventSource.onerror`
   fires both for transient drops _and_ for the server's natural
   end-of-stream — the client distinguishes the two so it doesn't reconnect
   after a clean finish.

## Architecture

```
 Browser  ──GET /api/gas-prices/{zip}──►  nginx :80  ──/api/──►  ASP.NET :5000
   ▲                                                                  │
   └──────────────  text/event-stream  (1 chunk/sec)  ◄────────────────┘
```

In local dev, the Angular CLI dev server replaces nginx and proxies `/api`
via `proxy.conf.json`. In both modes the browser only ever sees a same-origin
request, so there's no CORS preflight in the demo path.

## Run it

### With Docker (recommended)

```bash
docker compose up --build
```

Open <http://localhost:8080>, type a 5-digit zip, click **Fetch Live Prices**.

### Without Docker

In two terminals:

```bash
# terminal 1
cd GasApi
dotnet run                # listens on http://localhost:5000

# terminal 2
cd GasFrontend
npm install
npm start                 # http://localhost:4200, proxies /api → :5000
```

## Implementation notes

### Streaming the response

[`GasApi/Program.cs`](GasApi/Program.cs) sets the SSE headers, then loops with
a 1-second delay between chunks. Each chunk is a `data: <json>\n\n` frame
followed by an explicit flush:

```csharp
httpContext.Response.Headers.ContentType = "text/event-stream";
// ...
await httpContext.Response.WriteAsync($"data: {jsonChunk}\n\n", ct);
await httpContext.Response.Body.FlushAsync(ct);
```

The price for each station is derived from a `Random` seeded by a hash of the
zip code, so the same zip is stable across requests but different zips look
visibly different — useful when recording the demo.

### Zoneless change detection

[`GasFrontend/src/app/app.ts`](GasFrontend/src/app/app.ts) keeps all
view-bound state in signals:

```ts
gasStations = signal<GasStationUpdate[]>([]);
sortedStations = computed(() => [...this.gasStations()].sort((a, b) => a.Price - b.Price));
cheapest = computed(() => this.sortedStations()[0]);
```

`gasStations.update(s => [...s, station])` inside `EventSource.onmessage`
schedules a change-detection pass even though no zone is involved.

### Reconnect logic

The client retries up to 5 times with delays of 500 ms, 1 s, 2 s, 4 s, 8 s.
It distinguishes "stream complete" from "stream broken" by checking whether
any chunk has already arrived — so it doesn't try to reconnect after the
server cleanly finishes the 5-station loop.

### nginx for SSE

[`GasFrontend/nginx.conf`](GasFrontend/nginx.conf):

```nginx
location /api/ {
    proxy_pass http://api:5000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 1h;
    chunked_transfer_encoding off;
}
```

Without `proxy_buffering off`, the chunks pile up in nginx and the SPA only
sees them after the server closes the connection.

## Project layout

```
gas-prices-stream-sse/
├── GasApi/                  # ASP.NET Core 10 Minimal API
│   ├── Program.cs           # SSE endpoint + /api/health
│   └── Dockerfile
├── GasFrontend/             # Angular 21 SPA
│   ├── src/app/app.ts       # standalone component, all signal-driven
│   ├── nginx.conf           # SSE-friendly proxy config (Docker)
│   ├── proxy.conf.json      # /api dev-server proxy (local)
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```
