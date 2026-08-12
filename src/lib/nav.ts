import type { IrNode } from './ir';

/** Sidebar shape. Kept out of the server module so the UI can import the type. */
export interface NavSymbol {
    fqn: string;
    name: string;
    kind: IrNode['kind'];
    deprecated: boolean;
    /** How deeply nested the declaration is, for indentation. */
    depth: number;
}

export interface NavFile {
    name: string;
    symbols: NavSymbol[];
}

export interface NavPackage {
    name: string;
    files: NavFile[];
}
