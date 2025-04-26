<!-- @format -->

# Cursor Memo Plugin

Cursor 聊天指令备忘录插件，用于保存和复用常用的 Cursor 聊天指令。

## 功能

- 保存常用的 Cursor 聊天指令
- 在侧边栏显示指令列表
- 点击指令自动复制到剪贴板，方便粘贴到 Cursor Chatbox

## 使用方法

1. 打开 Cursor 编辑器
2. 通过命令面板（按 Ctrl+Shift+P 或 Cmd+Shift+P）执行 `Cursor Memo: 保存当前指令` 命令
3. 输入或粘贴要保存的指令
4. 在侧边栏的 "指令备忘录" 视图中查看保存的指令
5. 点击指令即可复制到剪贴板，然后粘贴到 Cursor Chatbox

## 开发

### 准备环境

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监视模式
npm run watch
```

### 测试插件

按 F5 启动调试会话，将打开一个新的 VS Code 窗口，其中已加载此插件。

### 打包插件

```bash
# 安装 vsce 工具
npm install -g vsce

# 打包插件
vsce package
```

## 许可

MIT
