import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from "lucide-react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
};

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card">
      <div className="text-sm text-muted-foreground">
        عرض <span className="font-bold text-foreground">{start.toLocaleString("ar-DZ")}</span> – <span className="font-bold text-foreground">{end.toLocaleString("ar-DZ")}</span> من إجمالي <span className="font-bold text-foreground">{total.toLocaleString("ar-DZ")}</span>
      </div>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            className="bg-background border border-border rounded-md px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(parseInt(e.target.value, 10));
              onPageChange(1);
            }}
            data-testid="select-page-size"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n} / صفحة</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => onPageChange(1)} disabled={safePage === 1} data-testid="button-page-first" title="الأولى">
            <ChevronsRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => onPageChange(safePage - 1)} disabled={safePage === 1} data-testid="button-page-prev" title="السابقة">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold px-3 min-w-[80px] text-center">
            {safePage} / {totalPages}
          </span>
          <Button variant="outline" size="icon" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages} data-testid="button-page-next" title="التالية">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => onPageChange(totalPages)} disabled={safePage >= totalPages} data-testid="button-page-last" title="الأخيرة">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
