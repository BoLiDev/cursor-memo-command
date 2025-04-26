/** @format */

import * as vscode from "vscode";
import { MemoItem } from "./extension";

/**
 * 分类节点类型
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = "category";
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

/**
 * TreeView data provider for displaying command list in the sidebar
 */
export class MemoTreeDataProvider
  implements vscode.TreeDataProvider<CategoryTreeItem | MemoItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    CategoryTreeItem | MemoItem | undefined | null | void
  > = new vscode.EventEmitter<
    CategoryTreeItem | MemoItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    CategoryTreeItem | MemoItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private memoItems: MemoItem[] = [];
  private commandCallback: string | undefined;
  private categories: Map<string, MemoItem[]> = new Map();

  constructor(initialItems: MemoItem[]) {
    this.memoItems = initialItems;
    // 调用更新分类，内部会处理分类加载
    this.updateCategories();

    // 设置一个延迟触发更新的备用方案，确保视图最终会显示
    setTimeout(() => {
      this._onDidChangeTreeData.fire();
    }, 1000);
  }

  /**
   * 更新分类映射
   */
  private updateCategories(): void {
    // 清空当前分类映射
    this.categories.clear();

    // 首先获取全局分类列表
    // 注意：这里需要访问extension.ts中的全局变量，我们通过命令获取
    vscode.commands
      .executeCommand<string[]>("cursor-memo.getCategories")
      .then((allCategories) => {
        if (allCategories && Array.isArray(allCategories)) {
          // 为所有分类创建空数组，即使没有命令的分类也会显示
          allCategories.forEach((category) => {
            if (!this.categories.has(category)) {
              this.categories.set(category, []);
            }
          });

          // 按分类分组命令
          this.memoItems.forEach((item) => {
            const category = item.category || "default";
            if (!this.categories.has(category)) {
              this.categories.set(category, []);
            }
            this.categories.get(category)?.push(item);
          });

          // 对每个分类内的命令按时间戳排序
          for (const [category, items] of this.categories.entries()) {
            this.categories.set(
              category,
              items.sort((a, b) => b.timestamp - a.timestamp)
            );
          }

          // 触发视图更新
          this._onDidChangeTreeData.fire();
        }
      });
  }

  /**
   * Set command to execute when item is clicked
   */
  setCommandCallback(commandId: string): void {
    this.commandCallback = commandId;
  }

  /**
   * Refresh TreeView data
   */
  refresh(newItems: MemoItem[]): void {
    this.memoItems = newItems;
    // 更新分类，内部会触发视图刷新
    this.updateCategories();
  }

  /**
   * Get tree item
   */
  getTreeItem(element: CategoryTreeItem | MemoItem): vscode.TreeItem {
    // 如果是分类项，直接返回
    if (element instanceof CategoryTreeItem) {
      return element;
    }

    // MemoItem处理
    // Use alias if available, otherwise use label
    const displayName = element.alias || element.label;

    const treeItem = new vscode.TreeItem(
      displayName,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = new Date(element.timestamp).toLocaleString();
    treeItem.iconPath = new vscode.ThemeIcon("note");

    // Show command text in tooltip for better usability
    treeItem.tooltip = element.command;

    // Set context value for menu contributions
    treeItem.contextValue = "memoItem";

    if (this.commandCallback) {
      treeItem.command = {
        command: this.commandCallback,
        title: "Execute Command",
        arguments: [element],
      };
    }

    return treeItem;
  }

  /**
   * Get children
   */
  getChildren(
    element?: CategoryTreeItem | MemoItem
  ): (CategoryTreeItem | MemoItem)[] {
    // 根节点，返回所有分类
    if (!element) {
      // 创建分类树节点
      const categoryNodes: CategoryTreeItem[] = [];

      // 按字母顺序排序分类（确保default排在最后）
      const sortedCategories = Array.from(this.categories.keys()).sort(
        (a, b) => {
          if (a === "default") return 1;
          if (b === "default") return -1;
          return a.localeCompare(b);
        }
      );

      // 为每个分类创建树节点
      for (const category of sortedCategories) {
        categoryNodes.push(
          new CategoryTreeItem(
            category,
            vscode.TreeItemCollapsibleState.Expanded
          )
        );
      }

      return categoryNodes;
    }

    // 如果是分类节点，返回该分类下的所有命令
    if (element instanceof CategoryTreeItem) {
      return this.categories.get(element.label) || [];
    }

    // 命令节点没有子节点
    return [];
  }

  /**
   * Get parent
   */
  getParent(
    element: CategoryTreeItem | MemoItem
  ): vscode.ProviderResult<CategoryTreeItem | MemoItem> {
    // 如果是命令项，返回其所属分类
    if (!(element instanceof CategoryTreeItem)) {
      const categoryName = element.category || "default";
      return new CategoryTreeItem(
        categoryName,
        vscode.TreeItemCollapsibleState.Expanded
      );
    }

    // 分类节点没有父节点
    return null;
  }
}
