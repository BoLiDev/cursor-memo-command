/** @format */

import { z } from "zod";
// import { MemoItem } from "../models/memo-item"; // Removed: No longer needed
// import { Category } from "../models/category"; // Removed: No longer needed

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
