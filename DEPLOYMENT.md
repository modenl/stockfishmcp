# Deployment Guide

## Quick Deployment

### Local Development
```bash
# Clone and setup
git clone https://github.com/yourusername/stockfishmcp.git
cd stockfishmcp
npm install
npm run client:install

# Development mode (hot reload)
npm run dev

# Production build
npm run build
npm start
```

### Production Deployment

#### Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Build the application
npm run build

# Start with PM2
pm2 start server/index.js --name chess-trainer-mcp

# Save PM2 configuration
pm2 save
pm2 startup
```

#### Using Docker
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci --only=production
RUN cd client && npm ci --only=production

# Copy source code
COPY . .

# Build frontend
RUN npm run client:build

# Expose port
EXPOSE 3456

# Start application
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t chess-trainer-mcp .
docker run -p 3456:3456 chess-trainer-mcp
```

#### Environment Variables

```bash
# Server configuration
PORT=3456                    # Server port (default: 3456)
NODE_ENV=production         # Environment mode

# MCP Integration (optional)
MCP_ENABLED=true            # Enable MCP protocol (default: true)
MCP_HOST_URL=http://localhost:3000/mcp/inbound  # MCP host endpoint

# Logging
LOG_LEVEL=info              # Log level (debug, info, warn, error)
```

#### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### System Requirements

- **Node.js**: 18.0.0 or higher
- **RAM**: Minimum 512MB, recommended 1GB+
- **Storage**: ~200MB for application + dependencies
- **CPU**: Any modern CPU (Stockfish WASM is optimized)

### Performance Optimization

1. **Enable Gzip Compression**:
   ```javascript
   // In server/index.js
   app.use(compression());
   ```

2. **CDN for Static Assets**:
   - Upload WASM files to CDN
   - Update paths in `client/src/lib/stockfish.js`

3. **Caching Headers**:
   ```javascript
   app.use('/public', express.static('client/public', {
     maxAge: '1y',
     etag: false
   }));
   ```

### Health Checks

The application provides health check endpoints:

- `GET /api/health` - Basic health check
- `GET /api/status` - Detailed status including engine

### Monitoring

Recommended monitoring setup:
- **Application**: PM2 monitoring or custom health checks
- **Logs**: Winston or PM2 logs
- **Metrics**: Engine response times, game completion rates
- **Alerts**: High memory usage, engine failures

### Troubleshooting

#### Common Issues

1. **WASM Loading Errors**:
   - Check MIME types: `.wasm` files should be `application/wasm`
   - Verify file permissions and paths
   - Check browser console for CORS errors

2. **WebSocket Connection Failed**:
   - Verify firewall settings
   - Check proxy configuration
   - Ensure WebSocket support in load balancer

3. **High Memory Usage**:
   - Monitor Stockfish engine instances
   - Implement session cleanup
   - Consider engine pooling for high traffic

4. **Slow Engine Response**:
   - Reduce engine thinking time
   - Lower Stockfish skill level
   - Check CPU resources

#### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug npm start
```

This will show:
- WebSocket connections
- Engine initialization
- Move processing
- MCP protocol messages

### Security Considerations

1. **Rate Limiting**: Implement rate limiting for API endpoints
2. **Input Validation**: All chess moves are validated by chessops
3. **CORS**: Configure appropriate CORS policies
4. **Headers**: Use Helmet.js for security headers (already included)
5. **Environment**: Never expose sensitive environment variables

### Backup and Recovery

Important data to backup:
- Session data (if using persistent storage)
- Configuration files
- Custom game databases
- User analytics (if implemented)

The application is stateless by default, so no critical data is stored locally. 