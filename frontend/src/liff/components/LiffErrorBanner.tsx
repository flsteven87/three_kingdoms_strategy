import { AlertCircle } from "lucide-react";

interface Props {
  readonly message: string;
}

export function LiffErrorBanner({ message }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{message}</span>
    </div>
  );
}
