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
  private cloudCategoriesIds: string[] = [];

  // Category ID prefixes to prevent collision between cloud and local categories
  private static CLOUD_PREFIX = "cloud:";
  private static LOCAL_PREFIX = "local:";

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
      }),
      this.cloudStoreService.onDidCloudCategoriesChange(() => {
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
    this.cloudCategoriesIds = this.cloudStoreService.getCloudCategories();

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
   * Add prefix to category ID to avoid collisions between cloud and local categories
   * @param id Original category ID
   * @param isCloud Whether the category is a cloud category
   * @returns Prefixed category ID
   */
  private getPrefixedCategoryId(id: string, isCloud: boolean): string {
    return isCloud
      ? `${MemoTreeViewModel.CLOUD_PREFIX}${id}`
      : `${MemoTreeViewModel.LOCAL_PREFIX}${id}`;
  }

  /**
   * Remove prefix from category ID to get the original ID
   * @param prefixedId Prefixed category ID
   * @returns Original category ID
   */
  private getOriginalCategoryId(prefixedId: string): string {
    if (prefixedId.startsWith(MemoTreeViewModel.CLOUD_PREFIX)) {
      return prefixedId.substring(MemoTreeViewModel.CLOUD_PREFIX.length);
    }
    if (prefixedId.startsWith(MemoTreeViewModel.LOCAL_PREFIX)) {
      return prefixedId.substring(MemoTreeViewModel.LOCAL_PREFIX.length);
    }
    return prefixedId;
  }

  /**
   * Rebuilds the internal maps of category tree items.
   */
  private rebuildCategoryNodes(): void {
    this.localCategoryNodes.clear();
    this.cloudCategoryNodes.clear();

    // Build local category nodes
    this.localCategories.forEach((category) => {
      const items = this.getLocalCategoryItems(category.id);
      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

      // Use prefixed ID for map key
      const prefixedId = this.getPrefixedCategoryId(category.id, false);
      this.localCategoryNodes.set(
        prefixedId,
        new CategoryTreeItem(category, collapsibleState, false)
      );
    });

    // Build cloud category nodes
    this.cloudCategoriesIds.forEach((catId) => {
      const items = this.getCloudCategoryItems(catId);

      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

      // Create category object from cloud category ID
      const category: Category = {
        id: catId,
        name:
          catId === this.cloudStoreService.getDefaultCategoryId()
            ? "Default (Cloud)"
            : catId,
      };

      // Use prefixed ID for map key
      const prefixedId = this.getPrefixedCategoryId(catId, true);
      this.cloudCategoryNodes.set(
        prefixedId,
        new CategoryTreeItem(category, collapsibleState, true)
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
    return Array.from(this.cloudCategoryNodes.values()).sort((a, b) => {
      const nameA = a.category?.name || "";
      const nameB = b.category?.name || "";
      return nameA.localeCompare(nameB);
    });
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
    if (item.isCloud) {
      const prefixedId = this.getPrefixedCategoryId(item.categoryId, true);
      return this.cloudCategoryNodes.get(prefixedId);
    } else {
      const prefixedId = this.getPrefixedCategoryId(item.categoryId, false);
      return this.localCategoryNodes.get(prefixedId);
    }
  }
}
