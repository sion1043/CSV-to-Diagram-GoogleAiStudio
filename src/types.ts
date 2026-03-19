export type DataType = 'int' | 'varchar' | 'datetime' | 'boolean' | 'float' | 'text';

export interface Column {
  id: string;
  name: string;
  type: DataType;
  nullable: boolean;
  sample: string;
  comment: string;
  isPK: boolean;
  isFK: boolean;
  fkReference?: {
    tableId: string;
    columnId: string;
  };
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface Relationship {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  type: '1:1' | '1:N' | 'N:1';
}

export interface ERDState {
  tables: Table[];
  relationships: Relationship[];
}
