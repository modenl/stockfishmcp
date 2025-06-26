# Chess Trainer MCP 使用指南

## 🎮 快速开始

Chess Trainer MCP 提供了完整的象棋训练工作流程，包括：
1. **启动Web UI** - 可视化界面
2. **游戏设置** - 配置AI强度、模式等
3. **对局控制** - 走棋、分析、建议

## 📋 主要工具

### 1. `launch_chess_trainer` - 启动训练器
```bash
# 启动Web UI (自动打开浏览器)
launch_chess_trainer

# 指定端口，不自动打开浏览器
launch_chess_trainer port=3456 auto_open_browser=false
```

**功能**:
- ✅ 启动Web服务器
- ✅ 自动检测是否已运行
- ✅ 可选择自动打开浏览器
- ✅ 提供健康检查

### 2. `create_game_with_settings` - 创建游戏
```bash
# 创建1800 ELO AI对局 (您执白)
create_game_with_settings game_id="my_game" ai_elo=1800

# 完整参数示例
create_game_with_settings \
  game_id="advanced_game" \
  mode="human_vs_ai" \
  player_color="white" \
  ai_elo=2000 \
  ai_time_limit=1500
```

**参数说明**:
- `game_id`: 游戏唯一标识符
- `mode`: `human_vs_ai` 或 `human_vs_human`
- `player_color`: `white` (先手) 或 `black` (后手)
- `ai_elo`: AI强度 800-2800
- `ai_time_limit`: AI思考时间(毫秒)

### 3. `make_move` - 走棋
```bash
# 标准走法
make_move game_id="my_game" move="e2e4"
make_move game_id="my_game" move="Nf3"
make_move game_id="my_game" move="O-O"  # 王车易位

# 兵的升变
make_move game_id="my_game" move="e7e8Q"  # 升后
```

### 4. `get_game_state` - 检查状态
```bash
get_game_state game_id="my_game"
```

**返回信息**:
- 当前FEN位置
- 轮到谁走
- 棋步历史
- 游戏状态 (进行中/结束)

### 5. `suggest_move` - 获取建议
```bash
# 默认深度分析
suggest_move game_id="my_game"

# 深度分析 (更强但更慢)
suggest_move game_id="my_game" depth=20
```

## 🚀 完整工作流程示例

### 场景: 与1800 ELO AI对局

```bash
# 1. 启动Chess Trainer
launch_chess_trainer

# 2. 创建1800 ELO对局 (您执白)
create_game_with_settings \
  game_id="vs_ai_1800" \
  mode="human_vs_ai" \
  player_color="white" \
  ai_elo=1800

# 3. 开局 - 王兵开局
make_move game_id="vs_ai_1800" move="e2e4"

# 4. 检查AI的回应
get_game_state game_id="vs_ai_1800"

# 5. 继续走棋
make_move game_id="vs_ai_1800" move="Nf3"

# 6. 如果需要帮助，获取建议
suggest_move game_id="vs_ai_1800" depth=15
```

## 🎯 不同强度AI对局

### 初学者 (800-1200 ELO)
```bash
create_game_with_settings \
  game_id="beginner" \
  ai_elo=1000 \
  ai_time_limit=500
```

### 中级 (1200-1800 ELO)  
```bash
create_game_with_settings \
  game_id="intermediate" \
  ai_elo=1500 \
  ai_time_limit=1000
```

### 高级 (1800-2400 ELO)
```bash
create_game_with_settings \
  game_id="advanced" \
  ai_elo=2100 \
  ai_time_limit=2000
```

### 大师级 (2400+ ELO)
```bash
create_game_with_settings \
  game_id="master" \
  ai_elo=2600 \
  ai_time_limit=3000
```

## 🌐 Web界面集成

启动后访问: **http://localhost:3456**

**Web界面功能**:
- 📱 响应式棋盘
- 🎮 拖拽走棋
- 📊 实时状态显示
- 🔄 自动同步MCP命令
- 📝 棋步历史回放

## 🔧 故障排除

### 常见问题

**1. 连接失败**
```
❌ Cannot connect to Chess Trainer web server
```
**解决**: 先运行 `launch_chess_trainer`

**2. 端口占用**
```
❌ Port 3456 already in use
```
**解决**: 使用不同端口或停止占用进程

**3. 无效走法**
```
❌ Invalid move: xyz
```
**解决**: 检查走法格式 (e2e4, Nf3, O-O等)

### 调试命令

```bash
# 检查服务器状态
curl http://localhost:3456/api/health

# 查看活跃游戏
list_active_games

# 重置游戏
reset_game game_id="my_game"
```

## 📚 高级用法

### 分析特定位置
```bash
# 从FEN位置开始
analyze_position fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

# 评估走法质量
evaluate_move fen="..." move="e2e4"
```

### 开局学习
```bash
# 解释开局
explain_opening moves="e4,e5,Nf3" opening_name="Italian Game"

# 获取最佳走法
get_best_moves fen="..." count=5
```

### 导出游戏
```bash
# 生成PGN
generate_pgn moves="e4,e5,Nf3,Nc6" white_player="Player" black_player="AI"
```

## 🎯 使用技巧

1. **循序渐进**: 从较低ELO开始，逐步提高
2. **分析复盘**: 使用 `suggest_move` 检查您的走法
3. **多种开局**: 尝试不同的开局走法
4. **时间控制**: 调整AI思考时间平衡强度和速度
5. **Web界面**: 结合命令行和可视化界面使用

## 🔗 相关文档

- [MODERN_UI_FEATURES.md](./MODERN_UI_FEATURES.md) - UI功能详解
- [README.md](./README.md) - 项目概述
- [server/mcpServer.js](./server/mcpServer.js) - MCP实现细节

---

**🎮 开始您的象棋训练之旅！** 