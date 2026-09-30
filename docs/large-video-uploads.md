# Large video uploads

The media library accepts MP4/MOV videos up to **1 GiB (1,024 MiB)** per file.
Images and audio retain the 100 MiB limit. Platform-specific publishing limits
still apply when composing a post.

Uploads stream multipart data directly to disk with backpressure. `/api/media`
is excluded from the Next.js proxy matcher to avoid cloning/buffering the body;
authentication and upload rate limiting run in the route itself. Partial files
are removed on malformed, oversized, or interrupted uploads.

## Deployment

Rebuild and redeploy the application to enable the new limits. Allow at least
1,025 MiB request bodies and 30-minute uploads in any reverse proxy/load balancer.
For nginx, the equivalent location settings are:

```nginx
client_max_body_size 1025m;
client_body_timeout 1800s;
proxy_send_timeout 1800s;
proxy_read_timeout 1800s;
proxy_request_buffering off;
```

Cloudflare-proxied hostnames may enforce a lower per-request upload limit
(depending on the plan). Application settings cannot override that limit;
use an ingress that permits these request sizes. HTTP 413 responses generated
by the proxy before the request reaches the app require an ingress configuration
change. Check the deployed hostname with the original 278 MB video after rollout.
