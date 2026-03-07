/**
 * Marketplace Manager for Obedience Benchmark Plugins
 *
 * Manages a local plugin registry, supports listing, searching, installing,
 * and registering plugins in the marketplace.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  keywords: string[];
  skills: string[];
  taskCount: number;
  domains: string[];
  installPath: string;
  pluginJsonPath: string;
  verified: boolean;
  featured: boolean;
  downloads: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
}

export interface MarketplaceRegistry {
  version: string;
  name: string;
  description: string;
  updatedAt: string;
  plugins: MarketplacePlugin[];
  categories: MarketplaceCategory[];
}

export interface SearchFilter {
  query?: string;
  category?: string;
  domains?: string[];
  verified?: boolean;
  featured?: boolean;
}

// ---------------------------------------------------------------------------
// Marketplace Manager
// ---------------------------------------------------------------------------

export class MarketplaceManager {
  private registryPath: string;
  private registry: MarketplaceRegistry | null = null;

  constructor(marketplaceDir: string) {
    this.registryPath = join(marketplaceDir, 'registry', 'registry.json');
  }

  async load(): Promise<MarketplaceRegistry> {
    if (this.registry) return this.registry;

    const raw = await readFile(this.registryPath, 'utf-8');
    this.registry = JSON.parse(raw) as MarketplaceRegistry;
    return this.registry;
  }

  async save(): Promise<void> {
    if (!this.registry) return;
    this.registry.updatedAt = new Date().toISOString();
    const dir = resolve(this.registryPath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8');
  }

  async listPlugins(): Promise<MarketplacePlugin[]> {
    const reg = await this.load();
    return reg.plugins;
  }

  async searchPlugins(filter: SearchFilter): Promise<MarketplacePlugin[]> {
    const reg = await this.load();
    let results = [...reg.plugins];

    if (filter.query) {
      const q = filter.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.keywords.some((k) => k.toLowerCase().includes(q)),
      );
    }

    if (filter.domains?.length) {
      results = results.filter((p) =>
        filter.domains!.some((d) => p.domains.includes(d)),
      );
    }

    if (filter.verified !== undefined) {
      results = results.filter((p) => p.verified === filter.verified);
    }

    if (filter.featured !== undefined) {
      results = results.filter((p) => p.featured === filter.featured);
    }

    return results;
  }

  async getPlugin(id: string): Promise<MarketplacePlugin | undefined> {
    const reg = await this.load();
    return reg.plugins.find((p) => p.id === id);
  }

  async registerPlugin(plugin: MarketplacePlugin): Promise<void> {
    const reg = await this.load();
    const existingIdx = reg.plugins.findIndex((p) => p.id === plugin.id);

    if (existingIdx >= 0) {
      reg.plugins[existingIdx] = { ...plugin, updatedAt: new Date().toISOString() };
    } else {
      reg.plugins.push({
        ...plugin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await this.save();
  }

  async removePlugin(id: string): Promise<boolean> {
    const reg = await this.load();
    const idx = reg.plugins.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    reg.plugins.splice(idx, 1);
    await this.save();
    return true;
  }

  async listCategories(): Promise<MarketplaceCategory[]> {
    const reg = await this.load();
    return reg.categories;
  }

  async registerFromPluginJson(pluginJsonPath: string, options?: {
    author?: string;
    license?: string;
    domains?: string[];
    taskCount?: number;
  }): Promise<MarketplacePlugin> {
    const raw = await readFile(pluginJsonPath, 'utf-8');
    const pluginJson = JSON.parse(raw);

    const plugin: MarketplacePlugin = {
      id: pluginJson.name,
      name: pluginJson.name,
      version: pluginJson.version || '0.1.0',
      description: pluginJson.description || '',
      author: options?.author || 'unknown',
      license: options?.license || 'MIT',
      homepage: pluginJson.homepage,
      keywords: [],
      skills: (pluginJson.skills || []).map((s: { name: string }) => s.name),
      taskCount: options?.taskCount || 0,
      domains: options?.domains || [],
      installPath: resolve(pluginJsonPath, '..'),
      pluginJsonPath,
      verified: false,
      featured: false,
      downloads: 0,
      rating: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.registerPlugin(plugin);
    return plugin;
  }
}
