/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "../services/local-data-service";
import { CloudStoreService } from "../services/cloud-store-service";
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

  /**
   * Constructor
   * @param localDataService Service for local data
   * @param cloudStoreService Service for cloud data
   */
  constructor(
    private localDataService: LocalMemoService,
    private cloudStoreService: CloudStoreService
  ) {
    // Initialize group nodes
    this.localGroupNode = new CategoryGroupTreeItem(
      "Local",
      vscode.TreeItemCollapsibleState.Expanded,
      false // isCloud = false
    );
    this.cloudGroupNode = new CategoryGroupTreeItem(
      "Cloud",
      vscode.TreeItemCollapsibleState.Expanded,
      true // isCloud = true
    );
    this.update(); // Initial data load
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
  }

  /**
   * Check if there are any local commands or categories (excluding default if empty).
   * @returns True if local data exists, false otherwise.
   */
  public hasLocalData(): boolean {
    // Check if there are commands or non-default categories
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

    // --- Create Local Category Nodes ---
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

    // --- Create Cloud Category Nodes ---
    this.cloudCategoriesSet.forEach((catId) => {
      const items = this.getCloudCategoryItems(catId);

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
      this.cloudCategoryNodes.set(
        catId,
        new CategoryTreeItem({ id: catId, name: catId }, collapsibleState, true)
      );
    });

    // --- Update Group Node States ---
    const localCollapsibleState = this.hasLocalData()
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    this.localGroupNode = new CategoryGroupTreeItem(
      this.localGroupNode.label!, // Reuse label
      localCollapsibleState, // Set state during creation
      false
    );

    const cloudCollapsibleState =
      this.cloudCommands.length > 0 || this.cloudCategoriesSet.size > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed; // Keep collapsed if empty
    this.cloudGroupNode = new CategoryGroupTreeItem(
      this.cloudGroupNode.label!, // Reuse label
      cloudCollapsibleState, // Set state during creation
      true
    );
  }

  // --- Getters for TreeDataProvider ---

  public getLocalGroupNode(): CategoryGroupTreeItem {
    return this.localGroupNode;
  }

  public getCloudGroupNode(): CategoryGroupTreeItem {
    return this.cloudGroupNode;
  }

  public getSortedLocalCategories(): CategoryTreeItem[] {
    return Array.from(this.localCategoryNodes.values()).sort((a, b) =>
      a.category.name.localeCompare(b.category.name)
    );
  }

  public getSortedCloudCategories(): CategoryTreeItem[] {
    const cloudCats = Array.from(this.cloudCategoryNodes.values())
      .filter((node) => {
        if (
          node.category.id === this.localDataService.getDefaultCategoryId() &&
          this.localCategoryNodes.has(node.category.id)
        ) {
          return this.getCloudCategoryItems(node.category.id).length > 0;
        }
        return true;
      })
      .sort((a, b) => a.category.name.localeCompare(b.category.name));
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
