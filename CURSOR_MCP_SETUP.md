# Chess Trainer MCP - Cursor 集成配置指南

## 📝 概述

本指南将帮助您将 Chess Trainer MCP Server 集成到 Cursor IDE 中，让您可以在编程时获得 AI 象棋教练的支持。

## 🚀 快速配置

### 步骤 1: 安装 Chess Trainer MCP

```bash
# 全局安装（推荐）
npm install -g chess-trainer-mcp

# 或使用 npx（无需安装）
npx chess-trainer-mcp --version
```

### 步骤 2: 配置 Cursor MCP

1. **打开 Cursor MCP 配置文件**：
   ```bash
   # macOS/Linux
   ~/.cursor/mcp.json
   
   # Windows
   %APPDATA%\Cursor\User\mcp.json
   ```

2. **添加 Chess Trainer MCP 配置**：
   ```json
   {
     "mcpServers": {
       "chess-trainer-mcp": {
         "transportType": "stdio",
         "command": "npx",
         "args": ["chess-trainer-mcp"]
       }
     }
   }
   ```

3. **如果已有其他 MCP 服务器，将配置合并**：
   ```json
   {
     "mcpServers": {
       "existing-mcp": {
         "transportType": "sse",
         "url": "http://localhost:8040/cursor/sse"
       },
       "chess-trainer-mcp": {
         "transportType": "stdio",
         "command": "npx",
         "args": ["chess-trainer-mcp"]
       }
     }
   }
   ```

### 步骤 3: 重启 Cursor

重启 Cursor IDE 以加载新的 MCP 配置。

### 步骤 4: 验证连接

1. 打开 Cursor
2. 在聊天中询问关于象棋的问题，如：
   - "Help me analyze this chess position: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR"
   - "What's the best opening move in chess?"
   - "Explain the Italian Game opening"

## 🔧 高级配置选项

### 自定义端口配置
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["chess-trainer-mcp", "--port", "3457"]
    }
  }
}
```

### 禁用 MCP 集成（仅本地使用）
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["chess-trainer-mcp", "--no-mcp"]
    }
  }
}
```

### 环境变量配置
```json
{
  "mcpServers": {
    "chess-trainer-mcp": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["chess-trainer-mcp"],
      "env": {
        "PORT": "3456",
        "MCP_ENABLED": "true",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## 🎯 使用场景

### 1. 象棋算法开发
- 在开发象棋相关代码时获得实时分析
- 验证走法的正确性
- 获得位置评估建议

### 2. 游戏逻辑验证
- 测试象棋引擎的走法生成
- 验证 FEN 字符串的正确性
- 分析游戏状态

### 3. 学习象棋编程
- 理解象棋算法的实现
- 学习位置评估函数
- 掌握 UCI 协议

## 🛠️ 可用功能

通过 Cursor MCP 集成，您可以访问：

### 分析功能
- **位置分析**：分析任何象棋位置
- **最佳走法**：获得引擎推荐的最佳走法
- **评估分数**：获得位置的数值评估

### 教育功能
- **开局理论**：学习常见开局
- **中局策略**：理解中局原则
- **残局技巧**：掌握基本残局

### 技术支持
- **FEN 解析**：解释 FEN 字符串
- **PGN 处理**：处理 PGN 格式的棋谱
- **UCI 命令**：理解 UCI 协议命令

## 📚 示例对话

### 位置分析
```
用户：分析这个象棋位置：rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1

MCP：这是标准的 1.e4 开局位置。白方控制了中心的重要格子，黑方有几个良好的回应：
- e5（对称控制中心）
- c5（西西里防御）
- e6（法兰西防御）
- c6（卡罗-康防御）
当前评估约为 +0.3，白方略优。
```

### 代码审查
```
用户：这个移动生成函数是否正确？
[代码片段]

MCP：让我分析这个移动生成函数...
[详细的代码分析和改进建议]
```

## 🔍 故障排除

### 常见问题

1. **MCP 服务器无法启动**
   ```bash
   # 检查 npm 全局安装
   npm list -g chess-trainer-mcp
   
   # 重新安装
   npm install -g chess-trainer-mcp
   ```

2. **端口冲突**
   ```json
   "args": ["chess-trainer-mcp", "--port", "3457"]
   ```

3. **权限问题**
   ```bash
   # macOS/Linux
   sudo npm install -g chess-trainer-mcp
   ```

### 调试步骤

1. **验证安装**：
   ```bash
   npx chess-trainer-mcp --help
   ```

2. **检查配置**：
   ```bash
   cat ~/.cursor/mcp.json
   ```

3. **查看日志**：
   - 打开 Cursor 开发者工具
   - 查看 Console 中的 MCP 相关日志

## 🤝 支持与反馈

- **GitHub Issues**: [报告问题](https://github.com/modenl/stockfishmcp/issues)
- **文档**: [项目文档](https://github.com/modenl/stockfishmcp#readme)
- **更新**: 定期运行 `npm update -g chess-trainer-mcp` 获取最新版本

## 📄 相关文档

- [Chess Trainer MCP 主文档](README.md)
- [部署指南](DEPLOYMENT.md)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Cursor 官方文档](https://cursor.sh/docs) 