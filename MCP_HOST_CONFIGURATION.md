# MCP Host Configuration Guide

本指南介绍如何在各种 MCP 主机中配置 chess-trainer-mcp 服务器。

## 🎯 快速配置（推荐）

### 方式一：使用专用 MCP 入口点
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

### 方式二：预安装后使用（更快）
```bash
# 先全局安装
npm install -g chess-trainer-mcp

# 然后配置
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "chess-trainer-mcp-server"
    }
  }
}
```

这两种方式都能确保协议合规。

## 🔧 各种主机配置方法

### 1. Claude Desktop (Anthropic)
配置文件位置：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### 2. Cursor IDE
配置文件：`~/.cursor/mcp.json`

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

### 3. Continue.dev
配置文件：`~/.continue/config.json`

```json
{
  "mcpServers": [
    {
      "name": "chess-trainer-mcp",
      "command": "npx",
      "args": ["chess-trainer-mcp-server"]
    }
  ]
}
```

### 4. 其他基于 MCP 的工具
通用配置格式：

```json
{
  "servers": {
    "chess-trainer-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": ["chess-trainer-mcp-server"]
    }
  }
}
```

## 🛠️ 高级配置选项

### 本地开发配置
如果您从源码运行：

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

### 使用特定版本
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio", 
      "command": "npx",
      "args": ["chess-trainer-mcp-server@1.0.4"]
    }
  }
}
```

### 调试模式配置
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

## 🔍 可用的工具 (Actions)

配置成功后，您的 MCP 主机将发现以下 9 个棋类分析工具：

### 分析工具
1. **`analyze_position`** - 分析棋局位置
2. **`evaluate_move`** - 评估走法质量  
3. **`get_best_moves`** - 获取最佳走法推荐
4. **`explain_opening`** - 解释开局理论

### 验证工具
5. **`validate_fen`** - 验证 FEN 字符串
6. **`generate_pgn`** - 生成 PGN 棋谱

### UI 管理工具
7. **`start_chess_ui`** - 启动棋类训练界面
8. **`stop_chess_ui`** - 停止 UI 服务器
9. **`start_chess_game`** - 启动游戏并自动打开浏览器

## 🧪 测试配置

### 验证 MCP 服务器
```bash
# 测试服务器是否响应
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx chess-trainer-mcp-server

# 测试工具列表
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx chess-trainer-mcp-server
```

### 验证工具调用
```bash
# 测试位置分析
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"validate_fen","arguments":{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}}}' | npx chess-trainer-mcp-server
```

## ⚠️ 常见问题

### 问题 1: "Command not found"
**解决方案**: 确保已安装 chess-trainer-mcp
```bash
npm install -g chess-trainer-mcp
```

### 问题 2: "JSON parsing errors"
**原因**: 使用了错误的入口点 (`chess-trainer-mcp` 而不是 `chess-trainer-mcp-server`)
**解决方案**: 使用 `chess-trainer-mcp-server` 作为命令

### 问题 3: "No tools discovered"
**解决方案**: 检查配置文件格式和路径是否正确

### 问题 4: "Connection timeout"
**解决方案**: 
1. 检查网络连接
2. 确保 npm 包已正确安装
3. 尝试本地路径配置

## 📝 配置模板

### 最小配置
```json
{
  "mcpServers": {
    "chess": {
      "command": "npx",
      "args": ["chess-trainer-mcp-server"]
    }
  }
}
```

### 完整配置
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["chess-trainer-mcp-server"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🚀 下一步

1. 配置您的 MCP 主机
2. 重启 MCP 主机应用
3. 验证工具发现
4. 开始使用棋类分析功能！

如有问题，请查看 [GitHub Issues](https://github.com/modenl/stockfishmcp/issues) 或提交新的问题报告。 