/**
 * Delete Confirm Dialog
 *
 * Confirmation dialog for delete actions.
 * Replaces browser confirm() for consistent UI.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title?: string;
  readonly description?: string;
  readonly onConfirm: () => void;
  readonly isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title = "確定刪除？",
  description = "此操作無法復原。",
  onConfirm,
  isLoading = false,
}: Props) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            )}
            刪除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
