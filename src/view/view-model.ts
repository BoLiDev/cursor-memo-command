/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { LocalService } from "../services/local-service";
import { CloudService } from "../services/cloud-service";
import { CategoryTreeItem, CategoryGroupTreeItem } from "./tree-items";
import { Category } from "../models/category";

/**
 * Manages the data state for the TreeView
 */
export class MemoTreeViewModel {
  private localCommands: MemoItem[] = [];
  private cloudCommands: MemoItem[] = [];
  private localCategories: Category[] = [];
  private cloudCategoriesSet: Set<string> = new Set();

  private localCategoryNodes: Map<string, CategoryTreeItem> = new Map();
  private cloudCategoryNodes: Map<string, CategoryTreeItem> = new Map();

  private localGroupNode: CategoryGroupTreeItem;
  private cloudGroupNode: CategoryGroupTreeItem;

  private _onDidViewModelUpdate = new vscode.EventEmitter<void>();
  readonly onDidViewModelUpdate: vscode.Event<void> =
    this._onDidViewModelUpdate.event;

  private disposables: vscode.Disposable[] = [];

  /**
   * Constructor
   * @param localDataService Service for local data
   * @param cloudStoreService Service for cloud data
   */
  constructor(
    private localDataService: LocalService,
    private cloudStoreService: CloudService
  ) {
    // Initialize group nodes
    this.localGroupNode = new CategoryGroupTreeItem(
      "Local",
      vscode.TreeItemCollapsibleState.Expanded,
      false
    );
    this.cloudGroupNode = new CategoryGroupTreeItem(
      "Cloud",
      vscode.TreeItemCollapsibleState.Expanded,
      true
    );

    this.disposables.push(
      this.localDataService.onDidCommandsChange(() => {
        this.update();
      }),
      this.localDataService.onDidCategoriesChange(() => {
        this.update();
      }),
      this.cloudStoreService.onDidCloudCommandsChange(() => {
        this.update();
      })
    );

    this.update();
  }

  /**
   * Update the view model state from the data services
   */
  public update(): void {
    // Fetch latest data
    this.localCommands = this.localDataService.getCommands();
    this.cloudCommands = this.cloudStoreService.getCloudCommands();
    this.localCategories = this.localDataService.getCategories();

    // Update cloud categories set
    this.cloudCategoriesSet.clear();
    this.cloudCommands.forEach((cmd) => {
      this.cloudCategoriesSet.add(
        cmd.categoryId || this.localDataService.getDefaultCategoryId()
      );
    });

    // Rebuild category nodes
    this.rebuildCategoryNodes();
    this._onDidViewModelUpdate.fire();
  }

  /**
   * Dispose of event listeners when the view model is no longer needed.
   */
  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidViewModelUpdate.dispose();
  }

  /**
   * Check if there are any local commands or categories (excluding default if empty).
   * @returns True if local data exists, false otherwise.
   */
  public hasLocalData(): boolean {
    const hasNonDefaultCategories = this.localCategories.some(
      (cat) => cat.id !== this.localDataService.getDefaultCategoryId()
    );
    return this.localCommands.length > 0 || hasNonDefaultCategories;
  }

  /**
   * Rebuilds the internal maps of category tree items.
   */
  private rebuildCategoryNodes(): void {
    this.localCategoryNodes.clear();
    this.cloudCategoryNodes.clear();

    this.localCategories.forEach((category) => {
      const items = this.getLocalCategoryItems(category.id);
      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
      this.localCategoryNodes.set(
        category.id,
        new CategoryTreeItem(category, collapsibleState, false)
      );
    });

    this.cloudCategoriesSet.forEach((catId) => {
      const items = this.getCloudCategoryItems(catId);

      // Avoid duplicating the "Default" category node if it exists locally and has no cloud items
      if (
        catId === this.localDataService.getDefaultCategoryId() &&
        this.localCategoryNodes.has(catId) &&
        !items.length
      ) {
        return;
      }
      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
      // Use the name from local categories if available, otherwise use the ID as name
      const categoryName =
        this.localCategories.find((cat) => cat.id === catId)?.name ?? catId;
      this.cloudCategoryNodes.set(
        catId,
        new CategoryTreeItem(
          { id: catId, name: categoryName },
          collapsibleState,
          true
        )
      );
    });

    // --- Update Group Node States ---
    const localCollapsibleState = this.hasLocalData()
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None; // Keep expanded if it has data, otherwise no expansion needed
    this.localGroupNode = new CategoryGroupTreeItem(
      this.localGroupNode.label!, // Reuse label
      localCollapsibleState,
      false
    );

    const cloudCollapsibleState =
      this.cloudCommands.length > 0 || this.cloudCategoryNodes.size > 0 // Use the updated cloudCategoryNodes map size
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed; // Keep collapsed if empty
    this.cloudGroupNode = new CategoryGroupTreeItem(
      this.cloudGroupNode.label!, // Reuse label
      cloudCollapsibleState,
      true
    );
  }

  public getLocalGroupNode(): CategoryGroupTreeItem {
    return this.localGroupNode;
  }

  public getCloudGroupNode(): CategoryGroupTreeItem {
    return this.cloudGroupNode;
  }

  public getSortedLocalCategories(): CategoryTreeItem[] {
    return Array.from(this.localCategoryNodes.values()).sort((a, b) => {
      const nameA = a.category?.name || "";
      const nameB = b.category?.name || "";
      return nameA.localeCompare(nameB);
    });
  }

  public getSortedCloudCategories(): CategoryTreeItem[] {
    const cloudCats = Array.from(this.cloudCategoryNodes.values())
      .filter((node) => {
        const isDefault =
          node.category.id === this.localDataService.getDefaultCategoryId();
        const existsLocally = this.localCategoryNodes.has(node.category.id);
        const hasCloudItems =
          this.getCloudCategoryItems(node.category.id).length > 0;

        if (isDefault && existsLocally) {
          return hasCloudItems;
        }
        return true;
      })
      .sort((a, b) => {
        const nameA = a.category?.name || "";
        const nameB = b.category?.name || "";
        return nameA.localeCompare(nameB);
      });
    return cloudCats;
  }

  public getLocalCategoryItems(categoryId: string): MemoItem[] {
    return this.localCommands
      .filter((item) => item.categoryId === categoryId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getCloudCategoryItems(categoryId: string): MemoItem[] {
    return this.cloudCommands
      .filter((item) => item.categoryId === categoryId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getCategoryNodeForItem(item: MemoItem): CategoryTreeItem | undefined {
    return item.isCloud
      ? this.cloudCategoryNodes.get(item.categoryId)
      : this.localCategoryNodes.get(item.categoryId);
  }
}
