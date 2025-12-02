# Development Subdomain Setup - agents.dev.petter.ai

## Summary

✅ **DNS Record Created:** agents.dev.petter.ai → 135.181.164.125
✅ **Caddy Configuration Updated:** Reverse proxy to dev ports (3001 & 5174)
⏳ **SSL Certificate:** Being obtained by Let's Encrypt (in progress)

---

## Configuration Details

### DNS Setup
```
Domain:    agents.dev.petter.ai
Type:      A Record
Value:     135.181.164.125
Record ID: rec_1f7be22210e6f743b9e478f1
Status:    ✅ Active and resolving
```

### Caddy Configuration
**File:** `/etc/caddy/Caddyfile`

```caddyfile
# Development - agents.dev.petter.ai
agents.dev.petter.ai {
    # Enable auto HTTPS
    tls {
        protocols tls1.2 tls1.3
    }

    # Backend API routes
    handle /api/* {
        reverse_proxy localhost:3001
    }

    # WebSocket for Socket.IO
    handle /socket.io/* {
        reverse_proxy localhost:3001
    }

    # Frontend (everything else)
    handle {
        reverse_proxy localhost:5174
    }

    # Logging
    log {
        output file /var/log/caddy/agents.dev.petter.ai.log
        format json
    }
}
```

### Service Routing

| Environment | Domain | Frontend Port | Backend Port | Database |
|-------------|--------|---------------|--------------|----------|
| **Production** | agents.petter.ai | 5173 | 3000 | `prod/backend/data/agents.db` |
| **Development** | agents.dev.petter.ai | 5174 | 3001 | `dev/backend/data/agents.db` |

---

## Current Status

### ✅ Working
- DNS resolution: `agents.dev.petter.ai` → `135.181.164.125`
- Caddy responding on HTTP (redirects to HTTPS)
- Dev services running on correct ports:
  - Frontend: http://localhost:5174
  - Backend: http://localhost:3001

### ⏳ In Progress
- SSL Certificate from Let's Encrypt
  - Caddy auto-retries every 60-120 seconds
  - Expected time: 2-10 minutes depending on DNS propagation
  - Check logs: `sudo journalctl -u caddy -f | grep agents.dev`

### 🔍 How to Monitor

**Check SSL cert status:**
```bash
sudo journalctl -u caddy -n 50 --no-pager | grep agents.dev
```

**Check if cert obtained:**
```bash
curl -I https://agents.dev.petter.ai
# Should eventually return 200 OK with valid SSL
```

**Watch Caddy logs live:**
```bash
sudo journalctl -u caddy -f
```

---

## Testing Access

### When SSL is Ready

1. **Frontend:** https://agents.dev.petter.ai
2. **Backend API:** https://agents.dev.petter.ai/api/agents
3. **Health Check:** https://agents.dev.petter.ai/api/health

### Current (HTTP redirect)

```bash
# This works but redirects to HTTPS (which will fail until cert is ready)
curl -I http://agents.dev.petter.ai
# Returns: HTTP/1.1 308 Permanent Redirect
```

---

## Environment Isolation

### Conversation Name Feature Testing

The conversation name feature is now available on **both environments**:

**Development (agents.dev.petter.ai):**
- ✅ Backend with conversation name support
- ✅ Frontend with input field + validation
- ✅ All 25 tests passing
- ✅ **Latest code with new feature**

**Production (agents.petter.ai):**
- ⚠️ May not have conversation name feature yet
- Depends on when prod was last updated from main branch

### Database Isolation

Each environment has its own SQLite database:
- **Dev:** `/dev/headless-agent-manager/backend/data/agents.db`
- **Prod:** `/prod/headless-agent-manager/backend/data/agents.db`

No data cross-contamination between environments.

---

## Troubleshooting

### SSL Certificate Not Obtaining

If SSL doesn't work after 10 minutes:

1. **Check DNS propagation:**
   ```bash
   dig +short agents.dev.petter.ai
   # Should return: 135.181.164.125
   ```

2. **Check Caddy errors:**
   ```bash
   sudo journalctl -u caddy -n 100 --no-pager | grep -i error
   ```

3. **Restart Caddy:**
   ```bash
   sudo systemctl restart caddy
   ```

4. **Force cert renewal:**
   ```bash
   sudo caddy reload --force
   ```

### Services Not Running

**Check dev services:**
```bash
lsof -ti:5174  # Frontend
lsof -ti:3001  # Backend
```

**Start dev services:**
```bash
# Backend
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend
PORT=3001 npm run dev

# Frontend (in another terminal)
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/frontend
VITE_PORT=5174 VITE_API_URL=http://localhost:3001 npm run dev
```

### Wrong Content Served

If you see production content on dev subdomain:
1. Verify Caddy config: `sudo cat /etc/caddy/Caddyfile`
2. Verify port mapping is correct
3. Restart Caddy: `sudo systemctl restart caddy`

---

## Next Steps

1. **Wait 2-10 minutes** for SSL certificate to be obtained
2. **Test access:** https://agents.dev.petter.ai
3. **Verify isolation:** Launch agents on both environments to ensure database separation
4. **Update prod:** When ready, deploy conversation name feature to production

---

## Files Modified

- `/etc/caddy/Caddyfile` - Added agents.dev.petter.ai configuration
- Vercel DNS - Added A record for agents.dev subdomain
- Log directory - Created `/var/log/caddy/agents.dev.petter.ai.log`

---

Last Updated: 2025-12-01 00:08 CET
Status: ⏳ SSL certificate being obtained, HTTP working, services running
Next Check: Monitor SSL cert status in 5-10 minutes
