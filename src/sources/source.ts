import { JobSource } from '../domain/types.js';

export class SourceRegistry {
  private sources = new Map<string, JobSource>();

  public register(source: JobSource): void {
    this.sources.set(source.name.toLowerCase(), source);
  }

  public get(name: string): JobSource | undefined {
    return this.sources.get(name.toLowerCase());
  }

  public getAll(): JobSource[] {
    return Array.from(this.sources.values());
  }

  public getEnabled(sourceNames: string[]): JobSource[] {
    return sourceNames
      .map((name) => this.get(name))
      .filter((s): s is JobSource => s !== undefined);
  }
}
