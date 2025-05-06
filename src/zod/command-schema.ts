/** @format */

import { z } from "zod";

// 单个命令内容的 schema
export const CommandContentSchema = z.object({
  content: z.string(),
});

// 分类内所有命令的 schema (别名 -> 命令内容)
export const CategoryCommandsSchema = z.record(
  z.string(),
  CommandContentSchema
);

// 整个命令集合的 schema (分类 -> 别名命令集)
export const CommandsStructureSchema = z.record(
  z.string(),
  CategoryCommandsSchema
);

/**
 * 将命令数据序列化为JSON字符串
 * @param data 命令数据结构
 * @returns 格式化的JSON字符串
 */
export function serializeCommands(
  data: z.infer<typeof CommandsStructureSchema>
): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 将JSON字符串解析为命令数据结构
 * @param jsonData JSON字符串
 * @returns 解析后的命令数据结构
 * @throws 如果解析失败
 */
export function parseCommands(
  jsonData: string
): z.infer<typeof CommandsStructureSchema> {
  try {
    const data = JSON.parse(jsonData);
    const validationResult = CommandsStructureSchema.safeParse(data);

    if (!validationResult.success) {
      throw new Error(
        `Invalid command data format: ${validationResult.error.message}`
      );
    }
    return validationResult.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

// 为了兼容内部模型，需要将命令数据转换为 MemoItem 数组
export function toMemoItems(
  commandData: z.infer<typeof CommandsStructureSchema>
): Array<{
  id: string;
  label: string;
  command: string;
  timestamp: number;
  alias: string;
  category: string;
}> {
  const now = Date.now();
  const items: Array<{
    id: string;
    label: string;
    command: string;
    timestamp: number;
    alias: string;
    category: string;
  }> = [];

  Object.entries(commandData).forEach(([category, commands]) => {
    Object.entries(commands).forEach(([alias, commandObj]) => {
      const command = commandObj.content;
      const label =
        command.length > 30 ? `${command.slice(0, 30)}...` : command;

      items.push({
        id: `cmd_${now}_${Math.random().toString().slice(2)}`,
        label,
        command,
        timestamp: now,
        alias,
        category,
      });
    });
  });

  return items;
}

// 从 MemoItem 数组转换为命令数据结构
export function fromMemoItems(
  items: Array<{
    command: string;
    category: string;
    alias?: string;
    label?: string;
  }>
): z.infer<typeof CommandsStructureSchema> {
  const result: z.infer<typeof CommandsStructureSchema> = {};

  items.forEach((item) => {
    const category = item.category;
    const alias = item.alias || item.label || "未命名命令";

    if (!result[category]) {
      result[category] = {};
    }

    result[category][alias] = {
      content: item.command,
    };
  });

  return result;
}
