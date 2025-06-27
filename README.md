# Chess Trainer MCP Server

A comprehensive chess training application with AI-powered analysis using Stockfish NNUE engine and MCP (Model Context Protocol) integration for advanced coaching capabilities.

## ✨ Features

### 🎯 Core Chess Features
- **Interactive Chess Board**: Drag-and-drop interface with real-time move validation
- **Real-time Engine Analysis**: Stockfish NNUE WASM integration for local analysis
- **Evaluation Bar**: Visual representation of position evaluation with depth info
- **Human vs AI**: Play against AI with adjustable ELO (800-2800) and thinking time
- **Human vs Human**: Local multiplayer chess games
- **Position Analysis**: Get best moves and evaluations for any position

### 🎬 Replay & Learning
- **Game Replay**: Full replay system with controls (play, pause, step, speed)
- **Sample Games**: Built-in famous games (Scholar's Mate, Italian Game, Sicilian Defense)
- **Move Navigation**: Browse through game history with analysis
- **Board Flipping**: View games from both perspectives

### 🔄 Server-Authoritative Architecture
- **Real-time Synchronization**: All moves are validated and synchronized through the server
- **WebSocket Communication**: Instant updates across all connected clients
- **State Persistence**: Games are automatically saved to disk and survive server restarts
- **Auto-Save**: Games are saved every 30 seconds and on server shutdown
- **Game Recovery**: All active games are restored when the server restarts
- **Unified Move Handling**: Both human and AI moves follow the same server-sync flow

### 🤖 MCP Integration
- **14 Organized Chess Tools**: Complete MCP tools for AI assistants
- **Server Management**: Launch and control the chess trainer server
- **Game Management**: Create, list, and manage chess games
- **Game Interaction**: Make moves and get AI suggestions
- **Analysis Tools**: Position analysis, move evaluation, and best move suggestions
- **Utility Tools**: FEN validation, PGN generation, and opening explanations

## 🚀 Quick Start

### 🎯 Web Interface (One-Command Setup)

```bash
# Run directly with npx - no installation needed!
npx chess-trainer-mcp
```

This will automatically:
- Install all dependencies
- Build the frontend
- Start the server on http://localhost:3456
- Open the chess interface in your browser

### 🎮 Playing Chess

1. **Human vs Human**: Default mode - take turns making moves
2. **Human vs AI**: Choose your color and AI difficulty
   - AI ELO range: 800-2800
   - Thinking time: 0.1s to 10s
   - AI automatically moves after your turn
3. **Game Analysis**: Use the evaluation bar and analysis tools
4. **Replay Mode**: Load and replay famous chess games

## 🏗️ Architecture

### Client-Server Communication Flow
```
Move Made → Sync to Server → Server Validates → WebSocket Broadcast → Client Updates → Check AI Turn
```

### Key Components
- **Frontend**: Svelte-based chess interface with Chessground board
- **Backend**: Node.js server with Express API and WebSocket support
- **Engine**: Stockfish NNUE for move analysis and AI play
- **MCP Server**: JSON-RPC interface for AI assistant integration

### 🤖 MCP Integration for AI Assistants

Chess Trainer MCP Server provides 15 well-organized chess tools that can be used by AI assistants like Claude, Cursor, and other MCP-compatible hosts.

#### Available Tools:

**🚀 Server Management:**
1. **`launch_chess_trainer`** - Launch the Chess Trainer web server with optional browser opening
2. **`stop_chess_trainer`** - Stop the Chess Trainer web server

**🎮 Game Management:**
3. **`create_game`** - Create a new chess game with specific settings (mode, AI ELO, color)
4. **`list_active_games`** - List all currently active chess games
5. **`get_game_state`** - Get the current state of a specific chess game
6. **`reset_game`** - Reset a game to the starting position

**🎯 Game Interaction:**
7. **`make_move`** - Make a move in an active chess game
8. **`suggest_best_move`** - Get the best move suggestion for the current position

**📊 Analysis Tools:**
9. **`analyze_position`** - Analyze a chess position (currently simulated, real Stockfish integration pending)
10. **`evaluate_move`** - Evaluate the quality of a chess move
11. **`get_best_moves`** - Get the top N best moves for a position

**🔧 Utility Tools:**
12. **`validate_fen`** - Validate a FEN string and get position information
13. **`generate_pgn`** - Generate PGN notation from a list of moves
14. **`explain_opening`** - Get explanation and principles of a chess opening

**🌐 Embedding Tools:**
15. **`get_embeddable_url`** - Get an embeddable URL for iframe integration

## 🔧 MCP Host Configuration

### 🎯 Quick Configuration (Recommended)

#### Method 1: Using npx with --package flag
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["--package=chess-trainer-mcp", "chess-trainer-mcp-server"]
    }
  }
}
```

#### Method 2: Pre-install for faster startup
```bash
# First install globally
npm install -g chess-trainer-mcp

# Then configure
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "chess-trainer-mcp-server"
    }
  }
}
```

### 🛠️ Host-Specific Configuration

#### Claude Desktop (Anthropic)
**Config file**: 
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "command": "npx",
      "args": ["--package=chess-trainer-mcp", "chess-trainer-mcp-server"]
    }
  }
}
```

#### Cursor IDE
**Config file**: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx", 
      "args": ["--package=chess-trainer-mcp", "chess-trainer-mcp-server"]
    }
  }
}
```

#### Continue.dev
**Config file**: `~/.continue/config.json`

```json
{
  "mcpServers": [
    {
      "name": "chess-trainer-mcp",
      "command": "npx",
      "args": ["--package=chess-trainer-mcp", "chess-trainer-mcp-server"]
    }
  ]
}
```

#### Other MCP Hosts
```json
{
  "servers": {
    "chess-trainer-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": ["--package=chess-trainer-mcp", "chess-trainer-mcp-server"]
    }
  }
}
```

### 🧪 Testing MCP Configuration

```bash
# Test server initialization
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx --package=chess-trainer-mcp chess-trainer-mcp-server

# Test tools discovery
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx --package=chess-trainer-mcp chess-trainer-mcp-server

# Test position validation
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"validate_fen","arguments":{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}}}' | npx --package=chess-trainer-mcp chess-trainer-mcp-server
```

## 📦 Installation Methods

### Method 1: NPX (No Installation)
```bash
# Start web interface
npx chess-trainer-mcp

# Use as MCP server
npx --package=chess-trainer-mcp chess-trainer-mcp-server
```

### Method 2: Global Installation
```bash
# Install globally
npm install -g chess-trainer-mcp

# Start web interface
chess-trainer-mcp

# Use as MCP server
chess-trainer-mcp-server
```

### Method 3: Local Development
```bash
# Clone the repository
git clone https://github.com/modenl/stockfishmcp.git
cd stockfishmcp

# Install and build
npm run setup

# Start web interface
npm start

# Use as MCP server
node bin/mcp
```

## 🛠️ Command Options

```bash
# Web Interface Commands
npx chess-trainer-mcp                    # Start on default port 3456
npx chess-trainer-mcp --port 8080       # Start on custom port
npx chess-trainer-mcp --no-mcp          # Disable MCP integration
npx chess-trainer-mcp dev               # Development mode with hot reload
npx chess-trainer-mcp build             # Build frontend only
npx chess-trainer-mcp setup             # Install dependencies and build
npx chess-trainer-mcp help              # Show all available options

# MCP Server Commands
npx --package=chess-trainer-mcp chess-trainer-mcp-server  # Start MCP server
chess-trainer-mcp-server                                  # If globally installed
```

## 🎮 Usage Examples

### Using with AI Assistants

Once configured, you can ask your AI assistant to:

**🔍 Analysis Commands:**
```
"Analyze this chess position: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

"What are the best moves for White in the starting position?"

"Explain the Italian Game opening"

"Validate this FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

**🎮 Game Management:**
```
"Launch the chess trainer server"

"Create a new chess game with ID 'my-game' against AI with 1800 ELO"

"List all active chess games"

"Show me the current state of game session_12345"
```

**🎯 Interactive Gameplay:**
```
"Make the move e2e4 in game session_12345"

"Suggest the best move for game 'my-game'"

"Reset the chess game to starting position"

"Make a move and then suggest the opponent's best response"
```

**💡 Advanced Interactions:**
```
"Start a game, make the moves 1.e4 e5 2.Nf3, then analyze the position"

"Play the Italian Game opening and explain each move"

"Set up a game where I can practice the Sicilian Defense"
```

### Web Interface Usage

1. **Playing Chess**:
   - Click "New Game" to start
   - Choose Human vs Human or Human vs AI
   - Configure AI strength (800-2800 ELO) and thinking time

2. **Analysis**:
   - Make moves on the board
   - Click "Analyze Position" for engine evaluation
   - View evaluation bar and best moves

3. **Replay**:
   - Click "Game Replay 📺" to open replay menu
   - Choose from current game or sample games
   - Use controls to navigate through moves

## 🏗️ Architecture

### Web Server vs MCP Server

```
┌─────────────────────────────────────────────────────────┐
│                   User Commands                         │
│  npx chess-trainer-mcp  │  npx chess-trainer-mcp-server │
└─────────────┬───────────┴─────────────┬─────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│     Web Server          │   │      MCP Server             │
│  (ChessTrainerServer)   │   │  (StdioMCPServer)          │
│  • Port 3456            │   │  • STDIO Communication     │
│  • Web Interface        │   │  • JSON-RPC 2.0 Protocol   │
│  • Game Management      │   │  • Tool Discovery           │
│  • Contains MCP Client  │   │  • 14 Chess Analysis Tools │
└─────────────────────────┘   └─────────────────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│    Frontend (Svelte)    │   │    MCPServer Class          │
│  • Interactive Board    │   │  • analyze_position         │
│  • Stockfish Engine     │   │  • evaluate_move            │
│  • Game Replay          │   │  • get_best_moves           │
│  • Real-time Analysis   │   │  • explain_opening          │
└─────────────────────────┘   │  • validate_fen             │
                              │  • generate_pgn             │
                              │  • start_chess_ui           │
                              │  • stop_chess_ui            │
                              │  • start_chess_game         │
                              └─────────────────────────────┘
```

## 🔧 Configuration

### Environment Variables
```bash
# Web Server Configuration
PORT=3456                                    # Server port
MCP_HOST_URL=http://localhost:3000/mcp/inbound  # MCP host endpoint
MCP_ENABLED=true                             # Enable/disable MCP integration
LOG_LEVEL=info                               # Logging level

# Development
NODE_ENV=development                         # Environment mode
```

### Advanced Configuration

#### Local Development with Custom Path
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "node",
      "args": ["/path/to/stockfishmcp/bin/mcp"]
    }
  }
}
```

#### With Specific Version
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio", 
      "command": "npx",
      "args": ["--package=chess-trainer-mcp@1.0.5", "chess-trainer-mcp-server"]
    }
  }
}
```

#### Debug Mode
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "node",
      "args": ["--inspect", "/path/to/stockfishmcp/bin/mcp-server.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## ⚠️ Troubleshooting

### Common Issues

#### 1. "Command not found" error
```bash
# Solution: Install the package
npm install -g chess-trainer-mcp
```

#### 2. "JSON parsing errors" in MCP host
```bash
# Problem: Using wrong entry point
# ❌ Wrong: npx chess-trainer-mcp
# ✅ Correct: npx --package=chess-trainer-mcp chess-trainer-mcp-server
```

#### 3. "Connection closed" or "MCP error -32000"
This usually indicates npm cache issues or version conflicts.

**Quick Fix:**
```bash
# Clear npm cache
npm cache clean --force

# Clear npx cache
rm -rf ~/.npm/_npx

# Use local path configuration (recommended for development)
```

**Local Path Configuration (Most Reliable):**
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "node",
      "args": ["/path/to/stockfishmcp/bin/mcp"],
      "cwd": "/path/to/stockfishmcp"
    }
  }
}
```

#### 4. "No tools discovered"
- Check MCP configuration file format and path
- Ensure proper JSON syntax
- Restart MCP host application
- Verify server initialization with test command

#### 5. "Connection timeout"
- Check network connectivity
- Verify npm package installation
- Try local path configuration
- Ensure no port conflicts

### Testing MCP Server

#### Basic Connection Test
```bash
# Test if server responds (using npx)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx --package=chess-trainer-mcp chess-trainer-mcp-server

# Test using local path (if you have the source)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node /path/to/stockfishmcp/bin/mcp

# Should return: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}
```

#### Test Tool Discovery
```bash
# List all available tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node bin/mcp

# Should return 14 organized tools across 5 categories
```

#### Test Interactive Features
```bash
# Test listing active games
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_active_games","arguments":{}}}' | node bin/mcp

# Test position analysis
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"analyze_position","arguments":{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}}}' | node bin/mcp
```

## 🛠️ Development

### Project Structure
```
stockfishmcp/
├── bin/
│   ├── chess-trainer-mcp      # Main CLI entry point (Web interface)
│   ├── mcp                    # Clean MCP entry point  
│   └── mcp-server.js          # MCP protocol implementation
├── client/                    # Frontend Svelte app
│   ├── src/components/        # Chess board, controls, etc.
│   ├── public/               # Stockfish WASM files
│   └── dist/                 # Built frontend
├── server/
│   ├── index.js              # Web server (ChessTrainerServer)
│   ├── mcpServer.js          # MCP tools implementation
│   └── mcpClient.js          # MCP client for outbound calls
└── package.json              # Defines both bin commands
```

### Key Technologies
- **Frontend**: Svelte, Vite, Chessground, Chessops
- **Chess Engine**: Stockfish NNUE (WebAssembly)
- **Backend**: Node.js, Express, WebSocket
- **Protocol**: MCP (Model Context Protocol) JSON-RPC 2.0

### Development Commands
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build frontend for production
npm run setup        # Install all dependencies and build
npm start           # Start production server
```

## 📋 MCP Tools Reference

### Server Management

#### `launch_chess_trainer`
Launch the Chess Trainer web server with optional browser opening.
```json
{
  "name": "launch_chess_trainer",
  "arguments": {
    "port": 3456,
    "auto_open_browser": true
  }
}
```

#### `stop_chess_trainer`
Stop the Chess Trainer web server.
```json
{
  "name": "stop_chess_trainer",
  "arguments": {
    "port": 3456
  }
}
```

### Game Management

#### `create_game`
Create a new chess game with specific settings.
```json
{
  "name": "create_game",
  "arguments": {
    "game_id": "my-game",
    "mode": "human_vs_ai",
    "player_color": "white",
    "ai_elo": 1500,
    "ai_time_limit": 1000
  }
}
```

#### `list_active_games`
List all currently active chess games.
```json
{
  "name": "list_active_games",
  "arguments": {}
}
```

#### `get_game_state`
Get the current state of a specific chess game.
```json
{
  "name": "get_game_state",
  "arguments": {
    "game_id": "my-game"
  }
}
```

#### `reset_game`
Reset a game to the starting position.
```json
{
  "name": "reset_game",
  "arguments": {
    "game_id": "my-game"
  }
}
```

### Game Interaction

#### `make_move`
Make a move in an active chess game.
```json
{
  "name": "make_move",
  "arguments": {
    "game_id": "my-game",
    "move": "e2e4"
  }
}
```

#### `suggest_best_move`
Get the best move suggestion for the current position.
```json
{
  "name": "suggest_best_move",
  "arguments": {
    "game_id": "my-game",
    "depth": 12
  }
}
```

### Analysis Tools

#### `analyze_position`
Analyze a chess position (currently returns simulated analysis).
```json
{
  "name": "analyze_position",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "depth": 15
  }
}
```

#### `evaluate_move`
Evaluate the quality of a chess move.
```json
{
  "name": "evaluate_move",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "move": "e2e4"
  }
}
```

#### `get_best_moves`
Get the top N best moves for a position.
```json
{
  "name": "get_best_moves",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "count": 3
  }
}
```

### Utility Tools

#### `validate_fen`
Validate a FEN string and get position information.
```json
{
  "name": "validate_fen",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  }
}
```

#### `generate_pgn`
Generate PGN notation from a list of moves.
```json
{
  "name": "generate_pgn",
  "arguments": {
    "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    "white_player": "Magnus Carlsen",
    "black_player": "Hikaru Nakamura",
    "event": "Online Blitz",
    "date": "2025.06.27"
  }
}
```

#### `explain_opening`
Get explanation and principles of a chess opening.
```json
{
  "name": "explain_opening",
  "arguments": {
    "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    "opening_name": "Ruy Lopez"
  }
}
```

### 🌐 Iframe Embedding

The Chess Trainer now supports iframe embedding, allowing you to integrate the chess board into any web application.

#### `get_embeddable_url`
Get an embeddable URL for iframe integration with customizable options.
```json
{
  "name": "get_embeddable_url",
  "arguments": {
    "game_id": "my-game",
    "mode": "minimal",
    "width": 600,
    "height": 600,
    "allow_moves": true,
    "show_controls": false
  }
}
```

**Parameters:**
- `game_id`: ID of the game to embed
- `mode`: UI mode - `"full"`, `"board-only"`, or `"minimal"`
- `width`/`height`: Dimensions of the embedded view (300-1200)
- `allow_moves`: Whether users can make moves in the embedded view
- `show_controls`: Whether to show game controls (reset, flip, hint)

**Example Usage:**
```html
<iframe 
  src="http://localhost:3456/embed?game_id=my-game&mode=minimal&width=600&height=600&allow_moves=true&show_controls=false"
  width="600"
  height="600"
  frameborder="0"
  allow="fullscreen"
  style="border: 1px solid #ccc; border-radius: 8px;"
></iframe>
```

**PostMessage API:**
The embedded chess board supports bidirectional communication via postMessage:

```javascript
// Send commands to the chess board
iframe.contentWindow.postMessage({
  type: 'chess_command',
  command: 'move',
  move: 'e2e4',
  san: 'e4'
}, '*');

// Listen for events from the chess board
window.addEventListener('message', (event) => {
  if (event.data.type === 'chess_move') {
    console.log('Move made:', event.data.move, event.data.san);
  }
});
```

**Supported Commands:**
- `reset`: Reset the game to starting position
- `flip`: Flip the board orientation
- `move`: Make a move (requires move and optionally san)
- `load_fen`: Load a specific position (requires fen)

**Events from Chess Board:**
- `chess_move`: Fired when a move is made
- `request_hint`: Fired when hint button is clicked (if controls shown)

## 📝 Changelog

### Version 1.0.11 (Latest)
- **Iframe Embedding Support**: New `get_embeddable_url` tool and `/embed` route for iframe integration
- **PostMessage API**: Bidirectional communication between parent and embedded chess board
- **Extended MCP Capabilities**: Added experimental embedding capability to MCP protocol
- **Reorganized MCP Tools**: Streamlined from 16 to 15 tools with better categorization
- **Improved Tool Names**: Clearer, more descriptive tool names (e.g., `suggest_move` → `suggest_best_move`)
- **Enhanced Server Startup**: Better error handling and retry logic for `launch_chess_trainer`
- **Added Proper Server Stop**: New `stop_chess_trainer` tool that actually stops the server
- **Game Persistence**: Games now survive server restarts with automatic save/restore
- **Auto-Save Feature**: Games automatically saved every 30 seconds
- **Inactive Game Cleanup**: Games inactive for 24 hours are automatically archived
- **Removed Redundant Tools**: Eliminated confusing tools like `start_chess_ui`, `stop_chess_ui`, `start_chess_game`
- **Added Tool Categories**: Server Management, Game Management, Game Interaction, Analysis Tools, Utility Tools, Embedding Tools
- **Fixed MCP SDK Integration**: Resolved Zod schema issues for proper tool registration
- **Updated Documentation**: Comprehensive tool reference with examples and iframe embedding guide

### Version 1.0.10
- Major UI overhaul and feature enhancements
- Multi-client support with unique client identification
- Server-authoritative architecture implementation

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📧 Issues: [GitHub Issues](https://github.com/modenl/stockfishmcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/modenl/stockfishmcp/discussions)
- 📚 Documentation: This README contains all configuration information

---

**Ready to enhance your chess training with AI-powered analysis!** 🚀♟️ 