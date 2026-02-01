/**
 * CollapsibleCard - Reusable collapsible card wrapper
 *
 * Professional card component with smooth animations and accessibility.
 * Adapted from digital-marketer project, following CLAUDE.md standards.
 */

import { useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleCardProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly badge?: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly collapsible?: boolean;
  readonly defaultExpanded?: boolean;
  readonly className?: string;
}

export function CollapsibleCard({
  icon,
  title,
  badge,
  description,
  children,
  actions,
  collapsible = false,
  defaultExpanded = false,
  className,
}: CollapsibleCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  function toggleExpanded() {
    setIsExpanded((prev) => !prev);
  }

  function handleCardInteraction(e: React.MouseEvent) {
    if (!collapsible) return;

    const target = e.target as HTMLElement;
    const isInteractiveElement = target.closest(
      'button, input, textarea, select, [role="button"], a',
    );

    if (!isInteractiveElement) {
      e.stopPropagation();
      toggleExpanded();
    }
  }

  return (
    <Card
      className={cn(
        "transition-all duration-300 group",
        collapsible && [
          "hover:shadow-md hover:shadow-primary/10",
          "hover:border-primary/30",
          "hover:bg-gradient-to-r hover:from-background hover:to-primary/5",
        ],
        isExpanded && "border-primary/20 shadow-sm",
        className,
      )}
    >
      <CardHeader
        className={`pb-4 ${collapsible ? "cursor-pointer" : ""}`}
        onClick={collapsible ? handleCardInteraction : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon && (
              <div
                className={cn(
                  "w-8 h-8 rounded-lg bg-muted flex items-center justify-center",
                  "transition-all duration-300 group-hover:scale-105",
                  isExpanded
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "group-hover:bg-primary/10",
                )}
              >
                {icon}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle
                  className={cn(
                    "text-lg transition-all duration-200",
                    isExpanded
                      ? "text-primary font-semibold"
                      : "group-hover:text-primary/80",
                  )}
                >
                  {title}
                </CardTitle>
                {badge && (
                  <div onClick={(e) => e.stopPropagation()}>{badge}</div>
                )}
              </div>
              {description && (
                <CardDescription className="mt-1 group-hover:text-foreground/80 transition-colors duration-200">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions && (
              <div onClick={(e) => e.stopPropagation()}>{actions}</div>
            )}
            {collapsible && (
              <div className="flex items-center">
                {isExpanded ? (
                  <ChevronUp
                    className={cn(
                      "transition-all duration-300 h-5 w-5",
                      "text-primary",
                    )}
                  />
                ) : (
                  <ChevronDown
                    className={cn(
                      "transition-all duration-300 h-5 w-5",
                      "text-muted-foreground group-hover:text-primary group-hover:scale-110",
                    )}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <div className="animate-in slide-in-from-top-2 duration-300 ease-out">
          <CardContent className="space-y-6 pt-4 pb-6 border-t border-border/30">
            {children}
          </CardContent>
        </div>
      )}
    </Card>
  );
}
