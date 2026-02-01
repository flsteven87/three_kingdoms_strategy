/**
 * CsvDropZone - Reusable CSV Upload Drop Zone Component
 * - No manual memoization (React Compiler handles)
 *
 * A drag & drop zone for CSV file uploads with visual feedback.
 * Uses native <label> + <input> association for reliable file dialog triggering.
 *
 * Best Practice (2025):
 * - Use <label htmlFor> instead of programmatic input.click()
 * - Chrome has strict "user gesture" requirements that can block input.click()
 * - Native label association is the most reliable cross-browser solution
 */

import { useState, useId, type ChangeEvent, type DragEvent } from "react";
import { FileUp, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CsvDropZoneProps {
  /** Label displayed above the drop zone */
  readonly label?: string;
  /** Description text inside the drop zone */
  readonly description?: string;
  /** Helper text shown below the main description */
  readonly helperText?: string;
  /** Currently selected file */
  readonly file: File | null;
  /** Callback when file is selected or cleared */
  readonly onFileChange: (file: File | null) => void;
  /** Whether the component is disabled */
  readonly disabled?: boolean;
  /** Whether to show compact mode (smaller padding) */
  readonly compact?: boolean;
}

export function CsvDropZone({
  label,
  description = "點擊上傳或拖放 CSV 檔案",
  helperText = "拖放或點擊選擇 CSV",
  file,
  onFileChange,
  disabled = false,
  compact = false,
}: CsvDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = useId();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileChange(selectedFile);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleDragEnter = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile?.name.endsWith(".csv")) {
      onFileChange(droppedFile);
    }
  };

  // File selected state
  if (file) {
    return (
      <div className="space-y-2">
        {label && <p className="text-sm font-medium">{label}</p>}
        <Card className="border-primary/50">
          <CardContent className={compact ? "py-3" : "py-4"}>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFileChange(null)}
                disabled={disabled}
              >
                移除
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="h-3 w-3" />
              <span>已選擇</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state - drop zone using native label association
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      {/*
        Using <label> with htmlFor provides native file dialog triggering.
        This bypasses Chrome's strict "user gesture" requirements that can
        block programmatic input.click() calls.
      */}
      <label
        htmlFor={inputId}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex flex-col items-center justify-center
          rounded-lg border-2 border-dashed
          transition-all duration-200
          ${compact ? "px-4 py-6" : "px-6 py-8"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${
            isDragging
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
          }
        `}
      >
        {/* Hidden file input */}
        <input
          id={inputId}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={disabled}
          className="sr-only"
        />

        <FileUp
          className={`mb-2 ${compact ? "h-6 w-6" : "h-8 w-8"} ${
            isDragging ? "text-primary" : "text-muted-foreground"
          }`}
        />
        <p className="text-sm font-medium mb-1">
          {isDragging ? "放開以上傳檔案" : description}
        </p>
        <p className="text-xs text-muted-foreground text-center">
          {helperText}
        </p>
      </label>
    </div>
  );
}
