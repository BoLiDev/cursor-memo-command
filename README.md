一个用于**复用和同步 Cursor Prompt** 的插件，当前仍处于 beta 阶段，任何问题欢迎联系 [@Li Bo 李博]。

- 插件仓库地址：[https://github.com/BoLiDev/cursor-memo-command](https://github.com/BoLiDev/cursor-memo-command)
- 所有公司相关信息均通过环境变量本地存储，当前开发在域外环境中进行，后续将迁移至内网

---

## 📦 安装方式

### 1. 下载插件

目前还没上架插件商店，需要手动安装

> 安装方式请参考 [Lark Docs](https://okg-block.sg.larksuite.com/wiki/MG5Owj9bSi5Plpkk9hDlwHLTgeh)

### 2. 域外安装

将打包得到的 `.vsix` 文件拖入 Cursor Extension 面板即可。

### 3. 域内使用

由于云同步基于内网 GitLab API，仅支持在**内网环境使用**；域外仍可正常使用本地功能。

> ❗ 若遇到无法保存或导出的问题，可能是通过错误方式打开了 DACS 应用：请不要通过 Spotlight 或 Dock 打开，而是通过 **DACS 应用程序列表** 正确启动。

---

## 🧩 使用指南

### 🗂 复用指令

1. **首次使用**：需创建一个文件夹用于添加指令
2. **添加指令**：悬停文件夹显示 ➕ 按钮，点击弹出输入框
   - 默认粘贴剪贴板内容，可手动编辑
   - 点击“保存”后可在视图中查看
3. **使用指令**：
   - 单击 → 自动复制到 Chat 输入框
   - 右键可执行额外操作：
     - 重命名
     - 删除
     - 移动至其他文件夹

---

### 💾 本地导入与导出

#### 📤 导出

1. 悬停 Local 分组标题栏，点击导出图标
2. 多选要导出的 Prompt
3. 插件将导出为 `.json` 格式的文件，可用于备份或分享

#### 📥 导入

1. 同样在 Local 分组标题栏点击导入图标
2. 选择目标文件夹
3. 自动导入并**去重**处理

---

### ☁️ 云同步（内网专用）

#### 配置 GitLab 密钥

1. 悬停 Cloud 分组标题栏，点击侧边的 `🔑` 图标
2. 输入并保存 GitLab Token
   - 密钥存储在 VSCode Context Secret Storage 中，确保安全

#### 上传至云端

1. 在 Local 分组标题栏点击云上传图标
2. 选择 Prompt，确认后将自动创建 GitLab Merge Request
3. 请联系 @Li Shaoyi 李绍懿 审核合并

#### 从云端下载

1. 点击 Cloud 分组的同步按钮
2. 弹出下拉框选择要导入的云端 Prompt
3. 导入成功后会归入 Cloud 分组

> 💡 云端 Prompt 属于团队资源，无法私自修改，通过 GitLab 权限控制
> 临时云端仓库地址：[`okfe-prompt`](https://gitlab.okg.com/okfe/demos/okfe-prompt)

---

### 🔍 搜索功能

- 点击插件标题栏 `🔍` 图标，弹出支持筛选的搜索框
- 支持搜索本地与已导入的云端 Prompt
- 点击结果即可一键添加到 Chat

---

## 🚀 应用场景示例

- **减少重复劳动**：如 Git 常用指令可保存，一键调用
- **固化流程**：将流程按顺序保存到文件夹，逐步点击执行
- **提升团队一致性**：PIC 可共享 Prompt，团队成员快速导入实现统一

---

## ❓ 常见问题

### 为什么不直接用 Project Rule？

Prompt 和 Rul **Rule 更偏向约束**（例如 Code Style、提交规范）

- **Prompt 更偏向需求表达**（如任务描述模板、常见命令）

只有高度通用的规范适合放入 Rule，而多数个性化场景建议使用 Prompt 形式复用。

---

## 🧪 状态

> 当前插件处于 Beta 阶段，欢迎反馈问题与建议
> 联系方式：[@Li Bo 李博]
