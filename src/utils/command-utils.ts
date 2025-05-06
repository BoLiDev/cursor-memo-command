/** @format */

import { MemoItem } from "../models/memo-item";

/**
 * 确定两个命令是否重复
 * 如果两个命令的 categoryId, alias/label 和 command(内容) 都相同，则视为重复
 * @param cmd1 第一个命令
 * @param cmd2 第二个命令
 * @returns 是否重复
 */
export function isSameCommand(cmd1: MemoItem, cmd2: MemoItem): boolean {
  // 使用别名(alias)如果存在，否则使用标签(label)
  const name1 = cmd1.alias || cmd1.label;
  const name2 = cmd2.alias || cmd2.label;

  return (
    cmd1.categoryId === cmd2.categoryId &&
    name1 === name2 &&
    cmd1.command === cmd2.command
  );
}

/**
 * 检查命令是否在已有命令集合中存在重复
 * @param newCmd 要检查的新命令
 * @param existingCmds 已有的命令集合
 * @returns 如果存在重复返回true，否则返回false
 */
export function isDuplicateCommand(
  newCmd: MemoItem,
  existingCmds: MemoItem[]
): boolean {
  return existingCmds.some((cmd) => isSameCommand(newCmd, cmd));
}

/**
 * 从命令列表中移除重复的命令
 * @param commands 要去重的命令列表
 * @returns 去重后的命令列表
 */
export function removeDuplicateCommands(commands: MemoItem[]): MemoItem[] {
  const uniqueCommands: MemoItem[] = [];

  for (const cmd of commands) {
    // 仅当该命令在结果列表中不存在重复项时才添加
    if (!isDuplicateCommand(cmd, uniqueCommands)) {
      uniqueCommands.push(cmd);
    }
  }

  return uniqueCommands;
}

/**
 * 从要导入的命令列表中移除与已有命令重复的命令
 * @param newCommands 要导入的新命令列表
 * @param existingCommands 已有的命令列表
 * @returns 去除重复后的新命令列表
 */
export function filterOutDuplicates(
  newCommands: MemoItem[],
  existingCommands: MemoItem[]
): MemoItem[] {
  return newCommands.filter(
    (newCmd) => !isDuplicateCommand(newCmd, existingCommands)
  );
}
