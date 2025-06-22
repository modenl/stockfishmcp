# Chess Trainer MCP Server

A comprehensive chess training application with AI-powered analysis using Stockfish NNUE engine and MCP (Model Context Protocol) integration for advanced coaching capabilities.

![Chess Trainer Screenshot](https://via.placeholder.com/800x600/2c2f33/ffffff?text=Chess+Trainer+Interface)

## ✨ Features

### 🎯 Core Chess Features
- **Interactive Chess Board**: Drag-and-drop interface powered by Chessground
- **Real-time Engine Analysis**: Stockfish NNUE WASM integration for local analysis
- **Evaluation Bar**: Visual representation of position evaluation with depth info
- **Human vs AI**: Play against AI with adjustable ELO (800-2800) and thinking time
- **Position Analysis**: Get best moves and evaluations for any position

### 🎬 Replay & Learning
- **Game Replay**: Full replay system with controls (play, pause, step, speed)
- **Sample Games**: Built-in famous games (Scholar's Mate, Italian Game, Sicilian Defense)
- **Move Navigation**: Browse through game history with analysis
- **Board Flipping**: View games from both perspectives

### 🤖 MCP Integration
- **9 Chess Analysis Tools**: Complete set of MCP tools for AI assistants
- **Position Analysis**: Analyze any chess position with Stockfish
- **Move Evaluation**: Get detailed move quality assessments
- **Opening Explanations**: Learn chess opening principles
- **UI Management**: Start/stop chess interface from AI assistants

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

### 🤖 MCP Integration for AI Assistants

Chess Trainer MCP Server provides 9 powerful chess analysis tools that can be used by AI assistants like Claude, Cursor, and other MCP-compatible hosts.

#### Available Tools:
1. **`analyze_position`** - Analyze chess positions using Stockfish engine
2. **`evaluate_move`** - Evaluate move quality and get detailed analysis
3. **`get_best_moves`** - Get best move recommendations for any position
4. **`explain_opening`** - Explain chess opening principles and theory
5. **`validate_fen`** - Validate FEN strings and get position information
6. **`generate_pgn`** - Generate PGN from move sequences
7. **`start_chess_ui`** - Start the Chess Trainer web interface
8. **`stop_chess_ui`** - Stop the UI server
9. **`start_chess_game`** - Start a chess game and automatically open browser

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
node bin/mcp-server.js
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

```
"Analyze this chess position: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

"What are the best moves for White in the starting position?"

"Explain the Italian Game opening"

"Start a chess game for me"

"Validate this FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
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
│  • Contains MCP Client  │   │  • 9 Chess Analysis Tools  │
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
      "args": ["/path/to/stockfishmcp/bin/mcp-server.js"]
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

#### 3. "No tools discovered"
- Check MCP configuration file format and path
- Ensure proper JSON syntax
- Restart MCP host application

#### 4. "Connection timeout"
- Check network connectivity
- Verify npm package installation
- Try local path configuration

### Testing MCP Server

```bash
# Test if server responds
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx --package=chess-trainer-mcp chess-trainer-mcp-server

# Should return initialization response with server info
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

### Analysis Tools

#### `analyze_position`
Analyze a chess position using Stockfish engine.
```json
{
  "name": "analyze_position",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "depth": 15
  }
}
```

#### `evaluate_move`
Evaluate a chess move and get detailed analysis.
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
Get the best moves for a given position.
```json
{
  "name": "get_best_moves",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "count": 3
  }
}
```

#### `explain_opening`
Explain a chess opening and its principles.
```json
{
  "name": "explain_opening",
  "arguments": {
    "moves": ["e2e4", "e7e5", "Ng1f3"],
    "opening_name": "King's Pawn Game"
  }
}
```

### Utility Tools

#### `validate_fen`
Validate a FEN string and provide position information.
```json
{
  "name": "validate_fen",
  "arguments": {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  }
}
```

#### `generate_pgn`
Generate PGN from a list of moves.
```json
{
  "name": "generate_pgn",
  "arguments": {
    "moves": ["e2e4", "e7e5", "Ng1f3", "Nb8c6"],
    "white_player": "Player1",
    "black_player": "Player2"
  }
}
```

### UI Management Tools

#### `start_chess_ui`
Start the Chess Trainer web UI interface.
```json
{
  "name": "start_chess_ui",
  "arguments": {
    "port": 3456,
    "mode": "play"
  }
}
```

#### `stop_chess_ui`
Stop the Chess Trainer web UI server.
```json
{
  "name": "stop_chess_ui",
  "arguments": {
    "port": 3456
  }
}
```

#### `start_chess_game`
Start a chess game and automatically open browser.
```json
{
  "name": "start_chess_game",
  "arguments": {
    "port": 3456,
    "mode": "play",
    "auto_open": true
  }
}
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📧 Issues: [GitHub Issues](https://github.com/modenl/stockfishmcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/modenl/stockfishmcp/discussions)
- 📚 Documentation: This README contains all configuration information

---

**Ready to enhance your chess training with AI-powered analysis!** 🚀♟️ 