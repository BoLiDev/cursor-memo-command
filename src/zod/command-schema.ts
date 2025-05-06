/** @format */

import { z } from "zod";
import { MemoItem } from "../models/memo-item"; // Import MemoItem
import { Category } from "../models/category"; // Import Category

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
): Omit<MemoItem, "isCloud">[] {
  const now = Date.now();
  const items: Omit<MemoItem, "isCloud">[] = [];

  Object.entries(commandData).forEach(([categoryName, commands]) => {
    Object.entries(commands).forEach(([alias, commandObj]) => {
      const command = commandObj.content;
      const label =
        command.length > 30 ? `${command.slice(0, 30)}...` : command;

      const categoryId = categoryName;

      items.push({
        id: `cmd_${now}_${Math.random().toString().slice(2)}`,
        label,
        command,
        timestamp: now,
        alias,
        categoryId: categoryId,
      });
    });
  });

  return items;
}

// 从 MemoItem 数组转换为命令数据结构
export function fromMemoItems(
  items: MemoItem[],
  categories?: Category[]
): z.infer<typeof CommandsStructureSchema> {
  const result: z.infer<typeof CommandsStructureSchema> = {};
  const categoryMap = new Map(categories?.map((cat) => [cat.id, cat.name]));

  items.forEach((item) => {
    const categoryName = categoryMap?.get(item.categoryId) ?? item.categoryId;
    const alias = item.alias || item.label || "未命名命令";

    if (!result[categoryName]) {
      result[categoryName] = {};
    }

    result[categoryName][alias] = {
      content: item.command,
    };
  });

  return result;
}
