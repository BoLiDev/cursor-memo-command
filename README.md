<!-- @format -->

# GitLab文件访问模块

一个简单、高效的GitLab API客户端，用于获取项目中的文件和目录内容。

## 特性

- 获取GitLab项目中的文件内容
- 获取GitLab项目中的目录内容
- 自动获取项目的默认分支
- 类型安全（使用Zod进行运行时类型验证）

## 安装

```bash
npm install node-fetch zod @types/node-fetch
```

## 使用示例

### 获取文件内容

```typescript
import { getFileContent } from "./gitlab";

// 设置环境变量
process.env.GITLAB_PERSONAL_ACCESS_TOKEN = "your_token_here";
process.env.GITLAB_API_URL = "https://gitlab.com/api/v4"; // 可选，默认使用gitlab.com

// 获取文件内容
const projectId = "namespace/project";
const filePath = "path/to/file.js";
const branch = "main"; // 可选，如果不提供则使用项目默认分支

try {
  const content = await getFileContent(projectId, filePath, branch);

  // 如果返回的是文件
  if (!Array.isArray(content)) {
    console.log(`文件名: ${content.file_name}`);
    console.log(`大小: ${content.size} 字节`);

    // 解码Base64内容
    const decodedContent = Buffer.from(content.content, "base64").toString(
      "utf-8"
    );
    console.log(`内容: ${decodedContent}`);
  }
} catch (error) {
  console.error("获取文件失败:", error);
}
```

### 获取目录内容

```typescript
import { getFileContent } from "./gitlab";

// 设置环境变量
process.env.GITLAB_PERSONAL_ACCESS_TOKEN = "your_token_here";

// 获取目录内容
const projectId = "namespace/project";
const directoryPath = "path/to/directory";

try {
  const content = await getFileContent(projectId, directoryPath);

  // 如果返回的是目录
  if (Array.isArray(content)) {
    console.log("目录内容:");
    content.forEach((item) => {
      console.log(`- ${item.name} (${item.type}): ${item.path}`);
    });
  }
} catch (error) {
  console.error("获取目录失败:", error);
}
```

## API

### getFileContent(projectId, filePath, ref?)

获取GitLab项目中的文件或目录内容。

**参数:**

- `projectId` (string): 项目ID或URL编码的路径（例如 'namespace/project'）
- `filePath` (string): 要获取内容的文件或目录路径
- `ref` (string, 可选): 分支、标签或提交的引用，默认为项目的默认分支

**返回值:**

返回一个Promise，解析为文件内容或目录内容列表。

## 环境变量

- `GITLAB_PERSONAL_ACCESS_TOKEN`: 必需。GitLab个人访问令牌，用于API认证。
- `GITLAB_API_URL`: 可选。GitLab API URL，默认为 'https://gitlab.com/api/v4'。

## 类型

模块包含以下主要类型定义：

```typescript
// 文件内容
type GitLabFileContent = {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string; // Base64编码
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
  execute_filemode?: boolean;
};

// 目录项
type GitLabDirectoryContent = {
  name: string;
  path: string;
  type: string;
  mode: string;
  id: string;
  web_url: string;
};

// 统一内容类型
type GitLabContent = GitLabFileContent | GitLabDirectoryContent[];
```

## License

MIT
