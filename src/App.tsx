import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Settings, 
  Maximize2, 
  Minimize2, 
  Download, 
  ChevronRight, 
  ChevronDown,
  Link as LinkIcon,
  X,
  Edit3,
  GripHorizontal,
  Table as TableIcon,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  MessageSquare,
  Hand
} from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Table, Column, Relationship, DataType } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATA_TYPES: DataType[] = ['int', 'varchar', 'datetime', 'boolean', 'float', 'text'];

const RELATIONSHIP_COLORS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

const TABLE_COLORS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate
];

export default function App() {
  const [tables, setTables] = useState<Table[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [sampleRows, setSampleRows] = useState(5);
  const [zoom, setZoom] = useState(0.5);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showHandHint, setShowHandHint] = useState(false);
  const [relModalTableId, setRelModalTableId] = useState<string | null>(null);
  const [exportImage, setExportImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- CSV Parsing ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => parseCSV(file));
    }
  };

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: false,
      preview: sampleRows + (hasHeader ? 1 : 0),
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length === 0) return;

        const fileName = file.name.replace(/\.[^/.]+$/, "");
        const headers = hasHeader ? data[0] : data[0].map((_, i) => `col_${i + 1}`);
        const firstRow = hasHeader ? data[1] : data[0];

        const newColumns: Column[] = headers.map((name, index) => {
          const sampleValue = firstRow ? firstRow[index] : '';
          return {
            id: uuidv4(),
            name: name || `col_${index + 1}`,
            type: inferType(sampleValue),
            nullable: true,
            sample: sampleValue || '',
            comment: '',
            isPK: false,
            isFK: false,
          };
        });

        const newTable: Table = {
          id: uuidv4(),
          name: fileName,
          columns: newColumns,
          x: Math.random() * 200 + 50,
          y: Math.random() * 200 + 50,
          width: 600, // Increased default width for comment column
          height: 0, 
          color: TABLE_COLORS[0],
        };

        setTables(prev => [...prev, newTable]);
      }
    });
  };

  const inferType = (value: string): DataType => {
    if (!value) return 'varchar';
    if (!isNaN(Number(value))) return value.includes('.') ? 'float' : 'int';
    if (!isNaN(Date.parse(value))) return 'datetime';
    if (['true', 'false', '1', '0'].includes(value.toLowerCase())) return 'boolean';
    return 'varchar';
  };

  // --- Actions ---
  const updateTable = useCallback((tableId: string, updates: Partial<Table>) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, ...updates } : t));
  }, []);

  const updateColumn = useCallback((tableId: string, columnId: string, updates: Partial<Column>) => {
    setTables(prev => prev.map(t => {
      if (t.id === tableId) {
        return {
          ...t,
          columns: t.columns.map(c => c.id === columnId ? { ...c, ...updates } : c)
        };
      }
      return t;
    }));
  }, []);

  const deleteTable = useCallback((id: string) => {
    setTables(prev => prev.filter(t => t.id !== id));
    setRelationships(prev => prev.filter(r => r.fromTableId !== id && r.toTableId !== id));
    setSelectedTableId(prev => prev === id ? null : prev);
  }, []);

  const exportAsImage = useCallback(async () => {
    if (canvasRef.current === null || tables.length === 0) return;

    try {
      // Filter out UI elements like delete buttons
      const filter = (node: HTMLElement) => {
        if (node.nodeType !== 1) return true;
        const className = (node as any).className?.baseVal !== undefined 
          ? (node as any).className.baseVal 
          : node.className;
        if (typeof className === 'string' && className.includes('no-export')) return false;
        if (node.tagName === 'BUTTON') return false;
        return true;
      };

      const dataUrl = await toPng(canvasRef.current, { 
        cacheBust: true,
        filter,
        backgroundColor: theme === 'dark' ? '#121212' : '#f5f5f5',
      });
      setExportImage(dataUrl);
    } catch (err) {
      console.error('Export failed', err);
    }
  }, [canvasRef, tables, theme]);

  // --- Drag and Drop for Canvas ---
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      Array.from(files).forEach((file: File) => parseCSV(file));
    }
  };

  const [relSource, setRelSource] = useState<{ tableId: string, columnId: string } | null>(null);

  const createRelationship = useCallback((fromTableId: string, fromColumnId: string, toTableId: string, toColumnId: string) => {
    const newRel: Relationship = {
      id: uuidv4(),
      fromTableId,
      fromColumnId,
      toTableId,
      toColumnId,
      type: '1:N'
    };

    setRelationships(prev => [...prev, newRel]);
    updateColumn(toTableId, toColumnId, { 
      isFK: true, 
      fkReference: { tableId: fromTableId, columnId: fromColumnId } 
    });
  }, [updateColumn]);

  const deleteRelationship = useCallback((id: string) => {
    setRelationships(prev => {
      const rel = prev.find(r => r.id === id);
      if (rel) {
        updateColumn(rel.toTableId, rel.toColumnId, { isFK: false, fkReference: undefined });
      }
      return prev.filter(r => r.id !== id);
    });
  }, [updateColumn]);

  const selectedTable = tables.find(t => t.id === selectedTableId);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) { // Right click
      setIsPanning(true);
      e.preventDefault();
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
  };

  return (
    <div 
      className={cn(
        "flex h-screen w-full overflow-hidden font-sans transition-colors duration-300",
        theme === 'dark' ? "bg-[#121212] text-white" : "bg-[#f5f5f5] text-[#1a1a1a]"
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Sidebar */}
      {!isFullScreen && (
        <aside className={cn(
          "w-80 border-r flex flex-col shadow-sm z-20 transition-colors duration-300",
          theme === 'dark' ? "bg-[#1e1e1e] border-white/10" : "bg-white border-black/5"
        )}>
          <div className={cn("p-6 border-b", theme === 'dark' ? "border-white/10" : "border-black/5")}>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <TableIcon className="w-6 h-6 text-emerald-600" />
              ERD Architect
            </h1>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Upload Section */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2">Import CSV</h2>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer group",
                  theme === 'dark' ? "border-white/10 hover:border-emerald-500 hover:bg-emerald-500/5" : "border-gray-200 hover:border-emerald-500 hover:bg-emerald-50"
                )}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-emerald-500" />
                <p className="text-sm text-gray-500">Click or drag CSV here</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  multiple 
                  accept=".csv"
                />
              </div>
              <div className="space-y-3 px-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasHeader} 
                    onChange={e => setHasHeader(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Has Header
                </label>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Rows to Import:</span>
                  <input 
                    type="number" 
                    value={sampleRows} 
                    onChange={e => setSampleRows(Number(e.target.value))}
                    className={cn(
                      "w-12 px-1 border rounded text-center outline-none",
                      theme === 'dark' ? "bg-[#2a2a2a] border-white/10" : "bg-white border-gray-200"
                    )}
                  />
                </div>
              </div>
            </section>

            {/* Relationships List */}
            {relationships.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2">Relationships</h2>
                <div className="space-y-2">
                  {relationships.map(rel => {
                    const fromT = tables.find(t => t.id === rel.fromTableId);
                    const toT = tables.find(t => t.id === rel.toTableId);
                    return (
                      <div key={rel.id} className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-xs",
                        theme === 'dark' ? "bg-white/5 text-gray-300" : "bg-gray-50 text-gray-600"
                      )}>
                        <span className="truncate flex-1">{fromT?.name} → {toT?.name}</span>
                        <button onClick={() => deleteRelationship(rel.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Table Settings */}
            {selectedTable ? (
              <section className="space-y-4 animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Table Settings</h2>
                  <button onClick={() => setSelectedTableId(null)} className={cn(
                    "transition-colors",
                    theme === 'dark' ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-black"
                  )}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className={cn(
                  "space-y-4 p-4 rounded-xl border",
                  theme === 'dark' ? "bg-white/5 border-white/10" : "bg-gray-50 border-black/5"
                )}>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Table Color</label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {TABLE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => updateTable(selectedTable.id, { color })}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all",
                            selectedTable.color === color ? "border-white scale-110 shadow-md" : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Table Name</label>
                    <input 
                      type="text" 
                      value={selectedTable.name} 
                      onChange={e => updateTable(selectedTable.id, { name: e.target.value })}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors mb-3",
                        theme === 'dark' ? "bg-[#2a2a2a] border-white/10 text-white" : "bg-white border-gray-200 text-black"
                      )}
                    />
                    <button 
                      onClick={() => setRelModalTableId(selectedTable.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-sm"
                    >
                      <LinkIcon className="w-4 h-4" />
                      Add Relationship
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-gray-500">Columns</label>
                    {selectedTable.columns.map(col => (
                      <div key={col.id} className={cn(
                        "p-3 border rounded-lg space-y-2 text-sm transition-colors",
                        theme === 'dark' ? "bg-[#2a2a2a] border-white/10" : "bg-white border-gray-200"
                      )}>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={col.name} 
                            onChange={e => updateColumn(selectedTable.id, col.id, { name: e.target.value })}
                            className={cn(
                              "flex-1 font-medium border-none p-0 focus:ring-0 bg-transparent",
                              theme === 'dark' ? "text-white" : "text-black"
                            )}
                          />
                          <div className="flex gap-1">
                            <button 
                              onClick={() => updateColumn(selectedTable.id, col.id, { isPK: !col.isPK })}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors", 
                                col.isPK 
                                  ? "bg-yellow-100 text-yellow-700" 
                                  : theme === 'dark' ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400"
                              )}
                            >
                              PK
                            </button>
                            <div className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold",
                              col.isFK 
                                ? "bg-blue-100 text-blue-700" 
                                : theme === 'dark' ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400"
                            )}>
                              FK
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select 
                            value={col.type} 
                            onChange={e => updateColumn(selectedTable.id, col.id, { type: e.target.value as DataType })}
                            className={cn(
                              "text-xs rounded border transition-colors",
                              theme === 'dark' ? "bg-[#1e1e1e] border-white/10 text-white" : "bg-white border-gray-200 text-black"
                            )}
                          >
                            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-xs text-gray-500">
                            <input 
                              type="checkbox" 
                              checked={col.nullable} 
                              onChange={e => updateColumn(selectedTable.id, col.id, { nullable: e.target.checked })}
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            Null
                          </label>
                        </div>
                        <input 
                          type="text" 
                          placeholder="Comment..." 
                          value={col.comment} 
                          onChange={e => updateColumn(selectedTable.id, col.id, { comment: e.target.value })}
                          className={cn(
                            "w-full text-xs border-none p-0 focus:ring-0 italic bg-transparent",
                            theme === 'dark' ? "text-gray-400" : "text-gray-500"
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <div className="text-center py-12 px-4">
                <Settings className={cn(
                  "w-12 h-12 mx-auto mb-3 transition-colors",
                  theme === 'dark' ? "text-white/10" : "text-gray-200"
                )} />
                <p className="text-sm text-gray-400 italic">Select a table to edit its properties</p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main Canvas */}
      <main 
        className={cn(
          "flex-1 relative overflow-hidden flex flex-col transition-colors duration-300",
          theme === 'dark' ? "bg-[#121212]" : "bg-[#f5f5f5]"
        )}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Toolbar */}
        <div className="absolute top-6 right-6 flex items-center gap-2 z-30">
          {relSource && (
            <div className="bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Select target column for relationship
              <button onClick={() => setRelSource(null)} className="ml-2 hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className={cn(
            "flex items-center gap-1 p-1 rounded-full shadow-lg border backdrop-blur-md",
            theme === 'dark' ? "bg-[#1e1e1e]/80 border-white/10" : "bg-white/80 border-black/5"
          )}>
            <div className="relative">
              <button 
                onClick={() => {
                  setShowHandHint(true);
                  setTimeout(() => setShowHandHint(false), 3000);
                }}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isPanning ? "bg-emerald-500 text-white" : theme === 'dark' ? "hover:bg-white/5 text-gray-400" : "hover:bg-black/5 text-gray-600"
                )}
                title="Drag Canvas (Right Click)"
              >
                <Hand className="w-5 h-5" />
              </button>
              <AnimatePresence>
                {showHandHint && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-50"
                  >
                    마우스 오른쪽 클릭으로 화면을 이동할 수 있습니다!
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className={cn("w-px h-4 mx-1", theme === 'dark' ? "bg-white/10" : "bg-black/5")} />
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={cn(
                "p-2 rounded-full transition-colors",
                theme === 'dark' ? "hover:bg-white/5 text-yellow-400" : "hover:bg-black/5 text-gray-600"
              )}
              title={theme === 'light' ? "Dark Mode" : "Light Mode"}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <div className={cn("w-px h-4 mx-1", theme === 'dark' ? "bg-white/10" : "bg-black/5")} />
            <button 
              onClick={() => setZoom(prev => Math.max(0.2, prev - 0.1))}
              className={cn(
                "p-2 rounded-full transition-colors",
                theme === 'dark' ? "hover:bg-white/5 text-gray-400" : "hover:bg-black/5 text-gray-600"
              )}
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-[10px] font-bold w-8 text-center text-gray-500">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
              className={cn(
                "p-2 rounded-full transition-colors",
                theme === 'dark' ? "hover:bg-white/5 text-gray-400" : "hover:bg-black/5 text-gray-600"
              )}
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={cn(
              "p-3 rounded-full shadow-lg transition-colors border",
              theme === 'dark' ? "bg-[#1e1e1e] border-white/10 text-gray-400 hover:bg-white/5" : "bg-white border-black/5 text-gray-600 hover:bg-gray-50"
            )}
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
          >
            {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button 
            onClick={exportAsImage}
            className={cn(
              "p-3 rounded-full shadow-lg transition-colors border",
              theme === 'dark' ? "bg-[#1e1e1e] border-white/10 text-gray-400 hover:bg-white/5" : "bg-white border-black/5 text-gray-600 hover:bg-gray-50"
            )}
            title="Save as Image"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>

        {/* ERD Area */}
        <div 
          ref={canvasRef}
          className={cn(
            "flex-1 relative overflow-hidden p-20 min-h-full min-w-full",
            isPanning ? "cursor-grabbing" : "cursor-default"
          )}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          style={{ 
            backgroundImage: theme === 'dark' 
              ? 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)' 
              : 'radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${offset.x}px ${offset.y}px`
          }}
        >
          <div 
            className="absolute inset-0 origin-top-left transition-transform duration-200 ease-out"
            style={{ 
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              width: '5000px',
              height: '5000px'
            }}
          >
            {tables.map(table => (
              <VisualTable 
                key={table.id}
                table={table}
                isSelected={selectedTableId === table.id}
                onSelect={setSelectedTableId}
                onUpdate={updateTable}
                onDelete={deleteTable}
                onAddRelationship={setRelModalTableId}
                onUpdateColumn={updateColumn}
                theme={theme}
                relationships={relationships}
              />
            ))}

            {/* Relationships Layer */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full">
              {relationships.map((rel, idx) => (
                <RelationshipLine 
                  key={rel.id} 
                  rel={rel} 
                  fromTable={tables.find(t => t.id === rel.fromTableId)}
                  toTable={tables.find(t => t.id === rel.toTableId)}
                  theme={theme}
                  color={RELATIONSHIP_COLORS[idx % RELATIONSHIP_COLORS.length]}
                  onDelete={deleteRelationship}
                />
              ))}
            </svg>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {relModalTableId && (
          <RelationshipModal 
            tableId={relModalTableId}
            tables={tables}
            theme={theme}
            onClose={() => setRelModalTableId(null)}
            onCreateRelationship={(fromColId, toTableId, toColId) => {
              createRelationship(relModalTableId, fromColId, toTableId, toColId);
            }}
          />
        )}
        {exportImage && (
          <ExportModal 
            image={exportImage} 
            theme={theme} 
            onClose={() => setExportImage(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Visual Components ---

interface VisualTableProps {
  table: Table;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Table>) => void;
  onDelete: (id: string) => void;
  onAddRelationship: (id: string) => void;
  onUpdateColumn: (tableId: string, colId: string, updates: Partial<Column>) => void;
  theme: 'light' | 'dark';
  relationships: Relationship[];
}

const VisualTable = memo(function VisualTable({ 
  table, 
  isSelected, 
  onSelect, 
  onUpdate, 
  onDelete, 
  onAddRelationship,
  onUpdateColumn,
  theme,
  relationships
}: VisualTableProps) {
  const [showFKAlert, setShowFKAlert] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const dragControls = useDragControls();

  const handleFKClick = (col: Column) => {
    if (col.isFK) {
      // If already FK, find and delete the relationship
      // For now we just show the alert as requested for manual toggle
    } else {
      setShowFKAlert(true);
      setTimeout(() => setShowFKAlert(false), 3000);
    }
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onDrag={(_, info) => {
        onUpdate(table.id, { x: table.x + info.delta.x, y: table.y + info.delta.y });
      }}
      initial={false}
      animate={{ x: table.x, y: table.y }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(table.id);
      }}
      className={cn(
        "absolute rounded-2xl shadow-xl border-2 overflow-hidden flex flex-col",
        isSelected ? "border-emerald-500 ring-4 ring-emerald-500/10" : theme === 'dark' ? "border-white/10" : "border-transparent",
        theme === 'dark' ? "bg-[#1e1e1e]" : "bg-white"
      )}
      style={{ width: table.width, minHeight: 300 }}
    >
      {/* FK Alert Toast */}
      <AnimatePresence>
        {showFKAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[20px] px-6 py-2 rounded-full shadow-lg z-50 whitespace-nowrap pointer-events-none"
          >
            먼저 관계(Link 아이콘)를 설정해주세요!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table Header */}
      <div className={cn(
        "px-8 h-24 border-b flex items-center justify-between group relative",
        theme === 'dark' ? "border-white/5" : "border-black/5"
      )}
      style={{ backgroundColor: table.color ? `${table.color}20` : undefined }}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setIsColorPickerOpen(!isColorPickerOpen); 
              }}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-all shadow-sm",
                theme === 'dark' ? "border-white/20" : "border-black/10"
              )}
              style={{ backgroundColor: table.color }}
              title="Change Table Color"
            />
            
            <AnimatePresence>
              {isColorPickerOpen && (
                <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsColorPickerOpen(false);
                      }} 
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className={cn(
                        "absolute top-12 left-0 z-50 p-3 rounded-xl shadow-2xl border flex flex-wrap gap-2 w-40",
                        theme === 'dark' ? "bg-[#2a2a2a] border-white/10" : "bg-white border-gray-200"
                      )}
                    >
                      {TABLE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            onUpdate(table.id, { color }); 
                            setIsColorPickerOpen(false);
                          }}
                          className={cn(
                            "w-6 h-6 rounded-full border transition-all hover:scale-110",
                            table.color === color ? "border-white ring-2 ring-emerald-500" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <input 
            className={cn(
              "bg-transparent font-bold text-[28px] border-none p-0 focus:ring-0 w-full",
              theme === 'dark' ? "text-white" : "text-gray-900"
            )}
            style={{ color: table.color }}
            value={table.name}
            onChange={e => onUpdate(table.id, { name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <div 
            onPointerDown={(e) => dragControls.start(e)}
            className="text-gray-400 hover:text-emerald-500 cursor-grab active:cursor-grabbing p-2 transition-colors"
            title="Drag Table"
          >
            <Hand className="w-8 h-8" />
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onAddRelationship(table.id); }}
            className="text-gray-300 hover:text-emerald-500 transition-colors p-2 flex items-center gap-2"
            title="Add Relationship"
          >
            <LinkIcon className="w-8 h-8" />
            <span className="text-[20px] font-bold whitespace-nowrap">Add Relationship</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(table.id); }}
            className="text-gray-300 hover:text-red-500 transition-colors p-2"
            title="Delete Table"
          >
            <Trash2 className="w-8 h-8" />
          </button>
        </div>
      </div>

      {/* Table Columns */}
      <div className="flex-1 p-2">
        <table className="w-full text-[22px] border-separate border-spacing-y-2">
          <thead>
            <tr className="text-gray-400 uppercase tracking-tighter font-bold h-16">
              <th className="px-4 text-left w-32">Keys</th>
              <th className="px-4 text-left">Name</th>
              <th className="px-4 text-left">Type</th>
              <th className="px-4 text-left">Null</th>
              <th className="px-4 text-left">Sample</th>
              <th className="px-4 text-left"><MessageSquare className="w-6 h-6 inline mr-2" />Comment</th>
              <th className="px-4 text-left w-12"></th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map(col => {
              const relIdx = relationships.findIndex(r => 
                (r.fromTableId === table.id && r.fromColumnId === col.id) || 
                (r.toTableId === table.id && r.toColumnId === col.id)
              );
              const relColor = relIdx !== -1 ? RELATIONSHIP_COLORS[relIdx % RELATIONSHIP_COLORS.length] : null;

              return (
                <tr key={col.id} className={cn(
                  "group rounded-lg transition-colors h-16",
                  theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50"
                )}
                style={{ backgroundColor: relColor ? `${relColor}15` : undefined }}
                >
                  <td className="px-4 flex items-center gap-2 h-16">
                    <label className="flex items-center gap-1 cursor-pointer" title="Primary Key">
                      <input 
                        type="checkbox" 
                        checked={col.isPK} 
                        onChange={e => onUpdateColumn(table.id, col.id, { isPK: e.target.checked })}
                        className="rounded-sm border-gray-300 text-yellow-500 focus:yellow-500 w-6 h-6"
                      />
                      <span className="text-[16px] font-bold text-yellow-600">PK</span>
                    </label>
                    <label 
                      className="flex items-center gap-1 cursor-pointer" 
                      title="Foreign Key"
                      onClick={(e) => {
                        if (!col.isFK) {
                          e.preventDefault();
                          handleFKClick(col);
                        }
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={col.isFK} 
                        readOnly
                        className="rounded-sm border-gray-300 text-blue-500 focus:ring-blue-500 w-6 h-6"
                      />
                      <span className="text-[16px] font-bold text-blue-600">FK</span>
                    </label>
                  </td>
                  <td className="px-4 font-medium">
                    <input 
                      className={cn(
                        "bg-transparent border-none p-0 focus:ring-0 w-full",
                        theme === 'dark' ? "text-gray-200" : "text-gray-700"
                      )}
                      value={col.name}
                      onChange={e => onUpdateColumn(table.id, col.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 text-gray-500">
                    <select 
                      value={col.type}
                      onChange={e => onUpdateColumn(table.id, col.id, { type: e.target.value as DataType })}
                      className="bg-transparent border-none p-0 focus:ring-0 text-[22px] outline-none"
                    >
                      {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-4 text-center">
                    <input 
                      type="checkbox" 
                      checked={col.nullable} 
                      onChange={e => onUpdateColumn(table.id, col.id, { nullable: e.target.checked })}
                      className="rounded-sm border-gray-300 text-emerald-500 focus:ring-emerald-500 w-6 h-6 no-export"
                    />
                  </td>
                  <td className="px-4 text-gray-400 truncate max-w-[160px]" title={col.sample}>
                    {col.sample}
                  </td>
                  <td className="px-4 text-gray-400 italic truncate max-w-[200px]" title={col.comment}>
                    {col.comment || '-'}
                  </td>
                  <td className="px-4 text-right w-12">
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Resize Handle */}
      <div 
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center"
        onMouseDown={(e) => {
          e.stopPropagation();
          const startX = e.clientX;
          const startWidth = table.width;
          
          const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(200, startWidth + (moveEvent.clientX - startX));
            onUpdate(table.id, { width: newWidth });
          };
          
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      >
        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
      </div>
    </motion.div>
  );
});

// --- Modal Component ---

// --- Modal Components ---

function ExportModal({ image, theme, onClose }: { image: string, theme: 'light' | 'dark', onClose: () => void }) {
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setSelection({ x, y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelection({
      x: Math.min(x, startPos.x),
      y: Math.min(y, startPos.y),
      w: Math.abs(x - startPos.x),
      h: Math.abs(y - startPos.y)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    if (!selection || selection.w < 10 || selection.h < 10) {
      // If no selection or too small, download full image
      const link = document.createElement('a');
      link.download = `erd-architect-full-${new Date().getTime()}.png`;
      link.href = image;
      link.click();
      onClose();
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = image;

    img.onload = () => {
      // Calculate scale between displayed image and original image
      if (!containerRef.current) return;
      const displayWidth = containerRef.current.clientWidth;
      const displayHeight = containerRef.current.clientHeight;
      const scaleX = img.width / displayWidth;
      const scaleY = img.height / displayHeight;

      canvas.width = selection.w * scaleX;
      canvas.height = selection.h * scaleY;

      ctx?.drawImage(
        img,
        selection.x * scaleX,
        selection.y * scaleY,
        selection.w * scaleX,
        selection.h * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const link = document.createElement('a');
      link.download = `erd-architect-selection-${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      onClose();
    };
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border",
          theme === 'dark' ? "bg-[#1e1e1e] border-white/10" : "bg-white border-black/5"
        )}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="font-bold flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-500" />
              Export Selection
            </h3>
            <p className="text-[10px] text-gray-500">Drag on the image to select the area you want to save.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="flex-1 relative bg-black/10 overflow-hidden flex items-center justify-center p-8"
        >
          <div 
            ref={containerRef}
            className="relative cursor-crosshair select-none shadow-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img 
              src={image} 
              alt="Export Preview" 
              className="max-w-full max-h-[60vh] block pointer-events-none"
              referrerPolicy="no-referrer"
            />
            
            {selection && (
              <div 
                className="absolute border-2 border-emerald-500 bg-emerald-500/10 pointer-events-none"
                style={{
                  left: selection.x,
                  top: selection.y,
                  width: selection.w,
                  height: selection.h
                }}
              >
                <div className="absolute -top-6 left-0 bg-emerald-500 text-white text-[10px] px-1 rounded whitespace-nowrap">
                  {Math.round(selection.w)} x {Math.round(selection.h)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between gap-4">
          <div className="text-xs text-gray-500">
            {selection ? "Area selected. Click download to save." : "No area selected. Click download to save full image."}
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleDownload}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-lg"
            >
              {selection && selection.w > 10 ? "Download Selection" : "Download Full Image"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RelationshipModal({ 
  tableId, 
  tables, 
  onClose, 
  onCreateRelationship,
  theme 
}: { 
  tableId: string, 
  tables: Table[], 
  onClose: () => void, 
  onCreateRelationship: (fromColId: string, toTableId: string, toColId: string) => void,
  theme: 'light' | 'dark'
}) {
  const sourceTable = tables.find(t => t.id === tableId);
  const [sourceColId, setSourceColId] = useState(sourceTable?.columns[0]?.id || '');
  const [targetTableId, setTargetTableId] = useState(tables.find(t => t.id !== tableId)?.id || '');
  const targetTable = tables.find(t => t.id === targetTableId);
  const [targetColId, setTargetColId] = useState(targetTable?.columns[0]?.id || '');

  if (!sourceTable) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border",
          theme === 'dark' ? "bg-[#1e1e1e] border-white/10" : "bg-white border-black/5"
        )}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-emerald-500" />
            Table Relationship
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-8">
          {/* Source Table */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Source Table: {sourceTable.name}</div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Select Column</label>
              <select 
                value={sourceColId}
                onChange={e => setSourceColId(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500",
                  theme === 'dark' ? "bg-[#2a2a2a] border-white/10 text-white" : "bg-white border-gray-200 text-black"
                )}
              >
                {sourceTable.columns.map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Target Table */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target Table</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Table</label>
                <select 
                  value={targetTableId}
                  onChange={e => {
                    setTargetTableId(e.target.value);
                    const t = tables.find(tbl => tbl.id === e.target.value);
                    if (t) setTargetColId(t.columns[0]?.id || '');
                  }}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500",
                    theme === 'dark' ? "bg-[#2a2a2a] border-white/10 text-white" : "bg-white border-gray-200 text-black"
                  )}
                >
                  {tables.filter(t => t.id !== tableId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Column</label>
                <select 
                  value={targetColId}
                  onChange={e => setTargetColId(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500",
                    theme === 'dark' ? "bg-[#2a2a2a] border-white/10 text-white" : "bg-white border-gray-200 text-black"
                  )}
                >
                  {targetTable?.columns.map(col => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onCreateRelationship(sourceColId, targetTableId, targetColId);
              onClose();
            }}
            disabled={!targetTableId || !targetColId}
            className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Relationship
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const RelationshipLine = memo(function RelationshipLine({ rel, fromTable, toTable, theme, color, onDelete }: { rel: Relationship, fromTable: Table | undefined, toTable: Table | undefined, theme: 'light' | 'dark', color: string, onDelete: (id: string) => void }) {
  if (!fromTable || !toTable) return null;

  const fromColIndex = fromTable.columns.findIndex(c => c.id === rel.fromColumnId);
  const toColIndex = toTable.columns.findIndex(c => c.id === rel.toColumnId);

  // Calculate positions based on column index
  // Header (96px) + Container Padding (8px) + Border Spacing (8px) + Thead (64px) + Border Spacing (8px) + Half Row (32px)
  // Total base offset = 96 + 8 + 8 + 64 + 8 + 32 = 216px
  // Row step = Row Height (64px) + Border Spacing (8px) = 72px
  const getColY = (idx: number) => 216 + (idx * 72);

  const x1 = fromTable.x + fromTable.width;
  const y1 = fromTable.y + getColY(fromColIndex);
  
  const x2 = toTable.x + 2; // Move right slightly to touch border
  const y2 = toTable.y + getColY(toColIndex);

  // Bezier curve points
  const cp1x = x1 + Math.abs(x2 - x1) / 2;
  const cp2x = x2 - Math.abs(x2 - x1) / 2;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g className="group/line">
      <path 
        d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke={color} 
        strokeWidth="3" 
        className="transition-all duration-300 opacity-60 group-hover/line:opacity-100 cursor-pointer"
      />
      <circle cx={x1} cy={y1} r="4" fill={color} />
      <circle cx={x2} cy={y2} r="4" fill={color} />
      
      {/* Delete Button on Line */}
      <g 
        className="pointer-events-auto opacity-0 group-hover/line:opacity-100 transition-opacity cursor-pointer no-export"
        onClick={(e) => { e.stopPropagation(); onDelete(rel.id); }}
      >
        <circle cx={midX} cy={midY} r="10" fill="#ef4444" className="shadow-lg" />
        <path 
          d={`M ${midX - 4} ${midY - 4} L ${midX + 4} ${midY + 4} M ${midX + 4} ${midY - 4} L ${midX - 4} ${midY + 4}`} 
          stroke="white" 
          strokeWidth="2" 
          strokeLinecap="round" 
        />
      </g>
    </g>
  );
});
