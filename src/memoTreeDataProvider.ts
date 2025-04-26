/** @format */

import * as vscode from "vscode";
import { MemoItem } from "./extension";

/**
 * TreeView 数据提供者，负责将指令列表显示在侧边栏
 */
export class MemoTreeDataProvider implements vscode.TreeDataProvider<MemoItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    MemoItem | undefined | null | void
  > = new vscode.EventEmitter<MemoItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    MemoItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private memoItems: MemoItem[] = [];

  constructor(initialItems: MemoItem[]) {
    this.memoItems = initialItems;
  }

  /**
   * 刷新 TreeView 数据
   */
  refresh(newItems: MemoItem[]): void {
    this.memoItems = newItems;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 获取树节点
   */
  getTreeItem(element: MemoItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    );

    // 设置项目的描述（可选）
    treeItem.description = new Date(element.timestamp).toLocaleString();

    // 设置图标（可选）
    treeItem.iconPath = new vscode.ThemeIcon("note");

    // 设置工具提示
    treeItem.tooltip = element.command;

    // 设置上下文值，用于在右键菜单中区分项目
    treeItem.contextValue = "memoItem";

    return treeItem;
  }

  /**
   * 获取子节点
   */
  getChildren(element?: MemoItem): MemoItem[] {
    // 如果提供了 element，则返回其子节点
    // 在我们的例子中，指令列表是扁平的，没有子节点
    if (element) {
      return [];
    }

    // 返回根级别的项目
    return this.memoItems.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 获取父节点
   */
  getParent(element: MemoItem): vscode.ProviderResult<MemoItem> {
    return null; // 扁平结构，没有父节点
  }
}
