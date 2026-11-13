import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/** Sticky white header on mobile; blends into the page on desktop. */
export function PageHeader({
  title,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b bg-white/95 px-4 pt-5 pb-4 backdrop-blur md:static md:border-none md:bg-transparent md:px-0 md:pt-8 md:backdrop-blur-none',
        className,
      )}
    >
      <div className='flex items-center justify-between gap-3'>
        <h1 className='flex items-center gap-2 text-2xl font-bold text-slate-900 md:text-3xl'>
          {title}
        </h1>
        {actions}
      </div>
      {children && <div className='mt-4'>{children}</div>}
    </header>
  );
}

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl md:px-8', className)}>
      {children}
    </div>
  );
}
