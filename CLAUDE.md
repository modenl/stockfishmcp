# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Run both server and client in development mode
npm run server:dev   # Run server with nodemon (hot reload)
npm run client:dev   # Run client development server (in client/ directory)
```

### Build & Production
```bash
npm run build        # Build the frontend client
npm start           # Start the production server
npm run setup       # Complete setup (install all deps + build)
```

### Client Commands (run from client/ directory)
```bash
npm run lint         # Run ESLint
npm run build       # Build for production
npm run preview     # Preview production build
```

## Architecture

This is a full-stack chess training application with MCP (Model Context Protocol) integration:

- **Server (`server/`)**: Node.js + Express + WebSocket server providing:
  - Server-authoritative game state management
  - WebSocket-based real-time synchronization
  - MCP server implementation with 14 chess analysis tools
  - Session management for multi-client support

- **Client (`client/`)**: Svelte + Vite PWA with:
  - Chessground for interactive chess board
  - Stockfish NNUE WebAssembly engine
  - Real-time game synchronization via WebSocket
  - Offline support through service workers

- **Dual Entry Points**:
  - `npx chess-trainer-mcp`: Launches web UI server
  - `npx chess-trainer-mcp-server`: Launches MCP-only server

## Key Server Components

- `index.js`: Main server entry point, handles Express routes and WebSocket connections
- `mcpServer.js`: MCP protocol implementation with chess analysis tools
- `gameStateManager.js`: Centralized game state management
- `sessionManager.js`: Client session and reconnection handling
- `validation.js`: Chess move validation logic

## Important Patterns

1. **Server-Authoritative Design**: All moves are validated server-side before being applied
2. **Unified Move Flow**: Both human and AI moves go through the same validation pipeline
3. **WebSocket Events**: Real-time updates use custom event protocol
4. **State Persistence**: Game states maintained across client reconnections

## Testing

Manual testing files available:
- `test-moves.html`: Test move validation
- `test-multiclient.html`: Test multi-client synchronization

No automated test suite currently exists.

## MCP Integration

The server exposes 15 MCP tools for chess analysis and game management. When working with MCP functionality, refer to the tool definitions in `mcpServer.js` and the MCP_USAGE_GUIDE.md for usage examples.

### New Iframe Embedding Feature

The latest version includes iframe embedding support:
- **`get_embeddable_url`** tool: Generates embeddable URLs with customizable parameters
- **`/embed` route**: Serves a minimal chess board interface suitable for iframe embedding
- **PostMessage API**: Enables bidirectional communication between parent and embedded chess board
- **MCP Capabilities**: Extended with experimental embedding support in protocol capabilities

When implementing iframe features, ensure:
1. Proper WebSocket connection handling in embedded contexts
2. Cross-origin message validation for security
3. Responsive design for various iframe dimensions
4. Minimal UI mode for embedded views